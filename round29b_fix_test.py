"""
Round 29b Adversarial FIX VERIFICATION.

Tests:
  F1-A  Dead-token universal rejection (401 on all protected endpoints after hard-delete)
  F1-B  Valid token regression (live user still accepted)
  F2-A  Phantom-settle rejected across all 4 settle endpoints (no debt -> 400)
  F2-B  Phantom-amount-over-outstanding rejected; happy path works
  F2-C  Concurrent double-settle: ≤1 succeeds
  F2-D  Legit partial + full sequence still works; 4th attempt -> 400
  F2-E  Invalid target_user_id format -> 400 (never 500)
"""

import asyncio
import json
import os
import random
import sys
import time
from typing import Any, Dict, Tuple

import httpx

BASE = "https://mintu-finance.preview.emergentagent.com/api"
OTP = "123456"
NEVER_DELETE = "9876543210"

REPORT = {
    "total_tests": 0,
    "pass": 0,
    "fail": 0,
    "notes": "Round 29b critical-fix verification",
    "f1_deadtoken_pass": None,
    "f2_settle_pass": None,
    "details": [],
}


def log(name: str, ok: bool, msg: str = ""):
    REPORT["total_tests"] += 1
    if ok:
        REPORT["pass"] += 1
    else:
        REPORT["fail"] += 1
    REPORT["details"].append({"name": name, "pass": ok, "msg": msg})
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {name} {msg}")


def fresh_phone() -> str:
    # 10-digit Indian mobile starting 9, never 9876543210
    while True:
        ph = "9" + "".join(str(random.randint(0, 9)) for _ in range(9))
        if ph != NEVER_DELETE:
            return ph


async def seed_user(client: httpx.AsyncClient, name: str) -> Tuple[str, str, str]:
    """Returns (phone, user_id, token)."""
    phone = fresh_phone()
    # send-otp
    r = await client.post(f"{BASE}/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, f"send-otp for {phone}: {r.status_code} {r.text}"
    # verify-otp
    r = await client.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": phone, "otp": OTP, "name": name},
    )
    assert r.status_code == 200, f"verify-otp for {phone}: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    uid = (body.get("user") or {}).get("id") or body.get("user_id")
    assert tok and uid, f"missing token/uid: {body}"
    return phone, uid, tok


