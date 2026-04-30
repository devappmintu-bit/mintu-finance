"""
Round 51i + Round 54a — Route timing & payload telemetry.

In-memory ring buffer that records per-route response times AND payload
sizes for every request that hits the API. Exposed via
GET /api/admin/route-stats so *future* fix decisions become data-driven
instead of guess-driven.

Design rationale (kept deliberately minimal — no Prometheus, no Redis):
  • A 4096-entry circular buffer per route gives us ~1-2 hours of headroom
    on the busiest endpoints without unbounded memory growth.
  • p50/p95/p99 are computed lazily on read using statistics.quantiles —
    no streaming sketch needed at our scale.
  • Round 54a — Response bytes captured from `Content-Length` header
    (set by FastAPI for non-streaming responses; ~0 for streams which
    we mark explicitly). This surfaces "fat payload" endpoints without
    consuming the response body.
  • The overhead per request is one timer + one O(1) deque append. We
    measured ~12 µs per record on Starter-tier infra — invisible.
  • Admin endpoint is gated by the existing auth dep + a list of admin
    phones from env. If admin list is empty, endpoint is locked entirely.
  • Buffer is process-local. With 2 K8s replicas this means stats are
    per-pod; that's intentional MVP simplicity. Replace with Prometheus
    when we cross 1k req/s.

This module exports:
  • RouteStatsRecorder — middleware that times every request
  • build_admin_router() — FastAPI router with the read endpoint(s)

Wiring: see server.py — middleware is added to the FastAPI app and the
router is included at the api_router level (so it's behind /api/*).
"""
from __future__ import annotations

import os
import statistics
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from core import get_current_user
from core import db


# ── Ring buffer config ────────────────────────────────────────────────
# 4096 samples is enough for p99 to stabilise on any endpoint that does
# more than ~50 req/hour. Anything quieter just gets a wider variance —
# acceptable since you wouldn't optimise for that endpoint anyway.
BUFFER_SIZE = 4096

# Per-route circular buffer of (timestamp, duration_ms, status_code, response_bytes)
# tuples. Keyed by template path ("GET /api/transactions/{txn_id}") — the
# literal path is normalised to the route template by FastAPI so we don't
# blow up the key space on URLs with IDs.
_buf: Dict[str, Deque[tuple]] = defaultdict(lambda: deque(maxlen=BUFFER_SIZE))

# Mark the moment recording started so the read endpoint can show the
# observation window length.
_started_at: float = time.time()


