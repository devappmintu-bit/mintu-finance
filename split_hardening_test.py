#!/usr/bin/env python3
"""
Module 1 & 6 hardening tests for /app/backend/routers/splits.py
- Split Rounding Engine (largest-remainder)
- Edit Expense with split recomputation
- Partial Settlement API
- Regression on existing reminders, mark-paid, settle, delete
"""
import sys
import time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
PW = "test123"

PASS = []
FAIL = []

_SESSION = requests.Session()


def _assert(cond, label, extra=""):
    if cond:
        PASS.append(label)
        print(f"  ✅ {label}")
    else:
        FAIL.append(f"{label} :: {extra}")
        print(f"  ❌ {label}  {extra}")


def _req(method, path, tok=None, js=None, retries=5):
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    for i in range(retries):
        r = _SESSION.request(method, f"{BASE}{path}", headers=h, json=js, timeout=30)
        if r.status_code == 429:
            wait = 2 + i * 2
            time.sleep(wait)
            continue
        return r
    return r


def _post(p, tok=None, js=None): return _req("POST", p, tok, js)
def _get(p, tok=None): return _req("GET", p, tok)
def _put(p, tok=None, js=None): return _req("PUT", p, tok, js)
def _del(p, tok=None): return _req("DELETE", p, tok)


def slow():
    time.sleep(0.35)


def login():
    r = _post("/auth/login", js={"phone": PHONE, "password": PW})
    if r.status_code != 200:
        print("Login failed:", r.status_code, r.text[:200])
        sys.exit(1)
    j = r.json()
    tok = j.get("token") or j.get("access_token")
    uid = (j.get("user") or {}).get("id") or j.get("user_id")
    print(f"  Logged in — token len={len(tok) if tok else 0}, uid={uid}")
    return tok, uid


def ensure_fresh_group(tok):
    """Always create a fresh group with 3 members total (me + 2 others)."""
    r = _post("/split/groups", tok, js={
        "name": f"Hardening-{int(time.time())}",
        "members": ["9999888811", "9999888822"]
    })
    if r.status_code != 200:
        print("Failed to create group:", r.status_code, r.text[:200])
        sys.exit(1)
    g = r.json()
    # make sure 3 members
    if len(g.get("members", [])) < 3:
        print(f"Group has only {len(g.get('members', []))} members")
    return g["id"], [m["user_id"] for m in g["members"]]


