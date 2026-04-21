"""
MintU Backend Full Regression Test — Apr 21 2026
Review: verify all major API endpoints respond correctly (no breaking changes / no middleware RuntimeError).
"""
import os
import time
import requests
import sys
from typing import Any

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
PHONE = "9876543210"
OTP = "123456"
TIMEOUT = 30

results: list[dict[str, Any]] = []

def rec(group, name, method, path, status, ok, elapsed, note=""):
    results.append({
        "group": group, "name": name, "method": method, "path": path,
        "status": status, "ok": ok, "elapsed_ms": round(elapsed * 1000, 1), "note": note,
    })
    marker = "\u2705" if ok else "\u274C"
    slow = " \u26A0\uFE0F SLOW" if elapsed > 5 else ""
    print(f"  {marker} [{group}] {method} {path} -> {status} ({elapsed*1000:.0f}ms){slow} {note}")

def req(method, path, *, token=None, json_body=None, params=None, expected_ok=(200,), group="", name="", note_on_fail=""):
    url = f"{API}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    start = time.time()
    try:
        r = requests.request(method, url, headers=headers, json=json_body, params=params, timeout=TIMEOUT)
        elapsed = time.time() - start
    except requests.exceptions.Timeout:
        elapsed = time.time() - start
        rec(group, name, method, path, 0, False, elapsed, f"TIMEOUT after {TIMEOUT}s")
        return None
    except Exception as e:
        elapsed = time.time() - start
        rec(group, name, method, path, 0, False, elapsed, f"EXCEPTION: {e}")
        return None
    ok = r.status_code in expected_ok
    note = note_on_fail if not ok else ""
    if not ok:
        try:
            body_preview = r.text[:240].replace("\n", " ")
            note += f" | body: {body_preview}"
        except Exception:
            pass
    rec(group, name, method, path, r.status_code, ok, elapsed, note)
    try:
        return r.json() if r.text else None
    except Exception:
        return r.text


# ==== 1. AUTH ====
print("\n=== 1. AUTH ===")
req("POST", "/auth/send-otp", json_body={"phone": PHONE}, group="auth", name="send-otp")
verify_body = req("POST", "/auth/verify-otp", json_body={"phone": PHONE, "otp": OTP}, group="auth", name="verify-otp")

token = None
if isinstance(verify_body, dict):
    token = verify_body.get("token") or verify_body.get("access_token")
if not token:
    print("\nFATAL: could not obtain auth token. Aborting.")
    sys.exit(1)
print(f"  token obtained ({len(token)} chars)")

print("\n  -- PIN endpoints (may not exist) --")
req("POST", "/auth/create-pin", token=token, json_body={"pin": "1234"},
    expected_ok=(200, 404, 422), group="auth", name="create-pin",
    note_on_fail="create-pin endpoint missing/failed")
req("POST", "/auth/verify-pin", token=token, json_body={"pin": "1234"},
    expected_ok=(200, 404, 422), group="auth", name="verify-pin",
    note_on_fail="verify-pin endpoint missing/failed")

# Unauth-protected route check
req("GET", "/user/avatar", expected_ok=(401, 403, 422),
    group="auth", name="protected-route-without-token",
    note_on_fail="expected 401/403/422 for no-token")


# ==== 2. USER PROFILE ====
print("\n=== 2. USER PROFILE ===")
req("GET", "/user/avatar", token=token, group="user", name="avatar")
req("GET", "/user/payment-methods", token=token, group="user", name="payment-methods")
req("GET", "/user/upi", token=token, group="user", name="upi")
req("GET", "/user/notification-prefs", token=token, group="user", name="notification-prefs")
req("POST", "/user/delete-account", token=token, json_body={},
    expected_ok=(200, 400, 422, 403), group="user", name="delete-account (schema)",
    note_on_fail="schema check, should not 500")


# ==== 3. TRANSACTIONS ====
print("\n=== 3. TRANSACTIONS ===")
req("GET", "/transactions", token=token, group="transactions", name="list")
new_tx = req("POST", "/transactions", token=token, json_body={
    "amount": 250.0,
    "type": "debit",
    "category": "Food",
    "description": "Regression test lunch",
}, group="transactions", name="create")

tx_id = None
if isinstance(new_tx, dict):
    tx_id = new_tx.get("id") or new_tx.get("_id") or new_tx.get("transaction_id")
