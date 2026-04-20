"""Round 15 Split Coin Redemption Backend Tests.

Validates:
  - NEW POST /api/split/coin-redeem-preview
  - POST /api/split/mark-paid-offline with coins_to_use
  - POST /api/split/partial-settle with coins_to_use
  - POST /api/split/settle-with-rewards with coins_to_use + backward-compat
  - Regression: /split/groups, /split/balances, /coins/status, /premium/status

Auth: phone 9876543210 / OTP 123456 (mock).
"""
import os
import sys
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/") + "/api"
PHONE = "9876543210"
OTP = "123456"
FAKE_TARGET_ID = "507f1f77bcf86cd799439011"  # Valid 24-char hex ObjectId shape

passed: list[str] = []
failed: list[tuple[str, str]] = []


def _rec(name: str, ok: bool, detail: str = ""):
    if ok:
        passed.append(name)
        print(f"  ✅ {name}")
    else:
        failed.append((name, detail))
        print(f"  ❌ {name} — {detail}")


def _post(path, body=None, headers=None, timeout=30):
    return requests.post(f"{BASE}{path}", json=body or {}, headers=headers or {}, timeout=timeout)


def _get(path, headers=None, timeout=30):
    return requests.get(f"{BASE}{path}", headers=headers or {}, timeout=timeout)


# ============== STEP 1: AUTH ==============
print("\n=== AUTH ===")
r = _post("/auth/send-otp", {"phone": PHONE})
assert r.status_code == 200, f"send-otp failed {r.status_code} {r.text}"
r = _post("/auth/verify-otp", {"phone": PHONE, "otp": OTP})
assert r.status_code == 200, f"verify-otp failed {r.status_code} {r.text}"
j = r.json()
TOKEN = j.get("access_token") or j.get("token")
USER_ID = (j.get("user") or {}).get("id") or j.get("user_id")
assert TOKEN, f"no token in verify-otp response: {j}"
H = {"Authorization": f"Bearer {TOKEN}"}
print(f"  ✅ authed as {PHONE} uid={USER_ID}")


# ============== STEP 2: SEED COINS ==============
print("\n=== SEED COINS ===")
r = _get("/coins/status", headers=H)
initial_bal = r.json().get("balance", 0) if r.status_code == 200 else 0
print(f"  initial balance = {initial_bal}")

for action in ("open_app_daily", "add_transaction", "scan_sms", "settle_split", "complete_lesson"):
    r = _post("/coins/award", {"action": action}, headers=H)
    if r.status_code == 200:
        print(f"  action={action} awarded={r.json().get('awarded')} bal={r.json().get('balance')}")

r = _get("/coins/status", headers=H)
post_seed_bal = r.json().get("balance", 0) if r.status_code == 200 else 0
print(f"  post-seed balance = {post_seed_bal}")

# If we still have < 100 coins, bump via MongoDB so we can test redemption paths
if post_seed_bal < 100 and USER_ID:
    print("  balance low — bumping via direct MongoDB write")
    try:
        import motor.motor_asyncio
        import asyncio
        from bson import ObjectId

        async def _bump():
            client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://localhost:27017")
            db = client["mintu_database"]
            await db.users.update_one({"_id": ObjectId(USER_ID)}, {"$inc": {"coins": 1000}})
            client.close()

        asyncio.run(_bump())
        r = _get("/coins/status", headers=H)
        post_seed_bal = r.json().get("balance", 0)
        print(f"  bumped balance = {post_seed_bal}")
    except Exception as e:
        print(f"  bump failed: {e}")


