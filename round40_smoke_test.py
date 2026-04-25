"""
Round 40 quick smoke test - confirm no regressions from frontend-only changes.
Tests 6 endpoint families listed in the review request.
"""
import requests
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []

def check(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((label, ok, detail))
    print(f"[{status}] {label}: {detail}")

# 1. Send OTP
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
check("POST /auth/send-otp", r.status_code == 200, f"status={r.status_code}")

# 2. Verify OTP
r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
ok = r.status_code == 200 and "token" in r.json()
token = r.json().get("token") if ok else None
check("POST /auth/verify-otp", ok, f"status={r.status_code}, token={'yes' if token else 'no'}")

if not token:
    print("Cannot proceed without token")
    sys.exit(1)

H = {"Authorization": f"Bearer {token}"}

# 3. GET /api/money-school/lessons
r = requests.get(f"{BASE}/money-school/lessons", headers=H, timeout=20)
body = None
try:
    body = r.json()
except Exception:
    pass
detail = f"status={r.status_code}"
if isinstance(body, dict):
    detail += f", keys={list(body.keys())[:6]}"
elif isinstance(body, list):
    detail += f", list_len={len(body)}"
check("GET /money-school/lessons", r.status_code == 200, detail)

# 4. GET /api/coins/ledger (Round 39)
r = requests.get(f"{BASE}/coins/ledger", headers=H, timeout=20)
check("GET /coins/ledger", r.status_code == 200, f"status={r.status_code}")

# 5. GET /api/notifications (Round 37)
r = requests.get(f"{BASE}/notifications", headers=H, timeout=20)
check("GET /notifications", r.status_code == 200, f"status={r.status_code}")

# 6. GET /api/search?q=test (Round 37)
r = requests.get(f"{BASE}/search", params={"q": "test"}, headers=H, timeout=20)
check("GET /search?q=test", r.status_code == 200, f"status={r.status_code}")

# 7. GET /api/bundle - per review request literally; also try /home/bundle
r = requests.get(f"{BASE}/bundle", headers=H, timeout=20)
bundle_ok = r.status_code == 200
check("GET /bundle", bundle_ok, f"status={r.status_code}")

# Also test /home/bundle (the one frontend actually uses)
r = requests.get(f"{BASE}/home/bundle", headers=H, timeout=30)
check("GET /home/bundle", r.status_code == 200, f"status={r.status_code}")

# Summary
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n=== ROUND 40 SMOKE: {passed}/{total} PASS ===")
for label, ok, detail in results:
    if not ok:
        print(f"  FAIL: {label} - {detail}")

sys.exit(0 if passed == total else 1)
