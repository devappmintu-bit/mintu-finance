"""
services/token_service.py — Round 88 auth upgrade.

Split the single 30-day JWT into a rotating pair:

  • Access token   — JWT HS256, 15-minute TTL. Payload carries
                      {sub, user_id, device_id, scope, exp, iat, jti}.
                      Stateless: verified via signature + exp check.
  • Refresh token  — random 256-bit opaque string, 30-day TTL.
                      Stored HASHED in the `sessions` collection;
                      we never write the plaintext to disk or logs.
                      Rotated on every /auth/refresh call.

Token family:
  Each refresh token carries a `family_id`. When the server detects a
  reused (already-rotated) refresh token, it revokes the entire family
  — this is the OWASP-recommended refresh-token-reuse defence.

Why this module exists in `services/` (not `core/`):
  • core/auth.py still owns the GET-user-from-access-token dependency
    so every existing protected route continues to work byte-identical.
  • services/token_service.py owns creation / rotation / revocation —
    the mutative side of the session lifecycle.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt

from core.time import utc_now

# ── Config ────────────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET") or "change_me_dev_only"
JWT_ALGORITHM = "HS256"

ACCESS_TTL_MINUTES = 15           # Short-lived, stateless.
REFRESH_TTL_DAYS = 30             # Long-lived, rotatable.

# Token scopes — reserved for future step-up flows.
SCOPE_ACCESS = "access"
SCOPE_STEP_UP = "step_up"         # Elevated JWT after fresh OTP (AA link, delete account, …).

# ── Access-token helpers ──────────────────────────────────────────────
def create_access_token(
    user_id: str,
    device_id: Optional[str] = None,
    scope: str = SCOPE_ACCESS,
    ttl_minutes: int = ACCESS_TTL_MINUTES,
) -> dict:
    """Mint a new access JWT. Returns
    ``{"token": str, "expires_at": iso, "expires_in": seconds}``.
    """
    now = utc_now()
    exp = now + timedelta(minutes=ttl_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "user_id": user_id,
        "scope": scope,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    if device_id:
        payload["device_id"] = device_id
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "token": token,
        "expires_at": exp.isoformat(),
        "expires_in": ttl_minutes * 60,
    }


def decode_access_token(token: str) -> dict:
    """Decode + verify an access JWT. Raises jwt exceptions on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ── Refresh-token helpers ─────────────────────────────────────────────
def mint_refresh_token() -> tuple[str, str]:
    """Return (plaintext, sha256_hex) for a new refresh token.

    The plaintext is returned to the client ONCE; the server only ever
    persists the hash. Any future presentation of the plaintext is
    compared against the stored hash via constant-time comparison
    (hmac.compare_digest) inside session_service.
    """
    plaintext = secrets.token_urlsafe(48)      # 48B url-safe ≈ 64-char string
    digest = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    return plaintext, digest


def hash_refresh_token(plaintext: str) -> str:
    """One-way SHA-256 hash of a refresh token — stable, deterministic,
    safe to store in Mongo. We do NOT salt the hash: the plaintext is
    already 384 bits of entropy so pre-image attacks are cost-prohibitive,
    and we need stable indexed lookups by hash for validation."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def refresh_expiry() -> datetime:
    """UTC datetime at which a fresh refresh token should expire."""
    return utc_now() + timedelta(days=REFRESH_TTL_DAYS)


__all__ = [
    "ACCESS_TTL_MINUTES",
    "REFRESH_TTL_DAYS",
    "SCOPE_ACCESS",
    "SCOPE_STEP_UP",
    "JWT_SECRET",
    "JWT_ALGORITHM",
    "create_access_token",
    "decode_access_token",
    "mint_refresh_token",
    "hash_refresh_token",
    "refresh_expiry",
]