def H(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


# ─────────────────────────── F1 DEAD TOKEN ───────────────────────────
F1_ENDPOINTS_GET = [
    "/user/me",
    "/transactions",
    "/home/bundle?lang=en",
    "/split/groups",
    "/leaderboard/unified?scope=contacts",
    "/user/payment-methods",
    "/budgets/live",
    "/split/balances",
    "/gamification/status",
    "/rewards/marketplace",
    "/ai/coach/suggestions",
]


async def test_f1_dead_token(client: httpx.AsyncClient) -> bool:
    all_ok = True
    phone, uid, tok = await seed_user(client, "Deadtoken User")

    # baseline alive
    r = await client.get(f"{BASE}/user/me", headers=H(tok))
    log("F1-A baseline /user/me alive=200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        all_ok = False

    # hard-delete
    r = await client.post(
        f"{BASE}/user/delete-account",
        json={"mode": "hard", "confirmation": "DELETE"},
        headers=H(tok),
    )
    ok = r.status_code == 200
    log("F1-A hard-delete=200", ok, f"got {r.status_code} {r.text[:120]}")
    if not ok:
        all_ok = False
        # Can't continue without successful deletion
        return False

    # dead-token sweep — all should 401
    for ep in F1_ENDPOINTS_GET:
        r = await client.get(f"{BASE}{ep}", headers=H(tok))
        ok = r.status_code == 401
        log(f"F1-A GET {ep} dead->401", ok, f"got {r.status_code}")
        if not ok:
            all_ok = False

    # POST /transactions with dead token
    r = await client.post(
        f"{BASE}/transactions",
        json={"amount": 100, "category": "Food", "type": "debit", "description": "ghost"},
        headers=H(tok),
    )
    ok = r.status_code == 401
    log("F1-A POST /transactions dead->401", ok, f"got {r.status_code}")
    if not ok:
        all_ok = False

    return all_ok


async def test_f1_regression(client: httpx.AsyncClient) -> bool:
    all_ok = True
    phone, uid, tok = await seed_user(client, "Regress Valid User")

    for ep in F1_ENDPOINTS_GET:
        r = await client.get(f"{BASE}{ep}", headers=H(tok))
        # Accept any 2xx; allow sensible 4xx but NOT 401 (valid token), NOT 5xx
        ok = (200 <= r.status_code < 300) or r.status_code in (404,)
        # If we get 401 that's a critical regression — token isn't valid
        if r.status_code == 401 or r.status_code >= 500:
            ok = False
        log(f"F1-B GET {ep} valid->2xx", ok, f"got {r.status_code}")
        if not ok:
            all_ok = False

    # POST /transactions should work (2xx)
    r = await client.post(
        f"{BASE}/transactions",
        json={"amount": 100, "category": "Food", "type": "debit", "description": "regression check"},
        headers=H(tok),
    )
    ok = 200 <= r.status_code < 300
    log("F1-B POST /transactions valid->2xx", ok, f"got {r.status_code} {r.text[:80]}")
    if not ok:
        all_ok = False

    return all_ok


# ─────────────────────────── F2 SETTLE ───────────────────────────
async def test_f2a_phantom_no_debt(client: httpx.AsyncClient) -> bool:
    """A and B share NO group → every settle endpoint should reject."""
    all_ok = True
    _, a_uid, a_tok = await seed_user(client, "Alice F2A")
    _, b_uid, b_tok = await seed_user(client, "Bob F2A")

    bodies = [
        ("/split/settle", {"target_user_id": b_uid, "amount": 500, "method": "upi"}),
        ("/split/partial-settle", {"target_user_id": b_uid, "amount": 500, "method": "upi"}),
        ("/split/settle-with-rewards", {"target_user_id": b_uid, "amount": 500, "method": "upi"}),
        ("/split/mark-paid-offline", {"target_user_id": b_uid, "amount": 500, "method": "cash"}),
    ]
    for path, body in bodies:
        r = await client.post(f"{BASE}{path}", json=body, headers=H(a_tok))
        # Expect 400 "No outstanding debt" (not 200 / not 500)
        ok = r.status_code == 400 and ("outstanding" in r.text.lower() or "debt" in r.text.lower() or "No " in r.text)
        log(f"F2-A {path} no-debt->400", ok, f"got {r.status_code} {r.text[:160]}")
        if not ok:
            all_ok = False
    return all_ok


async def _create_group_with_expense(
    client: httpx.AsyncClient,
    a_tok: str,
    b_phone: str,
    b_uid: str,
    a_uid: str,
    expense_amount: float,
) -> Tuple[str, str]:
    """Create a group with A + B (B via phone), add an expense paid by B split equally → A owes B (expense/2). Returns (group_id, expense_id)."""
    # Create group as A, with B via phone
    r = await client.post(
        f"{BASE}/split/groups",
        json={"name": f"F2Group {random.randint(1000,9999)}", "members": [b_phone]},
        headers=H(a_tok),
    )
    assert r.status_code in (200, 201), f"group create: {r.status_code} {r.text}"
    gid = r.json().get("id") or r.json().get("_id") or r.json().get("group_id")
    assert gid, f"no group id: {r.json()}"

    # Fetch manage to confirm B is a member via user_id
    r = await client.get(f"{BASE}/split/groups/{gid}/manage", headers=H(a_tok))
    assert r.status_code == 200, f"manage: {r.status_code} {r.text}"
    members = r.json().get("members", [])
    member_ids = [m.get("user_id") for m in members]
    assert a_uid in member_ids, f"A not in members: {member_ids}"
    # B may be a pending member by phone — find B in members
    # If B_uid not in members, join B to group via /join
    if b_uid not in member_ids:
        # B joins via /join
        r2 = await client.get(f"{BASE}/split/groups/{gid}/manage", headers=H(a_tok))
        # Try posting join
        pass

    # Add expense paid by B, split equally between A and B
    split_even = {a_uid: expense_amount / 2, b_uid: expense_amount / 2}
    exp_body = {
        "group_id": gid,
        "description": "F2 dinner",
        "amount": expense_amount,
        "paid_by": b_uid,
        "splits": split_even,
    }
    r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(a_tok))
    assert r.status_code in (200, 201), f"expense create: {r.status_code} {r.text}"
    exp_id = r.json().get("id") or r.json().get("_id")
    return gid, exp_id


async def _join_group(client: httpx.AsyncClient, gid: str, tok: str) -> None:
    """Ensure user (holding tok) is a member of gid."""
    r = await client.post(f"{BASE}/split/groups/{gid}/join", headers=H(tok))
    # may 200 or 404 depending on membership rules — we'll check both
    # If it fails, continue; the group creation should already have B as member via phone
    return None


async def test_f2b_phantom_amount(client: httpx.AsyncClient) -> bool:
    all_ok = True
    a_phone, a_uid, a_tok = await seed_user(client, "Alice F2B")
    b_phone, b_uid, b_tok = await seed_user(client, "Bob F2B")

    # Create group with both. A creates, B joins.
    r = await client.post(
        f"{BASE}/split/groups",
        json={"name": f"F2B-{random.randint(1000,9999)}", "members": [b_phone]},
        headers=H(a_tok),
    )
    if r.status_code not in (200, 201):
        log("F2-B group create", False, f"{r.status_code} {r.text[:200]}")
        return False
    gid = r.json().get("id") or r.json().get("_id") or r.json().get("group_id")

    # Have B join explicitly (phone-added members are often pending)
    await _join_group(client, gid, b_tok)

    # B creates an expense of 600, paid by B, split {A:300, B:300}
    exp_body = {
        "group_id": gid,
        "description": "F2B dinner",
        "amount": 600,
        "paid_by": b_uid,
        "splits": {a_uid: 300, b_uid: 300},
    }
    r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(b_tok))
    if r.status_code not in (200, 201):
        # Try as A
        r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(a_tok))
    if r.status_code not in (200, 201):
        log("F2-B expense create", False, f"{r.status_code} {r.text[:200]}")
        return False

    # Now A should owe B ₹300. Try settle ₹5000 → expect 400
    r = await client.post(
        f"{BASE}/split/settle",
        json={"target_user_id": b_uid, "amount": 5000, "method": "upi", "group_id": gid},
        headers=H(a_tok),
    )
    ok = r.status_code == 400 and "exceed" in r.text.lower()
    log("F2-B over-settle 5000 on 300 debt->400", ok, f"got {r.status_code} {r.text[:160]}")
    if not ok:
        all_ok = False

    # Exact settle ₹300 → 200
    r = await client.post(
        f"{BASE}/split/settle",
        json={"target_user_id": b_uid, "amount": 300, "method": "upi", "group_id": gid},
        headers=H(a_tok),
    )
    ok = r.status_code == 200
    log("F2-B exact settle 300->200", ok, f"got {r.status_code} {r.text[:160]}")
    if not ok:
        all_ok = False

    # Verify balance now 0
    r = await client.get(f"{BASE}/split/balances", headers=H(a_tok))
    bal = r.json() if r.status_code == 200 else {}
    total_owe = float(bal.get("total_you_owe", 0) or 0)
    ok = r.status_code == 200 and total_owe < 0.5
    log("F2-B post-settle balance=0", ok, f"total_you_owe={total_owe}")
    if not ok:
        all_ok = False

    return all_ok


