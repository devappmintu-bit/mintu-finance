"""core/middleware.py — Reusable FastAPI/Starlette middleware.

Extracted from server.py (Round 30f) so bootstrap stays thin.

Middlewares defined here:
  • SecurityHeadersMiddleware — OWASP defaults on every response
  • RateLimitMiddleware        — per-IP + per-path-class sliding window
  • AuditLogMiddleware         — async audit trail to Mongo

Back-compat
-----------
Re-exported from ``server.py`` so existing ``from server import
RateLimitMiddleware`` call sites keep working.
"""
from __future__ import annotations

import hashlib
import json as _json
import logging
import os
import time
from datetime import datetime, timezone

import jwt
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  SECURITY CONFIG (can be overridden by server.py; these are defaults)
# ══════════════════════════════════════════════════════════════════════
RATE_LIMIT_WINDOW = 60                      # seconds
RATE_LIMIT_MAX_REQUESTS = 1000              # per window — generous for SPA parallel calls
AUTH_RATE_LIMIT_MAX = 30                    # stricter for /auth/*
BRUTE_FORCE_LOCKOUT_MINUTES = 15
BRUTE_FORCE_MAX_FAILURES = 5
SENSITIVE_FIELDS = ["password", "otp_hash", "_id", "otp"]
DATA_RETENTION_DAYS = 365
OTP_DATA_RETENTION_MINUTES = 10

JWT_SECRET = os.environ.get('JWT_SECRET', '')
JWT_ALGORITHM = "HS256"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP-based rate limiting to prevent DDoS and abuse."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        # Lazy import — avoid circular import with server.py
        from core import db

        now = time.time()
        is_auth = "/auth/" in path
        max_req = AUTH_RATE_LIMIT_MAX if is_auth else RATE_LIMIT_MAX_REQUESTS
        window_start = now - RATE_LIMIT_WINDOW
        key = f"rate:{client_ip}:{1 if is_auth else 0}"

        # Read current counter for this key.
        doc = await db.rate_limits.find_one({"key": key})
        if doc and doc.get("window", 0) >= window_start:
            # Inside the current window — increment & check.
            new_count = (doc.get("count", 0) or 0) + 1
            if new_count > max_req:
                return Response(
                    content=_json.dumps({"detail": "Rate limit exceeded. Please slow down."}),
                    status_code=429,
                    media_type="application/json",
                )
            await db.rate_limits.update_one(
                {"key": key},
                {"$set": {"window": doc.get("window", now)}, "$inc": {"count": 1}},
                upsert=True,
            )
        else:
            # Stale window — RESET count to 1 so we don't carry leftover counts
            # from the previous minute (root cause of false 429s).
            await db.rate_limits.update_one(
                {"key": key},
                {"$set": {"window": now, "count": 1}},
                upsert=True,
            )

        # Wrap call_next so client disconnects / upstream exceptions don't
        # crash the middleware chain.
        try:
            return await call_next(request)
        except RuntimeError as e:
            if "No response returned" in str(e):
                # Client disconnected before server finished writing. Return
                # a small JSON response so downstream middleware doesn't explode.
                return Response(
                    content=_json.dumps({"detail": "client_disconnected"}),
                    status_code=499,
                    media_type="application/json",
                )
            raise


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Log all API access for compliance audit trail.

    Wraps call_next so client disconnects don't explode the chain.
    """

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        try:
            response = await call_next(request)
        except RuntimeError as e:
            if "No response returned" in str(e):
                return Response(
                    content=_json.dumps({"detail": "client_disconnected"}),
                    status_code=499,
                    media_type="application/json",
                )
            raise
        duration = time.time() - start_time

        if request.url.path.startswith("/api"):
            # Lazy import — avoid circular import with server.py
            from core import db

            client_ip = request.client.host if request.client else "unknown"
            user_id = None
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                    user_id = payload.get("user_id")
                except Exception:
                    pass

            await db.audit_logs.insert_one({
                "timestamp": datetime.now(timezone.utc),
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "client_ip": hashlib.sha256(client_ip.encode()).hexdigest()[:16],
                "user_id": user_id,
                "duration_ms": round(duration * 1000, 2),
                "user_agent": request.headers.get("user-agent", "")[:100],
            })

        return response


__all__ = [
    "SecurityHeadersMiddleware",
    "RateLimitMiddleware",
    "AuditLogMiddleware",
    "RATE_LIMIT_WINDOW",
    "RATE_LIMIT_MAX_REQUESTS",
    "AUTH_RATE_LIMIT_MAX",
    "BRUTE_FORCE_LOCKOUT_MINUTES",
    "BRUTE_FORCE_MAX_FAILURES",
    "SENSITIVE_FIELDS",
    "DATA_RETENTION_DAYS",
    "OTP_DATA_RETENTION_MINUTES",
]
