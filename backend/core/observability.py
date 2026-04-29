"""core/observability.py — Round 53e

Sentry SDK initialization + safe PII scrubber + request-scoped tagging
middleware for the FastAPI app.

DESIGN DECISIONS
----------------
1. **DSN-driven kill switch.** If ``SENTRY_DSN_BACKEND`` is empty / unset,
   ``init_sentry()`` is a no-op. The SDK ships nothing, the middleware
   tags nothing. No-op for local dev, no surprises on staging.

2. **PII scrubbing is opt-in to the upload, not opt-in to the scrubber.**
   ``before_send`` runs unconditionally — even if a future contributor
   calls ``capture_exception(...)`` directly, phones / OTPs / Authorization
   headers / cookies / raw bodies never leave the box.

3. **Tag hierarchy (request-scoped):**
       request_id, endpoint, idempotency_key, user_id, environment, release
   Set by ``SentryContextMiddleware`` per request via ``configure_scope``.

4. **Sampling.** errors=100% (free), traces=20% (env-tunable). Profiles
   off for now — they're noisy and we don't have a perf use case yet.

USAGE
-----
    # in server.py startup (before app.add_middleware calls):
    from core.observability import init_sentry, SentryContextMiddleware
    init_sentry()
    app.add_middleware(SentryContextMiddleware)

    # anywhere a swallowed exception happens (post-commit hooks etc.):
    from core.observability import capture_silenced
    capture_silenced(exc, tag="post_commit_hook")
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from typing import Any, Dict, Optional

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────
#  PII SCRUBBING
# ──────────────────────────────────────────────────────────────────────
# Headers whose VALUE must never reach Sentry.
_SENSITIVE_HEADERS = {
    "authorization", "cookie", "set-cookie", "x-api-key",
    "x-auth-token", "proxy-authorization",
}
# Body keys whose VALUE we hash (so we keep aggregation power without leaking).
_HASH_KEYS = {
    "phone", "mobile", "phone_number", "msisdn", "phone_e164",
    "otp", "otp_code", "token", "jwt", "email",
}
# Body keys whose VALUE we drop entirely.
_DROP_KEYS = {
    "password", "pin", "new_pin", "old_pin", "secret",
    "authorization", "cookie",
}


def _hash8(s: Any) -> str:
    """sha256 → first 8 hex chars. Stable across requests so we can
    aggregate by user/phone in Sentry without learning the actual value.
    """
    s = "" if s is None else str(s)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:8]


def _scrub_mapping(d: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively scrub a dict-like, in place. Returns the same dict."""
    if not isinstance(d, dict):
        return d
    for k in list(d.keys()):
        lk = k.lower() if isinstance(k, str) else k
        v = d[k]
        if isinstance(lk, str) and lk in _DROP_KEYS:
            d[k] = "[FILTERED]"
        elif isinstance(lk, str) and lk in _HASH_KEYS:
            if isinstance(v, str) and v:
                d[k] = f"sha8:{_hash8(v)}"
            else:
                d[k] = "[FILTERED]"
        elif isinstance(v, dict):
            _scrub_mapping(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    _scrub_mapping(item)
    return d


def _before_send(event: Dict[str, Any], _hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Sentry hook: last line of defense before the event leaves the box."""
    try:
        # Strip sensitive headers entirely.
        req = event.get("request") or {}
        headers = req.get("headers") or {}
        if isinstance(headers, dict):
            for h in list(headers.keys()):
                if h.lower() in _SENSITIVE_HEADERS:
                    headers[h] = "[FILTERED]"

        # Hash/drop sensitive body fields.
        for slot in ("data", "json", "query_string"):
            if slot in req and isinstance(req[slot], dict):
                _scrub_mapping(req[slot])

        # Strip raw body — we kept the structured `data` instead.
        req.pop("body", None)

        # Scrub user object: only keep the hashed user_id, never the raw phone.
        user = event.get("user") or {}
        if isinstance(user, dict):
            for k in ("phone", "email", "ip_address"):
                if k in user:
                    user[k] = "[FILTERED]"

        # Extra/contexts: walk and scrub.
        for slot in ("extra", "contexts", "tags"):
            if slot in event and isinstance(event[slot], dict):
                _scrub_mapping(event[slot])

        return event
    except Exception:  # pragma: no cover — defensive: never break the SDK
        # Drop the event rather than risk leaking on a scrubber bug.
        logger.exception("sentry before_send scrubber failed; dropping event")
        return None


# ──────────────────────────────────────────────────────────────────────
#  INIT
# ──────────────────────────────────────────────────────────────────────
def init_sentry() -> bool:
    """Initialize the Sentry SDK from environment.

    Returns True if the SDK was actually wired up (DSN present), False
    if it ran in no-op mode (DSN empty / unset).
    """
    dsn = (os.getenv("SENTRY_DSN_BACKEND") or "").strip()
    if not dsn:
        logger.info("Sentry: no DSN configured (SENTRY_DSN_BACKEND empty) — running as no-op.")
        return False

    env = os.getenv("APP_ENV", "dev")
    release = os.getenv("RELEASE") or os.getenv("GIT_SHA") or None
    sample = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.2"))

    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        release=release,
        traces_sample_rate=sample,
        profiles_sample_rate=0.0,
        send_default_pii=False,
        before_send=_before_send,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
        ],
        # We attach our own `request_id` tag below; but the SDK's
        # built-in trace propagation is still useful.
        attach_stacktrace=False,
    )
    logger.info(
        "Sentry initialised | env=%s | release=%s | traces_sample_rate=%s",
        env, release or "—", sample,
    )
    return True


# ──────────────────────────────────────────────────────────────────────
#  REQUEST-SCOPED TAGGING MIDDLEWARE
# ──────────────────────────────────────────────────────────────────────
class SentryContextMiddleware(BaseHTTPMiddleware):
    """Per-request scope: tag every event captured during the request
    with ``request_id``, ``endpoint``, ``idempotency_key``, ``user_id``.

    The middleware is safe even when Sentry is in no-op mode — it still
    generates an X-Request-Id response header, which is useful for
    correlation in plain logs too.
    """

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())

        # Use sentry's per-request scope — auto-cleaned at request end.
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("request_id", rid)
            scope.set_tag("endpoint", request.url.path)
            scope.set_tag("method", request.method)
            ik = request.headers.get("Idempotency-Key")
            if ik:
                # Hash the idem-key too; raw value isn't useful for Sentry,
                # but the prefix helps cluster retries.
                scope.set_tag("idempotency_key_h", _hash8(ik))
            try:
                response = await call_next(request)
            except Exception:
                # Let Sentry's FastAPI integration record the exception
                # while our tags are still on the scope.
                raise

            # Best-effort user tag: routers stash user on request.state.
            uid = getattr(request.state, "user_id", None)
            if uid:
                scope.set_user({"id": str(uid)})

            response.headers["X-Request-Id"] = rid
            return response


# ──────────────────────────────────────────────────────────────────────
#  HELPERS for the rest of the codebase
# ──────────────────────────────────────────────────────────────────────
def capture_silenced(exc: BaseException, *, tag: str = "", extras: Optional[Dict[str, Any]] = None) -> None:
    """Capture an exception that the caller is about to swallow.

    Use anywhere a try/except logs but doesn't re-raise — most importantly
    in post-commit hooks (transactions.py) and best-effort cache writes.
    Adds a ``silenced=true`` tag so dashboards can filter to "things the
    user didn't see but the operator should".
    """
    try:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("silenced", "true")
            if tag:
                scope.set_tag("silenced_origin", tag)
            if extras:
                for k, v in extras.items():
                    scope.set_extra(k, v)
            sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover — observability is best-effort
        logger.debug("capture_silenced failed", exc_info=True)


__all__ = [
    "init_sentry",
    "SentryContextMiddleware",
    "capture_silenced",
]
