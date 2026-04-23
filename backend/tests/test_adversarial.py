"""
Adversarial-regression pytest suite.

Locks in the 5 security / fraud fixes shipped in Round 29 series
(Apr 23 2026). Runs against a live FastAPI instance — requires the
backend to be up at http://localhost:8001 (or $BACKEND_URL).

Run:
    cd /app/backend
    pytest tests/test_adversarial.py -v

Coverage:
  F1  Dead-token universal 401 (core/auth.py get_current_user DB check)
  F2  Phantom-settle + double-settle (split_settle compute_outstanding_debt)
  F3  Phone field type validation (schemas.py Pydantic validators)
  F4  OTP brute-force phone-level rate limit (auth.py otp_audit)
  F5  Coin dedupe_key idempotency (analytics.py /coins/award)
"""
import asyncio
import os
import random
import time
import uuid
import pytest
import httpx

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND}/api"


# ─── Helpers ──────────────────────────────────────────────────────────
def fresh_phone() -> str:
    """Generate a unique 10-digit Indian mobile. Starts with 9, random 9 digits."""
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


async def register(client: httpx.AsyncClient, phone: str | None = None) -> dict:
    phone = phone or fresh_phone()
    r = await client.post(f"{API}/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    # New users need a display name — match the real client contract.
    r = await client.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456", "name": f"Test {phone[-4:]}"})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    body = r.json()
    # Response shape is {token, user: {id, ...}} in this codebase
    user_obj = body.get("user") or {}
    return {"token": body["token"], "user_id": user_obj.get("id") or body.get("user_id"), "phone": phone}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── F1 — Dead-token universal rejection ─────────────────────────────
@pytest.mark.asyncio
async def test_f1_deadtoken_universal_401():
    """Every protected route must 401 after hard-delete (was 200 pre-Round-29b)."""
    async with httpx.AsyncClient(timeout=30) as client:
        u = await register(client)
        h = bearer(u["token"])

        # Baseline — alive
        r = await client.get(f"{API}/user/me", headers=h)
        assert r.status_code == 200, "alive user should return 200 pre-delete"

        # Hard delete
        r = await client.post(f"{API}/user/delete-account", json={"mode": "hard", "confirmation": "DELETE"}, headers=h)
        assert r.status_code == 200

        # Now every protected route must 401 with the same (dead) token.
        routes = [
            ("GET", "/user/me"),
            ("GET", "/transactions"),
            ("GET", "/home/bundle?lang=en"),
            ("GET", "/split/groups"),
            ("GET", "/leaderboard/unified?scope=contacts"),
            ("GET", "/user/payment-methods"),
            ("GET", "/budgets/live"),
            ("GET", "/split/balances"),
            ("GET", "/gamification/status"),
            ("GET", "/rewards/marketplace"),
        ]
        for method, path in routes:
            if method == "GET":
                r = await client.get(f"{API}{path}", headers=h)
            assert r.status_code == 401, \
                f"Dead-token on {method} {path} should 401, got {r.status_code}"


@pytest.mark.asyncio
async def test_f1_regression_live_user_still_works():
    """The DB existence check must not break living users."""
    async with httpx.AsyncClient(timeout=30) as client:
        u = await register(client)
        h = bearer(u["token"])
        r = await client.get(f"{API}/user/me", headers=h)
        assert r.status_code == 200
        r = await client.get(f"{API}/transactions", headers=h)
        assert r.status_code == 200


# ─── F2 — Phantom-settle + double-settle race ────────────────────────
@pytest.mark.asyncio
async def test_f2_phantom_settle_rejected():
    """Settling when no debt exists must 400."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        payload = {"target_user_id": b["user_id"], "amount": 500, "method": "upi"}
        r = await client.post(f"{API}/split/settle", json=payload, headers=bearer(a["token"]))
        assert r.status_code == 400 and "No outstanding debt" in r.text


@pytest.mark.asyncio
async def test_f2_over_amount_rejected():
    """Amount > outstanding + ₹0.50 must 400."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        # Build a real debt of ₹300 (A owes B) via a group expense
        gr = await client.post(f"{API}/split/groups", json={"name": "test-grp", "members": [b["phone"]]}, headers=bearer(a["token"]))
        assert gr.status_code == 200, f"create group failed: {gr.status_code} {gr.text}"
        grp = gr.json()
        exp = await client.post(
            f"{API}/split/expenses",
            json={"group_id": grp["id"], "paid_by": b["user_id"], "description": "dinner", "amount": 600, "split_type": "equal", "splits": {a["user_id"]: 300, b["user_id"]: 300}},
            headers=bearer(b["token"]),
        )
        assert exp.status_code == 200
        # Over-amount
        r = await client.post(
            f"{API}/split/settle",
            json={"target_user_id": b["user_id"], "amount": 9999, "method": "upi", "group_id": grp["id"]},
            headers=bearer(a["token"]),
        )
        assert r.status_code == 400 and "exceeds outstanding" in r.text


@pytest.mark.asyncio
async def test_f2_double_settle_race():
    """5 concurrent settles of the same debt → only 1 succeeds."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        grp = (await client.post(f"{API}/split/groups", json={"name": "race-grp", "members": [b["phone"]]}, headers=bearer(a["token"]))).json()
        await client.post(
            f"{API}/split/expenses",
            json={"group_id": grp["id"], "paid_by": b["user_id"], "description": "race", "amount": 600, "split_type": "equal", "splits": {a["user_id"]: 300, b["user_id"]: 300}},
            headers=bearer(b["token"]),
        )
        payload = {"target_user_id": b["user_id"], "amount": 300, "method": "upi", "group_id": grp["id"]}
        # Serial sub for race — concurrent in same process is flaky on httpx; sequentially
        # each subsequent call sees the prior settlement, still verifying the guard.
        tasks = [client.post(f"{API}/split/settle", json=payload, headers=bearer(a["token"])) for _ in range(5)]
        responses = await asyncio.gather(*tasks)
        codes = [r.status_code for r in responses]
        assert codes.count(200) == 1, f"Expected exactly 1 success, got codes {codes}"


# ─── F3 — Phone type validation (NoSQL injection) ────────────────────
@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"phone": {"$ne": None}},
    {"phone": None},
    {"phone": 9876543210},
    {"phone": ["9876543210"]},
    {"phone": "98765abcdef"},
])
async def test_f3_send_otp_rejects_non_string(payload):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{API}/auth/send-otp", json=payload)
        assert r.status_code in (400, 422), f"Expected 4xx for {payload}, got {r.status_code}"


@pytest.mark.asyncio
async def test_f3_verify_otp_rejects_dict():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{API}/auth/verify-otp", json={"phone": {"$ne": None}, "otp": "123456"})
        assert r.status_code in (400, 422)
        r = await client.post(f"{API}/auth/verify-otp", json={"phone": "9876543210", "otp": {"$ne": None}})
        assert r.status_code in (400, 422)


# ─── F4 — OTP brute-force phone-level rate limit ─────────────────────
@pytest.mark.asyncio
async def test_f4_otp_bruteforce_lockout():
    """Brute force must be stopped by SOME rate limit (phone-level 429 on
    verify-otp, OR send-otp 429 on rapid OTP requests). Both are valid
    defences added in Round 29c. Test passes if we see ANY 429 before
    fleet of wrong guesses completes."""
    phone = fresh_phone()
    saw_429 = False
    async with httpx.AsyncClient(timeout=30) as client:
        for cycle in range(8):  # burn OTPs
            r = await client.post(f"{API}/auth/send-otp", json={"phone": phone})
            if r.status_code == 429:
                saw_429 = True; break
            for _ in range(5):
                wrong = "".join(str(random.randint(0, 9)) for _ in range(6))
                rr = await client.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": wrong})
                if rr.status_code == 429:
                    saw_429 = True; break
            if saw_429: break
    assert saw_429, "Expected a 429 rate-limit at some point during brute force; got none."


# ─── F5 — Coin award dedupe_key idempotency ──────────────────────────
@pytest.mark.asyncio
async def test_f5_coin_dedupe_key_idempotent():
    async with httpx.AsyncClient(timeout=15) as client:
        u = await register(client)
        h = bearer(u["token"])
        key = f"txn_{uuid.uuid4().hex[:12]}"
        r1 = await client.post(f"{API}/coins/award", json={"action": "add_transaction", "dedupe_key": key}, headers=h)
        assert r1.status_code == 200 and r1.json().get("awarded", 0) > 0
        r2 = await client.post(f"{API}/coins/award", json={"action": "add_transaction", "dedupe_key": key}, headers=h)
        assert r2.status_code == 200 and r2.json().get("awarded", 0) == 0
        assert r2.json().get("reason") == "already_awarded"


@pytest.mark.asyncio
async def test_f5_coin_no_dedupe_backcompat():
    """Call without dedupe_key still works as before."""
    async with httpx.AsyncClient(timeout=15) as client:
        u = await register(client)
        h = bearer(u["token"])
        r = await client.post(f"{API}/coins/award", json={"action": "open_app_daily"}, headers=h)
        assert r.status_code == 200
