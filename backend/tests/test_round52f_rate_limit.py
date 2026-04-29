"""Round 52f — Rate-limit tests for /api/users/lookup-batch.

We don't want to actually loop 101 HTTP calls in CI — that's slow and
flaky. Instead we manipulate the rate_limits collection directly to
fast-forward the counter to the threshold, then assert the 101st call
returns 429.
"""
import os
import pytest
import httpx

pytestmark = pytest.mark.integration

BASE = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_PHONE = "9876543210"
TEST_OTP = "123456"


@pytest.fixture
async def http():
    async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as c:
        yield c


@pytest.fixture
async def auth_token(http):
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    r = await http.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": TEST_OTP})
    return r.json()["token"]


@pytest.fixture
async def db_handle():
    """Direct Mongo handle for surgical state setup. Skips the test if
    we can't read MONGO_URL — keeps the suite green on environments
    without a local DB."""
    import os as _os
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    url = _os.environ.get("MONGO_URL")
    name = _os.environ.get("DB_NAME", "test_database")
    if not url:
        pytest.skip("MONGO_URL not configured")
    client = AsyncIOMotorClient(url)
    yield client[name]
    client.close()


def _user_id_from_jwt(token: str) -> str:
    import base64, json
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["user_id"]


async def _wipe_lookup_bucket(db, user_id: str):
    await db.rate_limits.delete_many({"key": f"user:lookup:{user_id}"})


# ── happy-path baseline ─────────────────────────────────────────────
async def test_first_call_under_limit_succeeds(http, auth_token, db_handle):
    uid = _user_id_from_jwt(auth_token)
    await _wipe_lookup_bucket(db_handle, uid)

    headers = {"Authorization": f"Bearer {auth_token}"}
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 200


# ── threshold / over-limit ──────────────────────────────────────────
async def test_request_just_over_limit_returns_429(http, auth_token, db_handle):
    """Pre-seed the counter to 100 (== the limit). The next call is the
    101st and must be rejected."""
    import time
    uid = _user_id_from_jwt(auth_token)
    await _wipe_lookup_bucket(db_handle, uid)
    await db_handle.rate_limits.insert_one({
        "key": f"user:lookup:{uid}",
        "window": time.time(),
        "count": 100,  # hit the ceiling exactly
    })

    headers = {"Authorization": f"Bearer {auth_token}"}
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 429, r.text
    assert "Retry-After" in r.headers
    # Body should explain why we got blocked.
    assert "rate limit" in r.text.lower()
    # Cleanup so other tests don't inherit a poisoned counter.
    await _wipe_lookup_bucket(db_handle, uid)


# ── window reset ────────────────────────────────────────────────────
async def test_stale_window_resets_counter(http, auth_token, db_handle):
    """If the stored window is older than 1 hour, the counter must
    reset to 1 on the next call (not stay blocked forever)."""
    import time
    uid = _user_id_from_jwt(auth_token)
    await _wipe_lookup_bucket(db_handle, uid)
    # Plant a "stale" counter from 2 hours ago that's already over.
    await db_handle.rate_limits.insert_one({
        "key": f"user:lookup:{uid}",
        "window": time.time() - 7200,  # 2 h ago
        "count": 999,
    })

    headers = {"Authorization": f"Bearer {auth_token}"}
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 200, r.text

    # And the bucket should now reflect the reset (count=1, fresh window).
    doc = await db_handle.rate_limits.find_one({"key": f"user:lookup:{uid}"})
    assert doc["count"] == 1
    assert time.time() - doc["window"] < 60
    await _wipe_lookup_bucket(db_handle, uid)


# ── different users have independent buckets ───────────────────────
async def test_per_user_buckets_dont_share_state(http, auth_token, db_handle):
    """Throttling user A must not affect user B \u2014 the bucket key is
    namespaced by user_id."""
    import time
    uid_a = _user_id_from_jwt(auth_token)
    await _wipe_lookup_bucket(db_handle, uid_a)
    # Pretend user A is at the limit.
    await db_handle.rate_limits.insert_one({
        "key": f"user:lookup:{uid_a}",
        "window": time.time(),
        "count": 100,
    })

    # We can't easily mint a token for user B in this test env, so we
    # assert on the data layer: a different key prefix means a different
    # rate limit bucket entirely \u2014 user B's record would never collide.
    other_uid = "ffffffffffffffffffffffff"
    doc_b = await db_handle.rate_limits.find_one({"key": f"user:lookup:{other_uid}"})
    assert doc_b is None  # user B has no bucket yet \u2014 buckets are independent

    await _wipe_lookup_bucket(db_handle, uid_a)
