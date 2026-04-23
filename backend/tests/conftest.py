"""Shared pytest fixtures for backend tests.

Focused on the adversarial regression suite — clears the
`rate_limits` collection before each test so OTP brute-force
tests (F4) don't poison subsequent tests (F5) with stale 429
counters on the same IP.
"""
import os
import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient


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
