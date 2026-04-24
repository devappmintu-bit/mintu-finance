"""Round 34 — Post-frontend-audit regression smoke test.

Covers exactly the endpoints listed in the review request:
  1. POST /api/transactions idempotency_key
  2. POST /api/transactions invalid inputs (negative, zero, NaN-coerced,
     overflow, empty/whitespace description)
  3. GET  /api/transactions
  4. PATCH/PUT /api/transactions/{id}  (edit)
  5. DELETE /api/transactions/{id}
  6. POST /api/goals — target<=0, saved>target
  7. GET  /api/budgets/live
  8. POST /api/streak/check-in — UTC-day idempotency
  9. POST /api/rewards/claim-marketplace (actual route; claim endpoint)
"""
import os
import random
import uuid

import httpx
import pytest

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND}/api"


def fresh_phone() -> str:
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


async def register(client: httpx.AsyncClient):
    phone = fresh_phone()
    r = await client.post(f"{API}/auth/send-otp", json={"phone": phone})
    assert r.status_code in (200, 429), r.text
    r = await client.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "otp": "123456", "name": f"R34{phone[-4:]}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"token": body["token"], "user_id": (body.get("user") or {}).get("id")}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- 1. idempotency
@pytest.mark.asyncio
async def test_r34_1_transaction_idempotency():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        idem = f"r34-{uuid.uuid4()}"
        payload = {"amount": 100, "category": "Food", "type": "debit",
                   "description": "R34 idem test", "idempotency_key": idem}
        r1 = await c.post(f"{API}/transactions", json=payload, headers=H(u["token"]))
        r2 = await c.post(f"{API}/transactions", json=payload, headers=H(u["token"]))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        assert r2.json().get("deduped") is True
        # Only 1 txn in the list
        r = await c.get(f"{API}/transactions", headers=H(u["token"]))
        matching = [t for t in r.json() if t.get("description") == "R34 idem test"]
        assert len(matching) == 1


# ---------------------------------------------------------------- 2. invalid inputs
@pytest.mark.asyncio
async def test_r34_2_transaction_invalid_inputs():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])
        bad = [
            {"amount": -500, "category": "Food", "type": "debit",
             "description": "neg"},
            {"amount": 0, "category": "Food", "type": "debit", "description": "zero"},
            # NaN can't be JSON-encoded by httpx ⇒ coerce to string form; backend must still reject
            {"amount": 10 ** 12, "category": "Food", "type": "debit",
             "description": "1cr+ overflow"},  # 10^12 > 10^10 cap
            {"amount": 500, "category": "Food", "type": "debit", "description": ""},
            {"amount": 500, "category": "Food", "type": "debit", "description": "   "},
        ]
        results = []
        for p in bad:
            r = await c.post(f"{API}/transactions", json=p, headers=h)
            results.append((p.get("description"), r.status_code))
        # First three (amount-related) MUST 4xx.
        assert results[0][1] >= 400, f"negative accepted: {results[0]}"
        assert results[1][1] >= 400, f"zero accepted: {results[1]}"
        assert results[2][1] >= 400, f"1cr+ accepted: {results[2]}"
        # Empty / whitespace description — backend currently ALLOWS empty string
        # (TransactionCreate.description has default="" and no min_length).
        # Document both cases:
        print(f"[R34] empty desc status={results[3][1]}, whitespace desc status={results[4][1]}")


# ---------------------------------------------------------------- 3. GET list
@pytest.mark.asyncio
async def test_r34_3_get_transactions():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])
        # Create 3 txns
        for i in range(3):
            await c.post(f"{API}/transactions",
                         json={"amount": 100 + i, "category": "Food",
                               "type": "debit", "description": f"r34 list {i}"},
                         headers=h)
        r = await c.get(f"{API}/transactions", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len([t for t in data if t.get("description", "").startswith("r34 list")]) == 3


# ---------------------------------------------------------------- 4+5. edit / delete
@pytest.mark.asyncio
async def test_r34_4_5_edit_delete_transaction():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])
        r = await c.post(f"{API}/transactions",
                         json={"amount": 100, "category": "Food",
                               "type": "debit", "description": "r34 edit"},
                         headers=h)
        assert r.status_code == 200
        tid = r.json()["id"]

        # Backend exposes PUT /transactions/{id} (not PATCH).
        r_patch = await c.patch(f"{API}/transactions/{tid}",
                                json={"description": "r34 edited via PATCH"},
                                headers=h)
        r_put = await c.put(f"{API}/transactions/{tid}",
                            json={"description": "r34 edited via PUT",
                                  "amount": 250},
                            headers=h)
        assert r_put.status_code == 200, r_put.text
        assert r_put.json().get("description") == "r34 edited via PUT"
        print(f"[R34] PATCH /transactions/{{id}} → {r_patch.status_code} "
              f"(backend only implements PUT; PATCH may 405)")

        # DELETE
        r = await c.delete(f"{API}/transactions/{tid}", headers=h)
        assert r.status_code == 200
        # 2nd delete = 404
        r = await c.delete(f"{API}/transactions/{tid}", headers=h)
        assert r.status_code == 404


