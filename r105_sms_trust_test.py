"""R105 SMS bulk-parse trust upgrade verification (read-only)."""
import os, sys, json, time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9111122221"
OTP = "123456"

SMS_1 = "INR 1,250.00 paid to SWIGGY via UPI Ref 312456789 on 06-MAY-2026 at 14:30 from HDFC AC XX1234. Bal: INR 23,450.00"
SMS_2 = "Salary credit of INR 85,000.00 received in Acct XX5678 on 01-MAY-2026. AXIS BANK"

results = []

def log(msg, ok=None):
    prefix = "" if ok is None else ("PASS " if ok else "FAIL ")
    print(f"{prefix}{msg}")
    if ok is not None:
        results.append((ok, msg))

def jp(o):
    return json.dumps(o, indent=2, default=str)[:4000]

# T1 Auth
log("T1: send-otp + verify-otp")
r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
log(f"send-otp status={r.status_code}", r.status_code == 200)
r = requests.post(f"{BASE}/auth/verify-otp", json={
    "phone": PHONE, "otp": OTP, "device_id": "cli", "device_name": "test", "os": "web"
}, timeout=15)
log(f"verify-otp status={r.status_code}", r.status_code == 200)
token = r.json().get("access_token")
log(f"Got token len={len(token) if token else 0}", bool(token))
H = {"Authorization": f"Bearer {token}"}

# T2 Bulk parse with 2 messages — first attempt
log("\nT2: POST /sms/bulk-parse with 2 SMS messages")
body = {"messages": [SMS_1, SMS_2]}
r = requests.post(f"{BASE}/sms/bulk-parse", json=body, headers=H, timeout=120)
log(f"status={r.status_code}", r.status_code == 200)
resp = r.json()
print("RESPONSE BODY:")
print(jp(resp))

required_keys = {"parsed", "failed", "duplicate", "pending_review", "recurring_detected", "total", "batch_limit"}
present = set(resp.keys())
missing = required_keys - present
log(f"All required keys present: missing={missing}", not missing)
log(f"parsed >= 1 (got {resp.get('parsed')})", resp.get("parsed", 0) >= 1)
log(f"total == 2 (got {resp.get('total')})", resp.get("total") == 2)
log(f"batch_limit == 200 (got {resp.get('batch_limit')})", resp.get("batch_limit") == 200)

t2_parsed = resp.get("parsed", 0)

# T3 Dedup — same 2 messages again
log("\nT3: POST /sms/bulk-parse AGAIN with EXACT SAME messages (dedup test)")
r = requests.post(f"{BASE}/sms/bulk-parse", json=body, headers=H, timeout=120)
log(f"status={r.status_code}", r.status_code == 200)
resp2 = r.json()
print("RESPONSE BODY:")
print(jp(resp2))
log(f"duplicate >= 2 (got {resp2.get('duplicate')})", resp2.get("duplicate", 0) >= 2)
log(f"parsed == 0 (got {resp2.get('parsed')})", resp2.get("parsed") == 0)

# T4 GET transactions — verify new fields
log("\nT4: GET /transactions and verify R105 fields on SMS-imported txns")
r = requests.get(f"{BASE}/transactions?source=sms_import&limit=20", headers=H, timeout=30)
log(f"status={r.status_code}", r.status_code == 200)
txns = r.json()
log(f"Got {len(txns)} sms-import txns", isinstance(txns, list))

# Find Swiggy + Salary recently created (look at top-most by date)
swiggy = None
salary = None
for t in txns:
    desc = (t.get("description") or "") + " " + (t.get("merchant") or "") + " " + (t.get("merchant_raw") or "")
    if "swiggy" in desc.lower() and swiggy is None:
        swiggy = t
    if (("salary" in desc.lower()) or t.get("category", "").lower() == "salary" or t.get("type") == "credit") and salary is None and t.get("amount") and abs(float(t["amount"]) - 85000) < 1:
        salary = t

print("\n--- SAMPLE SWIGGY TXN ---")
print(jp(swiggy))
print("\n--- SAMPLE SALARY TXN ---")
print(jp(salary))

if swiggy:
    log(f"swiggy: confidence is number (got {swiggy.get('confidence')})", isinstance(swiggy.get("confidence"), (int, float)))
    log(f"swiggy: raw_hash is string (got {swiggy.get('raw_hash')})", isinstance(swiggy.get("raw_hash"), str) and len(swiggy.get("raw_hash") or "") > 0)
    log(f"swiggy: merchant present (got '{swiggy.get('merchant')}')", isinstance(swiggy.get("merchant"), str) and len(swiggy.get("merchant") or "") > 0)
    raz_clean = "raz" not in (swiggy.get("merchant") or "").lower()
    log(f"swiggy: merchant has no RAZ* prefix (got '{swiggy.get('merchant')}')", raz_clean)
    log(f"swiggy: last4 == '1234' (got '{swiggy.get('last4')}')", swiggy.get("last4") == "1234")
    log(f"swiggy: date_inferred is bool (got {swiggy.get('date_inferred')!r})", isinstance(swiggy.get("date_inferred"), bool))
    log(f"swiggy: date_inferred == False (explicit date in SMS)", swiggy.get("date_inferred") is False)
    # Date should reflect 2026-05-06
    date_str = str(swiggy.get("date") or "")
    log(f"swiggy: date reflects 2026-05-06 (got '{date_str}')", date_str.startswith("2026-05-06"))
else:
    log("Swiggy txn not found", False)

if salary:
    log(f"salary: confidence is number (got {salary.get('confidence')})", isinstance(salary.get("confidence"), (int, float)))
    log(f"salary: raw_hash present", isinstance(salary.get("raw_hash"), str) and len(salary.get("raw_hash") or "") > 0)
    log(f"salary: date_inferred == False", salary.get("date_inferred") is False)
    date_str = str(salary.get("date") or "")
    log(f"salary: date reflects 2026-05-01 (got '{date_str}')", date_str.startswith("2026-05-01"))
else:
    log("Salary txn not found", False)

# T5 Negative — empty messages
log("\nT5: POST /sms/bulk-parse with empty messages → 400")
r = requests.post(f"{BASE}/sms/bulk-parse", json={"messages": []}, headers=H, timeout=15)
log(f"status == 400 (got {r.status_code})", r.status_code == 400)
print(f"Body: {r.text[:300]}")

# T6 Negative — non-transactional promo text
log("\nT6: POST /sms/bulk-parse with non-transactional text → 200 with failed >= 1")
r = requests.post(f"{BASE}/sms/bulk-parse", json={"messages": ["RANDOM PROMO TEXT — buy 1 get 1 free at our store this weekend!"]}, headers=H, timeout=120)
log(f"status == 200 (got {r.status_code})", r.status_code == 200)
resp6 = r.json()
print("RESPONSE BODY:")
print(jp(resp6))
log(f"failed >= 1 (got {resp6.get('failed')})", resp6.get("failed", 0) >= 1)
log(f"parsed == 0 (got {resp6.get('parsed')})", resp6.get("parsed") == 0)

# Summary
print("\n" + "=" * 80)
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print(f"RESULT: {passed}/{total} assertions PASS")
for ok, msg in results:
    print(f"  {'PASS' if ok else 'FAIL'} — {msg}")
sys.exit(0 if passed == total else 1)
