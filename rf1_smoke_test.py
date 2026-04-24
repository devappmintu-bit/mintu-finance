"""RF1 dead-code purge smoke test — verifies no regressions after:
  • budgets.py safe_oid import fix
  • premium.mock-activate now returns effective_price + coins_applied
  • split_settle.py E722 fix + dead var removal
  • notifications/user/ai_agent/etc F841 cleanup
"""
import json
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def log(name, ok, detail=""):
    emoji = "✅" if ok else "❌"
    print(f"{emoji} {name}: {detail}")
    results.append({"name": name, "ok": ok, "detail": detail})


def fail_stop(msg):
    print(f"FATAL: {msg}")
    sys.exit(1)


# ───── Auth ─────
print("━" * 60)
print("AUTH")
print("━" * 60)
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
if r.status_code != 200:
    fail_stop(f"send-otp → {r.status_code} {r.text}")

r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "name": "Test User"}, timeout=30)
if r.status_code != 200:
    fail_stop(f"verify-otp → {r.status_code} {r.text}")
token = r.json().get("token") or r.json().get("access_token")
if not token:
    fail_stop(f"verify-otp missing token field. Body: {r.json()}")
H = {"Authorization": f"Bearer {token}"}
log("Auth OK — token acquired", True, f"len={len(token)}")


# ───── 1. GET /api/budgets/suggest (review name — actual endpoints are smart-setup + smart-suggest) ─────
print("\n━" * 20)
print("1. BUDGETS SUGGEST (smart-setup — main one, fields match review)")
print("━" * 60)
r = requests.get(f"{BASE}/budgets/smart-setup", headers=H, timeout=60)
if r.status_code != 200:
    log("GET /budgets/smart-setup", False, f"status={r.status_code} body={r.text[:500]}")
else:
    body = r.json()
    has_income = "monthly_income" in body
    cats = body.get("categories") or []
    first_cat = cats[0] if cats else {}
    has_rec = "recommended" in first_cat
    has_risk = "risk_level" in first_cat
    has_preset = "preset_amounts" in first_cat
    log(
        "GET /budgets/smart-setup",
        has_income and has_rec and has_risk and has_preset,
        f"status=200 monthly_income={body.get('monthly_income')} recommended_present={has_rec} risk_level_present={has_risk} preset_amounts_present={has_preset} categories_count={len(cats)}",
    )

# Also hit the other suggestion endpoint (smart-suggest) for completeness
r = requests.get(f"{BASE}/budgets/smart-suggest", headers=H, timeout=60)
log(
    "GET /budgets/smart-suggest",
    r.status_code == 200,
    f"status={r.status_code} body_keys={list(r.json().keys()) if r.status_code == 200 else r.text[:200]}",
)


# ───── 2. POST /api/budgets ─────
print("\n━" * 20)
print("2. POST /api/budgets — create/upsert budget")
print("━" * 60)
r = requests.post(
    f"{BASE}/budgets",
    json={"category": "Food", "amount": 5000, "period": "monthly"},
    headers=H,
    timeout=30,
)
budget_id = None
if r.status_code != 200:
    log("POST /budgets", False, f"status={r.status_code} body={r.text[:500]}")
else:
    b = r.json()
    budget_id = b.get("id")
    log(
        "POST /budgets",
        bool(budget_id) and b.get("amount") == 5000,
        f"status=200 id={budget_id} amount={b.get('amount')} category={b.get('category')}",
    )


# ───── 3. POST /api/premium/mock-activate (MUST include effective_price + coins_applied) ─────
print("\n━" * 20)
print("3. POST /api/premium/mock-activate — NEW fields effective_price + coins_applied")
print("━" * 60)
# Try standard plan (99)
for plan in ("monthly", "intro", "yearly"):
    r = requests.post(
        f"{BASE}/premium/mock-activate",
        json={"plan": plan, "coins_to_use": 0},
        headers=H,
        timeout=30,
    )
    if r.status_code != 200:
        log(f"POST /premium/mock-activate plan={plan}", False, f"status={r.status_code} body={r.text[:500]}")
        continue
    body = r.json()
    has_eff = "effective_price" in body
    has_coins = "coins_applied" in body
    log(
        f"POST /premium/mock-activate plan={plan}",
        has_eff and has_coins and body.get("success") is True,
        f"status=200 effective_price={body.get('effective_price')} coins_applied={body.get('coins_applied')} tier={body.get('tier')} plan={body.get('plan')}",
    )


# ───── 4. GET /api/premium/status & paywall-trigger ─────
print("\n━" * 20)
print("4. GET /api/premium/status + /api/premium/paywall-trigger")
print("━" * 60)
r = requests.get(f"{BASE}/premium/status", headers=H, timeout=30)
log("GET /premium/status", r.status_code == 200, f"status={r.status_code} is_premium={r.json().get('is_premium') if r.status_code == 200 else ''} tier={r.json().get('tier') if r.status_code == 200 else ''}")

