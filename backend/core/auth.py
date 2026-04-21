"""JWT-based auth dependency used by every protected route."""
import os
import re
import jwt
from fastapi import Header, HTTPException
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

_HEX24 = re.compile(r"^[0-9a-fA-F]{24}$")


async def get_current_user(authorization: str = Header(...)) -> str:
    """FastAPI dependency — returns the user_id from the Bearer JWT.

    Hardened: rejects tokens where `user_id` is missing, non-string, empty,
    or not a valid 24-char hex ObjectId → 401 (never 500).
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
        return uid
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
