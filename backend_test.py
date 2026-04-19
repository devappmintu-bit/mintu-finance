"""Backend regression test for /api/notifications/send-test + existing notification endpoints.

Runs against the public REACT_APP_BACKEND_URL.
"""
import os
import sys
import json
import requests
from pathlib import Path

# Load the frontend .env to discover the public backend URL
FRONTEND_ENV = Path("/app/frontend/.env")
BASE = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

if not BASE:
    print("❌ Could not discover REACT_APP_BACKEND_URL in frontend/.env", file=sys.stderr)
    sys.exit(1)

API = f"{BASE}/api"
print(f"🌐 Using backend: {API}")

PHONE = "9876543210"
OTP = "123456"

results = []


def record(name, passed, detail=""):
    mark = "✅" if passed else "❌"
    print(f"{mark} {name}  {detail}")
    results.append({"name": name, "passed": passed, "detail": detail})


# ── Step 1: send-otp ────────────────────────────────────────────
r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=20)
record("POST /auth/send-otp", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

# ── Step 2: verify-otp (existing user) ──────────────────────────
r = requests.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
ok = r.status_code == 200
token = None
if ok:
    data = r.json()
    token = data.get("token")
    ok = bool(token)
record("POST /auth/verify-otp", ok, f"status={r.status_code} token_len={len(token) if token else 0}")

if not token:
    print("❌ Cannot continue — no auth token.")
    sys.exit(1)

headers = {"Authorization": f"Bearer {token}"}

# ── Step 2.5: clear any existing push_token so we test the "no token" path first ──
# Call the register endpoint with something, then we need to wipe it. There isn't a
# public "delete token" endpoint, but we can test the "no token" path by first
# ensuring user has none — we'll skip wiping and rely on sequence:
# First test "with existing/cleared token" behaviour is environment-dependent; so:
#   A) test send-test right now (whatever token state) and validate shape
#   B) register a fake token and test again

# ── Step 3a: send-test (initial state — token may or may not exist) ─────
r = requests.post(f"{API}/notifications/send-test", headers=headers, timeout=30)
ok = r.status_code == 200
body = None
try:
    body = r.json()
except Exception:
    pass
shape_ok = isinstance(body, dict) and "sent" in body and "message" in body and isinstance(body.get("sent"), bool) and isinstance(body.get("message"), str)
record(
    "POST /notifications/send-test (initial state)",
    ok and shape_ok,
    f"status={r.status_code} sent={body.get('sent') if body else 'n/a'} msg={(body.get('message') if body else r.text)[:120]}",
)
initial_body = body

# ── Step 4: Register a fake Expo token ──────────────────────────
fake_token = "ExponentPushToken[test-fake-token-mintu-regression]"
r = requests.post(
    f"{API}/notifications/register-token",
    headers=headers,
    json={"push_token": fake_token},
    timeout=20,
)
record("POST /notifications/register-token (fake)", r.status_code == 200, f"status={r.status_code} body={r.text[:160]}")

# ── Step 5: send-test with fake token — should NOT crash, sent=false ────
r = requests.post(f"{API}/notifications/send-test", headers=headers, timeout=30)
ok_status = r.status_code == 200
body = None
try:
    body = r.json()
except Exception:
    pass
shape_ok = isinstance(body, dict) and "sent" in body and "message" in body
# With a fake token the Expo API should reject it → sent:false, and the response must
# not be 500. We also expect the "Could not deliver" message OR the "no token" message
# if the token save raced (unlikely). The contract: NO crash, 200, sent is bool.
sent_flag_is_bool = isinstance((body or {}).get("sent"), bool)
record(
    "POST /notifications/send-test (fake token, should not crash)",
    ok_status and shape_ok and sent_flag_is_bool,
    f"status={r.status_code} sent={(body or {}).get('sent')} msg={((body or {}).get('message') or r.text)[:140]}",
)

# Print extra detail for the main agent: what messaging did we get?
if body:
    print(f"   ↳ sent={body.get('sent')!r}, message={body.get('message')!r}")

# ── Step 6: Regression — check-budget-alerts ────────────────────
r = requests.get(f"{API}/notifications/check-budget-alerts", headers=headers, timeout=20)
ok = r.status_code == 200
body = None
try:
    body = r.json()
except Exception:
    pass
shape_ok = isinstance(body, dict) and "alerts" in body and "total" in body
record("GET /notifications/check-budget-alerts", ok and shape_ok, f"status={r.status_code} total={(body or {}).get('total')}")

# ── Step 7: Regression — smart-triggers (existing push endpoint) ─
r = requests.get(f"{API}/notifications/smart-triggers", headers=headers, timeout=20)
ok = r.status_code == 200
body = None
try:
    body = r.json()
except Exception:
    pass
shape_ok = isinstance(body, dict) and "notifications" in body and "count" in body
record("GET /notifications/smart-triggers", ok and shape_ok, f"status={r.status_code} count={(body or {}).get('count')}")


# ── Summary ─────────────────────────────────────────────────────
total = len(results)
passed = sum(1 for x in results if x["passed"])
print("\n" + "=" * 60)
print(f"SUMMARY: {passed}/{total} passed")
print("=" * 60)
for x in results:
    mark = "✅" if x["passed"] else "❌"
    print(f"{mark} {x['name']}")
    if not x["passed"]:
        print(f"     └─ {x['detail']}")

sys.exit(0 if passed == total else 1)