if tx_id:
    req("PUT", f"/transactions/{tx_id}", token=token, json_body={
        "amount": 300.0, "type": "debit", "category": "Food",
        "description": "Regression updated",
    }, group="transactions", name="edit")
    req("DELETE", f"/transactions/{tx_id}", token=token, group="transactions", name="delete")
else:
    print("  (skipping edit/delete, no id)")

req("GET", "/stats/overview", token=token, group="transactions", name="stats/overview")
req("GET", "/analytics/summary", token=token, group="transactions", name="analytics/summary")


# ==== 4. BUDGETS ====
print("\n=== 4. BUDGETS ===")
req("GET", "/budgets/live", token=token, group="budgets", name="live")
req("GET", "/budgets/smart-suggest", token=token, group="budgets", name="smart-suggest")
req("GET", "/budgets/achievements", token=token, group="budgets", name="achievements")
req("POST", "/budgets", token=token, json_body={
    "category": "Entertainment", "amount": 2000, "period": "monthly",
}, group="budgets", name="create")


# ==== 5. SPLIT ====
print("\n=== 5. SPLIT ===")
req("GET", "/split/groups", token=token, group="split", name="groups")
req("GET", "/split/balances", token=token, group="split", name="balances")
req("GET", "/split/insights", token=token, group="split", name="insights")
req("GET", "/split/reminders", token=token, group="split", name="reminders")
req("GET", "/split/settlement-leaderboard", token=token, group="split", name="settlement-leaderboard")
req("POST", "/split/groups", token=token, json_body={
    "name": "Regression Apr21 Group", "members": ["9999888877"],
}, group="split", name="create-group")


# ==== 6. AI COACH ====
print("\n=== 6. AI COACH ===")
req("GET", "/ai/insights", token=token,
    expected_ok=(200, 404), group="ai", name="ai/insights (exact-path)",
    note_on_fail="may not exist; /insights/daily is the canonical path")
req("GET", "/insights/daily", token=token, group="ai", name="insights/daily (alt)")
req("GET", "/ai/proactive-nudges", token=token, group="ai", name="ai/proactive-nudges")
req("POST", "/ai/chat", token=token, json_body={
    "message": "How can I save more money this month?",
}, group="ai", name="ai/chat")


# ==== 7. REWARDS ====
print("\n=== 7. REWARDS ===")
req("GET", "/coins/status", token=token, group="rewards", name="coins/status")
req("GET", "/gamification/status", token=token, group="rewards", name="gamification/status")
req("GET", "/referral/enhanced-status", token=token, group="rewards", name="referral/enhanced-status")


# ==== 8. NEWS ====
print("\n=== 8. NEWS ===")
start = time.time()
try:
    r = requests.get(f"{API}/news/india-finance",
                     headers={"Authorization": f"Bearer {token}"},
                     timeout=25)
    elapsed = time.time() - start
    note = "" if r.status_code == 200 else f" body={r.text[:160]}"
    rec("news", "india-finance", "GET", "/news/india-finance", r.status_code,
        r.status_code == 200, elapsed, note)
except requests.exceptions.Timeout:
    elapsed = time.time() - start
    rec("news", "india-finance", "GET", "/news/india-finance", 0, False, elapsed, "TIMEOUT>25s")
except Exception as e:
    elapsed = time.time() - start
    rec("news", "india-finance", "GET", "/news/india-finance", 0, False, elapsed, f"EXC:{e}")


# ==== 9. GMAIL ====
print("\n=== 9. GMAIL ===")
req("GET", "/gmail/status", token=token, group="gmail", name="status")


# ==== SUMMARY ====
print("\n==========================================")
print("SUMMARY")
print("==========================================")
total_ok = sum(1 for r in results if r["ok"])
total = len(results)
print(f"\nTotal: {total_ok}/{total} PASS ({total_ok/total*100:.1f}%)\n")

slow = [r for r in results if r["elapsed_ms"] > 5000]
fails = [r for r in results if not r["ok"]]

print("--- SLOW ENDPOINTS (>5s) ---")
if slow:
    for r in slow:
        print(f"  SLOW: {r['method']} {r['path']} took {r['elapsed_ms']}ms")
else:
    print("  (none)")

print("\n--- FAILURES ---")
if fails:
    for r in fails:
        print(f"  FAIL: [{r['group']}] {r['method']} {r['path']} -> {r['status']} | {r['note']}")
else:
    print("  (none)")

print("\nDONE")
critical_fails = [r for r in fails if r["name"] not in ("create-pin", "verify-pin", "ai/insights (exact-path)")]
sys.exit(0 if not critical_fails else 1)
