"""Round 17 — Razorpay real-payment backend flow tests."""
import os
import sys
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE = "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE}/api"
PHONE = "9876543210"
OTP = "123456"
EXPECTED_KEY_ID = "rzp_test_SfgSwEcr68YJXF"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mintu_database")

passed = 0
failed = 0
errors = []


def check(label, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {label}")
    else:
        failed += 1
        errors.append(f"{label}: {detail}")
        print(f"  ❌ {label} — {detail}")


def section(title):
    print(f"\n=== {title} ===")


# ─── 1) Auth ──────────────────────────────────────────────────────────
section("AUTH — phone 9876543210 / OTP 123456")
r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=30)
check("send-otp 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
r = requests.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "name": "Test User"}, timeout=30)
check("verify-otp 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
data = r.json()
token = data.get("token")
user_id = (data.get("user") or {}).get("id")
check("token returned (field 'token')", bool(token), "missing token")
check("user_id returned", bool(user_id), "missing user id")
H = {"Authorization": f"Bearer {token}"}


# ─── 2) create-order WITHOUT coins ────────────────────────────────────
section("TEST 1 — POST /api/premium/create-order (no coins, monthly)")
r = requests.post(f"{API}/premium/create-order", headers=H, json={"plan": "monthly", "coins_to_use": 0}, timeout=30)
check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
saved_order_id = None
if r.status_code == 200:
    j = r.json()
    check("order_id starts with 'order_'", str(j.get("order_id", "")).startswith("order_"), f"got={j.get('order_id')}")
    check("amount == 99*100 paise", j.get("amount") == 9900, f"got={j.get('amount')}")
    check("currency == INR", j.get("currency") == "INR", f"got={j.get('currency')}")
    check("key_id matches env", j.get("key_id") == EXPECTED_KEY_ID, f"got={j.get('key_id')}")
    check("plan == monthly", j.get("plan") == "monthly", f"got={j.get('plan')}")
    check("list_price == effective_price", j.get("list_price") == j.get("effective_price"), f"list={j.get('list_price')} eff={j.get('effective_price')}")
    check("coins_to_use == 0", j.get("coins_to_use") == 0, f"got={j.get('coins_to_use')}")
    check("coin_discount == 0", j.get("coin_discount") == 0, f"got={j.get('coin_discount')}")
    check("checkout_url contains expected path", "/api/premium/checkout?order_id=" in str(j.get("checkout_url", "")), f"got={j.get('checkout_url')}")
    saved_order_id = j.get("order_id")


# ─── 3) Seed coins, then create-order WITH coins ──────────────────────
section("SEED COINS")
for action in ["open_app_daily", "add_transaction", "scan_sms", "settle_split", "complete_lesson",
               "login", "add_transaction", "scan_sms"]:
    try:
        rr = requests.post(f"{API}/coins/award", headers=H, json={"action": action}, timeout=15)
        print(f"   award {action} → {rr.status_code}")
    except Exception as e:
        print(f"   award {action} err {e}")

bal = 0
try:
    mc = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    udb = mc[DB_NAME]
    u = udb.users.find_one({"_id": ObjectId(user_id)})
    bal = int((u or {}).get("coins", 0))
    print(f"   mongo coin balance: {bal}")
    if bal < 100:
        udb.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"coins": 500}})
        print("   topped up coins to 500 via direct mongo injection")
        bal = 500
    check("coin balance >= 100 after seeding", bal >= 100, f"bal={bal}")
except Exception as e:
    print(f"   mongo top-up skipped: {e}")