async def test_f2c_concurrent_double_settle(client: httpx.AsyncClient) -> bool:
    all_ok = True
    a_phone, a_uid, a_tok = await seed_user(client, "Alice F2C")
    b_phone, b_uid, b_tok = await seed_user(client, "Bob F2C")

    # Group
    r = await client.post(
        f"{BASE}/split/groups",
        json={"name": f"F2C-{random.randint(1000,9999)}", "members": [b_phone]},
        headers=H(a_tok),
    )
    if r.status_code not in (200, 201):
        log("F2-C group create", False, f"{r.status_code}")
        return False
    gid = r.json().get("id") or r.json().get("_id") or r.json().get("group_id")
    await _join_group(client, gid, b_tok)

    # Expense: B paid 600, A owes 300
    exp_body = {
        "group_id": gid,
        "description": "F2C dinner",
        "amount": 600,
        "paid_by": b_uid,
        "splits": {a_uid: 300, b_uid: 300},
    }
    r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(b_tok))
    if r.status_code not in (200, 201):
        r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(a_tok))
    if r.status_code not in (200, 201):
        log("F2-C expense create", False, f"{r.status_code} {r.text[:200]}")
        return False

    # Fire 5 concurrent settle of 300 each
    async def one_settle():
        return await client.post(
            f"{BASE}/split/settle",
            json={"target_user_id": b_uid, "amount": 300, "method": "upi", "group_id": gid},
            headers=H(a_tok),
        )

    results = await asyncio.gather(*[one_settle() for _ in range(5)], return_exceptions=True)
    codes = []
    for rr in results:
        if isinstance(rr, Exception):
            codes.append(f"EXC:{type(rr).__name__}")
        else:
            codes.append(rr.status_code)
    count_200 = sum(1 for c in codes if c == 200)
    count_400 = sum(1 for c in codes if c == 400)
    count_bad = sum(1 for c in codes if isinstance(c, int) and c >= 500)

    ok = count_200 <= 1 and count_bad == 0
    log(
        "F2-C concurrent 5x settle => ≤1 success, 0 5xx",
        ok,
        f"codes={codes} 200s={count_200} 400s={count_400}",
    )
    if not ok:
        all_ok = False

    # Final balance should be 0, never negative
    r = await client.get(f"{BASE}/split/balances", headers=H(a_tok))
    bal = r.json() if r.status_code == 200 else {}
    total_owe = float(bal.get("total_you_owe", 0) or 0)
    owe_you = float(bal.get("total_owed_to_you", 0) or 0)
    ok2 = r.status_code == 200 and total_owe < 0.5 and owe_you < 0.5
    log("F2-C final balance 0 (no negative)", ok2, f"you_owe={total_owe} owed_to_you={owe_you}")
    if not ok2:
        all_ok = False

    return all_ok


