"""Post-refactor smoke test for server.py modular split (Round 30f).

Verifies:
1. Security headers on /api endpoints
2. Rate limiting (>30 /auth/send-otp in 60s → 429)
3. Audit log writes (via Mongo)
4. MongoDB indexes exist (users.phone_1 unique + transactions compound)
5. Auth flow: send-otp → verify-otp → /user/me
6. SMS AI parse no 5xx
7. Notifications endpoint does not 5xx
8. Adversarial pytest passes 24/24
"""
import os
import sys
import time
import requests
import subprocess
from pathlib import Path

# Load backend .env for MONGO_URL and DB_NAME
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

# Frontend .env for external base URL
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"') + "/api"
            break

print(f"[SMOKE] Base URL = {BASE_URL}")

PHONE = "9876543210"
OTP = "123456"

results = []
def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, ok, detail))
    print(f"  [{status}] {name}  {detail}")

# ─────────────────────────────────────────────────────────────────────
# 1. Security headers
# ─────────────────────────────────────────────────────────────────────
print("\n[1] Security headers check")
r = requests.get(f"{BASE_URL}/card-of-the-day", timeout=15)
hdrs = r.headers
expected = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
}
for k, v in expected.items():
    actual = hdrs.get(k, "")
    record(f"Header {k}={v}", actual == v, f"(got: {actual!r})")

record("Header Referrer-Policy present", "Referrer-Policy" in hdrs, f"(got: {hdrs.get('Referrer-Policy')!r})")
record("Header Permissions-Policy present", "Permissions-Policy" in hdrs, f"(got: {hdrs.get('Permissions-Policy')!r})")
cc = hdrs.get("Cache-Control", "")
record("Cache-Control has no-store", "no-store" in cc, f"(got: {cc!r})")

# ─────────────────────────────────────────────────────────────────────
# 5. Auth flow (do this BEFORE rate limit so we get a token first)
# ─────────────────────────────────────────────────────────────────────
print("\n[5] Auth flow send-otp → verify-otp → /user/me")

# First a fresh send-otp
r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=15)
record("POST /auth/send-otp 200", r.status_code == 200, f"(status={r.status_code}, body={r.text[:200]})")

r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
token = None
if r.status_code == 200:
    j = r.json()
    token = j.get("token") or j.get("access_token")
record("POST /auth/verify-otp 200+token", r.status_code == 200 and token, f"(status={r.status_code}, has_token={bool(token)})")

headers = {"Authorization": f"Bearer {token}"} if token else {}
r = requests.get(f"{BASE_URL}/user/me", headers=headers, timeout=15)
me_ok = r.status_code == 200 and r.json().get("phone") == PHONE
record("GET /user/me 200 with user", me_ok, f"(status={r.status_code})")

# ─────────────────────────────────────────────────────────────────────
# 6. SMS AI parse — no 5xx
# ─────────────────────────────────────────────────────────────────────
print("\n[6] SMS AI parse no 5xx")
sms_sample = {"sms_text": "INR 450.00 debited from a/c XXXX1234 on 23-Apr-26 at SWIGGY via UPI. Avl bal INR 15,230.50 -HDFC BANK"}
r = requests.post(f"{BASE_URL}/sms/parse", json=sms_sample, headers=headers, timeout=45)
record("POST /sms/parse no 5xx", r.status_code < 500, f"(status={r.status_code}, body={r.text[:200]})")

# ─────────────────────────────────────────────────────────────────────
# 7. Notifications endpoint does not 5xx
# ─────────────────────────────────────────────────────────────────────
print("\n[7] Notifications endpoint no 5xx")
r = requests.get(f"{BASE_URL}/notifications", headers=headers, timeout=15)
record("GET /notifications no 5xx", r.status_code < 500, f"(status={r.status_code})")

# test-push if exists
r = requests.post(f"{BASE_URL}/notifications/test-push", headers=headers, timeout=15)
record("POST /notifications/test-push no 5xx", r.status_code < 500, f"(status={r.status_code})")

