"""
Round 42 — Clean Session Regression Test (frontend-only fix verification)

Verifies that:
  1. Auth flow works for new + existing users
  2. /api/home/bundle returns ONLY current user's data (per-user cache scoping)
  3. New user sees zero data on all listing endpoints
  4. is_new_user flag correctly differentiates registration vs login paths
"""
import requests
import time
import random
import json
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"

EXISTING_PHONE = "9876543210"
EXISTING_OTP = "123456"


def _new_phone():
    """Generate a fresh phone number that has never logged in before."""
    # Use a random 10-digit phone starting with 6/7/8/9 to be safe
    return "6" + "".join(str(random.randint(0, 9)) for _ in range(9))


results = []


def log(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    line = f"[{status}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append((name, passed, detail))


def post(path, body, token=None, timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{BASE}{path}", json=body, headers=headers, timeout=timeout)


def get(path, token=None, timeout=30):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE}{path}", headers=headers, timeout=timeout)


# ==============================================================
# TEST 1 & 2 — New user registration
# ==============================================================
print("\n=== TEST 1 & 2: New user registration ===")
new_phone = _new_phone()
print(f"New phone: {new_phone}")

# Test 1: send-otp for new user
r = post("/auth/send-otp", {"phone": new_phone})
log("T1: POST /auth/send-otp -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    body = r.json()
    log("T1: response.is_new_user == true", body.get("is_new_user") is True, f"got is_new_user={body.get('is_new_user')}")
except Exception as e:
    log("T1: parse JSON", False, str(e))

# Test 2: verify-otp with name => registration path
fresh_name = f"NewUser{random.randint(1000,9999)}"
r = post("/auth/verify-otp", {"phone": new_phone, "otp": "123456", "name": fresh_name})
log("T2: POST /auth/verify-otp -> 200", r.status_code == 200, f"got {r.status_code} body={r.text[:200]}")

new_token = None
new_user_id = None
try:
    body = r.json()
    new_token = body.get("token")
    log("T2: token present", bool(new_token))
    log("T2: is_new_user == true", body.get("is_new_user") is True, f"got is_new_user={body.get('is_new_user')}")
    user = body.get("user") or {}
    new_user_id = user.get("id")
    log("T2: user.id present", bool(new_user_id), f"id={new_user_id}")
    log("T2: user.phone matches", user.get("phone") == new_phone, f"got {user.get('phone')}")
    log("T2: user.name matches", user.get("name") == fresh_name, f"got {user.get('name')}")
except Exception as e:
    log("T2: parse JSON", False, str(e))
    print("Cannot continue without new user token; aborting")
    sys.exit(1)

# ==============================================================
# TEST 3: GET /home/bundle for new user => zero data
# ==============================================================
print("\n=== TEST 3: GET /api/home/bundle (new user, zero data) ===")
r = get("/home/bundle", token=new_token)
log("T3: GET /home/bundle -> 200", r.status_code == 200, f"got {r.status_code} body={r.text[:300]}")
new_bundle = {}
try:
    new_bundle = r.json()
    stats = new_bundle.get("stats") or {}
    txn_count = stats.get("transaction_count")
    log("T3: stats.transaction_count == 0", txn_count == 0, f"got {txn_count}")
    recent = new_bundle.get("recent_txns")
    log("T3: recent_txns == []", recent == [], f"got {recent}")
    alerts_obj = new_bundle.get("alerts") or {}
    alerts_list = alerts_obj.get("alerts", [])
    # Alerts MAY be empty for fresh user, or contain only motivational/onboarding alerts
    log("T3: alerts.alerts is a list", isinstance(alerts_list, list), f"got {type(alerts_list).__name__}")
    coins = new_bundle.get("coins") or {}
    coin_balance = coins.get("balance", 0)
    # Fresh user may get welcome bonus; just ensure it's a number not leaked from other user
    log("T3: coins.balance is numeric & sane (<=500)", isinstance(coin_balance, (int, float)) and coin_balance <= 500,
        f"got balance={coin_balance}")
    # Weekly report present
    wr = new_bundle.get("weekly_report")
    log("T3: weekly_report present (any shape)", wr is not None, f"got type={type(wr).__name__}")
except Exception as e:
    log("T3: parse bundle JSON", False, str(e))

# ==============================================================
# TEST 4: GET /transactions for new user => empty
# ==============================================================
print("\n=== TEST 4: GET /api/transactions (new user) ===")
r = get("/transactions", token=new_token)
log("T4: GET /transactions -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    data = r.json()
    log("T4: response is empty list", isinstance(data, list) and len(data) == 0, f"got {data}")
except Exception as e:
    log("T4: parse JSON", False, str(e))

# ==============================================================
# TEST 5: GET /budgets and /goals for new user => empty arrays
# ==============================================================
print("\n=== TEST 5: GET /api/budgets, GET /api/goals (new user) ===")
r = get("/budgets", token=new_token)
log("T5a: GET /budgets -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    data = r.json()
    log("T5a: budgets is empty list", isinstance(data, list) and len(data) == 0, f"got len={len(data) if isinstance(data, list) else 'N/A'}")
except Exception as e:
    log("T5a: parse JSON", False, str(e))

r = get("/goals", token=new_token)
log("T5b: GET /goals -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    data = r.json()
    log("T5b: goals is empty list", isinstance(data, list) and len(data) == 0, f"got len={len(data) if isinstance(data, list) else 'N/A'}")
except Exception as e:
    log("T5b: parse JSON", False, str(e))

# ==============================================================
# TEST 6: GET /split/groups for new user => empty
# ==============================================================
print("\n=== TEST 6: GET /api/split/groups (new user) ===")
r = get("/split/groups", token=new_token)
log("T6: GET /split/groups -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    data = r.json()
    log("T6: split/groups is empty list", isinstance(data, list) and len(data) == 0, f"got len={len(data) if isinstance(data, list) else 'N/A'}")
except Exception as e:
    log("T6: parse JSON", False, str(e))

# ==============================================================
# TEST 7: Per-user cache scoping
# ==============================================================
print("\n=== TEST 7: Per-user cache scoping (existing vs new user) ===")
# Login existing user
r = post("/auth/send-otp", {"phone": EXISTING_PHONE})
log("T7: send-otp existing user -> 200", r.status_code == 200, f"got {r.status_code}")
existing_is_new = None
try:
    existing_is_new = r.json().get("is_new_user")
    log("T7: existing user is_new_user==false", existing_is_new is False, f"got {existing_is_new}")
except Exception as e:
    log("T7: parse send-otp JSON", False, str(e))

r = post("/auth/verify-otp", {"phone": EXISTING_PHONE, "otp": EXISTING_OTP, "name": "Test User"})
log("T7: verify-otp existing user -> 200", r.status_code == 200, f"got {r.status_code}")
existing_token = None
existing_user_id = None
try:
    body = r.json()
    existing_token = body.get("token")
    existing_user_id = (body.get("user") or {}).get("id")
    log("T7: existing user token present", bool(existing_token))
    log("T7: existing user is_new_user==false (verify-otp)", body.get("is_new_user") is False, f"got is_new_user={body.get('is_new_user')}")
except Exception as e:
    log("T7: parse verify-otp", False, str(e))

# Hit /home/bundle for existing user
r = get("/home/bundle", token=existing_token)
log("T7: existing /home/bundle -> 200", r.status_code == 200, f"got {r.status_code}")
existing_bundle = {}
try:
    existing_bundle = r.json()
except Exception as e:
    log("T7: parse existing bundle", False, str(e))

# Cross-check isolation
existing_user = (existing_bundle.get("user") or {})
new_user = (new_bundle.get("user") or {})
existing_uid = existing_user.get("id")
new_uid = new_user.get("id")
log("T7: existing.user.id != new.user.id",
    bool(existing_uid) and bool(new_uid) and existing_uid != new_uid,
    f"existing={existing_uid} new={new_uid}")

existing_stats = existing_bundle.get("stats") or {}
new_stats = new_bundle.get("stats") or {}
existing_txn_count = existing_stats.get("transaction_count", 0)
new_txn_count = new_stats.get("transaction_count", 0)
log("T7: stats.transaction_count differs (existing has data, new has 0)",
    existing_txn_count > 0 and new_txn_count == 0,
    f"existing={existing_txn_count} new={new_txn_count}")

existing_recent = existing_bundle.get("recent_txns") or []
new_recent = new_bundle.get("recent_txns") or []
log("T7: recent_txns differ (existing non-empty, new empty)",
    isinstance(existing_recent, list) and isinstance(new_recent, list) and
    len(existing_recent) > 0 and len(new_recent) == 0,
    f"existing_count={len(existing_recent)} new_count={len(new_recent)}")

# Final disjointness: no recent_txn id from existing leaks into new bundle
ex_ids = {t.get("id") for t in existing_recent if isinstance(t, dict)}
new_ids = {t.get("id") for t in new_recent if isinstance(t, dict)}
overlap = ex_ids & new_ids
log("T7: zero recent_txn ID overlap between users", len(overlap) == 0, f"overlap={overlap}")

# ==============================================================
# TEST 8: Returning user path — verify-otp without name
# ==============================================================
print("\n=== TEST 8: POST /auth/verify-otp (returning user, 9876543210) ===")
r = post("/auth/send-otp", {"phone": EXISTING_PHONE})
log("T8: send-otp returning -> 200", r.status_code == 200, f"got {r.status_code}")
r = post("/auth/verify-otp", {"phone": EXISTING_PHONE, "otp": EXISTING_OTP})
log("T8: verify-otp returning -> 200", r.status_code == 200, f"got {r.status_code}")
try:
    body = r.json()
    log("T8: is_new_user==false", body.get("is_new_user") is False, f"got is_new_user={body.get('is_new_user')}")
    log("T8: token present", bool(body.get("token")))
except Exception as e:
    log("T8: parse JSON", False, str(e))

# ==============================================================
# Summary
# ==============================================================
print("\n" + "=" * 60)
total = len(results)
passed = sum(1 for _, p, _ in results if p)
print(f"TOTAL: {passed}/{total} assertions passed")
failed = [r for r in results if not r[1]]
if failed:
    print(f"\nFAILURES ({len(failed)}):")
    for name, _, detail in failed:
        print(f"  - {name}: {detail}")
    sys.exit(1)
else:
    print("ALL ASSERTIONS PASSED")
    sys.exit(0)
