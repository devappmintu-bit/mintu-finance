"""JWT-based auth dependency used by every protected route."""
import os
import re
import jwt
from fastapi import Header, HTTPException
from dotenv import load_dotenv
from pathlib import Path
from bson import ObjectId

load_dotenv(Path(__file__).parent.parent / ".env")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

_HEX24 = re.compile(r"^[0-9a-fA-F]{24}$")


async def get_current_user(authorization: str = Header(...)) -> str:
    """FastAPI dependency — returns the user_id from the Bearer JWT.

    Hardened:
      • Rejects tokens where `user_id` is missing, non-string, empty, or
        not a valid 24-char hex ObjectId → 401.
      • **Verifies the user doc still exists in MongoDB** — this closes
        the dead-token hole from Round 29 AUTH-SESSION-001 where a
        hard-deleted user's JWT would still pass auth on /transactions,
        /home/bundle, /split/*, /leaderboard/*, /user/payment-methods
        (only /user/me was safe because it did its own DB lookup).
    """
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
        exists = await db.users.find_one({"_id": ObjectId(uid)}, {"_id": 1})
        if not exists:
            raise HTTPException(status_code=401, detail="Account no longer exists")
        return uid
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
