"""Round 53g — Device-based rate limit tests.

Verifies the secondary `enforce_device_rate_limit` gate that closes
the multi-account-from-one-device hole left by per-user limits alone.

Live API approach: pre-seed counters in the rate_limits collection
to fast-forward to threshold conditions (no need to actually loop
N HTTP calls).
"""
from __future__ import annotations

import hashlib
import os
import time
import uuid

import httpx
import pytest

pytestmark = pytest.mark.integration

BASE = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_PHONE = "9876543210"
TEST_OTP = "123456"


# ──────────────────────────────────────────────────────────────────────
#  Fixtures (same shape as test_round52f_rate_limit.py for consistency)
# ──────────────────────────────────────────────────────────────────────
@pytest.fixture
async def http():
    async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as c:
        yield c


@pytest.fixture
async def auth_token(http):
    await http.post("/auth/send-otp", json={"phone": TEST_PHONE})
    r = await http.post(
        "/auth/verify-otp",
        json={"phone": TEST_PHONE, "otp": TEST_OTP, "name": "RateTest"},
    )
    return r.json()["token"]


@pytest.fixture
async def db_handle():
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    url = os.environ.get("MONGO_URL")
    name = os.environ.get("DB_NAME", "test_database")
    if not url:
        pytest.skip("MONGO_URL not configured")
    client = AsyncIOMotorClient(url)
    yield client[name]
    client.close()


def _user_id_from_jwt(token: str) -> str:
    import base64, json
    payload = token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["user_id"]


def _hash_device(raw: str) -> str:
    """Mirror core/rate_limit.py:_hash_device — keep tests in sync."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


async def _wipe(db, key: str):
    await db.rate_limits.delete_many({"key": key})


# ══════════════════════════════════════════════════════════════════════
#  TEST 1 — Per-device gate triggers 429 even when user is under quota.
# ══════════════════════════════════════════════════════════════════════
async def test_device_limit_throttles_when_user_is_under_quota(http, auth_token, db_handle):
    """A device that's accumulated 400 calls (the device ceiling) gets
    429 on the 401st call EVEN IF the per-user counter is at zero.

    This is the multi-account-abuse defence: rotating accounts can't
    drain the per-user limit if the device limit is already exhausted.
    """
    uid = _user_id_from_jwt(auth_token)
    device_id = f"test-device-{uuid.uuid4().hex}"
    device_h = _hash_device(f"hdr:{device_id}")

    # Pre-seed: device at 400/400 (limit hit), user at 0.
    await _wipe(db_handle, f"user:lookup:{uid}")
    await _wipe(db_handle, f"device:lookup:{device_h}")
    await db_handle.rate_limits.insert_one({
        "key": f"device:lookup:{device_h}",
        "window": time.time(),
        "count": 400,  # at the ceiling
    })

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Device-ID": device_id,
    }
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 429, r.text
    assert "Retry-After" in r.headers
    await _wipe(db_handle, f"device:lookup:{device_h}")
    await _wipe(db_handle, f"user:lookup:{uid}")


# ══════════════════════════════════════════════════════════════════════
#  TEST 2 — Same user, different device → independent buckets.
# ══════════════════════════════════════════════════════════════════════
async def test_same_user_different_device_has_independent_bucket(http, auth_token, db_handle):
    """Switching X-Device-ID gives the user a fresh device bucket.
    The user-bucket is shared (one user_id), but device buckets aren't."""
    uid = _user_id_from_jwt(auth_token)
    dev_a = _hash_device("hdr:" + f"deva-{uuid.uuid4().hex}")
    dev_b_raw = f"devb-{uuid.uuid4().hex}"
    dev_b = _hash_device("hdr:" + dev_b_raw)

    await _wipe(db_handle, f"user:lookup:{uid}")
    await _wipe(db_handle, f"device:lookup:{dev_a}")
    await _wipe(db_handle, f"device:lookup:{dev_b}")
    # Saturate device A.
    await db_handle.rate_limits.insert_one({
        "key": f"device:lookup:{dev_a}",
        "window": time.time(),
        "count": 400,
    })

    # Device B should still be allowed (user bucket is at 0).
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Device-ID": dev_b_raw,
    }
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 200, r.text

    await _wipe(db_handle, f"device:lookup:{dev_a}")
    await _wipe(db_handle, f"device:lookup:{dev_b}")
    await _wipe(db_handle, f"user:lookup:{uid}")


