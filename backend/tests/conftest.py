"""Shared pytest fixtures for backend tests.

Focused on the adversarial regression suite — clears the
`rate_limits` collection before each test so OTP brute-force
tests (F4) don't poison subsequent tests (F5) with stale 429
counters on the same IP.

Phase 3 consolidation: the shared `http`, `auth_token`, and
`_user_id_from_jwt` helpers that were previously re-declared in
8+ individual test files are now defined here as pytest fixtures.
Individual tests just declare `http` (or `authed_http`) as a
function parameter to receive the shared httpx.AsyncClient.
"""
import os
import base64
import json
import pytest
import pytest_asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient


# ──────────────────────────────────────────────────────────────────
# SHARED CONSTANTS — used across the whole test suite
# ──────────────────────────────────────────────────────────────────
BASE_URL = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_PHONE = "9876543210"
TEST_OTP = "123456"


# ──────────────────────────────────────────────────────────────────
# SHARED HTTP CLIENT FIXTURES — move out of 8 test files
# ──────────────────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def http():
    """Unauthenticated httpx.AsyncClient pointed at the live backend."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as c:
        yield c


@pytest_asyncio.fixture
async def auth_token():
    """One-shot login → returns a bearer JWT string."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as c:
        await c.post("/auth/send-otp", json={"phone": TEST_PHONE})
        r = await c.post("/auth/verify-otp",
                         json={"phone": TEST_PHONE, "otp": TEST_OTP})
        assert r.status_code == 200, r.text
        return r.json()["token"]


@pytest_asyncio.fixture
async def authed_http(auth_token):
    """HTTP client with Authorization header already set."""
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=10.0,
        headers={"Authorization": f"Bearer {auth_token}"},
    ) as c:
        yield c


def _user_id_from_jwt(token: str) -> str:
    """Parse the `sub` claim out of a JWT without verifying the signature.
    Used by tests that need to assert on user_id-scoped DB state.
    Relocated here from test_round52f_rate_limit.py + test_round53c_concurrency.py
    + 2 other test files (Phase 3 consolidation).
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"Not a JWT: {token[:40]}…")
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    return payload.get("sub") or payload.get("user_id") or payload.get("id")


@pytest_asyncio.fixture(autouse=True)
async def _reset_rate_limits():
    """Blow away IP rate-limit counters before each test so tests are
    independent even when run sequentially. Safe no-op if Mongo is down."""
    try:
        # Load .env for MONGO_URL / DB_NAME (matches the running backend).
        try:
            from dotenv import load_dotenv
            load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        except Exception:
            pass
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "mintu_database")
        client = AsyncIOMotorClient(mongo_url)
        await client[db_name].rate_limits.delete_many({})
        # Also clear otp_audit phone-level counters used by F4 guard so
        # new phones registered in F5 aren't tripped by stale state.
        try:
            await client[db_name].otp_audit.delete_many({})
        except Exception:
            pass
        # Clear active OTP cooldown window (30s-per-phone guard in auth.py).
        # Tests re-send OTP to the same phone quickly during restore flows.
        try:
            await client[db_name].otps.delete_many({})
        except Exception:
            pass
        # Reset the per-pair settle advisory locks so race-test runs are clean
        try:
            await client[db_name].settle_locks.delete_many({})
        except Exception:
            pass
        client.close()
    except Exception:
        # Tests should still run even if cleanup fails — they will simply
        # surface the upstream issue via their own assertions.
        pass
    yield
