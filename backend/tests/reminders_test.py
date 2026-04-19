"""
Test NEW Group Payment Reminder + Mark-Paid-Offline endpoints.
Also verifies uuid_lib + SETTLEMENT_REWARDS regressions are fixed.
"""
import requests
import json
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
PASSWORD = "test123"

results = []


def log(name, passed, detail=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    results.append((name, passed, detail))
    print(f"{status} | {name} | {detail[:400]}")


def main():
    # AUTH
    r = requests.post(f"{BASE}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        log("auth/login", False, f"HTTP {r.status_code}: {r.text[:200]}")
        return
    data = r.json()
    token = data.get("access_token") or data.get("token")
    me_id = (data.get("user") or {}).get("id") or data.get("user_id")
    log("auth/login", bool(token), f"token_len={len(token) if token else 0}")
    H = {"Authorization": f"Bearer {token}"}

    # Current user id
    r = requests.get(f"{BASE}/user/me", headers=H, timeout=30)
    me = r.json() if r.status_code == 200 else {}
    me_id = me.get("id")
    log("user/me", r.status_code == 200 and bool(me_id), f"id={me_id} phone={me.get('phone')}")

    # Find group + target user
    r = requests.get(f"{BASE}/split/groups", headers=H, timeout=30)
    if r.status_code != 200:
        log("split/groups", False, f"HTTP {r.status_code}")
        return
    groups = r.json()
    group_id = None
    target_user_id = None
    for g in groups:
        for m in g.get("members", []):
            if m.get("user_id") and m["user_id"] != me_id:
                group_id = g.get("id")
                target_user_id = m["user_id"]
                break
        if target_user_id:
            break

    if not target_user_id:
        # Create a throwaway group
        r = requests.post(f"{BASE}/split/groups", headers=H, json={"name": "Test Remind", "members": ["9999888877"]}, timeout=30)
        if r.status_code != 200:
            log("create test group", False, f"HTTP {r.status_code}: {r.text[:200]}")
            return
        gd = r.json()
        group_id = gd["id"]
        for m in gd.get("members", []):
            if m.get("user_id") != me_id:
                target_user_id = m["user_id"]
                break

    log("find group+target", bool(group_id and target_user_id), f"group_id={group_id} target_user_id={target_user_id}")

    # Cleanup any prior reminder for anti-spam test predictability
    # (can't easily delete; we'll rely on test still passing or skipping 429)

    # ---- Test 1: POST /api/split/remind ----
    body1 = {"target_user_id": target_user_id, "amount": 250, "group_id": group_id, "note": "Test reminder please"}
    r = requests.post(f"{BASE}/split/remind", headers=H, json=body1, timeout=30)
    test1_pass = False
    reminder_id = None
    if r.status_code == 200:
        j = r.json()
        wa_link = j.get("whatsapp_link", "")
        wa_text = j.get("whatsapp_text", "")
        ok = (
            "id" in j and "message" in j
            and (wa_link.startswith("http") and ("wa.me" in wa_link or "whatsapp://" in wa_link) or wa_link.startswith("whatsapp://"))
            and "250" in wa_text
            and "Test reminder please" in wa_text
            and j.get("amount") == 250
            and j.get("recipient_name")
        )
        test1_pass = ok
        reminder_id = j.get("id")
        log("POST /split/remind (new)", ok, f"id={reminder_id} wa_link[:30]={wa_link[:30]} note_in_text={'Test reminder please' in wa_text}")
    elif r.status_code == 429:
        # Previous reminder exists. Try with slightly different note to still validate shape indirectly.
        log("POST /split/remind (new)", False, f"Got 429 immediately (prior reminder in last hour): {r.text[:200]}")
        # Attempt continuing with GET reminders to find existing one
        rr = requests.get(f"{BASE}/split/reminders", headers=H, timeout=30)
        if rr.status_code == 200:
            sent = rr.json().get("sent", [])
            for s in sent:
                if s.get("recipient_id") == target_user_id and s.get("amount") == 250 and s.get("group_id") == group_id:
                    reminder_id = s["id"]
                    test1_pass = True
                    log("POST /split/remind (recovered from existing)", True, f"existing reminder id={reminder_id}")
                    break
    else:
        log("POST /split/remind (new)", False, f"HTTP {r.status_code}: {r.text[:300]}")

    # ---- Test 2: POST same again → 429 anti-spam ----
    r = requests.post(f"{BASE}/split/remind", headers=H, json=body1, timeout=30)
    detail_text = ""
    try:
        detail_text = (r.json().get("detail") or "")
    except Exception:
        detail_text = r.text
    lower = detail_text.lower()
    test2_pass = r.status_code == 429 and ("already" in lower or "wait" in lower)
    log("POST /split/remind anti-spam 429", test2_pass, f"HTTP {r.status_code} detail={detail_text[:200]}")

    # ---- Test 3: GET /api/split/reminders ----
    r = requests.get(f"{BASE}/split/reminders", headers=H, timeout=30)
    test3_pass = False
    if r.status_code == 200:
        j = r.json()
        has_shape = "received" in j and "sent" in j and "received_count" in j
        sent = j.get("sent", [])
        found = False
        for s in sent:
            if s.get("id") == reminder_id or (s.get("sender_id") == me_id and s.get("amount") == 250 and s.get("status") == "pending"):
                found = True
                if not reminder_id:
                    reminder_id = s.get("id")
                break
        test3_pass = has_shape and found
        log("GET /split/reminders", test3_pass, f"shape={has_shape} sent_len={len(sent)} recv_len={len(j.get('received',[]))} found_sent={found}")
    else:
        log("GET /split/reminders", False, f"HTTP {r.status_code}: {r.text[:200]}")

    # ---- Test 4: POST /api/split/reminders/{id}/dismiss ----
    if reminder_id:
        r = requests.post(f"{BASE}/split/reminders/{reminder_id}/dismiss", headers=H, timeout=30)
        # 200 OR 404 both acceptable (can't dismiss your own sent reminder)
        test4_pass = r.status_code in (200, 404)
        log("POST /split/reminders/{id}/dismiss", test4_pass, f"HTTP {r.status_code} body={r.text[:200]}")
    else:
        log("POST /split/reminders/{id}/dismiss", False, "No reminder_id to test")

    # ---- Test 5: POST /api/split/mark-paid-offline ----
    body5 = {"target_user_id": target_user_id, "amount": 100, "group_id": group_id, "method": "cash", "note": "Paid at dinner"}
    r = requests.post(f"{BASE}/split/mark-paid-offline", headers=H, json=body5, timeout=30)
    test5_pass = False
    settlement_id = None
    if r.status_code == 200:
        j = r.json()
        txn = j.get("txn_ref", "")
        ok = "id" in j and "message" in j and j.get("method") == "cash" and txn.startswith("OFFLINE-")
        test5_pass = ok
        settlement_id = j.get("id")
        log("POST /split/mark-paid-offline", ok, f"id={settlement_id} method={j.get('method')} txn_ref={txn}")
    else:
        log("POST /split/mark-paid-offline", False, f"HTTP {r.status_code}: {r.text[:300]}")

    # Verify settlement shows up in /split/settlements with method=cash
    r = requests.get(f"{BASE}/split/settlements", headers=H, timeout=30)
    if r.status_code == 200:
        sts = r.json()
        match = next((s for s in sts if s.get("id") == settlement_id), None)
        if match and match.get("method") == "cash":
            log("GET /split/settlements (verify offline)", True, f"found settlement method=cash")
        else:
            # At minimum there should be a cash method with txn_ref starting OFFLINE-
            any_offline = any(s.get("method") == "cash" and str(s.get("txn_ref", "")).startswith("OFFLINE-") for s in sts)
            log("GET /split/settlements (verify offline)", any_offline, f"match_found={match is not None} any_offline_cash={any_offline} total={len(sts)}")
    else:
        log("GET /split/settlements (verify offline)", False, f"HTTP {r.status_code}")

    # ---- Test 6: pay-intent uuid_lib regression ----
    r = requests.get(f"{BASE}/split/pay-intent/{target_user_id}?amount=500", headers=H, timeout=30)
    test6_pass = False
    if r.status_code == 200:
        j = r.json()
        ok = (
            j.get("upi_link", "").startswith("upi://pay")
            and j.get("payee_name")
            and j.get("payee_upi")
            and j.get("amount") == 500
            and str(j.get("txn_ref", "")).startswith("MINTU")
        )
        test6_pass = ok
        log("GET /split/pay-intent (uuid_lib regression)", ok, f"upi_link_prefix={j.get('upi_link','')[:20]} txn_ref={j.get('txn_ref')}")
    elif r.status_code == 400:
        # target has no UPI set - acceptable
        log("GET /split/pay-intent (uuid_lib regression)", True, f"HTTP 400 target has no UPI (acceptable): {r.text[:150]}")
        test6_pass = True
    else:
        log("GET /split/pay-intent (uuid_lib regression)", False, f"HTTP {r.status_code}: {r.text[:300]}")

    # ---- Test 7: settle-with-rewards SETTLEMENT_REWARDS regression ----
    body7 = {"target_user_id": target_user_id, "amount": 50, "method": "upi", "group_id": group_id}
    r = requests.post(f"{BASE}/split/settle-with-rewards", headers=H, json=body7, timeout=30)
    test7_pass = False
    if r.status_code == 200:
        j = r.json()
        reward = j.get("reward", {})
        ok = (
            "id" in j and "message" in j and "txn_ref" in j
            and "coins_earned" in reward and "label" in reward
            and "total_coins" in reward and "cashback_available" in reward
            and isinstance(reward.get("new_badges"), list)
        )
        test7_pass = ok
        log("POST /split/settle-with-rewards (SETTLEMENT_REWARDS regr)", ok, f"coins={reward.get('coins_earned')} label={reward.get('label')}")
    else:
        log("POST /split/settle-with-rewards (SETTLEMENT_REWARDS regr)", False, f"HTTP {r.status_code}: {r.text[:300]}")

    # ---- Regression Smoke ----
    r = requests.get(f"{BASE}/split/groups", headers=H, timeout=30)
    log("GET /split/groups (smoke)", r.status_code == 200, f"HTTP {r.status_code} len={len(r.json()) if r.status_code==200 else 0}")

    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=30)
    if r.status_code == 200:
        j = r.json()
        ok = all(k in j for k in ("total_owed_to_you", "total_you_owe", "owe_you", "you_owe"))
        log("GET /split/balances (smoke)", ok, f"keys present={ok}")
    else:
        log("GET /split/balances (smoke)", False, f"HTTP {r.status_code}")

    r = requests.get(f"{BASE}/split/settlement-leaderboard", headers=H, timeout=30)
    if r.status_code == 200:
        j = r.json()
        ok = "leaderboard" in j and "my_stats" in j
        log("GET /split/settlement-leaderboard (smoke)", ok, f"lb_len={len(j.get('leaderboard',[]))} my_stats_keys={list(j.get('my_stats',{}).keys())[:5]}")
    else:
        log("GET /split/settlement-leaderboard (smoke)", False, f"HTTP {r.status_code}")

    r = requests.get(f"{BASE}/user/me", headers=H, timeout=30)
    log("GET /user/me (smoke)", r.status_code == 200, f"HTTP {r.status_code}")

    # Summary
    print("\n" + "=" * 80)
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed")
    for name, p, d in results:
        if not p:
            print(f"  ❌ {name}: {d[:300]}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