def test_A_rounding(tok, gid, my_id, mids):
    print("\n=== TEST A — Split Rounding Engine ===")
    m1, m2, m3 = mids[0], mids[1], mids[2]

    # A1a: equal 100 / 3
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "A1a-eq-100",
        "amount": 100, "paid_by": my_id, "split_type": "equal"
    })
    _assert(r.status_code == 200, "A1a POST equal 100/3", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 100.00, f"A1a sum(splits)==100.00 EXACT (got {total})",
                f"splits={splits}")
        _assert(len(splits) == 3, f"A1a split into exactly 3 members (got {len(splits)})")

    # A1b: equal 10 / 3
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "A1b-eq-10",
        "amount": 10, "paid_by": my_id, "split_type": "equal"
    })
    _assert(r.status_code == 200, "A1b POST equal 10/3", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 10.00, f"A1b sum(splits)==10.00 EXACT (got {total})",
                f"splits={splits}")

    # A2: percentage
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "A2-pct-100",
        "amount": 100, "paid_by": my_id, "split_type": "percentage",
        "splits": {m1: 33, m2: 33, m3: 34}
    })
    _assert(r.status_code == 200, "A2 POST percentage 33/33/34", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 100.00, f"A2 sum==100.00 EXACT (got {total})", f"splits={splits}")

    # A3: shares
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "A3-sh-100",
        "amount": 100, "paid_by": my_id, "split_type": "shares",
        "splits": {m1: 1, m2: 1, m3: 1}
    })
    _assert(r.status_code == 200, "A3 POST shares 1:1:1", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 100.00, f"A3 sum==100.00 EXACT (got {total})", f"splits={splits}")

    # A4: custom
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "A4-cust-100",
        "amount": 100, "paid_by": my_id, "split_type": "custom",
        "splits": {m1: 40, m2: 35, m3: 25}
    })
    _assert(r.status_code == 200, "A4 POST custom 40/35/25", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        _assert(
            splits.get(m1) == 40.0 and splits.get(m2) == 35.0 and splits.get(m3) == 25.0,
            f"A4 custom stored exactly {{40,35,25}}",
            f"splits={splits}"
        )


def test_B_edit(tok, gid, my_id, mids):
    print("\n=== TEST B — Edit Expense ===")
    m1, m2, m3 = mids[0], mids[1], mids[2]

    # Create baseline expense amt=90 equal
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "B-orig",
        "amount": 90, "paid_by": my_id, "split_type": "equal"
    })
    if r.status_code != 200:
        _assert(False, "B setup create expense", f"{r.status_code} {r.text[:200]}")
        return
    exp_id = r.json()["id"]

    # B1: change amount only
    slow()
    r = _put(f"/split/expenses/{exp_id}", tok, js={"amount": 150})
    _assert(r.status_code == 200, "B1 PUT amount=150", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 150.00, f"B1 sum==150.00 EXACT (got {total})", f"splits={splits}")
        vals = sorted(splits.values())
        _assert(vals == [50.0, 50.0, 50.0], f"B1 split 50/50/50 (got {vals})")

    # B2: change type to percentage
    slow()
    r = _put(f"/split/expenses/{exp_id}", tok, js={
        "amount": 150, "split_type": "percentage",
        "splits": {m1: 50, m2: 30, m3: 20}
    })
    _assert(r.status_code == 200, "B2 PUT percentage 50/30/20", f"{r.status_code} {r.text[:180]}")
    if r.status_code == 200:
        splits = r.json().get("splits", {})
        total = round(sum(splits.values()), 2)
        _assert(total == 150.00, f"B2 sum==150.00 EXACT (got {total})", f"splits={splits}")
        _assert(
            splits.get(m1) == 75.0 and splits.get(m2) == 45.0 and splits.get(m3) == 30.0,
            f"B2 splits m1=75 m2=45 m3=30 (got {splits})"
        )

    # B3: description + category only — no recomputation
    slow()
    r = _put(f"/split/expenses/{exp_id}", tok, js={
        "description": "Updated desc", "category": "Food"
    })
    _assert(r.status_code == 200, "B3 PUT desc+category only")
    slow()
    s = _get(f"/split/groups/{gid}/summary", tok)
    if s.status_code == 200:
        found = None
        for e in s.json().get("recent_expenses", []):
            if e.get("id") == exp_id:
                found = e; break
        if found:
            _assert(found.get("description") == "Updated desc", "B3 description updated",
                    f"got={found.get('description')}")
            _assert(found.get("amount") == 150, f"B3 amount unchanged=150 (got {found.get('amount')})")
            splits = found.get("splits", {})
            total = round(sum(splits.values()), 2)
            _assert(total == 150.00, f"B3 splits still sum to 150 (got {total})",
                    f"splits={splits}")

    # B4: summary structure
    slow()
    s = _get(f"/split/groups/{gid}/summary", tok)
    _assert(s.status_code == 200, "B4 GET summary")
    if s.status_code == 200:
        recent = s.json().get("recent_expenses", [])
        _assert(len(recent) > 0, "B4 recent_expenses non-empty")
        if recent:
            e0 = recent[0]
            required = {"id", "paid_by", "split_type", "splits"}
            missing = required - set(e0.keys())
            _assert(not missing, f"B4 recent_expenses[0] has id/paid_by/split_type/splits",
                    f"missing={missing}")


