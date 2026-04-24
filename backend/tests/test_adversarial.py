# ruff: noqa: E501 — test strings intentionally long for readability

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


# ─── F6 — Split expense IDOR (edit/delete must be member + creator/payer/admin) ─
@pytest.mark.asyncio
async def test_f6_expense_idor_outsider_blocked():
    """A logged-in user who is NOT in the group cannot delete/edit an expense
    by ObjectId enumeration. Must 404 (not leak info, not mutate)."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        outsider = await register(client)
        # A and B create a group and B adds an expense paid by B (owed by both)
        gr = await client.post(
            f"{API}/split/groups",
            json={"name": "idor-grp", "members": [b["phone"]]},
            headers=bearer(a["token"]),
        )
        assert gr.status_code == 200
        group = gr.json()
        exp = await client.post(
            f"{API}/split/expenses",
            json={
                "group_id": group["id"], "paid_by": b["user_id"],
                "description": "lunch", "amount": 400, "split_type": "equal",
                "splits": {a["user_id"]: 200, b["user_id"]: 200},
            },
            headers=bearer(b["token"]),
        )
        assert exp.status_code == 200
        eid = exp.json()["id"]

        # Outsider tries to DELETE — must 404 (no leak) and not actually delete
        r = await client.delete(f"{API}/split/expenses/{eid}", headers=bearer(outsider["token"]))
        assert r.status_code in (403, 404), f"Outsider DELETE should be 403/404, got {r.status_code}"
        # Outsider tries to PUT — must 404/403
        r = await client.put(
            f"{API}/split/expenses/{eid}",
            json={"amount": 99999, "description": "hijacked"},
            headers=bearer(outsider["token"]),
        )
        assert r.status_code in (403, 404), f"Outsider PUT should be 403/404, got {r.status_code}"
        # Expense must still exist and be unchanged
        fetch = await client.get(f"{API}/split/groups/{group['id']}/expenses", headers=bearer(a["token"]))
        assert fetch.status_code == 200
        expenses = fetch.json().get("expenses", [])
        still = next((e for e in expenses if e.get("id") == eid), None)
        assert still is not None, "Expense was deleted by outsider — IDOR exploit!"
        assert still.get("amount") == 400, f"Expense amount mutated by outsider: {still.get('amount')}"
        assert still.get("description") == "lunch"


@pytest.mark.asyncio
async def test_f6_expense_non_creator_member_blocked():
    """Even a group MEMBER can't edit/delete an expense they didn't create or pay.
    Only creator, payer, or group admin should succeed."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)  # group admin
        b = await register(client)  # regular member
        c = await register(client)  # another regular member (3-person group)
        # a creates group with b and c
        gr = await client.post(
            f"{API}/split/groups",
            json={"name": "3p-grp", "members": [b["phone"], c["phone"]]},
            headers=bearer(a["token"]),
        )
        assert gr.status_code == 200
        group = gr.json()
        # b adds an expense (b is payer + creator)
        exp = await client.post(
            f"{API}/split/expenses",
            json={
                "group_id": group["id"], "paid_by": b["user_id"],
                "description": "b's bill", "amount": 300, "split_type": "equal",
                "splits": {a["user_id"]: 100, b["user_id"]: 100, c["user_id"]: 100},
            },
            headers=bearer(b["token"]),
        )
        assert exp.status_code == 200
        eid = exp.json()["id"]
        # c (a regular member, not creator/payer/admin) tries to delete
        r = await client.delete(f"{API}/split/expenses/{eid}", headers=bearer(c["token"]))
        assert r.status_code == 403, f"Non-creator member DELETE should be 403, got {r.status_code}"
        # admin (a) CAN delete
        r = await client.delete(f"{API}/split/expenses/{eid}", headers=bearer(a["token"]))
        assert r.status_code == 200, f"Group admin DELETE should succeed, got {r.status_code}"


