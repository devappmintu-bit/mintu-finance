"""Re-audit test — verify 7 previously failing endpoints now pass.

Covers:
  1. /split/balances real-time sync with partial settlement
  2. PUT /api/transactions/{id}
  3. GET /api/transactions?category=...&type=...
  4. PUT /api/budgets/{id} + limit alias
  5. PUT /api/user/me
  6. /analytics/summary + /analytics/monthly
  7. /insights/waste
"""
import os
import json
import requests
from typing import Optional

BASE = "https://mintu-finance.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
PHONE = "9876543210"
PASSWORD = "test123"

results = []
def log(name, ok, detail=""):
    tag = "✅" if ok else "❌"
    results.append((name, ok, detail))
    print(f"{tag} {name}{(' — ' + detail) if detail else ''}")

def auth() -> str:
    r = requests.post(f"{BASE}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    data = r.json()
    token = data["token"]
    print(f"🔑 Login OK, user_id={data['user']['id']}, token len={len(token)}")
    return token, data["user"]["id"]

def hdr(tok): return {"Authorization": f"Bearer {tok}"}

def main():
    tok, me_id = auth()
    H = hdr(tok)

    # ================================================================
    # 1. /split/balances real-time sync (CRITICAL financial bug)
    # ================================================================
    print("\n=== 1. SPLIT BALANCES SYNC ===")
    # Create group with 9555000001 (other member) — they will be the payer so YOU owe
    r = requests.post(f"{BASE}/split/groups",
                      json={"name": f"Audit Balance Test {os.urandom(3).hex()}", "members": ["9555000001"]},
                      headers=H, timeout=30)
    log("POST /split/groups (balance test)", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    g = r.json()
    gid = g["id"]
    members = g["members"]
    other = next((m for m in members if m["user_id"] != me_id), None)
    if not other:
        log("Find other member", False, "No other member in group")
        return
    other_id = other["user_id"]
    print(f"   group_id={gid}, other_id={other_id} (phone={other.get('phone')})")

    # Create expense where OTHER paid ₹1000 split equally among 2 → you owe 500
    r = requests.post(f"{BASE}/split/expenses",
                      json={"group_id": gid, "description": "Lunch", "amount": 1000,
                            "paid_by": other_id, "split_type": "equal"},
                      headers=H, timeout=30)
    log("POST /split/expenses (other paid)", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return

    # Initial balance check — total_you_owe should be ~500
    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=30)
    log("GET /split/balances (initial)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return
    b = r.json()
    initial_owe = b.get("total_you_owe", 0)
    print(f"   total_you_owe={initial_owe}, total_owed_to_you={b.get('total_owed_to_you')}")
    # We might have pre-existing debts — so look for specific increase. Check that this group's other is in you_owe
    # Accept that the TOTAL you_owe includes pre-existing debts too
    # The key test is whether partial-settle reduces it by exactly 200.

    # Post partial settle of 200
    r = requests.post(f"{BASE}/split/partial-settle",
                      json={"target_user_id": other_id, "amount": 200, "group_id": gid, "method": "upi"},
                      headers=H, timeout=30)
    log("POST /split/partial-settle (200)", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    ps = r.json()
    print(f"   partial settle: id={ps.get('id')}, amount={ps.get('amount')}, txn_ref={ps.get('txn_ref')}")

    # Re-check balances — total_you_owe should have decreased by 200
    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=30)
    log("GET /split/balances (after partial settle)", r.status_code == 200)
    if r.status_code == 200:
        b2 = r.json()
        new_owe = b2.get("total_you_owe", 0)
        print(f"   new total_you_owe={new_owe}, total_owed_to_you={b2.get('total_owed_to_you')}")
        delta = round(initial_owe - new_owe, 2)
        # The delta should be ~200 (might be reduced less if the other user also owes you somehow, but typically 200)
        ok_delta = abs(delta - 200) < 1.0
        log("Balance reduced by 200 after partial settle (CRITICAL)",
            ok_delta, f"delta={delta} (expected ~200)")

        # Also check that this specific other's entry in you_owe is reduced
        other_name = other.get("name", "")
        owe_entries = b2.get("you_owe", {})
        this_debt = owe_entries.get(other_name, 0)
        print(f"   you_owe[{other_name}]={this_debt}")
        # Debt to this person should now be 300 (500 - 200)
        # But there may be other expenses from previous runs summed up. Look at the specific expense.
        log("you_owe[other_name] == 300 (500 - 200)",
            abs(this_debt - 300) < 1.0,
            f"actual={this_debt}, expected=300")

    # ================================================================
    # 2. PUT /api/transactions/{id}
    # ================================================================
    print("\n=== 2. PUT /api/transactions/{id} ===")
    r = requests.post(f"{BASE}/transactions",
                      json={"amount": 100, "category": "Food", "description": "Init", "type": "debit"},
                      headers=H, timeout=30)
    log("POST /transactions (create)", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return
    txn_id = r.json()["id"]
    print(f"   txn_id={txn_id}")

    r = requests.put(f"{BASE}/transactions/{txn_id}",
                     json={"amount": 999, "description": "Updated"}, headers=H, timeout=30)
    log("PUT /transactions/{id}", r.status_code == 200,
        f"HTTP {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        log("Response amount == 999", body.get("amount") == 999, f"got {body.get('amount')}")

    # GET list → entry should have amount=999
    r = requests.get(f"{BASE}/transactions?limit=200", headers=H, timeout=30)
    if r.status_code == 200:
        arr = r.json()
        found = next((t for t in arr if t.get("id") == txn_id), None)
        log("GET /transactions has updated amount=999", found is not None and found.get("amount") == 999,
            f"found={found.get('amount') if found else 'NOT FOUND'}")

    # ================================================================
    # 3. GET /api/transactions?category=Food&type=debit
    # ================================================================
    print("\n=== 3. TRANSACTION FILTERS ===")
    # Create fresh 2 Food debit + 1 Transport debit + 1 Food credit
    marker = f"AUDIT-{os.urandom(4).hex()}"
    created_ids = []
    fixtures = [
        {"amount": 50, "category": "Food", "description": f"{marker} food1", "type": "debit"},
        {"amount": 60, "category": "Food", "description": f"{marker} food2", "type": "debit"},
        {"amount": 70, "category": "Transport", "description": f"{marker} trans1", "type": "debit"},
        {"amount": 80, "category": "Food", "description": f"{marker} foodcredit", "type": "credit"},
    ]
    for f in fixtures:
        r = requests.post(f"{BASE}/transactions", json=f, headers=H, timeout=30)
        if r.status_code == 200:
            created_ids.append(r.json()["id"])
    log(f"Created {len(created_ids)} fixture transactions", len(created_ids) == 4, f"got {len(created_ids)}")

    # Filter by category=Food → should return transactions where category==Food
    r = requests.get(f"{BASE}/transactions?category=Food&limit=500", headers=H, timeout=30)
    log("GET /transactions?category=Food", r.status_code == 200)
    if r.status_code == 200:
        arr = r.json()
        mine = [t for t in arr if marker in t.get("description", "")]
        food_count = sum(1 for t in mine if t.get("category") == "Food")
        log(f"category=Food filter: 3 Food txns from our fixtures present ({food_count})",
            food_count == 3, f"got {food_count}/3 Food txns (total mine={len(mine)})")
        # Also: NO Transport transactions in results
        non_food = [t for t in arr if t.get("category") != "Food"]
        log("category=Food excludes non-Food", len(non_food) == 0,
            f"got {len(non_food)} non-Food txns")

    # Filter by type=debit
    r = requests.get(f"{BASE}/transactions?type=debit&limit=500", headers=H, timeout=30)
    log("GET /transactions?type=debit", r.status_code == 200)
    if r.status_code == 200:
        arr = r.json()
        mine = [t for t in arr if marker in t.get("description", "")]
        debit_count = sum(1 for t in mine if t.get("type") == "debit")
        log(f"type=debit filter: 3 debit from our fixtures ({debit_count})",
            debit_count == 3, f"got {debit_count}/3 debits")
        # No credits
        credits = [t for t in arr if t.get("type") == "credit"]
        log("type=debit excludes credits", len(credits) == 0, f"got {len(credits)} credits")

    # Both filters: category=Food & type=debit
    r = requests.get(f"{BASE}/transactions?category=Food&type=debit&limit=500", headers=H, timeout=30)
    log("GET /transactions?category=Food&type=debit", r.status_code == 200)
    if r.status_code == 200:
        arr = r.json()
        mine = [t for t in arr if marker in t.get("description", "")]
        both = sum(1 for t in mine if t.get("category") == "Food" and t.get("type") == "debit")
        log(f"combined filter: 2 from fixtures ({both})", both == 2,
            f"got {both}/2")
        # Total should only have Food debit entries
        mismatch = [t for t in arr if t.get("category") != "Food" or t.get("type") != "debit"]
        log("combined filter only returns Food+debit", len(mismatch) == 0,
            f"got {len(mismatch)} mismatched")

    # Cleanup fixture transactions
    for tid in created_ids:
        requests.delete(f"{BASE}/transactions/{tid}", headers=H, timeout=15)

    # ================================================================
    # 4. PUT /api/budgets/{id} + limit alias
    # ================================================================
    print("\n=== 4. BUDGETS PUT + limit alias ===")
    # Create with `limit` alias (use unique category to avoid upsert of existing)
    cat = f"AuditCat-{os.urandom(3).hex()}"
    r = requests.post(f"{BASE}/budgets", json={"category": cat, "limit": 3000, "period": "monthly"},
                      headers=H, timeout=30)
    log("POST /budgets with `limit` alias", r.status_code == 200,
        f"HTTP {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    bj = r.json()
    bid = bj["id"]
    log("POST response has amount=3000", bj.get("amount") == 3000, f"got amount={bj.get('amount')}")

    # PUT with limit alias
    r = requests.put(f"{BASE}/budgets/{bid}", json={"limit": 5000}, headers=H, timeout=30)
    log("PUT /budgets/{id} with `limit`", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        doc = r.json()
        log("PUT limit=5000 → amount=5000", doc.get("amount") == 5000, f"got {doc.get('amount')}")

    # PUT with native amount
    r = requests.put(f"{BASE}/budgets/{bid}", json={"amount": 6000}, headers=H, timeout=30)
    log("PUT /budgets/{id} with `amount`", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        doc = r.json()
        log("PUT amount=6000 → amount=6000", doc.get("amount") == 6000, f"got {doc.get('amount')}")

    # Cleanup
    requests.delete(f"{BASE}/budgets/{bid}", headers=H, timeout=15)

    # ================================================================
    # 5. PUT /api/user/me
    # ================================================================
    print("\n=== 5. PUT /user/me ===")
    r = requests.put(f"{BASE}/user/me", json={"name": "Test Audit"}, headers=H, timeout=30)
    log("PUT /user/me {name}", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")

    r = requests.put(f"{BASE}/user/me", json={"monthly_income": 75000}, headers=H, timeout=30)
    log("PUT /user/me {monthly_income}", r.status_code == 200, f"HTTP {r.status_code}")

    r = requests.put(f"{BASE}/user/me", json={"language": "hi"}, headers=H, timeout=30)
    log("PUT /user/me {language}", r.status_code == 200, f"HTTP {r.status_code}")

    # Verify persistence via GET /user/me
    r = requests.get(f"{BASE}/user/me", headers=H, timeout=30)
    log("GET /user/me after updates", r.status_code == 200)
    if r.status_code == 200:
        me = r.json()
        print(f"   me: name={me.get('name')} (note: /me projection may not include income/language)")
        # GET /me may or may not include monthly_income/language. Reset name.
        log("name persisted as 'Test Audit'", me.get("name") == "Test Audit",
            f"got {me.get('name')}")

    # restore a nicer name
    requests.put(f"{BASE}/user/me", json={"name": "Test User"}, headers=H, timeout=15)

    # ================================================================
    # 6. /analytics/summary + /analytics/monthly
    # ================================================================
    print("\n=== 6. ANALYTICS ROUTES ===")
    for path in ["/analytics/summary", "/analytics/monthly"]:
        r = requests.get(f"{BASE}{path}", headers=H, timeout=30)
        log(f"GET {path}", r.status_code == 200, f"HTTP {r.status_code} {r.text[:150]}")

    # ================================================================
    # 7. /insights/waste
    # ================================================================
    print("\n=== 7. /insights/waste ===")
    r = requests.get(f"{BASE}/insights/waste", headers=H, timeout=60)
    log("GET /insights/waste", r.status_code == 200, f"HTTP {r.status_code} {r.text[:150]}")

    # ================================================================
    # REGRESSION — make sure nothing else broke
    # ================================================================
    print("\n=== REGRESSION ===")
    for path in ["/transactions", "/budgets", "/user/me", "/split/groups",
                 "/split/balances", "/stats/overview"]:
        r = requests.get(f"{BASE}{path}", headers=H, timeout=30)
        log(f"Regression GET {path}", r.status_code == 200, f"HTTP {r.status_code}")

    # ================================================================
    # SUMMARY
    # ================================================================
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed ({100 * passed / total:.0f}%)")
    print("=" * 70)
    if passed < total:
        print("\nFAILURES:")
        for name, ok, detail in results:
            if not ok:
                print(f"  ❌ {name} — {detail}")

if __name__ == "__main__":
    main()