# ══════════════════════════════════════════════════════════════════════
#  TEST 3 — Stale device window resets the counter.
# ══════════════════════════════════════════════════════════════════════
async def test_stale_device_window_resets_counter(http, auth_token, db_handle):
    """A device counter > 1h old must be discarded — the next call
    starts a fresh window (count=1)."""
    uid = _user_id_from_jwt(auth_token)
    device_raw = f"devstale-{uuid.uuid4().hex}"
    device_h = _hash_device(f"hdr:{device_raw}")

    await _wipe(db_handle, f"user:lookup:{uid}")
    await _wipe(db_handle, f"device:lookup:{device_h}")
    await db_handle.rate_limits.insert_one({
        "key": f"device:lookup:{device_h}",
        "window": time.time() - 7200,  # 2h ago, stale
        "count": 999,
    })

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Device-ID": device_raw,
    }
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 200, r.text

    doc = await db_handle.rate_limits.find_one({"key": f"device:lookup:{device_h}"})
    assert doc["count"] == 1
    assert time.time() - doc["window"] < 60
    await _wipe(db_handle, f"device:lookup:{device_h}")
    await _wipe(db_handle, f"user:lookup:{uid}")


# ══════════════════════════════════════════════════════════════════════
#  TEST 4 — Fallback fingerprint (no header) uses IP+UA.
# ══════════════════════════════════════════════════════════════════════
async def test_fallback_fingerprint_when_header_missing(http, auth_token, db_handle):
    """When X-Device-ID is missing, the fallback is hash(ip + UA).
    A request without the header must still create a `device:` bucket
    keyed on the IP/UA fingerprint — so absence of the header doesn't
    silently bypass the gate."""
    uid = _user_id_from_jwt(auth_token)
    await _wipe(db_handle, f"user:lookup:{uid}")
    # Wipe any existing fallback bucket that prior tests may have created.
    await db_handle.rate_limits.delete_many({"key": {"$regex": "^device:lookup:"}})

    headers = {"Authorization": f"Bearer {auth_token}"}  # NO X-Device-ID
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 200, r.text

    # A device bucket should now exist (fallback ip:ua fingerprint).
    bucket = await db_handle.rate_limits.find_one({"key": {"$regex": "^device:lookup:"}})
    assert bucket is not None, "fallback fingerprint did not create a device bucket"
    assert bucket["count"] >= 1

    await _wipe(db_handle, f"user:lookup:{uid}")
    await db_handle.rate_limits.delete_many({"key": {"$regex": "^device:lookup:"}})


# ══════════════════════════════════════════════════════════════════════
#  TEST 5 — User limit still wins when it's the tighter bound.
#           (Verifies the combined gate runs USER first.)
# ══════════════════════════════════════════════════════════════════════
async def test_user_limit_still_enforced_independently(http, auth_token, db_handle):
    """User at 100/100 (its ceiling) but device at 0 → 429.
    Confirms `enforce_combined` runs the user gate too, not just device."""
    uid = _user_id_from_jwt(auth_token)
    device_raw = f"devuser-{uuid.uuid4().hex}"
    device_h = _hash_device(f"hdr:{device_raw}")

    await _wipe(db_handle, f"user:lookup:{uid}")
    await _wipe(db_handle, f"device:lookup:{device_h}")
    await db_handle.rate_limits.insert_one({
        "key": f"user:lookup:{uid}",
        "window": time.time(),
        "count": 100,  # at user ceiling
    })

    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Device-ID": device_raw,
    }
    r = await http.post("/users/lookup-batch", json={"phones": []}, headers=headers)
    assert r.status_code == 429, r.text

    await _wipe(db_handle, f"user:lookup:{uid}")
    await _wipe(db_handle, f"device:lookup:{device_h}")


# ══════════════════════════════════════════════════════════════════════
#  TEST 6 — device_fingerprint is deterministic + 16-char hex.
#           (Pure unit test of the helper.)
# ══════════════════════════════════════════════════════════════════════
def test_device_fingerprint_helper_format():
    from core.rate_limit import device_fingerprint
    from starlette.requests import Request

    scope_a = {
        "type": "http",
        "headers": [(b"x-device-id", b"abc123"), (b"user-agent", b"pytest/1.0")],
        "client": ("127.0.0.1", 1234),
    }
    scope_b = {
        "type": "http",
        "headers": [(b"x-device-id", b"abc123"), (b"user-agent", b"pytest/1.0")],
        "client": ("127.0.0.1", 5678),  # different port shouldn't affect fp
    }
    fp_a = device_fingerprint(Request(scope_a))
    fp_b = device_fingerprint(Request(scope_b))
    assert fp_a == fp_b
    assert len(fp_a) == 16
    assert all(c in "0123456789abcdef" for c in fp_a)


def test_device_fingerprint_falls_back_when_header_absent():
    from core.rate_limit import device_fingerprint
    from starlette.requests import Request

    scope = {
        "type": "http",
        "headers": [(b"user-agent", b"pytest/1.0")],
        "client": ("10.0.0.1", 1234),
    }
    fp = device_fingerprint(Request(scope))
    # No header → fallback fingerprint built from IP+UA. Shape only.
    assert len(fp) == 16
    assert all(c in "0123456789abcdef" for c in fp)
