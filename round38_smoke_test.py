#!/usr/bin/env python3
"""Round 38 fast smoke test - verify no regressions on key frontend-called endpoints."""
import os
import sys
import time
import uuid
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []
def add(name, ok, info=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, ok, info))
    print(f"[{status}] {name} — {info}")

# 1. POST /api/auth/send-otp
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
add("POST /api/auth/send-otp", r.status_code == 200, f"status={r.status_code}, body={r.text[:120]}")

# 2. POST /api/auth/verify-otp
r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
add("POST /api/auth/verify-otp", r.status_code == 200, f"status={r.status_code}")
token = r.json().get("token") if r.status_code == 200 else None
H = {"Authorization": f"Bearer {token}"} if token else {}

# 3. GET /api/bundle (or /home/bundle)
# Frontend likely uses /api/home/bundle - test both
r = requests.get(f"{BASE}/bundle", headers=H, timeout=20)
ok = r.status_code in (200, 404)  # 404 acceptable if path is /home/bundle
add("GET /api/bundle", r.status_code != 500, f"status={r.status_code}")
r2 = requests.get(f"{BASE}/home/bundle", headers=H, timeout=30)
add("GET /api/home/bundle", r2.status_code == 200, f"status={r2.status_code}")

# 4. GET /api/notifications
r = requests.get(f"{BASE}/notifications", headers=H, timeout=15)
add("GET /api/notifications", r.status_code == 200, f"status={r.status_code}, items={len(r.json()) if r.status_code==200 else 'n/a'}")

# 5. GET /api/notifications/unread-count
r = requests.get(f"{BASE}/notifications/unread-count", headers=H, timeout=15)
add("GET /api/notifications/unread-count", r.status_code == 200, f"status={r.status_code}, body={r.text[:100]}")

# 6. GET /api/search?q=test
r = requests.get(f"{BASE}/search", params={"q": "test"}, headers=H, timeout=15)
add("GET /api/search?q=test", r.status_code == 200, f"status={r.status_code}, total={r.json().get('total') if r.status_code==200 else 'n/a'}")

# 7. POST /api/transactions with idempotency_key
idem = str(uuid.uuid4())
payload = {
    "amount": 250.0,
    "type": "debit",
    "category": "Food",
    "description": "Round 38 smoke test - chai",
    "idempotency_key": idem,
}
r = requests.post(f"{BASE}/transactions", json=payload, headers=H, timeout=15)
add("POST /api/transactions (idempotency)", r.status_code == 200, f"status={r.status_code}")
txn_id = r.json().get("id") if r.status_code == 200 else None

# Repeat call should dedupe
r2 = requests.post(f"{BASE}/transactions", json=payload, headers=H, timeout=15)
deduped = r2.status_code == 200 and r2.json().get("deduped") is True and r2.json().get("id") == txn_id
add("POST /api/transactions (dedupe)", deduped, f"status={r2.status_code}, deduped={r2.json().get('deduped') if r2.status_code==200 else 'n/a'}")

# 8. GET /api/transactions
r = requests.get(f"{BASE}/transactions", headers=H, timeout=15)
add("GET /api/transactions", r.status_code == 200, f"status={r.status_code}, count={len(r.json()) if r.status_code==200 else 'n/a'}")

# 9. PUT /api/transactions/{id}
if txn_id:
    r = requests.put(
        f"{BASE}/transactions/{txn_id}",
        json={"amount": 275.0, "type": "debit", "category": "Food", "description": "Round 38 updated"},
        headers=H, timeout=15,
    )
    add("PUT /api/transactions/{id}", r.status_code == 200, f"status={r.status_code}")
else:
    add("PUT /api/transactions/{id}", False, "no txn_id")

# 10. DELETE /api/transactions/{id}
if txn_id:
    r = requests.delete(f"{BASE}/transactions/{txn_id}", headers=H, timeout=15)
    add("DELETE /api/transactions/{id}", r.status_code == 200, f"status={r.status_code}")
else:
    add("DELETE /api/transactions/{id}", False, "no txn_id")

# 11. GET /api/budgets/live
r = requests.get(f"{BASE}/budgets/live", headers=H, timeout=15)
add("GET /api/budgets/live", r.status_code == 200, f"status={r.status_code}")

# 12. GET /api/goals
r = requests.get(f"{BASE}/goals", headers=H, timeout=15)
add("GET /api/goals", r.status_code == 200, f"status={r.status_code}")

# 13. GET /api/coins/balance
r = requests.get(f"{BASE}/coins/balance", headers=H, timeout=15)
add("GET /api/coins/balance", r.status_code == 200, f"status={r.status_code}, body={r.text[:100]}")

# Summary
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
fives = [n for n, ok, info in results if "500" in info]
print(f"\n=== SUMMARY === {passed}/{total} pass, 500s={len(fives)}")
sys.exit(0 if passed == total else 1)