# ─────────────────────────────────────────────────────────────────────
# 2. Rate limiting — hammer send-otp >30 times, expect 429
# ─────────────────────────────────────────────────────────────────────
print("\n[2] Rate limit check (>30 POST /auth/send-otp in 60s)")
got_429 = False
got_429_at = None
status_counts = {}
for i in range(45):
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=10)
    status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
    if r.status_code == 429:
        got_429 = True
        got_429_at = i + 1
        try:
            body = r.json()
            if "Rate limit" in body.get("detail", ""):
                record("429 JSON body has Rate limit detail", True, f"(body={body})")
            else:
                record("429 JSON body has Rate limit detail", False, f"(body={body})")
        except Exception as e:
            record("429 JSON body parse", False, str(e))
        break
record("Rate limit triggers 429", got_429, f"(got 429 at req #{got_429_at}, counts={status_counts})")

# ─────────────────────────────────────────────────────────────────────
# 3. Audit log writes
# ─────────────────────────────────────────────────────────────────────
print("\n[3] Audit log writes check")
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    async def check_audit():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        dbh = cli[os.environ["DB_NAME"]]
        count = await dbh.audit_logs.count_documents({})
        recent = await dbh.audit_logs.find().sort("timestamp", -1).limit(5).to_list(5)
        cli.close()
        return count, recent
    count, recent = asyncio.run(check_audit())
    record("audit_logs count > 0", count > 0, f"(count={count})")
    record("audit_logs has recent /api entries", any(r.get("path", "").startswith("/api") for r in recent), f"(paths={[r.get('path') for r in recent]})")
except Exception as e:
    record("audit_logs check", False, f"(err={e})")

# ─────────────────────────────────────────────────────────────────────
# 4. Indexes exist
# ─────────────────────────────────────────────────────────────────────
print("\n[4] MongoDB indexes check")
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    async def check_indexes():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        dbh = cli[os.environ["DB_NAME"]]
        u_idx = await dbh.users.index_information()
        t_idx = await dbh.transactions.index_information()
        cli.close()
        return u_idx, t_idx
    u_idx, t_idx = asyncio.run(check_indexes())
    phone_idx = u_idx.get("phone_1", {})
    record("users.phone_1 exists", "phone_1" in u_idx, f"(keys={list(u_idx.keys())})")
    record("users.phone_1 is unique", phone_idx.get("unique") == True, f"(attrs={phone_idx})")
    has_compound = any(len(v.get("key", [])) >= 2 and v["key"][0][0] == "user_id" for v in t_idx.values())
    record("transactions has compound user_id indexes", has_compound, f"(keys={list(t_idx.keys())})")
except Exception as e:
    record("index check", False, f"(err={e})")

# ─────────────────────────────────────────────────────────────────────
# 8. Adversarial pytest
# ─────────────────────────────────────────────────────────────────────
print("\n[8] Adversarial pytest (must be 24/24)")
try:
    proc = subprocess.run(
        ["python", "-m", "pytest", "tests/test_adversarial.py", "-q", "--tb=line"],
        cwd="/app/backend",
        capture_output=True, text=True, timeout=300,
    )
    out = proc.stdout + proc.stderr
    tail = "\n".join(out.splitlines()[-20:])
    # Look for the summary line e.g. "24 passed in 41.02s"
    import re
    m = re.search(r"(\d+)\s+passed", out)
    passed = int(m.group(1)) if m else 0
    failed_m = re.search(r"(\d+)\s+failed", out)
    failed = int(failed_m.group(1)) if failed_m else 0
    record("Adversarial 24/24 passed", passed == 24 and failed == 0, f"(passed={passed}, failed={failed})")
    print("  --- pytest tail ---\n" + tail)
except Exception as e:
    record("Adversarial pytest run", False, f"(err={e})")

# ─────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("SMOKE TEST SUMMARY")
print("="*70)
pass_n = sum(1 for _, ok, _ in results if ok)
fail_n = len(results) - pass_n
for name, ok, detail in results:
    mark = "✅" if ok else "❌"
    print(f"{mark}  {name}  {detail}")
print(f"\nTOTAL: {pass_n}/{len(results)} passed, {fail_n} failed")
sys.exit(0 if fail_n == 0 else 1)