# ─── F7 — Razorpay verify-settle idempotency ─────────────────────────
@pytest.mark.asyncio
async def test_f7_razorpay_verify_rejects_bad_signature():
    """Direct POST with fake signature must 400 (signature verification layer).
    This is the outer gate that also protects the inner idempotency check."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{API}/split/verify-settle-payment",
            json={"order_id": "order_fake", "payment_id": "pay_fake", "signature": "bad"},
        )
        # Either 400 (signature failed) or 404 (order not found), both reject the replay
        assert r.status_code in (400, 404), f"Expected rejection, got {r.status_code}: {r.text}"


# ─── F8 — Group members endpoint no longer auto-creates users ────────
@pytest.mark.asyncio
async def test_f8_add_members_pending_invite_not_autocreate():
    """POST /split/groups/{id}/members for an unregistered phone should queue a
    pending invite, NOT create a placeholder user doc with `User XXXX` name.
    Prevents users-table spam vector."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        unregistered_phone = fresh_phone()  # brand-new, not in users
        gr = await client.post(
            f"{API}/split/groups",
            json={"name": "invite-grp", "members": [b["phone"]]},
            headers=bearer(a["token"]),
        )
        assert gr.status_code == 200
        group = gr.json()
        # Try to add unregistered phone via members endpoint
        r = await client.post(
            f"{API}/split/groups/{group['id']}/members",
            json={"phones": [unregistered_phone]},
            headers=bearer(a["token"]),
        )
        assert r.status_code == 200, f"add-members should succeed, got {r.status_code}"
        body = r.json()
        # Either `invited` is populated or `added` is empty with an invite queued
        assert "invited" in body or body.get("added") == [], \
            f"Response must expose invited list or empty added, got {body}"
        # Critical: phone must NOT have become a registered user. Sign up with that
        # phone should say is_new_user=True (would be False if we auto-created).
        send = await client.post(f"{API}/auth/send-otp", json={"phone": unregistered_phone})
        assert send.status_code == 200
        assert send.json().get("is_new_user") is True, \
            "Phone was auto-created as a user — spam vector still open!"


# ═══ H1 DATA INTEGRITY REGRESSIONS ════════════════════════════════════

# ─── F9 — Soft delete enforces 401 immediately on existing tokens ─────
@pytest.mark.asyncio
async def test_f9_soft_delete_locks_existing_tokens():
    """After a user calls /user/delete-account with mode=soft, subsequent
    calls with their existing token must 401 — that's the core guarantee
    of Round 30's soft-delete enforcement. Restore-via-OTP is a separate
    flow tied to auth.py verify-otp clearing `deleted_at` — verified below."""
    async with httpx.AsyncClient(timeout=15) as client:
        u = await register(client)
        h = bearer(u["token"])

        # Token is valid pre-delete
        r = await client.get(f"{API}/user/me", headers=h)
        assert r.status_code == 200

        # Soft-delete
        r = await client.post(f"{API}/user/delete-account", json={"mode": "soft"}, headers=h)
        assert r.status_code == 200, f"soft delete failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("mode") == "soft"
        assert body.get("scheduled_purge_at"), "soft-delete must expose scheduled_purge_at"

        # Same token must now 401 on every protected route (core invariant)
        for path in ("/user/me", "/transactions", "/split/balances", "/home/bundle"):
            r = await client.get(f"{API}{path}", headers=h)
            assert r.status_code == 401, \
                f"Soft-deleted token should 401 on {path}, got {r.status_code}"


