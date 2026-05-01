"""JWT-based auth dependency used by every protected route."""
import os
import re
import jwt
from fastapi import Header, HTTPException, Request
from dotenv import load_dotenv
from pathlib import Path
from bson import ObjectId

load_dotenv(Path(__file__).parent.parent / ".env")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

_HEX24 = re.compile(r"^[0-9a-fA-F]{24}$")


async def get_current_user(
    request: Request = None,  # type: ignore[assignment]
    authorization: str = Header(None),
) -> str:
    """FastAPI dependency — returns the user_id from the Bearer JWT.

    Hardened:
      • Missing Authorization header → 401 (NOT 422). We mark the header
        Optional and raise manually; FastAPI's default ``Header(...)``
        required-dep behaviour would surface a 422 with body
        ``{"detail":[{"loc":[...],"msg":"field required"}]}`` which is
        confusing for downstream clients and breaks auth-error handling.
      • Rejects tokens where `user_id` is missing, non-string, empty, or
        not a valid 24-char hex ObjectId → 401.
      • **Verifies the user doc still exists in MongoDB** — this closes
        the dead-token hole from Round 29 AUTH-SESSION-001 where a
        hard-deleted user's JWT would still pass auth on /transactions,
        /home/bundle, /split/*, /leaderboard/*, /user/payment-methods
        (only /user/me was safe because it did its own DB lookup).
      • Round 54b — populates ``request.state.user_id`` so the
        RequestLogMiddleware access-log line can carry the resolved
        user identity (the middleware runs *before* this dependency so
        it can't grab the value itself; we stash it on request.state
        from inside the dep instead — Starlette finalises the response
        AFTER all deps return, so the access logger sees the value).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        if not isinstance(authorization, str) or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization format")
        token = authorization.replace("Bearer ", "").strip()
        if not token:
            raise HTTPException(status_code=401, detail="Missing token")
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("user_id")
        if not isinstance(uid, str) or not _HEX24.match(uid):
            raise HTTPException(status_code=401, detail="Invalid token payload")
        # Dead-token guard — deferred import avoids circular dependency at module load.
        from server import db  # noqa: E402
        exists = await db.users.find_one(
            {"_id": ObjectId(uid)},
            {"_id": 1, "deleted_at": 1},
        )
        if not exists:
            raise HTTPException(status_code=401, detail="Account no longer exists")
        # Soft-deleted accounts are locked out immediately — the `deleted_at`
        # field is set by /user/delete-account mode=soft. Hard-purge worker
        # (core/soft_delete_worker) eventually removes the doc after the
        # 30-day restore window lapses.
        if exists.get("deleted_at"):
            raise HTTPException(status_code=401, detail="Account scheduled for deletion")
        # Stash on request.state for the access-log middleware (Round 54b).
        # Best-effort: if `request` is None (legacy callers, tests) we just
        # skip — the dep still returns the user_id.
        if request is not None:
            try:
                request.state.user_id = uid
            except Exception:
                pass
        return uid
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
