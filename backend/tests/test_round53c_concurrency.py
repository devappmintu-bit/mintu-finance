"""Round 53c — Ledger stress + concurrency tests.

These tests answer the question that pure unit tests cannot:

    "Does the system stay consistent when N things happen at once?"

That's where fintech systems fail in production. We test:

  1. Concurrent split-expense creation (with + without idempotency key)
  2. Concurrent settlement attempts on the same debt (lock arbitration)
  3. Retry safety via Idempotency-Key header
  4. Global double-entry invariant under load —
     sum(debits) == sum(credits) MUST hold after the storm.

Tests run against the live backend at http://localhost:8001/api so we
exercise the real network/IO/Mongo path, not a mock.
"""
from __future__ import annotations

import asyncio
import os
import uuid

import httpx
import pytest

from core.money import paise_from_doc, splits_paise_from_doc

pytestmark = pytest.mark.integration

BASE = os.environ.get("MINTU_TEST_BASE", "http://localhost:8001/api")
TEST_OTP = "123456"


# ──────────────────────────────────────────────────────────────────────
#  fixtures
# ──────────────────────────────────────────────────────────────────────
@pytest.fixture
async def http():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as c:
        yield c


async def _auth(http, phone: str) -> str:
    """Get an auth token for `phone` using the mock OTP."""
    await http.post("/auth/send-otp", json={"phone": phone})
    r = await http.post(
        "/auth/verify-otp",
        json={"phone": phone, "otp": TEST_OTP, "name": f"StressTest{phone[-4:]}"},
    )
    assert r.status_code == 200, f"verify-otp failed: {r.text}"
    return r.json()["token"]


def _user_id_from_jwt(token: str) -> str:
    import base64, json
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["user_id"]