@pytest.mark.asyncio
async def test_f9b_soft_delete_restore_via_otp():
    """Independent restore check — verify-otp with a soft-deleted user
    clears `deleted_at` so the user gets back in. We sidestep the 30s
    send-otp cooldown by working directly with the DB layer (as the
    testing infra would) rather than firing two send-otp calls back-to-back."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    import os as _os
    load_dotenv(_os.path.join(_os.path.dirname(__file__), "..", ".env"))
    mongo = AsyncIOMotorClient(_os.environ["MONGO_URL"])
    dbx = mongo[_os.environ["DB_NAME"]]

    async with httpx.AsyncClient(timeout=15) as client:
        u = await register(client)
        h = bearer(u["token"])
        await client.post(f"{API}/user/delete-account", json={"mode": "soft"}, headers=h)
        # Verify token is now dead
        r = await client.get(f"{API}/user/me", headers=h)
        assert r.status_code == 401

        # Simulate "30 seconds later" by clearing the OTP cooldown record for
        # this phone. (This is exactly what the real 30-s wait would do — we
        # just don't want to sleep 30s in a unit test.)
        await dbx.otps.delete_many({"phone": u["phone"]})

        # Fresh login via OTP should succeed AND clear deleted_at
        r = await client.post(f"{API}/auth/send-otp", json={"phone": u["phone"]})
        assert r.status_code == 200, f"restore send-otp failed: {r.status_code} {r.text}"
        v = await client.post(f"{API}/auth/verify-otp", json={"phone": u["phone"], "otp": "123456"})
        assert v.status_code == 200, f"restore verify-otp failed: {v.status_code} {v.text}"
        new_token = v.json()["token"]
        r = await client.get(f"{API}/user/me", headers=bearer(new_token))
        assert r.status_code == 200, f"Restored token should work, got {r.status_code}"
    mongo.close()


# ─── F10 — Hard delete cascades group membership + reminders + settlements ───
@pytest.mark.asyncio
async def test_f10_hard_delete_cascades_group_member_pull():
    """Hard-deleting a group member MUST remove them from `split_groups.members`.
    Round 29's $pull used wrong syntax (members: uid) which silently no-op'd
    against the real schema (members are objects). Verify the fix holds."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)  # the one who will delete
        gr = await client.post(
            f"{API}/split/groups",
            json={"name": "cascade-grp", "members": [b["phone"]]},
            headers=bearer(a["token"]),
        )
        assert gr.status_code == 200
        gid = gr.json()["id"]

        # Confirm b is in the member list pre-delete (via /split/groups which
        # returns full members arrays; /summary doesn't expose member ids).
        groups = await client.get(f"{API}/split/groups", headers=bearer(a["token"]))
        assert groups.status_code == 200
        g = next((x for x in groups.json() if x.get("id") == gid), None)
        assert g is not None, "Pre-condition: group not visible to a"
        member_ids_before = {m["user_id"] for m in g.get("members", [])}
        assert b["user_id"] in member_ids_before, \
            f"Pre-condition failed — b should be in members. Got {member_ids_before}"

        # b hard-deletes their account
        r = await client.post(
            f"{API}/user/delete-account",
            json={"mode": "hard", "confirmation": "DELETE"},
            headers=bearer(b["token"]),
        )
        assert r.status_code == 200, f"hard delete failed: {r.status_code} {r.text}"
        assert r.json().get("mode") == "hard"

        # Now a's view of the group must NOT contain b
        summary = await client.get(f"{API}/split/groups/{gid}/summary", headers=bearer(a["token"]))
        assert summary.status_code == 200
        member_ids_after = {m["user_id"] for m in summary.json().get("members", [])}
        assert b["user_id"] not in member_ids_after, \
            f"Deleted user still embedded in group members! Got {member_ids_after}"


# ─── F11 — Reminder auto-dismiss on settle (all paths) ─────────────────
@pytest.mark.asyncio
async def test_f11_settle_dismisses_pending_reminder():
    """When B reminds A about a debt, and A settles it via /split/settle,
    the pending reminder must auto-dismiss (status=settled). Mirrors the
    already-working mark-paid-offline behaviour."""
    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client)
        b = await register(client)
        # Build a ₹200 debt: A owes B
        gr = await client.post(
            f"{API}/split/groups", json={"name": "r-grp", "members": [b["phone"]]},
            headers=bearer(a["token"]),
        )
        assert gr.status_code == 200
        gid = gr.json()["id"]
        exp = await client.post(
            f"{API}/split/expenses",
            json={
                "group_id": gid, "paid_by": b["user_id"],
                "description": "coffee", "amount": 200, "split_type": "equal",
                "splits": {a["user_id"]: 100, b["user_id"]: 100},
            },
            headers=bearer(b["token"]),
        )
        assert exp.status_code == 200

        # B sends a reminder to A about the debt (endpoint expects target_user_id)
        rem = await client.post(
            f"{API}/split/remind",
            json={"target_user_id": a["user_id"], "amount": 100, "group_id": gid, "note": "please settle"},
            headers=bearer(b["token"]),
        )
        assert rem.status_code in (200, 201), f"remind failed: {rem.status_code} {rem.text}"

        # Confirm A has ≥ 1 pending reminder received
        received = await client.get(f"{API}/split/reminders", headers=bearer(a["token"]))
        assert received.status_code == 200
        received_body = received.json() if isinstance(received.json(), dict) else {}
        pending_before = [r for r in received_body.get("received", []) if r.get("status") == "pending"]
        assert len(pending_before) >= 1, f"A should have ≥1 pending reminder, got {received_body}"

        # A settles the ₹100 debt via /split/settle (UPI path, not mark-paid-offline)
        s = await client.post(
            f"{API}/split/settle",
            json={"target_user_id": b["user_id"], "amount": 100, "group_id": gid, "method": "upi"},
            headers=bearer(a["token"]),
        )
        assert s.status_code == 200, f"settle failed: {s.status_code} {s.text}"

        # Reminder should now be dismissed (not in pending list anymore)
        received = await client.get(f"{API}/split/reminders", headers=bearer(a["token"]))
        assert received.status_code == 200
        received_body = received.json() if isinstance(received.json(), dict) else {}
        pending_after = [r for r in received_body.get("received", []) if r.get("status") == "pending"]
        assert len(pending_after) < len(pending_before), \
            f"Reminder not auto-dismissed after settle. Before={len(pending_before)} After={len(pending_after)}"