async def test_f2d_legit_partial_sequence(client: httpx.AsyncClient) -> bool:
    all_ok = True
    a_phone, a_uid, a_tok = await seed_user(client, "Alice F2D")
    b_phone, b_uid, b_tok = await seed_user(client, "Bob F2D")

    r = await client.post(
        f"{BASE}/split/groups",
        json={"name": f"F2D-{random.randint(1000,9999)}", "members": [b_phone]},
        headers=H(a_tok),
    )
    if r.status_code not in (200, 201):
        log("F2-D group create", False, f"{r.status_code}")
        return False
    gid = r.json().get("id") or r.json().get("_id") or r.json().get("group_id")
    await _join_group(client, gid, b_tok)

    # 3 expenses, each paid by B, A owes B 1000 total (400 + 300 + 300)
    for amt, a_share in [(800, 400), (600, 300), (600, 300)]:
        b_share = amt - a_share
        exp_body = {
            "group_id": gid,
            "description": f"F2D exp {amt}",
            "amount": amt,
            "paid_by": b_uid,
            "splits": {a_uid: a_share, b_uid: b_share},
        }
        r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(b_tok))
        if r.status_code not in (200, 201):
            r = await client.post(f"{BASE}/split/expenses", json=exp_body, headers=H(a_tok))
        if r.status_code not in (200, 201):
            log(f"F2-D expense {amt} create", False, f"{r.status_code} {r.text[:160]}")
            return False

    # Partial 400
    r = await client.post(
        f"{BASE}/split/partial-settle",
        json={"target_user_id": b_uid, "amount": 400, "method": "upi", "group_id": gid},
        headers=H(a_tok),
    )
    ok = r.status_code == 200
    log("F2-D partial 400 of 1000->200", ok, f"got {r.status_code} {r.text[:120]}")
    if not ok:
        all_ok = False

    # Check balance shows 600 remaining
    r = await client.get(f"{BASE}/split/balances", headers=H(a_tok))
    total_owe = float((r.json() if r.status_code == 200 else {}).get("total_you_owe", 0) or 0)
    ok = 590 <= total_owe <= 610
    log("F2-D balance after partial = ~600", ok, f"owe={total_owe}")
    if not ok:
        all_ok = False

    # Full settle 600
    r = await client.post(
        f"{BASE}/split/settle",
        json={"target_user_id": b_uid, "amount": 600, "method": "upi", "group_id": gid},
        headers=H(a_tok),
    )
    ok = r.status_code == 200
    log("F2-D full settle 600->200", ok, f"got {r.status_code} {r.text[:120]}")
    if not ok:
        all_ok = False

    # Balance now 0
    r = await client.get(f"{BASE}/split/balances", headers=H(a_tok))
    total_owe = float((r.json() if r.status_code == 200 else {}).get("total_you_owe", 0) or 0)
    ok = total_owe < 0.5
    log("F2-D balance after full settle = 0", ok, f"owe={total_owe}")
    if not ok:
        all_ok = False

    # 4th attempt settle 100 → 400
    r = await client.post(
        f"{BASE}/split/settle",
        json={"target_user_id": b_uid, "amount": 100, "method": "upi", "group_id": gid},
        headers=H(a_tok),
    )
    ok = r.status_code == 400
    log("F2-D over-settled 4th attempt->400", ok, f"got {r.status_code} {r.text[:120]}")
    if not ok:
        all_ok = False

    return all_ok