section("TEST 2 — POST /api/premium/create-order (yearly, coins_to_use=100)")
r = requests.post(f"{API}/premium/create-order", headers=H, json={"plan": "yearly", "coins_to_use": 100}, timeout=30)
check("status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
yearly_order_id = None
if r.status_code == 200:
    j = r.json()
    check("plan == yearly", j.get("plan") == "yearly", f"got={j.get('plan')}")
    check("list_price == 499", j.get("list_price") == 499, f"got={j.get('list_price')}")
    check("coin_discount == 10", j.get("coin_discount") == 10, f"got={j.get('coin_discount')}")
    check("coins_to_use == 100", j.get("coins_to_use") == 100, f"got={j.get('coins_to_use')}")
    check("effective_price == list_price - coin_discount",
          j.get("effective_price") == j.get("list_price") - j.get("coin_discount"),
          f"eff={j.get('effective_price')}")
    check("amount (paise) == effective_price * 100",
          j.get("amount") == j.get("effective_price") * 100,
          f"amt={j.get('amount')} eff={j.get('effective_price')}")
    check("order_id starts with 'order_'", str(j.get("order_id", "")).startswith("order_"), f"got={j.get('order_id')}")
    yearly_order_id = j.get("order_id")

    try:
        mc = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        udb = mc[DB_NAME]
        pdoc = udb.payment_orders.find_one({"order_id": yearly_order_id})
        check("payment_orders doc exists", pdoc is not None, "no doc found")
        if pdoc:
            check("doc.list_price == 499", pdoc.get("list_price") == 499, f"got={pdoc.get('list_price')}")
            check("doc.amount (effective) == 489", pdoc.get("amount") == 489, f"got={pdoc.get('amount')}")
            check("doc.coins_to_use == 100", pdoc.get("coins_to_use") == 100, f"got={pdoc.get('coins_to_use')}")
            check("doc.coin_discount == 10", pdoc.get("coin_discount") == 10, f"got={pdoc.get('coin_discount')}")
            check("doc.plan == yearly", pdoc.get("plan") == "yearly", f"got={pdoc.get('plan')}")
            check("doc.status == created", pdoc.get("status") == "created", f"got={pdoc.get('status')}")
            check("doc.user_id == user_id", str(pdoc.get("user_id")) == str(user_id), f"got={pdoc.get('user_id')}")
    except Exception as e:
        check("mongo payment_orders lookup", False, str(e))


# ─── 4) Invalid plan ──────────────────────────────────────────────────
section("TEST 3 — create-order invalid plan zzz")
r = requests.post(f"{API}/premium/create-order", headers=H, json={"plan": "zzz"}, timeout=15)
check("status 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 400:
    try:
        check("detail contains 'Invalid plan'", "Invalid plan" in r.json().get("detail", ""), f"body={r.text}")
    except Exception:
        pass


# ─── 5) GET /api/premium/checkout valid order ─────────────────────────
section("TEST 4 — GET /api/premium/checkout (valid order_id)")
if saved_order_id:
    r = requests.get(f"{API}/premium/checkout", params={"order_id": saved_order_id}, allow_redirects=False, timeout=15)
    check("status 200", r.status_code == 200, f"status={r.status_code}")
    ct = r.headers.get("content-type", "")
    check("content-type is text/html", "text/html" in ct.lower(), f"got={ct}")
    body = r.text
    check("body contains 'Razorpay'", "Razorpay" in body, "no 'Razorpay' in body")
    check("body contains 'MintU Premium'", "MintU Premium" in body, "no 'MintU Premium'")
    check("body contains expected key_id", EXPECTED_KEY_ID in body, "key_id not in body")
    check("body contains the order_id", saved_order_id in body, "order_id not echoed")
    check("body references Razorpay checkout.js script",
          'src="https://checkout.razorpay.com/v1/checkout.js"' in body,
          "script tag missing")
else:
    check("valid order checkout test skipped", False, "Test 1 didn't produce an order")


# ─── 6) GET /api/premium/checkout bad order ──────────────────────────
section("TEST 5 — GET /api/premium/checkout (nonexistent)")
r = requests.get(f"{API}/premium/checkout", params={"order_id": "nonexistent_order_xyz"}, allow_redirects=False, timeout=15)
check("status 404", r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 404:
    try:
        check("detail 'Order not found'", "Order not found" in r.json().get("detail", ""), f"body={r.text}")
    except Exception:
        pass


# ─── 7) verify-payment error paths (NO auth header) ───────────────────
section("TEST 6 — POST /api/premium/verify-payment error paths (NO auth)")
r = requests.post(f"{API}/premium/verify-payment", json={}, timeout=15)
check("empty body → 400 (not 401)", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 400:
    try:
        check("detail 'Missing payment details'", "Missing payment details" in r.json().get("detail", ""), f"body={r.text}")
    except Exception:
        pass

r = requests.post(f"{API}/premium/verify-payment",
                  json={"order_id": "order_fake", "payment_id": "pay_fake", "signature": "badsig"},
                  timeout=15)
check("bad signature → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 400:
    try:
        check("detail 'Payment verification failed'",
              "Payment verification failed" in r.json().get("detail", ""),
              f"body={r.text}")
    except Exception:
        pass

check("verify-payment does NOT return 401 (no auth required)", r.status_code != 401, f"status={r.status_code}")


# ─── 8) Regression sanity ─────────────────────────────────────────────
section("TEST 7 — Regression sanity")
r = requests.get(f"{API}/premium/status", headers=H, timeout=20)
check("GET /premium/status 200", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    j = r.json()
    check("premium/status has pricing", "pricing" in j, f"keys={list(j.keys())}")
    check("premium/status has is_premium", "is_premium" in j, f"keys={list(j.keys())}")
    check("premium/status has features", "features" in j, f"keys={list(j.keys())}")

r = requests.post(f"{API}/premium/mock-activate", headers=H,
                  json={"plan": "monthly", "coins_to_use": 0}, timeout=30)
check("POST /premium/mock-activate 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

r = requests.get(f"{API}/gmail/status", headers=H, timeout=15)
check("GET /gmail/status 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 200:
    check("gmail/status connected=false", r.json().get("connected") is False, f"body={r.text}")

r = requests.get(f"{API}/split/groups", headers=H, timeout=15)
check("GET /split/groups 200", r.status_code == 200, f"status={r.status_code}")

r = requests.get(f"{API}/transactions", headers=H, timeout=15)
check("GET /transactions 200", r.status_code == 200, f"status={r.status_code}")


# ─── SUMMARY ──────────────────────────────────────────────────────────
print(f"\n{'='*60}\nRESULT: {passed} passed, {failed} failed\n{'='*60}")
if failed > 0:
    print("\nFAILURES:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("\n✅ ALL ROUND 17 RAZORPAY TESTS PASSED")
    sys.exit(0)
