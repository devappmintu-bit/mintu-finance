"""Unit test for Round 54b user_id wiring in core/auth.py.

When `get_current_user` resolves a JWT, it should also stash the
resolved `user_id` on `request.state` so the RequestLogMiddleware
access-log line can carry the value (the middleware itself can't read
the dependency's return value because it runs *before* deps execute).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

# Pre-set required env vars so importing `core.auth` doesn't crash.
os.environ.setdefault("JWT_SECRET", "test-secret-for-roundtrip")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_round54b")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import jwt  # noqa: E402
import pytest  # noqa: E402
from bson import ObjectId  # noqa: E402
from fastapi import Depends, FastAPI, Request  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from core.auth import JWT_ALGORITHM, JWT_SECRET, get_current_user  # noqa: E402


def _make_token(user_id: str, expires_in_days: int = 7) -> str:
    return jwt.encode(
        {
            "user_id": user_id,
            "exp": datetime.now(timezone.utc) + timedelta(days=expires_in_days),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


@pytest.mark.asyncio
async def test_get_current_user_populates_request_state(monkeypatch):
    """A successful auth should set ``request.state.user_id``."""
    uid = str(ObjectId())

    # Stub server.db.users.find_one so we don't need a real Mongo.
    class _StubUsers:
        async def find_one(self, *_a, **_kw):
            return {"_id": ObjectId(uid)}

    class _StubDb:
        users = _StubUsers()

    monkeypatch.setitem(sys.modules, "server", type("M", (), {"db": _StubDb()}))

    app = FastAPI()

    @app.get("/api/whoami")
    async def whoami(request: Request, user_id: str = Depends(get_current_user)):
        # Confirm both the dep return AND the state-stash agree.
        return {"dep": user_id, "state": getattr(request.state, "user_id", None)}

    client = TestClient(app)
    r = client.get("/api/whoami", headers={"Authorization": f"Bearer {_make_token(uid)}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dep"] == uid
    assert body["state"] == uid, "request.state.user_id must mirror the dep return"


@pytest.mark.asyncio
async def test_get_current_user_missing_header_returns_401(monkeypatch):
    """Unauthenticated callers must NOT crash — 401, never 422."""
    app = FastAPI()

    @app.get("/api/whoami")
    async def whoami(user_id: str = Depends(get_current_user)):
        return {"dep": user_id}

    client = TestClient(app)
    r = client.get("/api/whoami")
    assert r.status_code == 401
    assert "authorization" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_current_user_invalid_token_returns_401(monkeypatch):
    app = FastAPI()

    @app.get("/api/whoami")
    async def whoami(user_id: str = Depends(get_current_user)):
        return {"dep": user_id}

    client = TestClient(app)
    r = client.get("/api/whoami", headers={"Authorization": "Bearer not-a-valid-jwt"})
    assert r.status_code == 401


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
