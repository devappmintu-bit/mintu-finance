"""Smoke test for UI redesign backend changes:
1. POST /api/split/groups with custom_emoji
2. POST /api/split/groups WITHOUT custom_emoji (backward compat)
3. Split expense chat message includes member_names + paid_count + split_count + amount
4. Regression on previously passing endpoints
"""
import requests, json, sys, time

BASE = "https://mintu-finance.preview.emergentagent.com/api"

def _log(ok, msg):
    print(("✅ " if ok else "❌ ") + msg)
    return ok

def main():
    results = []

    # AUTH
    r = requests.post(f"{BASE}/auth/login", json={"phone":"9876543210","password":"test123"}, timeout=30)
    if r.status_code != 200:
        print(f"❌ AUTH failed {r.status_code}: {r.text}")
        sys.exit(1)
    token = r.json()["token"]
    my_id = r.json()["user"]["id"]
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    results.append(_log(True, f"AUTH login ok (token len={len(token)}, my_id={my_id})"))

    # ===== 1. CREATE GROUP WITH custom_emoji =====
    print("\n=== Test 1: Group with custom_emoji ===")
    r = requests.post(f"{BASE}/split/groups",
                      headers=H,
                      json={"name":"Flatmates","members":["9555000099"],"custom_emoji":"🏠"},
                      timeout=20)
    ok = r.status_code == 200
    results.append(_log(ok, f"POST /split/groups custom_emoji → {r.status_code}"))
    if not ok:
        print("body:", r.text[:500]); return _finalize(results)
    body = r.json()
    gid1 = body.get("id")
    ce = body.get("custom_emoji")
    results.append(_log(ce == "🏠", f"response contains custom_emoji='🏠' (got {repr(ce)})"))

    # GET /split/groups should contain it
    r = requests.get(f"{BASE}/split/groups", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"GET /split/groups → {r.status_code}"))
    if r.status_code == 200:
        groups = r.json()
        match = next((g for g in groups if g.get("id") == gid1), None)
        if match is None:
            results.append(_log(False, f"created group {gid1} not found in GET list"))
        else:
            results.append(_log(match.get("custom_emoji") == "🏠",
                                f"GET entry has custom_emoji='🏠' (got {repr(match.get('custom_emoji'))})"))

    # cleanup
    r = requests.delete(f"{BASE}/split/groups/{gid1}", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"DELETE /split/groups/{gid1} → {r.status_code}"))

    # ===== 2. CREATE GROUP WITHOUT custom_emoji =====
    print("\n=== Test 2: Group WITHOUT custom_emoji (backward compat) ===")
    r = requests.post(f"{BASE}/split/groups",
                      headers=H,
                      json={"name":"Office Team","members":["9555000088"]},
                      timeout=20)
    ok = r.status_code == 200
    results.append(_log(ok, f"POST /split/groups (no custom_emoji) → {r.status_code}"))
    if not ok:
        print("body:", r.text[:500])
    else:
        body = r.json()
        ce = body.get("custom_emoji", "MISSING")
        results.append(_log(ce is None or ce == "MISSING",
                            f"custom_emoji is null/missing (got {repr(ce)}) — no crash"))
        gid2 = body.get("id")
        # cleanup
        requests.delete(f"{BASE}/split/groups/{gid2}", headers=H, timeout=10)

    # ===== 3. EXPENSE CHAT MESSAGE with member_names + paid_count + split_count + amount =====
    print("\n=== Test 3: Expense chat message includes member_names + paid_count ===")
    # Create fresh group with 2 other members (3 members total including me)
    r = requests.post(f"{BASE}/split/groups",
                      headers=H,
                      json={"name":"Pizza Night Test","members":["9555000077","9555000066"]},
                      timeout=20)
    ok = r.status_code == 200
    results.append(_log(ok, f"POST /split/groups (2 other members) → {r.status_code}"))
    if not ok:
        print("body:", r.text[:500])
        return _finalize(results)
    body = r.json()
    gid3 = body.get("id")
    members = body.get("members", [])
    results.append(_log(len(members) == 3, f"group has 3 members (got {len(members)})"))

    # Post expense (equal split)
    r = requests.post(f"{BASE}/split/expenses",
                      headers=H,
                      json={"group_id": gid3, "description":"Pizza", "amount":300,
                            "paid_by": my_id, "split_type":"equal"},
                      timeout=20)
    ok = r.status_code == 200
    results.append(_log(ok, f"POST /split/expenses equal 300 → {r.status_code}"))
    if not ok:
        print("body:", r.text[:500])
        requests.delete(f"{BASE}/split/groups/{gid3}", headers=H, timeout=10)
        return _finalize(results)

    # Fetch messages
    r = requests.get(f"{BASE}/split/groups/{gid3}/messages", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"GET /split/groups/{gid3}/messages → {r.status_code}"))
    if r.status_code != 200:
        print("body:", r.text[:500])
        requests.delete(f"{BASE}/split/groups/{gid3}", headers=H, timeout=10)
        return _finalize(results)
    msgs = r.json()
    expense_msgs = [m for m in msgs if m.get("type") == "expense"]
    results.append(_log(len(expense_msgs) >= 1, f"at least 1 expense message (got {len(expense_msgs)})"))
    if expense_msgs:
        latest = expense_msgs[-1]
        ed = latest.get("expense_data", {}) or {}
        print("  expense_data:", json.dumps(ed, default=str)[:400])
        results.append(_log(isinstance(ed.get("member_names"), list) and len(ed.get("member_names", [])) == 3,
                            f"expense_data.member_names is array of length 3 (got {ed.get('member_names')})"))
        results.append(_log(ed.get("paid_count") == 1, f"expense_data.paid_count == 1 (got {ed.get('paid_count')})"))
        results.append(_log(ed.get("split_count") == 3, f"expense_data.split_count == 3 (got {ed.get('split_count')})"))
        results.append(_log(float(ed.get("amount", 0)) == 300.0, f"expense_data.amount == 300 (got {ed.get('amount')})"))

    # cleanup
    requests.delete(f"{BASE}/split/groups/{gid3}", headers=H, timeout=10)

    # ===== 4. REGRESSION =====
    print("\n=== Test 4: Regression ===")
    r = requests.get(f"{BASE}/split/groups", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"GET /split/groups → {r.status_code}"))

    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"GET /split/balances → {r.status_code}"))

    r = requests.get(f"{BASE}/transactions", headers=H, timeout=20)
    results.append(_log(r.status_code == 200, f"GET /transactions → {r.status_code}"))
    txns = r.json() if r.status_code == 200 else []
    # PUT /transactions/{id}
    if isinstance(txns, list) and len(txns) > 0:
        tid = txns[0].get("id")
        r = requests.put(f"{BASE}/transactions/{tid}", headers=H,
                         json={"amount": float(txns[0].get("amount", 100)), "description":"smoke updated"},
                         timeout=20)
        results.append(_log(r.status_code == 200, f"PUT /transactions/{tid} → {r.status_code}"))
    else:
        # create one first
        r = requests.post(f"{BASE}/transactions", headers=H,
                          json={"amount":50.0,"category":"Food","description":"smoke-test","type":"debit"},
                          timeout=20)
        if r.status_code == 200:
            tid = r.json().get("id")
            r2 = requests.put(f"{BASE}/transactions/{tid}", headers=H,
                              json={"amount":55.0,"description":"smoke updated"}, timeout=20)
            results.append(_log(r2.status_code == 200, f"PUT /transactions/{tid} → {r2.status_code}"))

    # PUT /budgets/{id}
    r = requests.get(f"{BASE}/budgets", headers=H, timeout=20)
    if r.status_code == 200:
        budgets = r.json()
        if isinstance(budgets, list) and budgets:
            bid = budgets[0].get("id")
            r2 = requests.put(f"{BASE}/budgets/{bid}", headers=H, json={"amount": 4500}, timeout=20)
            results.append(_log(r2.status_code == 200, f"PUT /budgets/{bid} → {r2.status_code}"))
        else:
            # create one first
            r2 = requests.post(f"{BASE}/budgets", headers=H,
                              json={"category":"SmokeCat","amount":2000,"period":"monthly"}, timeout=20)
            if r2.status_code == 200:
                bid = r2.json().get("id")
                r3 = requests.put(f"{BASE}/budgets/{bid}", headers=H, json={"amount": 2500}, timeout=20)
                results.append(_log(r3.status_code == 200, f"PUT /budgets/{bid} → {r3.status_code}"))
                # cleanup
                requests.delete(f"{BASE}/budgets/{bid}", headers=H, timeout=10)

    # PUT /user/me
    r = requests.put(f"{BASE}/user/me", headers=H, json={"name":"Test Smoke"}, timeout=20)
    results.append(_log(r.status_code == 200, f"PUT /user/me → {r.status_code}"))

    _finalize(results)

def _finalize(results):
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"\n==== RESULT: {passed}/{total} PASSED ====")
    if passed != total:
        sys.exit(1)

if __name__ == "__main__":
    main()