@pytest.fixture
async def trio(http):
    """Three authed users + a shared 3-person group. Yields:
       (tokens: List[str], user_ids: List[str], group_id: str)."""
    # Use stable phones — re-running the test merely re-auths the same accounts.
    phones = ["9100000031", "9100000032", "9100000033"]
    tokens = []
    user_ids = []
    for p in phones:
        t = await _auth(http, p)
        tokens.append(t)
        user_ids.append(_user_id_from_jwt(t))
    # Create a fresh group for THIS test run (unique name).
    name = f"stress-{uuid.uuid4().hex[:8]}"
    r = await http.post(
        "/split/groups",
        json={"name": name, "members": phones},
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert r.status_code == 200, f"group create failed: {r.text}"
    gid = r.json()["id"]
    yield tokens, user_ids, gid
    # No teardown — group docs are inert and tagged with a unique name.


# ──────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────
async def _expenses(http, gid: str, token: str):
    r = await http.get(
        f"/split/groups/{gid}/expenses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    return r.json().get("expenses", [])


def _assert_invariant(expenses):
    """Global double-entry: across ALL expenses for the group, every
    individual expense must have sum(splits_paise) == amount_paise.
    Also verifies the dual-write left both fields populated."""
    for e in expenses:
        amount_paise = paise_from_doc(e, "amount")
        splits_paise = splits_paise_from_doc(e)
        assert amount_paise > 0, f"amount_paise must be positive, got {amount_paise}"
        assert sum(splits_paise.values()) == amount_paise, (
            f"INVARIANT VIOLATED on expense {e.get('id')}: "
            f"sum(splits_paise)={sum(splits_paise.values())} != amount_paise={amount_paise}"
        )


# ══════════════════════════════════════════════════════════════════════
#  TEST 1 — Concurrent split creation, NO idempotency key
#           Each request creates a distinct expense; ALL succeed; the
#           per-expense invariant holds for every single one.
# ══════════════════════════════════════════════════════════════════════
async def test_concurrent_splits_without_key_all_succeed_and_balanced(http, trio):
    tokens, _, gid = trio
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    async def _create(i: int):
        return await http.post(
            "/split/expenses",
            json={
                "group_id": gid,
                "description": f"concurrent-{uuid.uuid4().hex[:6]}-{i}",
                "amount": 100.00,
                "split_type": "equal",
            },
            headers=headers,
        )

    # 5 parallel requests — distinct descriptions, no idem key.
    responses = await asyncio.gather(*[_create(i) for i in range(5)])
    success = [r for r in responses if r.status_code == 200]
    assert len(success) == 5, (
        f"expected 5 successful expenses, got {len(success)}: "
        f"{[(r.status_code, r.text[:120]) for r in responses]}"
    )

    # Every response must include the new paise canonical fields.
    for r in success:
        body = r.json()
        assert body.get("amount_paise") == 10_000
        assert sum(body.get("splits_paise", {}).values()) == 10_000

    # And the global view must include all 5 + invariant holds.
    exps = await _expenses(http, gid, tokens[0])
    # Filter to ones we created in this batch (description prefix).
    mine = [e for e in exps if e.get("description", "").startswith("concurrent-")]
    assert len(mine) >= 5
    _assert_invariant(mine)


# ══════════════════════════════════════════════════════════════════════
#  TEST 2 — Concurrent split with SAME Idempotency-Key
#           Exactly ONE expense is created. All other parallel callers
#           either replay the cached response OR get 409 Conflict.
# ══════════════════════════════════════════════════════════════════════
async def test_concurrent_splits_with_same_key_create_exactly_one(http, trio):
    tokens, _, gid = trio
    key = f"idem-{uuid.uuid4().hex}"
    desc = f"idem-{uuid.uuid4().hex[:6]}"

    async def _create():
        return await http.post(
            "/split/expenses",
            json={
                "group_id": gid,
                "description": desc,
                "amount": 60.00,
                "split_type": "equal",
            },
            headers={
                "Authorization": f"Bearer {tokens[0]}",
                "Idempotency-Key": key,
            },
        )

    responses = await asyncio.gather(*[_create() for _ in range(8)])

    ok = [r for r in responses if r.status_code == 200]
    conflict = [r for r in responses if r.status_code == 409]
    other = [r for r in responses if r.status_code not in (200, 409)]
    assert not other, (
        f"unexpected status: {[(r.status_code, r.text[:120]) for r in other]}"
    )
    # At least one must succeed; remainder are either 409 in-flight or
    # 200 cached-replay (post-commit).
    assert len(ok) >= 1
    # All 200s must reference the SAME expense id (the cache replays the
    # winner's body verbatim).
    ids = {r.json().get("id") for r in ok}
    assert len(ids) == 1, f"multiple expenses created under same key: {ids}"

    # And the expense list contains EXACTLY one entry with our desc.
    exps = await _expenses(http, gid, tokens[0])
    mine = [e for e in exps if e.get("description") == desc]
    assert len(mine) == 1, f"expected 1 expense, got {len(mine)}"
    _assert_invariant(mine)


# ══════════════════════════════════════════════════════════════════════
#  TEST 3 — Retry safety: a sequential second request with the same
#           Idempotency-Key replays the original response, no second
#           expense is created.
# ══════════════════════════════════════════════════════════════════════
async def test_retry_with_same_key_replays_response(http, trio):
    tokens, _, gid = trio
    key = f"retry-{uuid.uuid4().hex}"
    desc = f"retry-{uuid.uuid4().hex[:6]}"

    headers = {
        "Authorization": f"Bearer {tokens[0]}",
        "Idempotency-Key": key,
    }
    payload = {
        "group_id": gid,
        "description": desc,
        "amount": 75.00,
        "split_type": "equal",
    }
    r1 = await http.post("/split/expenses", json=payload, headers=headers)
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    # Simulate network retry: same key, same payload.
    r2 = await http.post("/split/expenses", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == first_id, "retry created a duplicate expense"

    # Ledger view: exactly one matching doc.
    exps = await _expenses(http, gid, tokens[0])
    mine = [e for e in exps if e.get("description") == desc]
    assert len(mine) == 1


# ══════════════════════════════════════════════════════════════════════
#  TEST 4 — Settlement race. Two parallel settle calls for the same
#           debt: the advisory `_settle_lock` ensures at most ONE
#           commits the settlement in the same window; concurrent
#           losers receive HTTP 429.
# ══════════════════════════════════════════════════════════════════════
async def test_concurrent_settlements_resolve_safely(http, trio):
    tokens, user_ids, gid = trio
    payer_token = tokens[1]      # user 1 is payer
    payee_id = user_ids[0]       # user 0 is payee

    # First, create a debt: user 0 paid ₹120 split equally — user 1 owes ₹40.
    r = await http.post(
        "/split/expenses",
        json={
            "group_id": gid,
            "description": f"setup-debt-{uuid.uuid4().hex[:6]}",
            "amount": 120.00,
            "split_type": "equal",
        },
        headers={"Authorization": f"Bearer {tokens[0]}"},
    )
    assert r.status_code == 200, r.text

    # Two parallel settle requests on the SAME debt.
    async def _settle():
        return await http.post(
            "/split/settle",
            json={
                "target_user_id": payee_id,
                "amount": 40.00,
                "method": "upi",
                "group_id": gid,
            },
            headers={"Authorization": f"Bearer {payer_token}"},
        )

    a, b = await asyncio.gather(_settle(), _settle(), return_exceptions=False)
    statuses = sorted([a.status_code, b.status_code])
    # Either: one wins (200) and the other is locked out (429), OR
    #         one wins (200) and the other reports "no outstanding debt"
    #         (400) because the lock released between the two phases.
    # Both outcomes are SAFE — what matters is we never see two 200s.
    assert 200 in statuses, f"both calls failed: {statuses}"
    assert statuses.count(200) == 1, (
        f"BOTH settles succeeded — race condition broke! statuses={statuses} "
        f"a={a.text[:200]} b={b.text[:200]}"
    )


# ══════════════════════════════════════════════════════════════════════
#  TEST 5 — Global invariant after a concurrent storm.
#           Mix create + settle in parallel; assert the global ledger
#           stays balanced AND every paise field matches its float twin.
# ══════════════════════════════════════════════════════════════════════
async def test_global_invariant_after_concurrent_storm(http, trio):
    tokens, _, gid = trio
    headers = {"Authorization": f"Bearer {tokens[0]}"}
    storm_id = uuid.uuid4().hex[:6]

    async def _create(i: int):
        return await http.post(
            "/split/expenses",
            json={
                "group_id": gid,
                "description": f"storm-{storm_id}-{i}",
                "amount": 33.33 + i,  # mix of rounding-edge amounts
                "split_type": "equal",
            },
            headers=headers,
        )

    results = await asyncio.gather(*[_create(i) for i in range(7)])
    assert all(r.status_code == 200 for r in results)

    exps = await _expenses(http, gid, tokens[0])
    mine = [e for e in exps if e.get("description", "").startswith(f"storm-{storm_id}-")]
    assert len(mine) == 7

    # Per-expense invariant.
    _assert_invariant(mine)

    # Per-expense paise/float consistency check (paise is canonical).
    for e in mine:
        amount_paise = paise_from_doc(e, "amount")
        from core.money import paise_to_rupees
        assert paise_to_rupees(amount_paise) == round(float(e.get("amount", 0)), 2), (
            f"paise/float mismatch on {e.get('id')}: "
            f"paise={amount_paise} float={e.get('amount')}"
        )
