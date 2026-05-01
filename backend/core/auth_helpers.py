"""core/auth_helpers.py — Round 53h

Password + JWT helpers extracted out of ``server.py``.

The thin functions in this module used to live at module level on
``server.py``; routers/auth.py imported them as ``from server import
hash_password, verify_password, create_token``. Keeping the public
shape unchanged here means routers don't have to know they moved —
but new code should prefer importing from this module directly.

Why split them out?
  • ``server.py`` shrinks toward the bootstrap-only ideal.
  • The helpers are now unit-testable without spinning up FastAPI.
  • Future enhancements (argon2id rotation, refresh tokens) land in a
    cohesive module instead of bloating server.py.

Nothing semantic has changed — `bcrypt` cost factor, JWT algo, and
expiration window are identical to the previous server.py impl.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from core.time import utc_now

import bcrypt
import jwt

# JWT config — pulled from env at import time. The same values live
# (for now) on `server.py` for back-compat re-export; this module is
# the canonical home.
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30


def hash_password(password: str) -> str:
    """bcrypt hash with a per-call random salt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time bcrypt verification."""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str) -> str:
    """Issue a 30-day JWT for ``user_id`` (``user_id`` claim)."""
    expiration = utc_now() + timedelta(days=JWT_EXPIRATION_DAYS)
    return jwt.encode(
        {"user_id": user_id, "exp": expiration},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


__all__ = [
    "JWT_SECRET",
    "JWT_ALGORITHM",
    "JWT_EXPIRATION_DAYS",
    "hash_password",
    "verify_password",
    "create_token",
]
