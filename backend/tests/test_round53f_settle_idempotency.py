"""Round 53f — Settle endpoint Idempotency-Key + post-commit tests.

Live-API integration suite. Verifies:

  ✓ Same Idempotency-Key on repeat → exactly one settlement created
  ✓ Two parallel calls with SAME key → one wins, others 200 (cached)
    or 409 (in-flight) — never two distinct settlements
  ✓ Two parallel calls with DIFFERENT keys on same debt →
    advisory lock arbitrates; only one persists
  ✓ /split/partial-settle and /split/mark-paid-offline support the
    same idempotency contract (smoke test each endpoint)
"""
from __future__ import annotations

import asyncio
import os
import uuid

import httpx
import pytest

pytestmark = pytest.mark.integration

BASE = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_OTP = "123456"


@pytest.fixture
async def http():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as c:
        yield c


async def _auth(http, phone: str) -> str:
    await http.post("/auth/send-otp", json={"phone": phone})
    r = await http.post(
        "/auth/verify-otp",
        json={"phone": phone, "otp": TEST_OTP, "name": f"SettleIdem{phone[-4:]}"},
    )
    assert r.status_code == 200, f"verify-otp failed: {r.text}"
    return r.json()["token"]


def _user_id_from_jwt(token: str) -> str:
    import base64, json
    payload = token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["user_id"]


@pytest.fixture
async def setup(http):
    """Two users + a group + a real outstanding debt user[1] owes user[0]."""
    phones = ["9100000041", "9100000042"]
    tokens = [await _auth(http, p) for p in phones]
    uids = [_user_id_from_jwt(t) for t in tokens]
    # Fresh group each run.
    r = await http.post(
        "/split/groups",
        json={"name": f"settle-{uuid.uuid4().hex[:6]}", "members": phones},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert r.status_code == 200, r.text
    gid = r.json()["id"]
    # Create a ₹100 expense paid by user[0] split equally → user[1] owes ₹50.
    r = await http.post(
        "/split/expenses",
        json={"group_id": gid, "description": f"setup-{uuid.uuid4().hex[:6]}",
              "amount": 100.00, "split_type": "equal"},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert r.status_code == 200, r.text
    return tokens, uids, gid


async def _count_settlements(http, token: str) -> int:
    r = await http.get(
        "/split/settlements",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    return len(r.json())


# ──────────────────────────────────────────────────────────────────────
#  TEST 1 — Sequential retry: same key, second call replays response.
# ──────────────────────────────────────────────────────────────────────
async def test_settle_retry_with_same_key_replays_response(http, setup):
    tokens, uids, gid = setup
    payer_token = tokens[1]
    payee_id = uids[0]
    key = f"idem-settle-{uuid.uuid4().hex}"

    headers = {"Authorization": f"Bearer {payer_token}", "Idempotency-Key": key}
    payload = {"target_user_id": payee_id, "amount": 25.00,
               "method": "upi", "group_id": gid}

    before = await _count_settlements(http, payer_token)
    r1 = await http.post("/split/settle", json=payload, headers=headers)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    # Retry with the same key → must replay, no second insert.
    r2 = await http.post("/split/settle", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == first_id, "retry created a duplicate settlement"
    after = await _count_settlements(http, payer_token)
    assert after == before + 1


# ──────────────────────────────────────────────────────────────────────
#  TEST 2 — Concurrent, SAME key: exactly one settlement persists.
# ──────────────────────────────────────────────────────────────────────
async def test_settle_concurrent_same_key_creates_one(http, setup):
    tokens, uids, gid = setup
    payer_token = tokens[1]
    payee_id = uids[0]
    key = f"idem-settle-{uuid.uuid4().hex}"

    async def _settle():
        return await http.post(
            "/split/settle",
            json={"target_user_id": payee_id, "amount": 10.00,
                  "method": "upi", "group_id": gid},
            headers={"Authorization": f"Bearer {payer_token}", "Idempotency-Key": key},
        )

    before = await _count_settlements(http, payer_token)
    responses = await asyncio.gather(*[_settle() for _ in range(5)])
    after = await _count_settlements(http, payer_token)

    statuses = [r.status_code for r in responses]
    other = [s for s in statuses if s not in (200, 409)]
    assert not other, f"unexpected statuses: {statuses}"
    # ALL 200s must reference the SAME settlement id.
    ids_200 = {r.json().get("id") for r in responses if r.status_code == 200}
    assert len(ids_200) == 1, f"different settlement ids: {ids_200}"
    # And exactly ONE settlement was actually inserted.
    assert after == before + 1, f"expected 1 new settlement, got {after - before}"


# ──────────────────────────────────────────────────────────────────────
#  TEST 3 — Concurrent, DIFFERENT keys, same debt: lock arbitrates.
# ──────────────────────────────────────────────────────────────────────
async def test_settle_concurrent_different_keys_only_one_succeeds(http, setup):
    tokens, uids, gid = setup
    payer_token = tokens[1]
    payee_id = uids[0]

    async def _settle(idem: str):
        return await http.post(
            "/split/settle",
            json={"target_user_id": payee_id, "amount": 50.00,
                  "method": "upi", "group_id": gid},
            headers={"Authorization": f"Bearer {payer_token}", "Idempotency-Key": idem},
        )

    a, b = await asyncio.gather(
        _settle(f"k1-{uuid.uuid4().hex}"),
        _settle(f"k2-{uuid.uuid4().hex}"),
    )
    statuses = [a.status_code, b.status_code]
    # Without idempotency-key collision, the only protection is the
    # advisory `_settle_lock`: at most one 200, the other 429 or 400
    # ("no outstanding debt" if the lock released between phases).
    assert statuses.count(200) == 1, (
        f"expected exactly 1 success, got {statuses}: "
        f"a={a.text[:200]} b={b.text[:200]}"
    )


# ──────────────────────────────────────────────────────────────────────
#  TEST 4 — partial-settle accepts the same idempotency contract.
# ──────────────────────────────────────────────────────────────────────
async def test_partial_settle_idempotent_retry(http, setup):
    tokens, uids, gid = setup
    payer_token = tokens[1]
    payee_id = uids[0]
    key = f"idem-partial-{uuid.uuid4().hex}"

    payload = {"target_user_id": payee_id, "amount": 5.00,
               "method": "upi", "group_id": gid}
    headers = {"Authorization": f"Bearer {payer_token}", "Idempotency-Key": key}

    before = await _count_settlements(http, payer_token)
    r1 = await http.post("/split/partial-settle", json=payload, headers=headers)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    r2 = await http.post("/split/partial-settle", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == first_id

    after = await _count_settlements(http, payer_token)
    assert after == before + 1


# ──────────────────────────────────────────────────────────────────────
#  TEST 5 — mark-paid-offline supports the contract.
# ──────────────────────────────────────────────────────────────────────
async def test_mark_paid_offline_idempotent_retry(http, setup):
    tokens, uids, gid = setup
    payer_token = tokens[1]
    payee_id = uids[0]
    key = f"idem-offline-{uuid.uuid4().hex}"

    payload = {"target_user_id": payee_id, "amount": 5.00,
               "method": "cash", "group_id": gid, "note": "offline retry"}
    headers = {"Authorization": f"Bearer {payer_token}", "Idempotency-Key": key}

    before = await _count_settlements(http, payer_token)
    r1 = await http.post("/split/mark-paid-offline", json=payload, headers=headers)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    r2 = await http.post("/split/mark-paid-offline", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == first_id

    after = await _count_settlements(http, payer_token)
    assert after == before + 1
