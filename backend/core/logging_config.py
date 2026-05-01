"""core/logging_config.py — Round 54b structured JSON logging.

Why this exists
---------------
We already had a great per-route p95 buffer (`core/route_stats.py`) and
Sentry scrubbing (`core/observability.py`), but our stdout/stderr was
still emitting *human-readable* log lines (e.g. `INFO:     "GET /api/...
HTTP/1.1" 200 OK`). Any log aggregator — Loki, ELK, CloudWatch, GCP
Logging — chokes on that format and forces ops to write fragile regex
parsers.

This module provides a `JsonFormatter` that emits one JSON object per
log record AND a `RequestLogMiddleware` that emits a structured access
log line per request with all the dimensions needed for SLO dashboards
(p50/p95/p99 latency, status code, route template, request_id, user_id).

Activated by setting ``LOG_FORMAT=json`` (or any non-"text" value) in the
backend env. Default is still "text" for local dev so developers see
pretty output in the terminal.

Sample JSON line
----------------
    {"ts":"2025-06-01T12:34:56.789Z","level":"INFO","logger":"access",
     "msg":"request","method":"GET","route":"/api/transactions",
     "status":200,"latency_ms":12.3,"request_id":"a1b2c3...",
     "user_id":"647e...","bytes":4521}
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from typing import Any, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ──────────────────────────────────────────────────────────────────────
#  JSON FORMATTER
# ──────────────────────────────────────────────────────────────────────
class JsonFormatter(logging.Formatter):
    """Emits one JSON object per log record.

    Standard keys: ``ts`` (ISO-8601 UTC), ``level``, ``logger``, ``msg``.
    Any extras passed via `logger.info("…", extra={"foo": 1})` are
    merged in as top-level fields. Stack traces from exc_info are
    included under ``stack`` as a single string (newlines preserved).
    """

    # Keys we always set ourselves — record extras with these names are
    # ignored to avoid clobbering. Everything else from `extra={}` is
    # promoted to a top-level field.
    _RESERVED = {
        "args", "asctime", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "module",
        "msecs", "message", "msg", "name", "pathname", "process",
        "processName", "relativeCreated", "stack_info", "thread",
        "threadName", "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        # Build base envelope.
        out: Dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                  + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        # Promote extras (anything in record.__dict__ that's not reserved).
        for k, v in record.__dict__.items():
            if k in self._RESERVED or k.startswith("_"):
                continue
            try:
                # Ensure JSON-serialisable; fall back to str() for exotic types.
                json.dumps(v)
                out[k] = v
            except (TypeError, ValueError):
                out[k] = str(v)

        if record.exc_info:
            out["stack"] = self.formatException(record.exc_info)

        return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


def setup_logging() -> None:
    """Install JSON formatter on the root + uvicorn loggers if
    ``LOG_FORMAT=json`` (default = text for local-dev readability).

    Idempotent — safe to call multiple times.
    """
    fmt = (os.getenv("LOG_FORMAT") or "text").strip().lower()
    level = (os.getenv("LOG_LEVEL") or "INFO").strip().upper()

    if fmt != "json":
        # Leave default text formatter; only normalise level.
        logging.getLogger().setLevel(level)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.setLevel(level)

    # Replace handlers on the root logger so every child logger inherits.
    root = logging.getLogger()
    root.setLevel(level)
    # Idempotency guard: if we've already attached a JsonFormatter, bail.
    for h in root.handlers:
        if isinstance(h.formatter, JsonFormatter):
            return
    root.handlers[:] = [handler]

    # Uvicorn's access/error loggers use their own formatters by default.
    # Override them so their lines also become JSON. (We still set the
    # parent loggers in case future uvicorn versions stop auto-configuring.)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers[:] = [handler]
        lg.propagate = False
        lg.setLevel(level)


# ──────────────────────────────────────────────────────────────────────
#  REQUEST LOG MIDDLEWARE
# ──────────────────────────────────────────────────────────────────────
_access = logging.getLogger("access")


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Emits one structured ``access`` log line per request.

    Why a custom middleware instead of uvicorn's access log?
      • Uvicorn's default lines are unstructured ("GET /api/foo 200")
        and don't include latency, request_id, or user_id.
      • We already need the timing for `route_stats.py`; reusing it here
        avoids double instrumentation.
      • Skipping `/api/health/*` keeps the access log clean from k8s
        liveness probes (1 hit/sec → 86k/day of useless lines).

    Adds an ``X-Request-Id`` response header (if not already set by
    SentryContextMiddleware) so client errors can be correlated with
    backend logs by request_id.
    """

    # Routes we never log to keep the access log signal-rich.
    _SKIP_PREFIXES = ("/api/health/",)

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in self._SKIP_PREFIXES):
            return await call_next(request)

        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        start = time.perf_counter()
        status = 500
        bytes_out = 0
        try:
            response = await call_next(request)
            status = response.status_code
            cl = response.headers.get("content-length")
            if cl and cl.isdigit():
                bytes_out = int(cl)
            response.headers.setdefault("X-Request-Id", rid)
            return response
        except Exception:
            # Re-raise — exception handler downstream formats the response.
            # We still emit the access line in `finally`.
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
            route = request.scope.get("route")
            template = getattr(route, "path", None) or path
            uid = getattr(request.state, "user_id", None)
            _access.info(
                "request",
                extra={
                    "method": request.method,
                    "route": template,
                    "path": path,
                    "status": status,
                    "latency_ms": elapsed_ms,
                    "request_id": rid,
                    "user_id": str(uid) if uid else None,
                    "bytes": bytes_out,
                    "client": (request.client.host if request.client else None),
                },
            )


__all__ = ["JsonFormatter", "setup_logging", "RequestLogMiddleware"]