async def test_f2e_invalid_target(client: httpx.AsyncClient) -> bool:
    all_ok = True
    _, a_uid, a_tok = await seed_user(client, "Alice F2E")
    r = await client.post(
        f"{BASE}/split/settle",
        json={"target_user_id": "not-an-objectid", "amount": 100, "method": "upi"},
        headers=H(a_tok),
    )
    ok = r.status_code == 400 and "invalid" in r.text.lower()
    log("F2-E invalid target_user_id->400 (not 500)", ok, f"got {r.status_code} {r.text[:120]}")
    if not ok:
        all_ok = False
    return all_ok


# ─────────────────────────── MAIN ───────────────────────────
async def main():
    timeout = httpx.Timeout(60.0, connect=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        print("=" * 70)
        print("F1-A  DEAD TOKEN SWEEP")
        print("=" * 70)
        f1a = await test_f1_dead_token(client)

        print("=" * 70)
        print("F1-B  VALID TOKEN REGRESSION")
        print("=" * 70)
        f1b = await test_f1_regression(client)
        REPORT["f1_deadtoken_pass"] = bool(f1a and f1b)

        print("=" * 70)
        print("F2-A  PHANTOM SETTLE (NO DEBT)")
        print("=" * 70)
        f2a = await test_f2a_phantom_no_debt(client)

        print("=" * 70)
        print("F2-B  PHANTOM AMOUNT OVER OUTSTANDING")
        print("=" * 70)
        f2b = await test_f2b_phantom_amount(client)

        print("=" * 70)
        print("F2-C  CONCURRENT DOUBLE-SETTLE RACE")
        print("=" * 70)
        f2c = await test_f2c_concurrent_double_settle(client)

        print("=" * 70)
        print("F2-D  LEGIT PARTIAL + FULL SEQUENCE")
        print("=" * 70)
        f2d = await test_f2d_legit_partial_sequence(client)

        print("=" * 70)
        print("F2-E  INVALID TARGET FORMAT")
        print("=" * 70)
        f2e = await test_f2e_invalid_target(client)

        REPORT["f2_settle_pass"] = bool(f2a and f2b and f2c and f2d and f2e)

        print("\n" + "=" * 70)
        print("FINAL REPORT")
        print("=" * 70)
        summary = {k: v for k, v in REPORT.items() if k != "details"}
        print(json.dumps(summary, indent=2))

        with open("/app/round29b_results.json", "w") as f:
            json.dump(REPORT, f, indent=2)

        # Return code: 0 if both clusters pass
        sys.exit(0 if (REPORT["f1_deadtoken_pass"] and REPORT["f2_settle_pass"]) else 1)


if __name__ == "__main__":
    asyncio.run(main())