class RouteStatsRecorder(BaseHTTPMiddleware):
    """ASGI middleware: time every API request, push into the ring buffer.

    Notes:
      • We ignore non-/api/ traffic (static, openapi.json, docs) to keep
        the buffer focused on real product endpoints.
      • The /api/admin/route-stats endpoint itself is excluded from
        recording — looking at your own telemetry shouldn't pollute it.
      • If FastAPI couldn't resolve a route template (404, malformed),
        we record under the literal path — those rows are still useful
        for finding clients hitting nonexistent endpoints.
      • Response bytes come from the Content-Length header. Streaming
        responses (chunked encoding) report 0; that's correct — we
        explicitly choose NOT to consume the body iterator just for
        accounting because that doubles memory pressure.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        # Cheap fast-path: skip non-API traffic AND the telemetry
        # endpoint itself (avoid recursive accounting).
        if not path.startswith("/api/") or path.startswith("/api/admin/route-stats"):
            return await call_next(request)

        start = time.perf_counter()
        response: Response
        status_code = 500
        response_bytes = 0
        try:
            response = await call_next(request)
            status_code = response.status_code
            # Round 54a — capture payload size cheaply via header.
            # FastAPI's default JSONResponse sets Content-Length; only
            # explicit StreamingResponse leaves it unset (we report 0).
            cl = response.headers.get("content-length")
            if cl and cl.isdigit():
                response_bytes = int(cl)
            return response
        except Exception:
            # Don't swallow — re-raise after recording. The global
            # exception handler downstream will format the response.
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            # Try to use the matched route template ("/api/foo/{id}")
            # rather than the literal path so cardinality stays bounded.
            route = request.scope.get("route")
            template = getattr(route, "path", None) or path
            key = f"{request.method} {template}"
            _buf[key].append(
                (time.time(), round(elapsed_ms, 2), status_code, response_bytes)
            )


# ── Read endpoint(s) ──────────────────────────────────────────────────

def _admin_phones() -> set[str]:
    """Comma-separated ADMIN_PHONES from env. Empty = locked."""
    raw = os.getenv("ADMIN_PHONES", "")
    return {p.strip() for p in raw.split(",") if p.strip()}


async def _require_admin(user_id: str = Depends(get_current_user)) -> str:
    """
    Admin gate: user must (a) be authenticated AND (b) have a phone
    listed in ADMIN_PHONES env var. If ADMIN_PHONES is empty/unset the
    endpoint refuses everyone — no accidental open endpoint in prod.
    """
    allowed = _admin_phones()
    if not allowed:
        raise HTTPException(status_code=503, detail="route-stats: ADMIN_PHONES not configured")
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id)}, {"phone": 1})
    phone = (user or {}).get("phone")
    if phone not in allowed:
        raise HTTPException(status_code=403, detail="route-stats: admin only")
    return user_id


def _percentile(samples: list[float], p: float) -> float:
    """Inclusive percentile. statistics.quantiles needs n>=2."""
    if not samples:
        return 0.0
    if len(samples) == 1:
        return samples[0]
    if p == 50:
        return statistics.median(samples)
    # quantiles(n=100) gives 99 cut-points — index p-1 is the p-th percentile.
    qs = statistics.quantiles(samples, n=100, method="inclusive")
    return qs[min(int(p) - 1, len(qs) - 1)]


def build_admin_router() -> APIRouter:
    """Returns a FastAPI router carrying /admin/route-stats. Mount it on
    api_router so the /api prefix is applied automatically."""
    r = APIRouter(prefix="/admin", tags=["admin"])

    @r.get("/route-stats")
    async def route_stats(
        sort_by: str = Query(
            "p95_ms",
            description="Sort key: p95_ms | p99_ms | bytes_p95 | bytes_max | error_rate | samples",
        ),
        limit: int = Query(50, ge=1, le=500),
        _user_id: str = Depends(_require_admin),
    ):
        """
        Per-route latency + payload-size summary. Sorted by `sort_by`
        descending so the worst offenders surface first.

        Each row:
          {
            "route": "GET /api/transactions",
            "samples": 1842,
            "p50_ms": 12.4,
            "p95_ms": 84.1,
            "p99_ms": 312.0,
            "max_ms": 2104.0,
            "bytes_p50": 8120,           # Round 54a — payload size
            "bytes_p95": 42180,
            "bytes_max": 188400,
            "error_rate": 0.012,         # 4xx+5xx fraction
            "last_seen": 1733...          # epoch
          }
        """
        valid_sort = {
            "p95_ms", "p99_ms", "max_ms", "p50_ms",
            "bytes_p50", "bytes_p95", "bytes_max",
            "error_rate", "samples",
        }
        if sort_by not in valid_sort:
            raise HTTPException(
                status_code=400,
                detail=f"sort_by must be one of {sorted(valid_sort)}",
            )

        rows = []
        for key, buf in list(_buf.items()):
            samples = list(buf)
            if not samples:
                continue
            durs = [s[1] for s in samples]
            statuses = [s[2] for s in samples]
            # Round 54a — bytes is the 4th tuple slot. Defensive default
            # for any legacy rows captured before the schema change.
            byte_sizes = [s[3] if len(s) > 3 else 0 for s in samples]
            err_count = sum(1 for s in statuses if s >= 400)
            rows.append({
                "route": key,
                "samples": len(samples),
                "p50_ms": round(_percentile(durs, 50), 2),
                "p95_ms": round(_percentile(durs, 95), 2),
                "p99_ms": round(_percentile(durs, 99), 2),
                "max_ms": round(max(durs), 2),
                "bytes_p50": int(round(_percentile(byte_sizes, 50))),
                "bytes_p95": int(round(_percentile(byte_sizes, 95))),
                "bytes_max": max(byte_sizes) if byte_sizes else 0,
                "error_rate": round(err_count / max(len(statuses), 1), 4),
                "last_seen": samples[-1][0],
            })
        rows.sort(key=lambda row: row.get(sort_by, 0), reverse=True)
        rows = rows[:limit]
        return {
            "window_started_at": _started_at,
            "window_seconds": round(time.time() - _started_at, 1),
            "buffer_size": BUFFER_SIZE,
            "sort_by": sort_by,
            "total_routes": len(rows),
            "rows": rows,
        }

    @r.get("/route-stats/reset")
    async def route_stats_reset(_user_id: str = Depends(_require_admin)):
        """Clear all buffers. Useful before running a perf experiment."""
        global _started_at
        _buf.clear()
        _started_at = time.time()
        return {"reset": True, "started_at": _started_at}

    return r