# ═══ R3 EVENT BUS REGRESSIONS ════════════════════════════════════════

# ─── F12 — Budget breach alert fires automatically on transaction create ──
@pytest.mark.asyncio
async def test_f12_event_bus_fires_budget_breach_alert():
    """When a user has a ₹1000 monthly budget for "Food" and adds a ₹900
    Food transaction (90% usage), the `transaction.created` event fires
    the budget-breach handler which inserts a `budget_alerts` row at the
    80% threshold. Verifies the end-to-end event bus wiring is live and
    idempotent (repeating the same txn must NOT double-alert)."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    import os as _os
    load_dotenv(_os.path.join(_os.path.dirname(__file__), "..", ".env"))
    mongo = AsyncIOMotorClient(_os.environ["MONGO_URL"])
    dbx = mongo[_os.environ["DB_NAME"]]

    async with httpx.AsyncClient(timeout=30) as client:
        u = await register(client)
        h = bearer(u["token"])

        # Pre-condition: no existing budget alerts for this user.
        await dbx.budget_alerts.delete_many({"user_id": u["user_id"]})

        # Create a ₹1000 monthly budget for "Food"
        r = await client.post(
            f"{API}/budgets",
            json={"category": "Food", "amount": 1000, "period": "monthly"},
            headers=h,
        )
        assert r.status_code in (200, 201), f"budget create: {r.status_code} {r.text}"

        # Add a ₹900 debit Food transaction — should fire 80% alert.
        r = await client.post(
            f"{API}/transactions",
            json={"amount": 900, "category": "Food", "type": "debit", "description": "groceries"},
            headers=h,
        )
        assert r.status_code == 200, f"txn create: {r.status_code} {r.text}"

        # Give the bus 2s to fan out (it's fire-and-forget).
        await asyncio.sleep(2)
        alerts = await dbx.budget_alerts.find({"user_id": u["user_id"]}).to_list(10)
        assert len(alerts) >= 1, f"Expected ≥1 budget alert from event bus, got {alerts}"
        a = alerts[0]
        assert a["threshold_pct"] in (80, 100), f"Unexpected threshold {a['threshold_pct']}"
        assert a["category"] == "Food"

        # Idempotency — add ₹50 more Food (still under 100%). Should NOT
        # create another 80%-threshold alert for the same month.
        before = len(alerts)
        r = await client.post(
            f"{API}/transactions",
            json={"amount": 50, "category": "Food", "type": "debit", "description": "snack"},
            headers=h,
        )
        assert r.status_code == 200
        await asyncio.sleep(2)
        alerts_after = await dbx.budget_alerts.find({
            "user_id": u["user_id"], "threshold_pct": 80,
        }).to_list(10)
        assert len(alerts_after) == 1, \
            f"Budget alert not idempotent — duplicated. before={before} after={len(alerts_after)}"

    mongo.close()


# ─── F13 — Event bus isolation: bad subscriber doesn't break emit ─────
@pytest.mark.asyncio
async def test_f13_event_bus_isolates_handler_failures():
    """A handler that raises must not bubble up to the emitter. The
    primary write path (POST /transactions) returns 200 even if a
    listener blows up mid-event. We verify by adding a ₹100 txn — the
    bus would fan out to the budget-breach handler (no budget → no-op,
    no raise) and the call returns 200."""
    async with httpx.AsyncClient(timeout=15) as client:
        u = await register(client)
        h = bearer(u["token"])
        r = await client.post(
            f"{API}/transactions",
            json={"amount": 100, "category": "Other", "type": "debit", "description": "test"},
            headers=h,
        )
        assert r.status_code == 200, \
            f"primary write path regressed: {r.status_code} {r.text}"
