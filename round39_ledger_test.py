"""Round 39 — /api/coins/ledger validation + regression smoke."""
import os
import time
import requests
from datetime import datetime, timezone

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}{(': ' + detail) if detail else ''}")

# 1) Auth
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
check("auth/send-otp 200", r.status_code == 200, f"status={r.status_code}")
r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
check("auth/verify-otp 200", r.status_code == 200)
token = r.json().get("token") or r.json().get("access_token")
check("token issued", bool(token))
H = {"Authorization": f"Bearer {token}"}

# 2) Seed coin events
# (a) streak check-in (idempotent within a UTC day, but should still attempt)
r = requests.post(f"{BASE}/streak/check-in", headers=H, timeout=30)
check("streak/check-in 200", r.status_code == 200, f"body keys: {list(r.json().keys()) if r.status_code==200 else r.text[:120]}")

# (b) seed multiple transactions to trigger coin awards via hook
seeded = 0
for i in range(4):
    payload = {
        "amount": 50 + i,
        "type": "debit",
        "category": "Food",
        "description": f"Round39 ledger seed #{i}",
        "idempotency_key": f"r39-ledger-seed-{int(time.time())}-{i}",
    }
    rr = requests.post(f"{BASE}/transactions", headers=H, json=payload, timeout=30)
    if rr.status_code == 200:
        seeded += 1
check(">=2 transactions seeded", seeded >= 2, f"seeded={seeded}")

# (c) Try /coins/award if available — known endpoint exists
ra = requests.post(f"{BASE}/coins/award", headers=H, json={"reason": "round39_test", "amount": 1}, timeout=15)
# It may not be a public endpoint; we just don't fail on 404/422
print(f"  /coins/award attempt → {ra.status_code}")

# Allow background hooks to settle
time.sleep(2)

# 3) GET /api/coins/ledger
r = requests.get(f"{BASE}/coins/ledger", headers=H, timeout=30)
check("ledger GET 200", r.status_code == 200, f"status={r.status_code}")
body = r.json() if r.status_code == 200 else {}
entries = body.get("entries", [])
check("ledger has entries non-empty", len(entries) > 0, f"count={len(entries)}")

required_fields = {"id", "type", "amount", "description", "source", "balance_after", "created_at"}
all_have_fields = all(required_fields.issubset(e.keys()) for e in entries)
check("each entry has all required fields", all_have_fields)

all_amount_pos = all(isinstance(e.get("amount"), (int, float)) and e["amount"] > 0 for e in entries)
check("each entry amount > 0", all_amount_pos)

valid_types = all(e.get("type") in ("earn", "spend") for e in entries)
check("each entry type is earn|spend", valid_types)

check("total_earned non-negative int", isinstance(body.get("total_earned"), int) and body["total_earned"] >= 0)
check("total_spent non-negative int", isinstance(body.get("total_spent"), int) and body["total_spent"] >= 0)

# 4) ?type=earn
r = requests.get(f"{BASE}/coins/ledger?type=earn", headers=H, timeout=30)
check("ledger?type=earn 200", r.status_code == 200)
es = r.json().get("entries", [])
check("type=earn → all entries earn", all(e["type"] == "earn" for e in es), f"count={len(es)}")

# 5) ?type=spend
r = requests.get(f"{BASE}/coins/ledger?type=spend", headers=H, timeout=30)
check("ledger?type=spend 200", r.status_code == 200)
es_spend = r.json().get("entries", [])
check("type=spend → all spend (or empty)", all(e["type"] == "spend" for e in es_spend), f"count={len(es_spend)}")

# 6) ?type=invalid → normalize to all (no 500)
r = requests.get(f"{BASE}/coins/ledger?type=banana", headers=H, timeout=30)
check("ledger?type=invalid no 500", r.status_code == 200, f"status={r.status_code}")
inv_count = len(r.json().get("entries", []))
check("type=invalid behaves as all", inv_count == len(entries), f"got {inv_count} vs all {len(entries)}")

# 7) limit=2 → exactly 2 entries + non-null next_cursor
r = requests.get(f"{BASE}/coins/ledger?limit=2", headers=H, timeout=30)
check("ledger?limit=2 200", r.status_code == 200)
b7 = r.json()
e7 = b7.get("entries", [])
check("limit=2 returns exactly 2 entries", len(e7) == 2, f"got {len(e7)}")
nc = b7.get("next_cursor")
check("limit=2 next_cursor not null", nc is not None and nc != "", f"cursor={nc}")

# 8) limit=2 with cursor → no overlap
ids_page1 = {e["id"] for e in e7}
r = requests.get(f"{BASE}/coins/ledger?limit=2&cursor={nc}", headers=H, timeout=30)
check("ledger?limit=2&cursor 200", r.status_code == 200)
e8 = r.json().get("entries", [])
check("page2 returned entries", len(e8) >= 1, f"got {len(e8)}")
ids_page2 = {e["id"] for e in e8}
check("no overlap with page1", ids_page1.isdisjoint(ids_page2), f"overlap: {ids_page1 & ids_page2}")

# 9) cursor=notanobjectid → no 500
r = requests.get(f"{BASE}/coins/ledger?cursor=notanobjectid", headers=H, timeout=30)
check("ledger?cursor=notanobjectid no 500", r.status_code == 200, f"status={r.status_code}")
e9 = r.json().get("entries", [])
check("invalid cursor → returns first page", len(e9) > 0, f"got {len(e9)}")

# 10) total_earned − total_spent should equal /coins/balance
r = requests.get(f"{BASE}/coins/ledger", headers=H, timeout=30)
b10 = r.json()
te, ts = b10.get("total_earned", 0), b10.get("total_spent", 0)
diff = te - ts
r2 = requests.get(f"{BASE}/coins/balance", headers=H, timeout=30)
check("/coins/balance 200", r2.status_code == 200)
bal_body = r2.json()
balance = bal_body.get("balance", bal_body.get("coins", -1))
check("total_earned − total_spent == /coins/balance",
      diff == balance,
      f"earned={te}, spent={ts}, diff={diff}, /coins/balance={balance}")

# REGRESSION
print("\n── Regression endpoints ──")
for path in ["/notifications", "/notifications/unread-count", "/search?q=test",
             "/home/bundle", "/coins/balance", "/coins/history"]:
    rr = requests.get(f"{BASE}{path}", headers=H, timeout=30)
    check(f"GET {path} 200", rr.status_code == 200, f"status={rr.status_code}")

# Summary
print("\n── SUMMARY ──")
passed = sum(1 for s, _, _ in results if s == "PASS")
failed = sum(1 for s, _, _ in results if s == "FAIL")
print(f"Total: {len(results)}  Pass: {passed}  Fail: {failed}")
for s, n, d in results:
    if s == "FAIL":
        print(f"  FAIL: {n} :: {d}")