# ============== T1: coin-redeem-preview amount=500 ==============
print("\n=== T1: POST /split/coin-redeem-preview {amount:500} ===")
r = _post("/split/coin-redeem-preview", {"amount": 500}, headers=H)
_rec("T1 status=200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
if r.status_code == 200:
    d = r.json()
    required = {"amount", "coin_balance", "coins_applied", "discount", "effective_amount",
                "effective_price", "list_price", "max_discount", "rate"}
    _rec("T1 shape complete", required.issubset(d.keys()), f"missing: {required - set(d.keys())}")
    rate = d.get("rate", {})
    _rec("T1 rate.coins_per_rupee=10", rate.get("coins_per_rupee") == 10, f"got {rate.get('coins_per_rupee')}")
    _rec("T1 rate.max_pct=50", rate.get("max_pct") == 50, f"got {rate.get('max_pct')}")
    _rec("T1 max_discount=250 (50% of 500)", d.get("max_discount") == 250, f"got {d.get('max_discount')}")
    _rec("T1 discount <= max_discount", d.get("discount", 0) <= d.get("max_discount", 0))
    _rec("T1 effective_amount = amount - discount",
         abs(d.get("effective_amount", 0) - (d.get("amount", 0) - d.get("discount", 0))) < 0.01)
    _rec("T1 effective_price == effective_amount", d.get("effective_price") == d.get("effective_amount"))
    bal = d.get("coin_balance", 0)
    max_coins = 250 * 10
    expected_applied = min(bal, bal, max_coins)
    _rec("T1 coins_applied = min(bal, max_disc*10)", d.get("coins_applied") == expected_applied,
         f"got {d.get('coins_applied')} expected {expected_applied} (bal={bal})")
    print(f"  [T1] balance={bal} coins_applied={d.get('coins_applied')} discount={d.get('discount')} eff={d.get('effective_amount')}")


# ============== T2: coin-redeem-preview amount=100 coins_to_use=0 ==============
print("\n=== T2: POST /split/coin-redeem-preview {amount:100, coins_to_use:0} ===")
r = _post("/split/coin-redeem-preview", {"amount": 100, "coins_to_use": 0}, headers=H)
_rec("T2 status=200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    d = r.json()
    _rec("T2 discount=0", d.get("discount") == 0)
    _rec("T2 effective_amount=100", d.get("effective_amount") == 100)
    _rec("T2 coins_applied=0", d.get("coins_applied") == 0)


# ============== T3: coin-redeem-preview amount=0 -> 400 ==============
print("\n=== T3: POST /split/coin-redeem-preview {amount:0} ===")
r = _post("/split/coin-redeem-preview", {"amount": 0}, headers=H)
_rec("T3 status=400", r.status_code == 400, f"{r.status_code} {r.text[:150]}")
if r.status_code == 400:
    _rec("T3 error message matches", "positive" in r.text.lower(), f"{r.text[:200]}")


# ============== T4: coin-redeem-preview no auth ==============
print("\n=== T4: POST /split/coin-redeem-preview (no auth) ===")
r = _post("/split/coin-redeem-preview", {"amount": 100})
_rec("T4 status in (401, 422)", r.status_code in (401, 422), f"got {r.status_code}")


# ============== T5: mark-paid-offline with coins_to_use=50 ==============
print("\n=== T5: POST /split/mark-paid-offline {amount:200, coins_to_use:50} ===")
r = _get("/coins/status", headers=H)
bal_before = r.json().get("balance", 0) if r.status_code == 200 else 0
print(f"  balance before = {bal_before}")

r = _post("/split/mark-paid-offline", {
    "target_user_id": FAKE_TARGET_ID,
    "amount": 200,
    "group_id": None,
    "method": "cash",
    "coins_to_use": 50,
}, headers=H)
_rec("T5 status=200", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
coins_applied_t5 = 0
if r.status_code == 200:
    d = r.json()
    for k in ("coins_applied", "coin_discount", "cash_paid", "message", "txn_ref", "method"):
        _rec(f"T5 has '{k}'", k in d, f"missing {k} (body keys={list(d.keys())})")
    coins_applied_t5 = d.get("coins_applied", 0)
    _rec("T5 coins_applied <= 50", coins_applied_t5 <= 50, f"got {coins_applied_t5}")
    _rec("T5 coin_discount == coins_applied // 10",
         d.get("coin_discount") == coins_applied_t5 // 10,
         f"cd={d.get('coin_discount')} exp={coins_applied_t5 // 10}")
    _rec("T5 cash_paid = 200 - coin_discount",
         abs(d.get("cash_paid", 0) - (200 - d.get("coin_discount", 0))) < 0.01,
         f"cash={d.get('cash_paid')} cd={d.get('coin_discount')}")
    print(f"  [T5] coins_applied={coins_applied_t5} coin_discount={d.get('coin_discount')} cash_paid={d.get('cash_paid')}")

r = _get("/coins/status", headers=H)
bal_after = r.json().get("balance", 0) if r.status_code == 200 else 0
_rec("T5 balance decreased by coins_applied",
     bal_before - bal_after == coins_applied_t5,
     f"before={bal_before} after={bal_after} diff={bal_before - bal_after} exp={coins_applied_t5}")


# ============== T6: mark-paid-offline with coins_to_use=0 ==============
print("\n=== T6: POST /split/mark-paid-offline {coins_to_use:0} ===")
bal_before_t6 = bal_after
r = _post("/split/mark-paid-offline", {
    "target_user_id": FAKE_TARGET_ID,
    "amount": 100,
    "group_id": None,
    "method": "cash",
    "coins_to_use": 0,
}, headers=H)
_rec("T6 status=200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    d = r.json()
    _rec("T6 coins_applied=0", d.get("coins_applied") == 0)
    _rec("T6 coin_discount=0", d.get("coin_discount") == 0)
    _rec("T6 cash_paid=100", d.get("cash_paid") == 100)
r = _get("/coins/status", headers=H)
bal_after_t6 = r.json().get("balance", 0) if r.status_code == 200 else 0
_rec("T6 balance unchanged", bal_before_t6 == bal_after_t6,
     f"before={bal_before_t6} after={bal_after_t6}")


# ============== T7: partial-settle with coins_to_use=20 ==============
print("\n=== T7: POST /split/partial-settle {amount:300, coins_to_use:20} ===")
bal_before_t7 = bal_after_t6
r = _post("/split/partial-settle", {
    "target_user_id": FAKE_TARGET_ID,
    "amount": 300,
    "method": "cash",
    "coins_to_use": 20,
}, headers=H)
_rec("T7 status=200", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
coins_applied_t7 = 0
if r.status_code == 200:
    d = r.json()
    for k in ("coins_applied", "coin_discount", "cash_paid", "coins_earned", "is_partial"):
        _rec(f"T7 has '{k}'", k in d, f"missing {k}")
    _rec("T7 is_partial=True", d.get("is_partial") is True)
    coins_applied_t7 = d.get("coins_applied", 0)
    _rec("T7 coins_applied <= 20", coins_applied_t7 <= 20)
    _rec("T7 coin_discount == coins_applied // 10", d.get("coin_discount") == coins_applied_t7 // 10)
    print(f"  [T7] coins_applied={coins_applied_t7} coin_discount={d.get('coin_discount')} cash_paid={d.get('cash_paid')}")

r = _get("/coins/status", headers=H)
bal_after_t7 = r.json().get("balance", 0) if r.status_code == 200 else 0
_rec("T7 balance decreased by coins_applied",
     bal_before_t7 - bal_after_t7 == coins_applied_t7,
     f"before={bal_before_t7} after={bal_after_t7}")


# ============== T8: settle-with-rewards with coins_to_use=30 ==============
print("\n=== T8: POST /split/settle-with-rewards {amount:500, coins_to_use:30} ===")
bal_before_t8 = bal_after_t7
r = _post("/split/settle-with-rewards", {
    "target_user_id": FAKE_TARGET_ID,
    "amount": 500,
    "method": "upi",
    "coins_to_use": 30,
}, headers=H)
_rec("T8 status=200", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
coins_applied_t8 = 0
if r.status_code == 200:
    d = r.json()
    for k in ("coins_applied", "coin_discount", "cash_paid", "reward"):
        _rec(f"T8 has top-level '{k}'", k in d, f"missing {k}")
    _rec("T8 reward is dict", isinstance(d.get("reward"), dict))
    coins_applied_t8 = d.get("coins_applied", 0)
    _rec("T8 coins_applied <= 30", coins_applied_t8 <= 30)
    _rec("T8 coin_discount == coins_applied // 10", d.get("coin_discount") == coins_applied_t8 // 10)
    print(f"  [T8] coins_applied={coins_applied_t8} reward.coins_earned={d.get('reward', {}).get('coins_earned')}")

r = _get("/coins/status", headers=H)
bal_after_t8 = r.json().get("balance", 0) if r.status_code == 200 else 0
_rec("T8 balance decreased by coins_applied",
     bal_before_t8 - bal_after_t8 == coins_applied_t8,
     f"before={bal_before_t8} after={bal_after_t8}")


# ============== T9: settle-with-rewards WITHOUT coins_to_use (backward compat) ==============
print("\n=== T9: /split/settle-with-rewards without coins_to_use ===")
bal_before_t9 = bal_after_t8
r = _post("/split/settle-with-rewards", {
    "target_user_id": FAKE_TARGET_ID,
    "amount": 250,
    "method": "upi",
}, headers=H)
_rec("T9 status=200", r.status_code == 200, f"{r.status_code}")
if r.status_code == 200:
    d = r.json()
    _rec("T9 coins_applied=0 (omitted)", d.get("coins_applied") == 0)
    _rec("T9 reward present", isinstance(d.get("reward"), dict))

r = _get("/coins/status", headers=H)
bal_after_t9 = r.json().get("balance", 0) if r.status_code == 200 else 0
_rec("T9 balance unchanged (no redemption)", bal_before_t9 == bal_after_t9,
     f"before={bal_before_t9} after={bal_after_t9}")


# ============== T10: REGRESSION ==============
print("\n=== T10: REGRESSION ===")
for path in ("/split/groups", "/split/balances", "/coins/status", "/premium/status"):
    r = _get(path, headers=H)
    _rec(f"GET {path} = 200", r.status_code == 200, f"got {r.status_code} {r.text[:150]}")


# ============== SUMMARY ==============
print("\n" + "=" * 60)
print(f"RESULTS: {len(passed)} passed, {len(failed)} failed")
print("=" * 60)
if failed:
    print("\nFAILURES:")
    for name, detail in failed:
        print(f"  ❌ {name}\n     {detail}")
sys.exit(0 if not failed else 1)
