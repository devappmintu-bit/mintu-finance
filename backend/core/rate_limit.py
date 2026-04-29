"""
core/rate_limit.py — Round 52f + Round 53g

Sliding-window rate limiters for the FastAPI app:

  • ``enforce_user_rate_limit``   — per (JWT-bound) user_id    [Round 52f]
  • ``enforce_device_rate_limit`` — per device fingerprint     [Round 53g]
  • ``enforce_combined``          — both at once (recommended) [Round 53g]
  • ``device_fingerprint(req)``   — resolve a stable per-device id

WHY DEVICE-BASED ON TOP OF PER-USER?
------------------------------------
Per-user limits stop ONE bad account, but a single device can rotate
through dozens of accounts and stay under each user-quota. The combined
gate enforces ``MIN(user_limit, device_limit)`` so multi-account abuse
hits the device ceiling first.

FINGERPRINT PRIORITY
--------------------
1. ``X-Device-ID`` header (frontend-controlled UUID stored in
   SecureStore — survives reinstalls only if Keychain restore is on,
   which is the right behaviour for our threat model).
2. Fallback: SHA256 of ``client_ip + ":" + User-Agent``.

We HASH whatever we receive before storing it, so the rate-limit table
never holds raw device IDs.

LIMITS (defaults; per-call overridable)
---------------------------------------
| Bucket           | User limit  | Device limit |
|------------------|-------------|--------------|
| lookup           | 100/hr      | 400/hr       |
| settle           | 60/hr       | 200/hr       |
| split_expense    | 200/hr      | 800/hr       |
| auth             | 10/15min    | 30/15min     |

Storage: same ``rate_limits`` collection, key prefixed with
``device:`` instead of ``user:``. TTL index already wired in lifecycle.py.

OBSERVABILITY
-------------
On a 429 we tag the Sentry scope with ``rate_limit_kind`` (`user` |
`device`) and the hashed device id — so dashboards can spot abuse
patterns without ever logging raw values.
"""
from __future__ import annotations

import hashlib
import time
from typing import Optional

from fastapi import HTTPException, Request


# ──────────────────────────────────────────────────────────────────────
#  FINGERPRINT
# ──────────────────────────────────────────────────────────────────────
def _hash_device(raw: str) -> str:
    """sha256 → first 16 hex chars. Stable, short, irreversible."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def device_fingerprint(request: Request) -> str:
    """Resolve a stable, hashed device fingerprint for rate-limit keying.

    Order of preference:
        1. ``X-Device-ID`` header (preferred; frontend sends a UUID
           it generated once and stored in SecureStore).
        2. Fallback: hash of ``<client_ip>:<User-Agent>``.

    Always returns a 16-hex-char hash — never the raw value.
    """
    raw = (request.headers.get("X-Device-ID") or "").strip()
    if raw:
        return _hash_device(f"hdr:{raw}")
    # Fallback: best-effort IP + UA. Not bulletproof (two users behind
    # the same NAT share a fingerprint), so device limits run looser
    # than user limits to keep false positives at zero.
    ip = (request.client.host if request.client else "0.0.0.0")
    ua = request.headers.get("User-Agent", "-")
    return _hash_device(f"ipua:{ip}|{ua}")


# ──────────────────────────────────────────────────────────────────────
#  CORE — single-key sliding window
# ──────────────────────────────────────────────────────────────────────
async def _enforce(
    key: str, limit: int, window_s: int, *, kind: str, bucket: str,
) -> None:
    """Sliding-window check + increment. Raises 429 on overflow."""
    # Lazy import — server.db isn't ready at module-load time.
    from server import db

    now = time.time()
    window_start = now - window_s

    doc = await db.rate_limits.find_one({"key": key})
    if doc and doc.get("window", 0) >= window_start:
        new_count = (doc.get("count", 0) or 0) + 1
        if new_count > limit:
            elapsed = now - doc.get("window", now)
            retry_after = max(1, int(window_s - elapsed))
            # Round 53g — surface throttle events to Sentry so we can
            # spot abuse patterns. Tagged but never fail-loud (the
            # observability layer is best-effort).
            try:
                from core.observability import capture_silenced
                capture_silenced(
                    Exception(f"rate_limit_exceeded:{kind}:{bucket}"),
                    tag=f"rate_limit:{kind}",
                    extras={"bucket": bucket, "limit": limit, "window_s": window_s},
                )
            except Exception:
                pass
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded for {bucket}. Try again in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
        await db.rate_limits.update_one(
            {"key": key},
            {"$set": {"window": doc.get("window", now)}, "$inc": {"count": 1}},
            upsert=True,
        )
    else:
        await db.rate_limits.update_one(
            {"key": key},
            {"$set": {"window": now, "count": 1}},
            upsert=True,
        )


# ──────────────────────────────────────────────────────────────────────
#  PUBLIC API — per-user (Round 52f, unchanged behaviour)
# ──────────────────────────────────────────────────────────────────────
async def enforce_user_rate_limit(
    user_id: str,
    bucket: str,
    *,
    limit: int,
    window_s: int,
) -> None:
    """Per-user sliding-window throttle. Raise 429 on overflow.

    `bucket` namespaces different endpoints so a heavy lookup user
    doesn't get throttled out of e.g. /split/expenses too.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    await _enforce(
        key=f"user:{bucket}:{user_id}",
        limit=limit, window_s=window_s,
        kind="user", bucket=bucket,
    )


# ──────────────────────────────────────────────────────────────────────
#  PUBLIC API — per-device (Round 53g, new)
# ──────────────────────────────────────────────────────────────────────
async def enforce_device_rate_limit(
    device_h: str,
    bucket: str,
    *,
    limit: int,
    window_s: int,
) -> None:
    """Per-device sliding-window throttle. Raise 429 on overflow.

    ``device_h`` MUST be the already-hashed fingerprint from
    ``device_fingerprint(request)`` — we never accept raw device IDs.
    """
    if not device_h:
        # Don't throttle on empty fingerprint — that means we couldn't
        # resolve one, which is itself a signal but not a hard block.
        return
    await _enforce(
        key=f"device:{bucket}:{device_h}",
        limit=limit, window_s=window_s,
        kind="device", bucket=bucket,
    )


# ──────────────────────────────────────────────────────────────────────
#  PUBLIC API — combined (the recommended call site)
# ──────────────────────────────────────────────────────────────────────
async def enforce_combined(
    *,
    user_id: str,
    request: Request,
    bucket: str,
    user_limit: int,
    device_limit: int,
    window_s: int,
) -> None:
    """Run BOTH user and device rate limits. Effective ceiling for an
    actor = ``MIN(user_limit, device_limit)``. Order matters: we run
    the per-user check first (the cheaper, more-precise limiter); on
    pass we also charge the device counter.

    Multi-account abuse (one device, many accounts): each account's
    user-counter stays low, but the device-counter aggregates them and
    trips on its own ceiling.
    """
    await enforce_user_rate_limit(user_id, bucket, limit=user_limit, window_s=window_s)
    device_h = device_fingerprint(request)
    await enforce_device_rate_limit(device_h, bucket, limit=device_limit, window_s=window_s)


__all__ = [
    "enforce_user_rate_limit",
    "enforce_device_rate_limit",
    "enforce_combined",
    "device_fingerprint",
]
