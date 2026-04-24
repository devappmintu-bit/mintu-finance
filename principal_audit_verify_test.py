"""Verification test for the 7 P0 bug fixes + 6 regression spot-checks from the principal audit.

Runs against the public URL from frontend/.env (EXPO_PUBLIC_BACKEND_URL).
"""
import os
import sys
import time
import json
import requests

BASE = os.environ.get("BASE_URL") or "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE}/api"

# Use existing test user so we don't pollute DB with fresh users
PHONE = "9876543210"
OTP = "123456"
NAME = "Probe"

results = []


def check(label, cond, extra=""):
    status = "PASS" if cond else "FAIL"
    marker = "OK " if cond else "XX "
    line = f"{marker} {status} :: {label}"
    if extra:
        line += f" -- {extra}"
    print(line)
    results.append((label, cond, extra))


def get_token():
    # send OTP
    r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    # may hit rate limit — retry once after small wait
    if r.status_code == 429:
        time.sleep(6)
        r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    if r.status_code != 200:
        print(f"send-otp failed: {r.status_code} {r.text}")
        sys.exit(2)
    # verify
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "name": NAME},
        timeout=30,
    )
    if r.status_code != 200:
        print(f"verify-otp failed: {r.status_code} {r.text}")
        sys.exit(2)
    j = r.json()
    return j.get("token") or j.get("access_token")


def main():
    token = get_token()
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("\n=== 7 P0 BUG FIXES — validation endpoints ===")

    # ------------- GOALS validation -------------
    # 1. name empty
    r = requests.post(f"{API}/goals", headers=H, json={"name": "", "target_amount": 100})
    check("BUG1 goals empty name → 422", r.status_code == 422, f"got {r.status_code} body={r.text[:200]}")

    # 2. target_amount negative
    r = requests.post(f"{API}/goals", headers=H, json={"name": "x", "target_amount": -100})
    check("BUG2 goals negative target_amount → 422", r.status_code == 422, f"got {r.status_code}")

    # 3. target_amount zero
    r = requests.post(f"{API}/goals", headers=H, json={"name": "x", "target_amount": 0})
    check("BUG3 goals zero target_amount → 422", r.status_code == 422, f"got {r.status_code}")

    # 4. name 200 chars (>100)
    r = requests.post(f"{API}/goals", headers=H, json={"name": "x" * 200, "target_amount": 100})
    check("BUG4 goals name>100 chars → 422", r.status_code == 422, f"got {r.status_code}")

    # 5. target_amount exceeds ₹10Cr (1e8) — test with 1e20
    r = requests.post(f"{API}/goals", headers=H, json={"name": "x", "target_amount": 1e20})
    check("BUG5 goals target_amount=1e20 → 422", r.status_code == 422, f"got {r.status_code}")

    # 6. saved > target → 400 (cross-field)
    r = requests.post(f"{API}/goals", headers=H, json={"name": "Valid", "target_amount": 10000, "saved_amount": 99999})
    check("BUG6 goals saved>target → 400", r.status_code == 400, f"got {r.status_code} body={r.text[:200]}")

    # 7. Transaction invalid type enum
    r = requests.post(f"{API}/transactions", headers=H, json={"amount": 100, "type": "invalid_type", "category": "Food"})
    check("BUG7 transactions invalid type → 422", r.status_code == 422, f"got {r.status_code} body={r.text[:200]}")

    print("\n=== 6 VALID-INPUT REGRESSION SPOT-CHECKS ===")

    # R1: POST /api/goals with valid input → 200 with goal object
    r = requests.post(f"{API}/goals", headers=H, json={"name": "Laptop", "target_amount": 80000})
    ok = r.status_code == 200 and isinstance(r.json().get("goal"), dict) and "id" in r.json()["goal"]
    check("REG1 POST /goals valid → 200 + goal", ok, f"got {r.status_code} body={r.text[:200]}")
    created_goal_id = None
    if ok:
        created_goal_id = r.json()["goal"]["id"]

    # R2: POST /api/transactions valid → 200
    r = requests.post(
        f"{API}/transactions",
        headers=H,
        json={"amount": 500, "type": "debit", "category": "Food", "description": "lunch"},
    )
    ok = r.status_code == 200
    check("REG2 POST /transactions valid → 200", ok, f"got {r.status_code} body={r.text[:200]}")

    # R3: GET /api/user/me — no otp_hash/password fields leaked
    r = requests.get(f"{API}/user/me", headers=H)
    if r.status_code == 200:
        body = r.json()
        leaked = [k for k in ("otp_hash", "password", "password_hash") if k in body]
        # Also check nested user object if present
        user_obj = body.get("user") if isinstance(body.get("user"), dict) else None
        if user_obj:
            leaked += [f"user.{k}" for k in ("otp_hash", "password", "password_hash") if k in user_obj]
        check("REG3 GET /user/me no sensitive fields", len(leaked) == 0, f"leaked={leaked} keys={list(body.keys())[:15]}")
    else:
        check("REG3 GET /user/me no sensitive fields", False, f"got {r.status_code}")

    # R4: GET /api/split/balances → 200 array (may be dict wrapping array)
    r = requests.get(f"{API}/split/balances", headers=H)
    body = r.json() if r.status_code == 200 else None
    is_array = isinstance(body, list) or (isinstance(body, dict) and any(isinstance(v, list) for v in body.values()))
    check("REG4 GET /split/balances → 200 array", r.status_code == 200 and is_array, f"got {r.status_code} type={type(body).__name__}")

    # R5: GET /api/home/bundle → 200 dashboard object
    r = requests.get(f"{API}/home/bundle", headers=H)
    body = r.json() if r.status_code == 200 else {}
    check(
        "REG5 GET /home/bundle → 200 dashboard obj",
        r.status_code == 200 and isinstance(body, dict) and len(body) >= 5,
        f"got {r.status_code} keys={list(body.keys())[:10] if isinstance(body, dict) else 'NA'}",
    )

    # R6: POST /api/premium/mock-activate
    r = requests.post(f"{API}/premium/mock-activate", headers=H, json={"plan": "monthly", "tier": "pro"})
    body = r.json() if r.status_code == 200 else {}
    ok = (
        r.status_code == 200
        and "effective_price" in body
        and "coins_applied" in body
    )
    check(
        "REG6 POST /premium/mock-activate → 200 + effective_price + coins_applied",
        ok,
        f"got {r.status_code} body_keys={list(body.keys()) if isinstance(body, dict) else body}",
    )

    # Cleanup: delete the created goal if any
    if created_goal_id:
        requests.delete(f"{API}/goals/{created_goal_id}", headers=H)

    # ─── Summary ───
    passed = sum(1 for _, ok, _ in results if ok)
    failed = len(results) - passed
    print(f"\n─── RESULT: {passed}/{len(results)} passed, {failed} failed ───")
    for label, ok, extra in results:
        if not ok:
            print(f"  FAILED → {label} :: {extra}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
