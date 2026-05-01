"""Comprehensive backend CRUD + calculation audit for MintU.

Tests ALL modules sequentially, continuing on failures to build a full picture.
Auth: password login (phone 9876543210 / pw test123) - per test_credentials.md.
"""
import os
import sys
import json
import time
import requests
from core.time import utc_now
from datetime import datetime, timezone

# Backend URL from frontend .env
BACKEND_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"

PHONE = "9876543210"
PASSWORD = "test123"

results = {"MODULE_1": [], "MODULE_2": [], "MODULE_3": [], "MODULE_4": [], "MODULE_5": []}
critical = []
headers = {}
my_user_id = None


def log(module, name, ok, msg="", severity="normal"):
    mark = "PASS" if ok else "FAIL"
    results[module].append((ok, name, msg))
    print(f"  [{mark}] [{module}] {name}: {msg[:240]}")
    if not ok and severity == "critical":
        critical.append(f"[{module}] {name} -- {msg}")


def auth():
    global headers, my_user_id
    r = requests.post(f"{API}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        print(f"AUTH FAIL: {r.status_code} {r.text}")
        sys.exit(1)
    data = r.json()
    headers = {"Authorization": f"Bearer {data['token']}"}
    my_user_id = data["user"]["id"]
    print(f"AUTH OK -- user_id={my_user_id}, token_len={len(data['token'])}")


def test_module_1():
    print("\n" + "="*60 + "\n MODULE 1: TRANSACTIONS\n" + "="*60)
    payload = {
        "description": "Swiggy dinner", "amount": 450, "type": "debit",
        "category": "Food", "source": "manual", "date": "2026-04-18T12:00:00"
    }
    r = requests.post(f"{API}/transactions", json=payload, headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_1", "1.1 POST create", False, f"status={r.status_code} body={r.text[:200]}", "critical")
        return
    d = r.json()
    txn_id = d.get("id")
    log("MODULE_1", "1.1 POST /transactions create", txn_id is not None,
        f"id={txn_id} amount={d.get('amount')} cat={d.get('category')}")

    r = requests.get(f"{API}/transactions", headers=headers, timeout=15)
    ok = r.status_code == 200 and isinstance(r.json(), list) and any(t.get("id") == txn_id for t in r.json())
    log("MODULE_1", "1.2a GET /transactions (contains new)", ok, f"status={r.status_code}")

    r = requests.get(f"{API}/transactions?category=Food", headers=headers, timeout=15)
    if r.status_code == 200:
        txns = r.json()
        non_food = [t for t in txns if t.get("category") != "Food"]
        log("MODULE_1", "1.2b GET ?category=Food filter", len(non_food) == 0,
            f"total={len(txns)} non_Food={len(non_food)} (backend has NO category filter -- returns all)")
    else:
        log("MODULE_1", "1.2b filter", False, f"{r.status_code}")

    r = requests.get(f"{API}/transactions?type=debit", headers=headers, timeout=15)
    if r.status_code == 200:
        txns = r.json()
        non_debit = [t for t in txns if t.get("type") != "debit"]
        log("MODULE_1", "1.2c GET ?type=debit filter", len(non_debit) == 0,
            f"total={len(txns)} non_debit={len(non_debit)} (backend has NO type filter)")

    r = requests.put(f"{API}/transactions/{txn_id}",
                     json={"amount": 500, "description": "Swiggy dinner (corrected)"},
                     headers=headers, timeout=15)
    upd_ok = r.status_code == 200
    log("MODULE_1", "1.3 PUT update txn", upd_ok, f"{r.status_code} body={r.text[:120]}",
        severity="critical" if not upd_ok else "normal")

    r = requests.delete(f"{API}/transactions/{txn_id}", headers=headers, timeout=15)
    log("MODULE_1", "1.4a DELETE txn", r.status_code in (200, 204), f"{r.status_code}")

    r = requests.get(f"{API}/transactions", headers=headers, timeout=15)
    gone = r.status_code == 200 and not any(t.get("id") == txn_id for t in r.json())
    log("MODULE_1", "1.4b deleted txn gone", gone, f"still_present={not gone}")

    # 1.5 Category preservation on manual POST (backend has no auto-categorize)
    for desc, ctype, cat in [
        ("Salary credit HDFC Rs50000", "credit", "Salary"),
        ("Zomato order", "debit", "Food"),
        ("Uber ride airport", "debit", "Transport"),
        ("Amazon.in purchase", "debit", "Shopping"),
    ]:
        r = requests.post(f"{API}/transactions", json={
            "description": desc, "amount": 500, "type": ctype,
            "category": cat, "date": "2026-04-18T12:00:00"
        }, headers=headers, timeout=15)
        ok = r.status_code == 200 and r.json().get("category") == cat
        if r.status_code == 200:
            requests.delete(f"{API}/transactions/{r.json()['id']}", headers=headers, timeout=15)
        log("MODULE_1", f"1.5 manual-POST preserves cat '{desc[:30]}' -> {cat}",
            ok, f"got={r.json().get('category') if r.status_code == 200 else 'N/A'}")

    # SMS parse
    sms = "Your a/c XX1234 is debited for INR 450.00 on 18-Apr-26 at ZOMATO. Avl bal: INR 45000."
    r = requests.post(f"{API}/transactions/parse-sms", json={"sms_text": sms}, headers=headers, timeout=45)
    if r.status_code == 200:
        d = r.json()
        parsed = d.get("parsed", {})
        ok = parsed.get("amount") == 450 and "food" in str(parsed.get("category", "")).lower()
        log("MODULE_1", "1.5 SMS parse Zomato 450 -> Food",
            ok, f"amount={parsed.get('amount')} cat={parsed.get('category')}")
        if d.get("id"):
            requests.delete(f"{API}/transactions/{d['id']}", headers=headers, timeout=15)
    else:
        log("MODULE_1", "1.5 SMS parse", False, f"{r.status_code} {r.text[:120]}",
            severity="critical" if r.status_code == 500 else "normal")

    # 1.6 Summary totals (use stats/overview since analytics/summary doesn't exist)
    r_summary = requests.get(f"{API}/analytics/summary", headers=headers, timeout=15)
    log("MODULE_1", "1.6a GET /analytics/summary (review spec)",
        r_summary.status_code == 200, f"{r_summary.status_code} (endpoint doesn't exist in backend)",
        severity="normal")

    r_monthly = requests.get(f"{API}/analytics/monthly", headers=headers, timeout=15)
    log("MODULE_1", "1.6a GET /analytics/monthly (review spec)",
        r_monthly.status_code == 200, f"{r_monthly.status_code} (endpoint doesn't exist in backend)",
        severity="normal")

    # Test actual stats endpoint
    r = requests.get(f"{API}/stats/overview", headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_1", "1.6 GET /stats/overview", False, f"{r.status_code}", "critical")
    else:
        # Create 3 txns in unique category and verify sum
        unique_cat = f"AuditTest_{int(time.time())}"
        created = []
        for amt in (100, 200, 300):
            rr = requests.post(f"{API}/transactions", json={
                "description": f"Audit {amt}", "amount": amt, "type": "debit",
                "category": unique_cat, "date": utc_now().isoformat()
            }, headers=headers, timeout=15)
            if rr.status_code == 200:
                created.append(rr.json()["id"])
        time.sleep(0.5)
        rr = requests.get(f"{API}/stats/overview", headers=headers, timeout=15)
        if rr.status_code == 200:
            cat_sum = rr.json().get("category_breakdown", {}).get(unique_cat, 0)
            log("MODULE_1", "1.6 stats cat breakdown EXACT 600",
                abs(cat_sum - 600) < 0.01, f"got {cat_sum}",
                severity="critical" if abs(cat_sum - 600) >= 0.01 else "normal")
        for tid in created:
            requests.delete(f"{API}/transactions/{tid}", headers=headers, timeout=15)


def test_module_2():
    print("\n" + "="*60 + "\n MODULE 2: SPLIT GROUPS + EXPENSES\n" + "="*60)
    r = requests.post(f"{API}/split/groups",
                      json={"name": "Audit Test", "members": ["9111222333", "9111222444"]},
                      headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_2", "2.1 POST group", False, f"{r.status_code} {r.text[:120]}", "critical")
        return
    g = r.json()
    group_id = g["id"]
    log("MODULE_2", "2.1 POST /split/groups (3 members)", len(g.get("members", [])) == 3,
        f"members={len(g.get('members',[]))}")
    member_ids = [m["user_id"] for m in g["members"]]

    r = requests.post(f"{API}/split/expenses", json={
        "group_id": group_id, "description": "Dinner", "amount": 300,
        "paid_by": my_user_id, "split_type": "equal"
    }, headers=headers, timeout=15)
    if r.status_code == 200:
        s = sum(r.json().get("splits", {}).values())
        log("MODULE_2", "2.2a equal 300/3 sum==300", abs(s - 300) < 0.01, f"sum={s}",
            severity="critical" if abs(s - 300) >= 0.01 else "normal")
    else:
        log("MODULE_2", "2.2a 300 expense", False, f"{r.status_code}", "critical")

    r = requests.post(f"{API}/split/expenses", json={
        "group_id": group_id, "description": "Test100", "amount": 100,
        "paid_by": my_user_id, "split_type": "equal"
    }, headers=headers, timeout=15)
    exp_id_100 = None
    if r.status_code == 200:
        d = r.json()
        exp_id_100 = d["id"]
        s = sum(d.get("splits", {}).values())
        log("MODULE_2", "2.2b equal 100/3 sum==100 (largest-remainder)",
            abs(s - 100) < 0.01, f"sum={s} splits={d.get('splits')}",
            severity="critical" if abs(s - 100) >= 0.01 else "normal")

    if exp_id_100:
        r = requests.put(f"{API}/split/expenses/{exp_id_100}", json={"amount": 600},
                         headers=headers, timeout=15)
        if r.status_code == 200:
            s = sum(r.json().get("splits", {}).values())
            log("MODULE_2", "2.3a PUT amount=600 sum==600", abs(s - 600) < 0.01, f"sum={s}",
                severity="critical" if abs(s - 600) >= 0.01 else "normal")

        pct = {member_ids[0]: 50, member_ids[1]: 30, member_ids[2]: 20}
        r = requests.put(f"{API}/split/expenses/{exp_id_100}", json={
            "split_type": "percentage", "amount": 600, "splits": pct
        }, headers=headers, timeout=15)
        if r.status_code == 200:
            ss = r.json().get("splits", {})
            expected = {member_ids[0]: 300.0, member_ids[1]: 180.0, member_ids[2]: 120.0}
            ok_exact = all(abs(ss.get(k, 0) - v) < 0.01 for k, v in expected.items())
            log("MODULE_2", "2.3b percentage 50/30/20 of 600 -> {300,180,120}", ok_exact,
                f"got={ss}", severity="critical" if not ok_exact else "normal")

        r = requests.delete(f"{API}/split/expenses/{exp_id_100}", headers=headers, timeout=15)
        log("MODULE_2", "2.4 DELETE expense", r.status_code in (200, 204), f"{r.status_code}")

    r = requests.put(f"{API}/split/groups/{group_id}/name", json={"name": "Renamed"},
                     headers=headers, timeout=15)
    if r.status_code == 200:
        rr = requests.get(f"{API}/split/groups/{group_id}/manage", headers=headers, timeout=15)
        ok = rr.status_code == 200 and rr.json().get("name") == "Renamed"
        log("MODULE_2", "2.5 PUT rename reflected", ok, f"{rr.json().get('name')}")

    r = requests.post(f"{API}/split/groups/{group_id}/members", json={"phones": ["9888777666"]},
                      headers=headers, timeout=15)
    log("MODULE_2", "2.6a POST add member", r.status_code == 200, f"{r.status_code}")

    rr = requests.get(f"{API}/split/groups/{group_id}/manage", headers=headers, timeout=15)
    new_id = None
    if rr.status_code == 200:
        for m in rr.json().get("members", []):
            if m.get("phone") == "9888777666":
                new_id = m["user_id"]
                break
    if new_id:
        r = requests.delete(f"{API}/split/groups/{group_id}/members/{new_id}",
                            headers=headers, timeout=15)
        log("MODULE_2", "2.6b DELETE member", r.status_code == 200, f"{r.status_code}")

    r = requests.delete(f"{API}/split/groups/{group_id}", headers=headers, timeout=15)
    log("MODULE_2", "2.7 DELETE group", r.status_code == 200, f"{r.status_code}")

    # 2.8 balance sync
    r = requests.post(f"{API}/split/groups",
                      json={"name": "Bal Test", "members": ["9555000111"]},
                      headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_2", "2.8 create bal group", False, f"{r.status_code}", "critical")
        return
    bg = r.json()
    bg_id = bg["id"]
    other_id = [m["user_id"] for m in bg["members"] if m["user_id"] != my_user_id][0]

    r = requests.post(f"{API}/split/expenses", json={
        "group_id": bg_id, "description": "Test", "amount": 1000,
        "paid_by": other_id, "split_type": "equal"
    }, headers=headers, timeout=15)
    log("MODULE_2", "2.8a create 1000 paid by other", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{API}/split/balances", headers=headers, timeout=15)
    if r.status_code == 200:
        tyo = r.json().get("total_you_owe", 0)
        log("MODULE_2", "2.8b balance shows 500 owed", abs(tyo - 500) < 1.0,
            f"total_you_owe={tyo}",
            severity="critical" if abs(tyo - 500) >= 1.0 else "normal")

    r = requests.post(f"{API}/split/partial-settle",
                      json={"target_user_id": other_id, "amount": 200, "group_id": bg_id},
                      headers=headers, timeout=15)
    log("MODULE_2", "2.8c partial-settle 200", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{API}/split/balances", headers=headers, timeout=15)
    if r.status_code == 200:
        tyo = r.json().get("total_you_owe", 0)
        log("MODULE_2", "2.8c balance=300 after partial", abs(tyo - 300) < 1.0,
            f"total_you_owe={tyo}",
            severity="critical" if abs(tyo - 300) >= 1.0 else "normal")

    r = requests.post(f"{API}/split/settle-with-rewards",
                      json={"target_user_id": other_id, "amount": 300, "method": "upi", "group_id": bg_id},
                      headers=headers, timeout=15)
    log("MODULE_2", "2.8d settle-with-rewards 300", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{API}/split/balances", headers=headers, timeout=15)
    if r.status_code == 200:
        tyo = r.json().get("total_you_owe", 0)
        log("MODULE_2", "2.8d balance=0 after full settle",
            abs(tyo) < 1.0, f"total_you_owe={tyo}",
            severity="critical" if abs(tyo) >= 1.0 else "normal")

    requests.delete(f"{API}/split/groups/{bg_id}", headers=headers, timeout=15)


def test_module_3():
    print("\n" + "="*60 + "\n MODULE 3: BUDGETS\n" + "="*60)
    unique_cat = f"BudgAudit_{int(time.time())}"

    # 3.1 Create with amount (backend spec)
    r = requests.post(f"{API}/budgets", json={
        "category": unique_cat, "amount": 5000, "period": "monthly"
    }, headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_3", "3.1 POST /budgets amount=5000", False, f"{r.status_code} {r.text[:120]}", "critical")
        return
    bud_id = r.json().get("id")
    log("MODULE_3", "3.1 POST /budgets amount=5000", bud_id is not None, f"id={bud_id}")

    # Test review-spec format with `limit` instead of `amount`
    r_limit = requests.post(f"{API}/budgets", json={
        "category": f"{unique_cat}_L", "limit": 5000, "period": "monthly"
    }, headers=headers, timeout=15)
    log("MODULE_3", "3.1b POST with 'limit' key (review spec)",
        r_limit.status_code == 200,
        f"{r_limit.status_code} -- review uses 'limit' but backend requires 'amount' (422 expected)")

    # 3.2
    r = requests.get(f"{API}/budgets", headers=headers, timeout=15)
    ok = r.status_code == 200 and any(b.get("id") == bud_id for b in r.json())
    log("MODULE_3", "3.2a GET /budgets includes new", ok, f"{r.status_code}")

    r = requests.get(f"{API}/budgets/live", headers=headers, timeout=15)
    if r.status_code == 200:
        has = any(b.get("category") == unique_cat for b in r.json().get("budgets", []))
        log("MODULE_3", "3.2b GET /budgets/live includes new", has, f"found={has}")

    # 3.3 PUT (review expects) vs POST upsert (actual)
    r = requests.put(f"{API}/budgets/{bud_id}", json={"amount": 6000}, headers=headers, timeout=15)
    log("MODULE_3", "3.3a PUT /budgets/{id} (REVIEW SPEC)",
        r.status_code == 200, f"{r.status_code} -- NO PUT endpoint in backend (405 expected)",
        severity="critical" if r.status_code == 500 else "normal")

    r = requests.post(f"{API}/budgets",
                      json={"category": unique_cat, "amount": 6000, "period": "monthly"},
                      headers=headers, timeout=15)
    log("MODULE_3", "3.3b POST upsert amount=6000", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{API}/budgets", headers=headers, timeout=15)
    if r.status_code == 200:
        found = next((b for b in r.json() if b.get("category") == unique_cat), None)
        log("MODULE_3", "3.3c GET reflects amount=6000",
            found is not None and found.get("amount") == 6000,
            f"got amount={found.get('amount') if found else None}")

    # 3.4 tracking accuracy
    track_cat = f"AuditTrack_{int(time.time())}"
    requests.post(f"{API}/budgets",
                  json={"category": track_cat, "amount": 5000, "period": "monthly"},
                  headers=headers, timeout=15)
    created = []
    for amt in (1000, 1500, 2000):
        rr = requests.post(f"{API}/transactions", json={
            "description": f"Track {amt}", "amount": amt, "type": "debit",
            "category": track_cat, "date": utc_now().isoformat()
        }, headers=headers, timeout=15)
        if rr.status_code == 200:
            created.append(rr.json()["id"])
    time.sleep(0.5)

    r = requests.get(f"{API}/budgets/live", headers=headers, timeout=15)
    if r.status_code == 200:
        found = next((b for b in r.json().get("budgets", []) if b.get("category") == track_cat), None)
        if found:
            spent = found.get("spent", 0)
            log("MODULE_3", "3.4a budgets/live spent=4500",
                abs(spent - 4500) < 1.0,
                f"spent={spent} remaining={found.get('remaining')} pct={found.get('percentage')}",
                severity="critical" if abs(spent - 4500) >= 1.0 else "normal")
        else:
            log("MODULE_3", "3.4a track cat in /budgets/live", False, "not found", "critical")

    # 4th expense (over budget)
    rr = requests.post(f"{API}/transactions", json={
        "description": "Over", "amount": 1000, "type": "debit",
        "category": track_cat, "date": utc_now().isoformat()
    }, headers=headers, timeout=15)
    if rr.status_code == 200:
        created.append(rr.json()["id"])
    time.sleep(0.3)

    r = requests.get(f"{API}/budgets/live", headers=headers, timeout=15)
    if r.status_code == 200:
        found = next((b for b in r.json().get("budgets", []) if b.get("category") == track_cat), None)
        if found:
            log("MODULE_3", "3.4b spent=5500 status=exceeded",
                abs(found.get("spent", 0) - 5500) < 1.0 and found.get("status") == "exceeded",
                f"spent={found.get('spent')} status={found.get('status')}")

    for tid in created:
        requests.delete(f"{API}/transactions/{tid}", headers=headers, timeout=15)

    # 3.5
    r = requests.delete(f"{API}/budgets/{bud_id}", headers=headers, timeout=15)
    log("MODULE_3", "3.5 DELETE budget", r.status_code == 200, f"{r.status_code}")

    # cleanup
    r = requests.get(f"{API}/budgets", headers=headers, timeout=15)
    if r.status_code == 200:
        for b in r.json():
            if b.get("category") in (track_cat, f"{unique_cat}_L", unique_cat):
                requests.delete(f"{API}/budgets/{b['id']}", headers=headers, timeout=15)


def test_module_4():
    print("\n" + "="*60 + "\n MODULE 4: PROFILE\n" + "="*60)

    r = requests.get(f"{API}/user/me", headers=headers, timeout=15)
    if r.status_code != 200:
        log("MODULE_4", "4.1 GET /user/me", False, f"{r.status_code}", "critical")
        return
    d = r.json()
    log("MODULE_4", "4.1 GET /user/me", "phone" in d and "name" in d,
        f"name={d.get('name')} phone={d.get('phone')}")

    # Review uses PUT /user/me but backend has PUT /user/profile
    r = requests.put(f"{API}/user/me", json={"name": "Updated"}, headers=headers, timeout=15)
    log("MODULE_4", "4.2a PUT /user/me (REVIEW SPEC)",
        r.status_code == 200, f"{r.status_code} -- backend uses PUT /user/profile (405 expected)",
        severity="critical" if r.status_code == 500 else "normal")

    r = requests.put(f"{API}/user/profile", json={"name": "AuditName"}, headers=headers, timeout=15)
    log("MODULE_4", "4.2b PUT /user/profile {name}", r.status_code == 200, f"{r.status_code}")

    r = requests.put(f"{API}/user/me", json={"monthly_income": 50000}, headers=headers, timeout=15)
    log("MODULE_4", "4.2c PUT /user/me monthly_income",
        r.status_code == 200, f"{r.status_code}",
        severity="critical" if r.status_code == 500 else "normal")

    r = requests.put(f"{API}/user/me", json={"language": "hi"}, headers=headers, timeout=15)
    log("MODULE_4", "4.2d PUT /user/me language",
        r.status_code == 200, f"{r.status_code}",
        severity="critical" if r.status_code == 500 else "normal")

    r = requests.post(f"{API}/user/upi", json={"upi_id": "test@upi"}, headers=headers, timeout=15)
    log("MODULE_4", "4.3a POST /user/upi", r.status_code == 200, f"{r.status_code}")

    r = requests.get(f"{API}/user/upi", headers=headers, timeout=15)
    ok = r.status_code == 200 and "@upi" in (r.json().get("masked") or "")
    log("MODULE_4", "4.3b GET /user/upi masked", ok,
        f"{r.status_code} masked={r.json().get('masked') if r.status_code == 200 else None}")

    tiny = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
    r = requests.post(f"{API}/user/avatar", json={"avatar": tiny}, headers=headers, timeout=15)
    log("MODULE_4", "4.4 POST /user/avatar", r.status_code == 200, f"{r.status_code}")


def test_module_5():
    print("\n" + "="*60 + "\n MODULE 5: SMOKE\n" + "="*60)
    endpoints = [
        "/alerts/smart",
        "/reports/weekly",
        "/leaderboard/savings",
        "/gamification/status",
        "/news/india-finance",
        "/referral/fomo-feed",
        "/referral/enhanced-status",
        "/referral/money-score-card",
        "/money-school/dynamic?lang=en",
        "/card-of-the-day",
        "/insights/waste",
        "/waste-detector",
        "/premium/status",
    ]
    for ep in endpoints:
        try:
            r = requests.get(f"{API}{ep}", headers=headers, timeout=45)
            ok = 200 <= r.status_code < 500
            sev = "critical" if r.status_code >= 500 else "normal"
            log("MODULE_5", f"GET {ep}", ok, f"status={r.status_code}", severity=sev)
        except Exception as e:
            log("MODULE_5", f"GET {ep}", False, f"EXC: {e}", "critical")


if __name__ == "__main__":
    auth()
    for name, fn in [("M1", test_module_1), ("M2", test_module_2),
                     ("M3", test_module_3), ("M4", test_module_4),
                     ("M5", test_module_5)]:
        try:
            fn()
        except Exception as e:
            print(f"{name} crashed: {e}")

    print("\n" + "="*60 + "\n FINAL REPORT\n" + "="*60)
    for mod, items in results.items():
        passed = sum(1 for ok, _, _ in items if ok)
        total = len(items)
        print(f"\n{mod}: {passed}/{total} pass")
        for ok, name, msg in items:
            if not ok:
                print(f"  FAIL {name}: {msg}")

    print("\n" + "="*60 + "\n CRITICAL BUGS\n" + "="*60)
    if critical:
        for c in critical:
            print(f"  * {c}")
    else:
        print("  (none)")
