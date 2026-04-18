#!/usr/bin/env python3
"""Re-test 16 endpoints after backend fix (per review request)."""
import requests, json, sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"

# Auth via password login
r = requests.post(f"{BASE}/auth/login", json={"phone": "9876543210", "password": "test123"}, timeout=30)
print(f"[AUTH] login → {r.status_code}")
if r.status_code != 200:
    print(r.text[:400])
    sys.exit(1)
token = r.json().get("token") or r.json().get("access_token")
H = {"Authorization": f"Bearer {token}"}

tests = [
    ("GET", "/cash/recurring", None),
    ("GET", "/notifications/check-budget-alerts", None),
    ("GET", "/sms/sample-inbox", None),
    ("GET", "/premium/status", None),
    ("GET", "/ab/paywall-group", None),
    ("GET", "/share/score-card", None),
    ("GET", "/privacy/policy", None),
    ("GET", "/budgets/live", None),
    ("GET", "/alerts/smart", None),
    ("GET", "/upi/apps", None),
    ("GET", "/insights/weekly", None),
    ("GET", "/user/me", None),
    ("GET", "/split/groups", None),
    ("GET", "/money-school/lessons", None),
    ("GET", "/transactions", None),
    ("POST", "/transactions", {"amount": 50, "category": "Food", "description": "Test", "type": "debit"}),
]

passed = 0
failed = 0
failures = []
for method, path, body in tests:
    try:
        if method == "GET":
            r = requests.get(BASE + path, headers=H, timeout=30)
        else:
            r = requests.post(BASE + path, headers=H, json=body, timeout=30)
        ok = (r.status_code == 200)
        status = "✅" if ok else "❌"
        snippet = ""
        if not ok:
            failed += 1
            try:
                snippet = r.text[:250]
            except Exception:
                snippet = "?"
            failures.append((method, path, r.status_code, snippet))
        else:
            passed += 1
        print(f"{status} {method} {path} → {r.status_code}  {('' if ok else snippet[:200])}")
    except Exception as e:
        failed += 1
        failures.append((method, path, "EXC", str(e)[:200]))
        print(f"❌ {method} {path} → EXC: {e}")

print(f"\n==== RESULT: PASS {passed}/16, FAIL {failed}/16 ====")
for f in failures:
    print("FAIL:", f)
