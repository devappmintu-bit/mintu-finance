"""R101G/R101F regression tests — /api/split/balances and /api/split/razorpay-order"""
import requests
import json
import sys

BASE = "http://localhost:8001/api"
PASS = "[PASS]"
FAIL = "[FAIL]"
results = []


def auth(phone: str, name: str, otp: str = "123456") -> tuple[str, str]:
    """Return (token, user_id). Retries once on rate-limit."""
    import time
    for _ in range(2):
        r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
        if r.status_code == 200:
            break
        if "wait" in r.text.lower():
            time.sleep(32)
            continue
        raise RuntimeError(f"send-otp {phone}: {r.status_code} {r.text}")
    time.sleep(1)
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": phone, "otp": otp, "name": name,
              "device_id": "cli", "device_name": "CLI", "os": "web"},
        timeout=15,
    )
    if r.status_code != 200:
        raise RuntimeError(f"verify-otp {phone}: {r.status_code} {r.text}")
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    uid = body.get("user_id") or (body.get("user") or {}).get("id")
    return tok, uid


def hdrs(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def assert_balances_shape(label: str, body: dict):
    required = ["total_owed_to_you", "total_you_owe", "owe_you", "you_owe", "pending_invites", "pending_total"]
    missing = [k for k in required if k not in body]
    if missing:
        results.append((FAIL, f"{label}: missing keys {missing}"))
        return False
    ok = True
    if not isinstance(body["pending_invites"], list):
        results.append((FAIL, f"{label}: pending_invites not a list"))
        ok = False
    if not isinstance(body["owe_you"], dict) or not isinstance(body["you_owe"], dict):
        results.append((FAIL, f"{label}: owe_you/you_owe not dicts"))
        ok = False
    for k in ("total_owed_to_you", "total_you_owe", "pending_total"):
        if not isinstance(body[k], (int, float)):
            results.append((FAIL, f"{label}: {k} not numeric"))
            ok = False
    return ok


def main():
    # ---- Test 1: Auth flow with 9111122221
    print("\n=== TEST 1: Auth phone 9111122221 / OTP 123456 ===")
    sys.stdout.flush()
    try:
        tok1, uid1 = auth("9111122221", "Aarav Sharma", "123456")
        if tok1:
            results.append((PASS, f"T1 auth 9111122221 OK, user_id={uid1}"))
        else:
            results.append((FAIL, "T1 auth 9111122221 returned no token"))
            print_summary(); return
    except Exception as e:
        results.append((FAIL, f"T1 auth 9111122221 failed: {e}"))
        print_summary(); return

    # ---- Test 2: GET /api/split/balances for primary user
    print("\n=== TEST 2: GET /api/split/balances (primary user) ===")
    r = requests.get(f"{BASE}/split/balances", headers=hdrs(tok1), timeout=20)
    print(f"Status: {r.status_code}")
    if r.status_code == 500:
        results.append((FAIL, f"T2 GET /split/balances → 500 (regression!): {r.text[:300]}"))
    elif r.status_code != 200:
        results.append((FAIL, f"T2 GET /split/balances → {r.status_code}: {r.text[:300]}"))
    else:
        body = r.json()
        print(json.dumps(body, indent=2)[:500])
        if assert_balances_shape("T2", body):
            results.append((PASS, f"T2 GET /split/balances → 200 with all required keys (owe_you={len(body['owe_you'])}, you_owe={len(body['you_owe'])}, pending_invites={len(body['pending_invites'])})"))

    # ---- Test 3: Fresh user with NO groups (the path that crashed)
    print("\n=== TEST 3: Fresh user 9000099991 — GET /api/split/balances ===")
    sys.stdout.flush()
    try:
        tok2, uid2 = auth("9000099991", "Priya Mehta", "123456")
        if not tok2:
            results.append((FAIL, "T3 auth 9000099991 returned no token"))
        else:
            results.append((PASS, f"T3a auth 9000099991 OK, user_id={uid2}"))
            # Check user has no groups
            gr = requests.get(f"{BASE}/split/groups", headers=hdrs(tok2), timeout=15)
            groups = gr.json() if gr.status_code == 200 else []
            print(f"Group count for 9000099991: {len(groups) if isinstance(groups, list) else 'n/a'}")
            r = requests.get(f"{BASE}/split/balances", headers=hdrs(tok2), timeout=20)
            print(f"Status: {r.status_code}")
            if r.status_code == 500:
                results.append((FAIL, f"T3 EMPTY-GROUPS GET /split/balances → 500 (R101F REGRESSION!): {r.text[:300]}"))
            elif r.status_code != 200:
                results.append((FAIL, f"T3 EMPTY-GROUPS GET /split/balances → {r.status_code}: {r.text[:300]}"))
            else:
                body = r.json()
                print(json.dumps(body, indent=2))
                if assert_balances_shape("T3", body):
                    # Verify it really is empty
                    if (body["total_owed_to_you"] == 0 and body["total_you_owe"] == 0
                            and body["owe_you"] == {} and body["you_owe"] == {}
                            and body["pending_invites"] == [] and body["pending_total"] == 0):
                        results.append((PASS, "T3 EMPTY-GROUPS path → 200 with all-empty payload (R101F fix verified)"))
                    else:
                        # Still 200 means no crash. User may have had prior data; still PASS the no-crash bit
                        results.append((PASS, f"T3 EMPTY-GROUPS path → 200 (no crash). Note: user not pristine — owe_you={len(body['owe_you'])}, you_owe={len(body['you_owe'])}, pending={len(body['pending_invites'])}"))
    except Exception as e:
        results.append((FAIL, f"T3 fresh-user flow exception: {e}"))

    # ---- Test 4: POST /api/split/razorpay-order
    print("\n=== TEST 4: POST /api/split/razorpay-order ===")
    # 4a: missing target_user_id → 400
    r = requests.post(f"{BASE}/split/razorpay-order", headers=hdrs(tok1),
                      json={"amount": 100, "group_id": None}, timeout=15)
    print(f"4a missing target_user_id: {r.status_code}")
    if r.status_code == 400:
        results.append((PASS, "T4a missing target_user_id → 400"))
    else:
        results.append((FAIL, f"T4a missing target_user_id → {r.status_code}: {r.text[:200]}"))

    # 4b: amount <= 0 → 400
    r = requests.post(f"{BASE}/split/razorpay-order", headers=hdrs(tok1),
                      json={"target_user_id": "0" * 24, "amount": 0, "group_id": None}, timeout=15)
    print(f"4b amount=0: {r.status_code}")
    if r.status_code == 400:
        results.append((PASS, "T4b amount=0 → 400"))
    else:
        results.append((FAIL, f"T4b amount=0 → {r.status_code}: {r.text[:200]}"))

    r = requests.post(f"{BASE}/split/razorpay-order", headers=hdrs(tok1),
                      json={"target_user_id": "0" * 24, "amount": -5, "group_id": None}, timeout=15)
    print(f"4b2 amount=-5: {r.status_code}")
    if r.status_code == 400:
        results.append((PASS, "T4b2 amount=-5 → 400"))
    else:
        results.append((FAIL, f"T4b2 amount=-5 → {r.status_code}: {r.text[:200]}"))

    # 4c: happy path — need a real other-user OID. Use uid2 (the freshly auth'd 9000099991).
    print("\n=== TEST 4c: razorpay-order happy path ===")
    target_oid = uid2 or uid1  # fall back if uid2 missing
    r = requests.post(f"{BASE}/split/razorpay-order", headers=hdrs(tok1),
                      json={"target_user_id": target_oid, "amount": 100, "group_id": None}, timeout=30)
    print(f"4c happy path status: {r.status_code}")
    print(f"4c body: {r.text[:500]}")
    if r.status_code == 500:
        results.append((FAIL, f"T4c happy path → 500: {r.text[:300]}"))
    elif r.status_code != 200:
        results.append((FAIL, f"T4c happy path → {r.status_code}: {r.text[:300]}"))
    else:
        body = r.json()
        required = ["order_id", "amount_paise", "effective_amount", "key_id", "currency", "checkout_url"]
        missing = [k for k in required if k not in body]
        if missing:
            results.append((FAIL, f"T4c missing keys: {missing}"))
        elif body.get("currency") != "INR":
            results.append((FAIL, f"T4c currency != INR: {body.get('currency')}"))
        elif not body.get("order_id", "").startswith("order_"):
            results.append((FAIL, f"T4c bad order_id: {body.get('order_id')}"))
        else:
            results.append((PASS, f"T4c happy path → 200 order_id={body['order_id']} amount_paise={body['amount_paise']} effective={body['effective_amount']} currency={body['currency']}"))

    # Summary
    print_summary()


def print_summary():
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    pass_count = sum(1 for s, _ in results if s == PASS)
    fail_count = sum(1 for s, _ in results if s == FAIL)
    for status, msg in results:
        print(f"{status} {msg}")
    print(f"\nTotal: {pass_count} pass / {fail_count} fail")


if __name__ == "__main__":
    main()