def test_C_partial_settle(tok, my_id):
    """Create a fresh group with a clean debt: target pays 300 equally among 3 → I owe 100."""
    print("\n=== TEST C — Partial Settlement ===")

    # Fresh group for isolated debt test
    slow()
    r = _post("/split/groups", tok, js={
        "name": f"PartialTest-{int(time.time())}",
        "members": ["9999777711", "9999777722"]
    })
    if r.status_code != 200:
        _assert(False, "C0 create fresh group", f"{r.status_code} {r.text[:200]}")
        return
    g = r.json()
    gid = g["id"]
    members = g["members"]
    # choose target = a member that's not me
    target = next((m["user_id"] for m in members if m["user_id"] != my_id), None)
    if not target:
        _assert(False, "C0 find target member", f"members={members}")
        return

    # Create debt: target pays 300 equally → I owe 100
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "C-debt",
        "amount": 300, "paid_by": target, "split_type": "equal"
    })
    if r.status_code != 200:
        _assert(False, "C0 setup debt expense", f"{r.status_code} {r.text[:200]}")
        return

    # Verify debt via summary
    slow()
    s = _get(f"/split/groups/{gid}/summary", tok)
    debts = s.json().get("simplified_debts", []) if s.status_code == 200 else []
    debt = None
    for d in debts:
        if d.get("from_id") == my_id and d.get("to_id") == target:
            debt = d; break
    if not debt:
        _assert(False, "C0 find outstanding debt me→target", f"debts={debts}")
        return

    D = float(debt["amount"])
    half = round(D / 2, 2)
    print(f"    Debt: I owe ₹{D:.2f} to {debt.get('to_name')}; half=₹{half}")

    # C1: first partial payment
    slow()
    r = _post("/split/partial-settle", tok, js={
        "target_user_id": target, "amount": half, "group_id": gid,
        "method": "upi", "note": "Half for now"
    })
    _assert(r.status_code == 200, "C1 POST partial-settle (half)",
            f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        j = r.json()
        for k in ("id", "message", "amount", "coins_earned", "txn_ref", "is_partial"):
            _assert(k in j, f"C1 response has '{k}'", f"keys={list(j.keys())}")
        _assert(j.get("is_partial") is True, "C1 is_partial=True")
        _assert(str(j.get("txn_ref", "")).startswith("PART-"),
                f"C1 txn_ref starts with PART- (got {j.get('txn_ref')})")
        _assert(abs(float(j.get("amount", 0)) - half) < 0.01,
                f"C1 amount == {half} (got {j.get('amount')})")

    # C2: verify debt reduced
    slow()
    s = _get(f"/split/groups/{gid}/summary", tok)
    new_debts = s.json().get("simplified_debts", []) if s.status_code == 200 else []
    remaining = 0.0
    for d in new_debts:
        if d.get("from_id") == my_id and d.get("to_id") == target:
            remaining = float(d["amount"]); break
    _assert(abs(remaining - half) < 1.0,
            f"C2 debt reduced to ≈₹{half} (got ₹{remaining:.2f})",
            f"expected≈{half} actual={remaining}")

    # C3: second partial to fully settle
    slow()
    r = _post("/split/partial-settle", tok, js={
        "target_user_id": target, "amount": half, "group_id": gid,
        "method": "upi", "note": "Remaining"
    })
    _assert(r.status_code == 200, "C3 POST partial-settle (second half)",
            f"{r.status_code} {r.text[:200]}")
    slow()
    s = _get(f"/split/groups/{gid}/summary", tok)
    final_debts = s.json().get("simplified_debts", []) if s.status_code == 200 else []
    final_remaining = 0.0
    for d in final_debts:
        if d.get("from_id") == my_id and d.get("to_id") == target:
            final_remaining = float(d["amount"]); break
    _assert(final_remaining < 0.51,
            f"C3 debt now ≈0 (got ₹{final_remaining:.2f})",
            f"expected<0.51 actual={final_remaining}")

    # C4: system chat message
    slow()
    r = _get(f"/split/groups/{gid}/messages?limit=50", tok)
    if r.status_code == 200:
        msgs = r.json()
        sys_msgs = [m for m in msgs if m.get("type") == "system"
                    and "partial" in (m.get("content") or "").lower()]
        _assert(len(sys_msgs) > 0,
                f"C4 system message mentions 'partial' (found {len(sys_msgs)})",
                f"last_msgs={[m.get('content','') for m in msgs[-5:]]}")

    # C5: validation
    slow()
    r = _post("/split/partial-settle", tok, js={
        "target_user_id": target, "amount": 0, "group_id": gid
    })
    _assert(r.status_code == 400, f"C5a amount=0 → 400 (got {r.status_code})",
            f"body={r.text[:150]}")
    slow()
    r = _post("/split/partial-settle", tok, js={"target_user_id": "xxx"})
    _assert(r.status_code == 400, f"C5b missing amount → 400 (got {r.status_code})",
            f"body={r.text[:150]}")

    return gid, target


def test_regression(tok, gid, my_id, mids):
    print("\n=== REGRESSION ===")
    slow()
    r = _get("/split/reminders", tok)
    _assert(r.status_code == 200, f"REG GET /split/reminders 200 (got {r.status_code})")
    if r.status_code == 200:
        j = r.json()
        _assert("received" in j and "sent" in j, "REG reminders has received+sent arrays")

    target = next((m for m in mids if m != my_id), None)
    # POST remind
    slow()
    r = _post("/split/remind", tok, js={
        "target_user_id": target, "amount": 123, "group_id": gid,
        "note": "Regression test"
    })
    _assert(r.status_code in (200, 429),
            f"REG POST /split/remind 200 or 429 (got {r.status_code})",
            f"body={r.text[:150]}")

    slow()
    r = _post("/split/mark-paid-offline", tok, js={
        "target_user_id": target, "amount": 50, "group_id": gid,
        "method": "cash", "note": "regression"
    })
    _assert(r.status_code == 200, f"REG POST /split/mark-paid-offline 200 (got {r.status_code})",
            f"body={r.text[:200]}")

    slow()
    r = _post("/split/settle-with-rewards", tok, js={
        "target_user_id": target, "amount": 10, "method": "upi", "group_id": gid
    })
    _assert(r.status_code == 200, f"REG POST /split/settle-with-rewards 200 (got {r.status_code})",
            f"body={r.text[:200]}")
    if r.status_code == 200:
        _assert("reward" in r.json(), "REG settle-with-rewards has reward")

    # DELETE expense — create and delete
    slow()
    r = _post("/split/expenses", tok, js={
        "group_id": gid, "description": "to-delete",
        "amount": 50, "paid_by": my_id, "split_type": "equal"
    })
    if r.status_code == 200:
        eid = r.json()["id"]
        slow()
        r = _del(f"/split/expenses/{eid}", tok)
        _assert(r.status_code == 200, f"REG DELETE /split/expenses/{{id}} 200 (got {r.status_code})",
                f"body={r.text[:150]}")


def main():
    print("=" * 60)
    print("Module 1 & 6 Hardening Test")
    print("=" * 60)
    tok, my_id = login()
    gid, all_mids = ensure_fresh_group(tok)
    print(f"  Fresh group {gid} with {len(all_mids)} members: {all_mids}")

    # Ensure my_id is first
    mids = [my_id] + [m for m in all_mids if m != my_id][:2]
    if len(mids) < 3:
        print(f"  ❌ Not enough members ({len(mids)})")
        return 1

    test_A_rounding(tok, gid, my_id, mids)
    test_B_edit(tok, gid, my_id, mids)
    test_C_partial_settle(tok, my_id)
    test_regression(tok, gid, my_id, mids)

    print("\n" + "=" * 60)
    print(f"RESULTS: PASS={len(PASS)}  FAIL={len(FAIL)}")
    print("=" * 60)
    if FAIL:
        print("\nFAILED:")
        for f in FAIL:
            print(f"  - {f}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
