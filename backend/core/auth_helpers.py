"""core/auth_helpers.py — Round 53h + Round 94 concurrency fix

Password + JWT helpers extracted out of ``server.py``.

Round 94 concurrency upgrade
────────────────────────────
The simulation engine surfaced a P0 reliability bug: at ≥10 concurrent
``/auth/verify-otp`` calls the server returns ``RemoteProtocolError:
Server disconnected without sending a response`` for ~95% of requests.

Root cause: ``bcrypt.hashpw`` / ``bcrypt.checkpw`` are CPU-bound C
extensions. When called from an async route they block the entire
event loop for ~80-200 ms each (cost-12 default). With 10 concurrent
verify-otp calls that's a 1-2 second loop stall, long enough for
uvicorn's HTTP/1.1 keep-alive to time out and drop connections.

Fix: keep the synchronous helpers (back-compat for legacy callers)
**and** introduce ``hash_password_async`` / ``verify_password_async``
that offload to ``asyncio.to_thread``. New routes should prefer the
async variants. Existing routes were migrated where they sit on hot
paths (``auth.py`` verify-otp, register, login).

Nothing else changed — ``bcrypt`` cost factor, JWT algo, and
expiration window are identical.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from core.time import utc_now

# JWT config — pulled from env at import time. The same values live
# (for now) on `server.py` for back-compat re-export; this module is
# the canonical home.
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30


# ─────────────── synchronous (legacy) helpers ──────────────────────
def hash_password(password: str) -> str:
    """bcrypt hash with a per-call random salt. **Sync** — DO NOT call
    from async routes on hot paths; use ``hash_password_async`` instead.
    """
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time bcrypt verification. **Sync** — DO NOT call from
    async routes on hot paths; use ``verify_password_async`` instead.
    """
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


# ─────────────── async wrappers (Round 94) ─────────────────────────
async def hash_password_async(password: str) -> str:
    """Non-blocking bcrypt hash. Offloads CPU work to the default
    thread executor so the asyncio event loop stays responsive.

    Use this from any async route. Cost: a thread-pool job (cheap in
    Python's GIL-released bcrypt path)."""
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password: str, hashed: str) -> bool:
    """Non-blocking bcrypt verification. See ``hash_password_async``
    for rationale."""
    return await asyncio.to_thread(verify_password, password, hashed)


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
    "hash_password_async",
    "verify_password_async",
    "create_token",
]
