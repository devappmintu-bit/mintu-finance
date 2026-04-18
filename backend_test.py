"""Smoke test for transactions refactor - Apr 18 2026."""
import os
import sys
import requests
import json

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def log(msg):
    print(msg, flush=True)


def main():
    results = []
    # Auth
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    log(f"send-otp: {r.status_code}")
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}
    log(f"verify-otp: 200, token acquired")

    # 1. POST /api/transactions
    payload = {"amount": 250, "category": "Food", "description": "Pizza", "type": "debit"}
    r = requests.post(f"{BASE}/transactions", json=payload, headers=H, timeout=30)
    log(f"\n[1] POST /api/transactions -> {r.status_code}")
    if r.status_code != 200:
        log(f"  BODY: {r.text[:500]}")
        results.append(("POST /transactions", False, r.status_code))
        return results
    body = r.json()
    txn_id = body.get("id")
    log(f"  id: {txn_id}")
    log(f"  keys: {list(body.keys())}")
    results.append(("POST /transactions", bool(txn_id), r.status_code))

    # 2. GET /api/transactions?limit=5
    r = requests.get(f"{BASE}/transactions?limit=5", headers=H, timeout=30)
    log(f"\n[2] GET /api/transactions?limit=5 -> {r.status_code}")
    ok = False
    if r.status_code == 200:
        body = r.json()
        log(f"  returned {len(body) if isinstance(body, list) else 'N/A'} txns")
        found = False
        if isinstance(body, list):
            for t in body:
                if t.get("id") == txn_id or t.get("_id") == txn_id:
                    found = True
                    break
            ok = len(body) > 0 and found
            log(f"  new txn at top: {body[0].get('id') == txn_id if body else False}")
            log(f"  new txn in list: {found}")
        else:
            log(f"  BODY (not list): {str(body)[:300]}")
    else:
        log(f"  BODY: {r.text[:500]}")
    results.append(("GET /transactions?limit=5", ok, r.status_code))

    # 3. DELETE /api/transactions/{id}
    r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H, timeout=30)
    log(f"\n[3] DELETE /api/transactions/{txn_id} -> {r.status_code}")
    ok = False
    if r.status_code == 200:
        body = r.json()
        log(f"  body: {body}")
        ok = body.get("message") == "Transaction deleted"
    else:
        log(f"  BODY: {r.text[:500]}")
    results.append(("DELETE /transactions/{id}", ok, r.status_code))

    # 4. POST /api/transactions/parse-sms
    sms = {"sms_text": "Your A/C XXXX123 debited Rs.599 for SWIGGY on 15-Apr. Avl bal Rs.8000."}
    r = requests.post(f"{BASE}/transactions/parse-sms", json=sms, headers=H, timeout=60)
    log(f"\n[4] POST /api/transactions/parse-sms -> {r.status_code}")
    ok = False
    if r.status_code == 200:
        body = r.json()
        log(f"  keys: {list(body.keys())}")
        log(f"  body: {json.dumps(body, default=str)[:500]}")
        ok = True
    else:
        log(f"  BODY: {r.text[:500]}")
    results.append(("POST /transactions/parse-sms", ok, r.status_code))

    # 5. GET /api/gamification/status
    r = requests.get(f"{BASE}/gamification/status", headers=H, timeout=30)
    log(f"\n[5] GET /api/gamification/status -> {r.status_code}")
    ok = r.status_code == 200
    if ok:
        body = r.json()
        log(f"  keys: {list(body.keys())}")
    else:
        log(f"  BODY: {r.text[:500]}")
    results.append(("GET /gamification/status", ok, r.status_code))

    # 6. GET /api/waste-detector
    r = requests.get(f"{BASE}/waste-detector", headers=H, timeout=60)
    log(f"\n[6] GET /api/waste-detector -> {r.status_code}")
    ok = r.status_code == 200
    if ok:
        body = r.json()
        log(f"  keys: {list(body.keys())}")
    else:
        log(f"  BODY: {r.text[:500]}")
    results.append(("GET /waste-detector", ok, r.status_code))

    return results


if __name__ == "__main__":
    try:
        results = main()
    except AssertionError as e:
        log(f"ASSERTION FAIL: {e}")
        sys.exit(2)
    except Exception as e:
        log(f"EXCEPTION: {type(e).__name__}: {e}")
        sys.exit(3)

    log("\n" + "=" * 60)
    log("SUMMARY")
    log("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, code in results:
        mark = "PASS" if ok else "FAIL"
        log(f"  [{mark}] {name} (HTTP {code})")
    log(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)
