"""MintU Backend - Adversarial Final Sweep (Apr 21 2026)

Re-runs the full adversarial IDOR + amount validation suite after patches:
  1. server.py — _SafeJSONResponse + _scrub_nonfinite + RequestValidationError handler
  2. split_common.py — field_validator on amount
  3. transactions.py — field_validator + Field bounds
  4. split_groups.py — IDOR filter on 5 endpoints + admin check
  5. split_expenses.py — IDOR filter on summary

Must pass ALL 23 tests with ZERO failures."""

import json
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE_A = "9876543210"   # owner
PHONE_B = "9988776655"   # attacker (not a member of A's group)
OTP = "123456"


def log(tag, ok, detail=""):
    icon = "✅" if ok else "❌"
    print(f"  {icon} {tag}: {detail}")
    return ok


def auth(phone):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, f"send-otp {phone} → {r.status_code} {r.text[:200]}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"verify-otp {phone} → {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def post_raw(path, token, raw_body):
    """POST raw body string so NaN/Inf survive until FastAPI."""
    return requests.post(
        f"{BASE}{path}",
        data=raw_body,
        headers={**headers(token)},
        timeout=30,
    )


def main():
    results = []

    print("\n━━━━ SETUP ━━━━")
    tok_a = auth(PHONE_A)
    tok_b = auth(PHONE_B)
    print(f"  User A token: ...{tok_a[-12:]}")
    print(f"  User B token: ...{tok_b[-12:]}")

    # Need another phone for group member so A's group has >1 member
    filler_phone = "9123456780"
    try:
        auth(filler_phone)  # ensure exists
    except Exception:
        pass

    # Create a fresh group owned by A (B is NOT a member)
    gr = requests.post(
        f"{BASE}/split/groups",
        headers=headers(tok_a),
        json={"name": "Adversarial Test Group", "members": [filler_phone]},
        timeout=20,
    )
    assert gr.status_code == 200, f"create group → {gr.status_code} {gr.text[:200]}"
    group_id = gr.json()["id"]
    # Get a member_id for the remove-member test
    mg = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=headers(tok_a)).json()
    other_member_id = next(
        (m["user_id"] for m in mg["members"] if m["user_id"] != mg["created_by"]),
        mg["members"][0]["user_id"],
    )
    print(f"  Group A ID: {group_id}  (other member: {other_member_id})")

    # ─────── IDOR tests (User B attacking User A's group) ───────
    print("\n━━━━ IDOR TESTS (user B against A's group) ━━━━")

    r = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=headers(tok_b))
    results.append(log("1. GET /manage as B", r.status_code == 404, f"HTTP {r.status_code}"))

    r = requests.put(f"{BASE}/split/groups/{group_id}/name", headers=headers(tok_b), json={"name": "Hacked"})
    results.append(log("2. PUT /name as B", r.status_code == 404, f"HTTP {r.status_code}"))

    r = requests.delete(
        f"{BASE}/split/groups/{group_id}/members/{other_member_id}",
        headers=headers(tok_b),
    )
    results.append(log("3. DELETE /members/{mid} as B (non-admin)", r.status_code == 403, f"HTTP {r.status_code}"))

    r = requests.delete(f"{BASE}/split/groups/{group_id}", headers=headers(tok_b))
    results.append(log("4. DELETE group as B (non-admin)", r.status_code == 403, f"HTTP {r.status_code}"))

    r = requests.get(f"{BASE}/split/groups/{group_id}/messages", headers=headers(tok_b))
    results.append(log("5. GET /messages as B", r.status_code == 404, f"HTTP {r.status_code}"))

    r = requests.post(
        f"{BASE}/split/groups/{group_id}/messages",
        headers=headers(tok_b),
        json={"content": "hacked", "type": "text"},
    )
    results.append(log("6. POST /messages as B", r.status_code == 404, f"HTTP {r.status_code}"))

    r = requests.get(f"{BASE}/split/groups/{group_id}/summary", headers=headers(tok_b))
    results.append(log("7. GET /summary as B", r.status_code == 404, f"HTTP {r.status_code}"))

    # ─────── Owner A still has access ───────
    print("\n━━━━ OWNER A ACCESS (must all 200) ━━━━")
    r = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=headers(tok_a))
    results.append(log("8a. GET /manage as A", r.status_code == 200, f"HTTP {r.status_code}"))

    r = requests.get(f"{BASE}/split/groups/{group_id}/summary", headers=headers(tok_a))
    results.append(log("8b. GET /summary as A", r.status_code == 200, f"HTTP {r.status_code}"))

    r = requests.get(f"{BASE}/split/groups/{group_id}/messages", headers=headers(tok_a))
    results.append(log("8c. GET /messages as A", r.status_code == 200, f"HTTP {r.status_code}"))

    # ─────── Validation edge cases (must return 422 NEVER 500) ───────
    print("\n━━━━ VALIDATION — /api/transactions ━━━━")

    tx_base = {"category": "Food", "description": "adv", "type": "debit"}

    for tag, amount_literal in [
        ("9. amount=NaN", "NaN"),
        ("10. amount=Infinity", "Infinity"),
        ("11. amount=-Infinity", "-Infinity"),
    ]:
        raw = json.dumps(tx_base) [:-1] + f', "amount": {amount_literal}' + "}"
        r = post_raw("/transactions", tok_a, raw)
        results.append(log(tag, r.status_code == 422, f"HTTP {r.status_code} body={r.text[:120]}"))

    for tag, amt in [
        ("12. amount=-1000", -1000),
        ("13. amount=0", 0),
        ("14. amount=1e20", 1e20),
    ]:
        body = {**tx_base, "amount": amt}
        r = requests.post(f"{BASE}/transactions", headers=headers(tok_a), json=body)
        results.append(log(tag, r.status_code == 422, f"HTTP {r.status_code} body={r.text[:120]}"))

    print("\n━━━━ VALIDATION — /api/split/expenses + /split/settle ━━━━")

    exp_base = {
        "group_id": group_id,
        "description": "adv",
        "paid_by": mg["created_by"],
        "split_type": "equal",
    }
    raw = json.dumps(exp_base) [:-1] + ', "amount": NaN}'
    r = post_raw("/split/expenses", tok_a, raw)
    results.append(log("15. /split/expenses amount=NaN", r.status_code == 422, f"HTTP {r.status_code} body={r.text[:120]}"))

    body = {**exp_base, "amount": -500}
    r = requests.post(f"{BASE}/split/expenses", headers=headers(tok_a), json=body)
    results.append(log("16. /split/expenses amount=-500", r.status_code == 422, f"HTTP {r.status_code}"))

    settle_base = {"target_user_id": other_member_id, "method": "upi", "group_id": group_id}
    raw = json.dumps(settle_base) [:-1] + ', "amount": Infinity}'
    r = post_raw("/split/settle", tok_a, raw)
    results.append(log("17. /split/settle amount=Infinity", r.status_code == 422, f"HTTP {r.status_code} body={r.text[:120]}"))

    # Oversize / empty strings
    print("\n━━━━ VALIDATION — string bounds ━━━━")
    body = {"amount": 100, "category": "Food", "description": "x" * 501, "type": "debit"}
    r = requests.post(f"{BASE}/transactions", headers=headers(tok_a), json=body)
    results.append(log("18. description=501 chars", r.status_code == 422, f"HTTP {r.status_code}"))

    body = {"amount": 100, "category": "", "description": "ok", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", headers=headers(tok_a), json=body)
    results.append(log("19. category empty", r.status_code == 422, f"HTTP {r.status_code}"))

    # ─────── Happy path ───────
    print("\n━━━━ HAPPY PATHS (must all 200) ━━━━")

    body = {"amount": 100.5, "category": "Food", "description": "valid tx", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", headers=headers(tok_a), json=body)
    results.append(log("20. POST /transactions amount=100.5", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:120]}"))

    body = {**exp_base, "amount": 250}
    r = requests.post(f"{BASE}/split/expenses", headers=headers(tok_a), json=body)
    results.append(log("21. POST /split/expenses amount=250", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:120]}"))

    body = {"target_user_id": other_member_id, "amount": 100.5, "method": "upi", "group_id": group_id}
    r = requests.post(f"{BASE}/split/settle", headers=headers(tok_a), json=body)
    results.append(log("22. POST /split/settle amount=100.5", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:120]}"))

    r = requests.get(f"{BASE}/split/groups/{group_id}/manage", headers=headers(tok_a))
    results.append(log("23. GET /manage as owner", r.status_code == 200, f"HTTP {r.status_code}"))

    # ─────── Summary ───────
    passed = sum(results)
    total = len(results)
    print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  RESULT: {passed}/{total} passed")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return passed == total


if __name__ == "__main__":
    import sys
    sys.exit(0 if main() else 1)