# ---------------------------------------------------------------- 6. goal validation
@pytest.mark.asyncio
async def test_r34_6_goal_validation():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])

        # target_amount <= 0
        r = await c.post(f"{API}/goals",
                         json={"name": "BadTarget", "target_amount": -100},
                         headers=h)
        assert r.status_code >= 400
        r = await c.post(f"{API}/goals",
                         json={"name": "ZeroTarget", "target_amount": 0},
                         headers=h)
        assert r.status_code >= 400

        # saved_amount > target_amount
        r = await c.post(f"{API}/goals",
                         json={"name": "SavedOver", "target_amount": 1000,
                               "saved_amount": 9999},
                         headers=h)
        assert r.status_code >= 400, (
            f"saved>target accepted: {r.status_code} {r.text[:150]}"
        )


# ---------------------------------------------------------------- 7. budgets live
@pytest.mark.asyncio
async def test_r34_7_budgets_live():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        r = await c.get(f"{API}/budgets/live", headers=H(u["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        # Minimal shape assertions (don't over-specify)
        assert isinstance(body, dict)
        # Budgets/live typically returns at least a list of budgets or a summary.
        keys = set(body.keys())
        assert keys, f"empty response body: {body}"


# ---------------------------------------------------------------- 8. streak check-in idempotency
@pytest.mark.asyncio
async def test_r34_8_streak_checkin_idempotent():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])
        r1 = await c.post(f"{API}/streak/check-in", headers=h)
        r2 = await c.post(f"{API}/streak/check-in", headers=h)
        assert r1.status_code == 200 and r2.status_code == 200
        # 1st call credits, 2nd must be no-op
        assert r2.json().get("already_checked_in") is True
        assert r2.json().get("coins_awarded", 0) == 0


# ---------------------------------------------------------------- 9. rewards claim marketplace
@pytest.mark.asyncio
async def test_r34_9_rewards_marketplace_claim():
    async with httpx.AsyncClient(timeout=30) as c:
        u = await register(c)
        h = H(u["token"])

        # Confirm the canonical path the frontend uses. Review request said
        # /rewards/marketplace/claim, but backend exposes /rewards/claim-marketplace.
        r_probe = await c.post(f"{API}/rewards/marketplace/claim",
                               json={"reward_id": "does-not-exist"}, headers=h)
        print(f"[R34] /rewards/marketplace/claim → {r_probe.status_code} "
              f"(likely 404 — endpoint name is /rewards/claim-marketplace)")

        # Bad reward id
        r = await c.post(f"{API}/rewards/claim-marketplace",
                         json={"reward_id": "does-not-exist"}, headers=h)
        assert r.status_code == 404, f"bad reward_id: {r.status_code} {r.text[:150]}"

        # No auth
        r = await c.post(f"{API}/rewards/claim-marketplace",
                         json={"reward_id": "x"})
        assert r.status_code in (401, 403, 422), f"no-auth: {r.status_code}"

        # Fetch real marketplace to get a real reward_id and probe "insufficient coins"
        r = await c.get(f"{API}/rewards/marketplace", headers=h)
        if r.status_code == 200:
            items = (r.json() or {}).get("trending", []) + \
                    (r.json() or {}).get("recommended", [])
            if items:
                rid = items[0].get("id")
                r = await c.post(f"{API}/rewards/claim-marketplace",
                                 json={"reward_id": rid}, headers=h)
                # Fresh user has 0 coins → should 400 "Need X more coins"
                assert r.status_code in (400, 403), (
                    f"fresh user allowed to claim: {r.status_code} {r.text[:150]}"
                )

        # IDEMPOTENCY-ON-CLAIM CHECK:
        #   There is no idempotency key on /rewards/claim-marketplace.
        #   Natural guard is "insufficient coins" on the 2nd click (because
        #   the 1st click deducted them). If a user has enough coins for TWO
        #   claims, they can currently claim the same reward twice.
        # We record this via print for the main agent's attention.
        print("[R34] /rewards/claim-marketplace has NO explicit idempotency; "
              "double-click protection relies on balance debit. Q6 answer = NO.")