r = requests.get(f"{BASE}/premium/paywall-trigger", headers=H, timeout=30)
log("GET /premium/paywall-trigger", r.status_code == 200, f"status={r.status_code} hook_text={(r.json().get('hook_text') or '')[:60] if r.status_code == 200 else r.text[:200]}")


# ───── 5. POST /api/split/settle (just verify shape, may fail 400 if no debt — still NOT 500) ─────
print("\n━" * 20)
print("5. POST /api/split/settle — verify no regression (expect 400 if no debt, never 500)")
print("━" * 60)
# Send a clearly invalid payload to ensure the handler doesn't 500
fake_target = "000000000000000000000000"  # valid ObjectId shape, non-existent user
r = requests.post(
    f"{BASE}/split/settle",
    json={"target_user_id": fake_target, "amount": 100, "method": "upi"},
    headers=H,
    timeout=30,
)
# Expected: 400 "No outstanding debt". NEVER 500.
log(
    "POST /split/settle (no-debt case)",
    r.status_code in (400, 404, 422),
    f"status={r.status_code} body={r.text[:200]} (expect 400 'No outstanding debt'; 5xx would be regression)",
)

# Also check malformed target_user_id → 400
r = requests.post(
    f"{BASE}/split/settle",
    json={"target_user_id": "not_a_valid_oid", "amount": 100, "method": "upi"},
    headers=H,
    timeout=30,
)
log(
    "POST /split/settle (invalid oid)",
    r.status_code == 400,
    f"status={r.status_code} body={r.text[:200]}",
)


# ───── 6. POST /api/split/verify-settle-payment (E722 fix only, no behavioral change) ─────
print("\n━" * 20)
print("6. POST /api/split/verify-settle-payment")
print("━" * 60)
# Empty body should → 400 (never 500)
r = requests.post(
    f"{BASE}/split/verify-settle-payment",
    json={},
    headers=H,
    timeout=30,
)
log(
    "POST /split/verify-settle-payment empty-body",
    r.status_code in (400, 422),
    f"status={r.status_code} body={r.text[:200]}",
)

# Bad signature → 400
r = requests.post(
    f"{BASE}/split/verify-settle-payment",
    json={"order_id": "order_FAKE", "payment_id": "pay_FAKE", "signature": "bad_sig"},
    headers=H,
    timeout=30,
)
log(
    "POST /split/verify-settle-payment bad-sig",
    r.status_code in (400, 404),
    f"status={r.status_code} body={r.text[:200]}",
)


# ───── 7. GET /api/notifications ─────
print("\n━" * 20)
print("7. Notifications endpoints (F841 cleanup of unused `user` local)")
print("━" * 60)
# Note: routers/notifications.py doesn't expose a plain GET /notifications, but does
# expose /notifications/check-budget-alerts and /notifications/smart-triggers. Test both.
r = requests.get(f"{BASE}/notifications/check-budget-alerts", headers=H, timeout=30)
log(
    "GET /notifications/check-budget-alerts",
    r.status_code == 200,
    f"status={r.status_code} alerts_count={r.json().get('total') if r.status_code == 200 else r.text[:200]}",
)

r = requests.get(f"{BASE}/notifications/smart-triggers", headers=H, timeout=30)
log(
    "GET /notifications/smart-triggers",
    r.status_code == 200,
    f"status={r.status_code} notif_count={r.json().get('count') if r.status_code == 200 else r.text[:200]}",
)

# Also notifications-list endpoint (common name) — try both spellings
for path in ("/notifications", "/notifications/list"):
    try:
        r = requests.get(f"{BASE}{path}", headers=H, timeout=15)
        log(
            f"GET {path}",
            r.status_code in (200, 404),
            f"status={r.status_code} {'OK' if r.status_code == 200 else 'not mounted'}",
        )
    except Exception as e:
        log(f"GET {path}", False, f"exception={e}")


# ───── Clean up: delete the budget we created ─────
if budget_id:
    requests.delete(f"{BASE}/budgets/{budget_id}", headers=H, timeout=30)


# ───── SUMMARY ─────
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
pass_count = sum(1 for r in results if r["ok"])
fail_count = sum(1 for r in results if not r["ok"])
print(f"PASS: {pass_count}/{len(results)}")
print(f"FAIL: {fail_count}/{len(results)}")
if fail_count:
    print("\nFAILURES:")
    for r in results:
        if not r["ok"]:
            print(f"  ❌ {r['name']}: {r['detail']}")
sys.exit(0 if fail_count == 0 else 1)
