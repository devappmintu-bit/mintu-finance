"""
Round 99D regression sweep — verify cleanup deletions did not break working endpoints.

Goals:
1. Verify deleted endpoints (POST /api/coins/award, GET /api/coins/status) return 404
2. Verify all preserved endpoints still pass
3. Verify no regression on prior 3 ships (Onboarding R99, Idempotency R99B, Subs R99C)
"""
import os
import sys
import time
import uuid
import json
import requests

BACKEND = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []

def record(label, ok, detail=""):
    status = "✅" if ok else "❌"
    line = f"{status} {label}: {detail}"
    print(line)
    results.append((label, ok, detail))


def get_token():
    # send-otp
    r = requests.post(f"{BACKEND}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    if r.status_code != 200:
        record("Auth.send-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    r2 = requests.post(
        f"{BACKEND}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "device_id": "cli", "device_name": "CLI", "os": "web"},
        timeout=20,
    )
    if r2.status_code != 200:
        record("Auth.verify-otp", False, f"status={r2.status_code} body={r2.text[:200]}")
        return None
    body = r2.json()
    tok = body.get("access_token") or body.get("token")
    if not tok:
        record("Auth.verify-otp", False, f"no token in body keys={list(body.keys())}")
        return None
    record("Auth", True, f"got JWT len={len(tok)}")
    return tok


def main():
    tok = get_token()
    if not tok:
        print("\n=== FAILED TO AUTH — aborting ===")
        sys.exit(2)
    H = {"Authorization": f"Bearer {tok}"}

    # =============== 1. DELETION VERIFICATION ==================
    print("\n--- 1. DELETION VERIFICATION ---")
    r = requests.post(f"{BACKEND}/coins/award", json={"amount": 10}, headers=H, timeout=15)
    record("DEL.POST /coins/award", r.status_code == 404, f"status={r.status_code} body={r.text[:120]}")

    r = requests.get(f"{BACKEND}/coins/status", headers=H, timeout=15)
    record("DEL.GET /coins/status", r.status_code == 404, f"status={r.status_code} body={r.text[:120]}")

    r = requests.get(f"{BACKEND}/coins/award", headers=H, timeout=15)
    record("DEL.GET /coins/award (wrong method)", r.status_code in (404, 405), f"status={r.status_code}")

    # =============== 2. PRESERVED COIN ENDPOINTS ==================
    print("\n--- 2. PRESERVED COIN ENDPOINTS ---")
    r = requests.get(f"{BACKEND}/coins/balance", headers=H, timeout=15)
    if r.status_code == 200:
        body = r.json()
        ok = isinstance(body.get("balance"), int)
        record("PRES.GET /coins/balance", ok, f"balance={body.get('balance')}")
    else:
        record("PRES.GET /coins/balance", False, f"status={r.status_code} body={r.text[:200]}")

    r = requests.get(f"{BACKEND}/coins/history", headers=H, timeout=15)
    if r.status_code == 200:
        body = r.json()
        ok = isinstance(body.get("history"), list) and "count" in body
        record("PRES.GET /coins/history", ok, f"count={body.get('count')} history_type={type(body.get('history')).__name__}")
    else:
        record("PRES.GET /coins/history", False, f"status={r.status_code} body={r.text[:200]}")

    r = requests.get(f"{BACKEND}/coins/ledger", headers=H, timeout=15)
    if r.status_code == 200:
        body = r.json()
        keys_required = ["entries", "next_cursor", "total_earned", "total_spent"]
        missing = [k for k in keys_required if k not in body]
        record("PRES.GET /coins/ledger", not missing, f"keys present? missing={missing}; total_earned={body.get('total_earned')}, total_spent={body.get('total_spent')}, entries_len={len(body.get('entries',[]))}")
    else:
        record("PRES.GET /coins/ledger", False, f"status={r.status_code} body={r.text[:200]}")

    # =============== 3. STREAK + GAMIFICATION ==================
    print("\n--- 3. STREAK + GAMIFICATION ---")
    r = requests.get(f"{BACKEND}/streak/status", headers=H, timeout=15)
    record("STREAK.GET /streak/status", r.status_code == 200, f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:120]}")

    r = requests.post(f"{BACKEND}/streak/check-in", headers=H, timeout=15)
    record("STREAK.POST /streak/check-in (1st)", r.status_code == 200, f"status={r.status_code}")
    r2 = requests.post(f"{BACKEND}/streak/check-in", headers=H, timeout=15)
    record("STREAK.POST /streak/check-in (2nd, idempotent)", r2.status_code == 200, f"status={r2.status_code}")

    r = requests.get(f"{BACKEND}/gamification/status", headers=H, timeout=15)
    if r.status_code == 200:
        body = r.json()
        for k in ["score", "streak", "badges_earned", "weekly_challenge"]:
            record(f"GAMIFY.body has '{k}'", k in body, f"present={k in body}")
    else:
        record("GAMIFY.GET /gamification/status", False, f"status={r.status_code} body={r.text[:200]}")

    # =============== 4a. R99 ONBOARDING ==================
    print("\n--- 4a. R99 ONBOARDING ---")
    r = requests.post(f"{BACKEND}/onboarding/seed", json={"income": 50000}, headers=H, timeout=20)
    if r.status_code == 200:
        body = r.json()
        sc = body.get("starter_cards") or body.get("cards") or []
        # spec says starter_cards (3)
        record("R99.POST /onboarding/seed", isinstance(sc, list) and len(sc) >= 3, f"starter_cards len={len(sc)}; keys={list(body.keys())}")
    else:
        record("R99.POST /onboarding/seed", False, f"status={r.status_code} body={r.text[:200]}")

    r = requests.get(f"{BACKEND}/onboarding/starter-cards", headers=H, timeout=15)
    if r.status_code == 200:
        body = r.json()
        cards = body.get("cards") if isinstance(body, dict) else body
        record("R99.GET /onboarding/starter-cards", isinstance(cards, list), f"cards_len={len(cards) if isinstance(cards,list) else 'n/a'}")
    else:
        record("R99.GET /onboarding/starter-cards", False, f"status={r.status_code} body={r.text[:200]}")

    # =============== 4b. R99B IDEMPOTENCY ==================
    print("\n--- 4b. R99B IDEMPOTENCY ---")
    txn_payload = {
        "amount": 250.0,
        "category": "Food",
        "description": "Round 99D regression test latte",
        "type": "debit",
    }
    # Without idempotency key — expect X-Idempotency-Hint header
    r = requests.post(f"{BACKEND}/transactions", json=txn_payload, headers=H, timeout=15)
    hint = r.headers.get("X-Idempotency-Hint") or r.headers.get("x-idempotency-hint")
    record("R99B.POST /transactions no-key has X-Idempotency-Hint", hint is not None, f"status={r.status_code}, hint={hint}")

    # With idempotency key — 1st call
    idem_key = f"r99d-regress-{uuid.uuid4()}"
    H_idem = {**H, "Idempotency-Key": idem_key}
    r1 = requests.post(f"{BACKEND}/transactions", json=txn_payload, headers=H_idem, timeout=15)
    record("R99B.POST /transactions with-key 1st", r1.status_code == 200, f"status={r1.status_code} replay={r1.headers.get('X-Idempotency-Replay')}")
    # 2nd call with same key
    r2 = requests.post(f"{BACKEND}/transactions", json=txn_payload, headers=H_idem, timeout=15)
    replay = r2.headers.get("X-Idempotency-Replay") or r2.headers.get("x-idempotency-replay")
    record("R99B.POST /transactions with-key 2nd (replay)", r2.status_code == 200 and (replay or "").lower() == "true",
           f"status={r2.status_code}, replay={replay}")

    # =============== 4c. R99C SUBSCRIPTIONS ==================
    print("\n--- 4c. R99C SUBSCRIPTIONS ---")
    r = requests.get(f"{BACKEND}/subscriptions", headers=H, timeout=20)
    if r.status_code == 200:
        body = r.json()
        ok = "subscriptions" in body and "summary" in body
        record("R99C.GET /subscriptions", ok, f"keys={list(body.keys())}, subs_len={len(body.get('subscriptions',[]))}")
    else:
        record("R99C.GET /subscriptions", False, f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(f"{BACKEND}/subscriptions/scan", headers=H, timeout=30)
    record("R99C.POST /subscriptions/scan", r.status_code == 200, f"status={r.status_code} body_keys={list(r.json().keys()) if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

    # =============== 5. CRITICAL SURFACE SMOKES ==================
    print("\n--- 5. CRITICAL SURFACE SMOKES ---")
    smokes = [
        "/user/me",
        "/transactions",
        "/budgets/live",
        "/goals",
        "/home/bundle",
        "/coach/suggestions",
        "/notifications/unread-count",
    ]
    for path in smokes:
        try:
            r = requests.get(f"{BACKEND}{path}", headers=H, timeout=25)
            record(f"SMOKE.GET {path}", r.status_code == 200, f"status={r.status_code}")
        except requests.RequestException as e:
            record(f"SMOKE.GET {path}", False, f"exception={e}")

    # =============== SUMMARY ==================
    print("\n\n=== ROUND 99D REGRESSION SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(l, d) for l, ok, d in results if not ok]
    print(f"Total: {len(results)}  Pass: {passed}  Fail: {len(failed)}")
    for l, d in failed:
        print(f"  ❌ {l}: {d}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
