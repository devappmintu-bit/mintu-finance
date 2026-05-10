"""
Backend test for beta waitlist endpoints + regression for notifications, auth_v2 OTP, intelligence/mood-score.

Tests against EXPO_PUBLIC_BACKEND_URL from frontend/.env (+ /api).
"""
import sys
import json
import uuid
import requests
from pathlib import Path


def _read_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return "http://localhost:8001"


BASE = _read_backend_url().rstrip("/")
API = f"{BASE}/api"
print(f"\n=== Testing against: {API} ===\n")

PASS = 0
FAIL = 0
FAILURES = []


def _assert(cond, name, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        FAILURES.append(f"{name} -- {detail}")
        print(f"  FAIL  {name}  ({detail})")


# T1 — POST /api/beta/waitlist  — valid email submission
print("\n[T1] POST /api/beta/waitlist -- valid email")
unique_email = f"beta.tester.{uuid.uuid4().hex[:8]}@mintu.in"
r = requests.post(f"{API}/beta/waitlist", json={
    "email": unique_email,
    "phone": "+91 99887-76655",
    "platform_pref": "ios",
    "referrer": "twitter",
}, timeout=20)
_assert(r.status_code == 200, "T1.1 status 200 on valid email", f"got {r.status_code} body={r.text[:200]}")
try:
    body = r.json()
except Exception:
    body = {}
_assert(body.get("ok") is True, "T1.2 ok==True", f"body={body}")
_assert(body.get("already_joined") is False, "T1.3 already_joined==False on first submit", f"body={body}")
position_first = body.get("position")
_assert(isinstance(position_first, int) and position_first >= 1, "T1.4 position is positive int", f"got {position_first}")
_assert("joined_at" in body, "T1.5 joined_at present", f"body={body}")


# T2 — Idempotency: same email re-submission returns same position
print("\n[T2] POST /api/beta/waitlist -- idempotency (same email)")
r2 = requests.post(f"{API}/beta/waitlist", json={"email": unique_email}, timeout=20)
_assert(r2.status_code == 200, "T2.1 status 200 on resubmit", f"got {r2.status_code}")
body2 = r2.json() if r2.status_code == 200 else {}
_assert(body2.get("already_joined") is True, "T2.2 already_joined==True", f"body={body2}")
_assert(body2.get("position") == position_first, "T2.3 same position returned", f"first={position_first} second={body2.get('position')}")


# T3 — Email normalization (uppercase + trim)
print("\n[T3] POST /api/beta/waitlist -- email normalization (uppercase+spaces)")
r3 = requests.post(f"{API}/beta/waitlist", json={"email": f"  {unique_email.upper()}  "}, timeout=20)
_assert(r3.status_code == 200, "T3.1 status 200 with mixed-case+padded email", f"got {r3.status_code}")
body3 = r3.json() if r3.status_code == 200 else {}
_assert(body3.get("already_joined") is True, "T3.2 normalized to existing record (already_joined=True)", f"body={body3}")
_assert(body3.get("position") == position_first, "T3.3 same position after normalization", f"first={position_first} norm={body3.get('position')}")


# T4 — Invalid email → 422
print("\n[T4] POST /api/beta/waitlist -- invalid email")
r4 = requests.post(f"{API}/beta/waitlist", json={"email": "not-an-email"}, timeout=20)
_assert(r4.status_code == 422, "T4.1 invalid email returns 422", f"got {r4.status_code} body={r4.text[:200]}")
_assert("invalid_email" in r4.text or "invalid" in r4.text.lower(),
        "T4.2 422 body mentions invalid_email/invalid", f"body={r4.text[:300]}")


# T5 — Missing email → 422
print("\n[T5] POST /api/beta/waitlist -- missing email")
r5 = requests.post(f"{API}/beta/waitlist", json={}, timeout=20)
_assert(r5.status_code == 422, "T5.1 missing email returns 422", f"got {r5.status_code}")


# T6 — Phone normalization (strips spaces/dashes, keeps + and digits)
print("\n[T6] POST /api/beta/waitlist -- phone normalization")
phone_email = f"phonetest.{uuid.uuid4().hex[:8]}@mintu.in"
r6 = requests.post(f"{API}/beta/waitlist", json={
    "email": phone_email,
    "phone": "+91 98-76 54 32 10",
}, timeout=20)
_assert(r6.status_code == 200, "T6.1 status 200 with formatted phone", f"got {r6.status_code}")
_assert(r6.json().get("ok") is True, "T6.2 ok=True with formatted phone", "")


# T7 — platform_pref accepts only ios/android/either
print("\n[T7] POST /api/beta/waitlist -- platform_pref enum")
for pf in ["ios", "android", "either"]:
    em = f"plat.{pf}.{uuid.uuid4().hex[:6]}@mintu.in"
    rp = requests.post(f"{API}/beta/waitlist", json={"email": em, "platform_pref": pf}, timeout=20)
    _assert(rp.status_code == 200, f"T7.{pf} accepts platform_pref={pf}", f"got {rp.status_code}")

rbad = requests.post(f"{API}/beta/waitlist", json={
    "email": f"plat.bad.{uuid.uuid4().hex[:6]}@mintu.in",
    "platform_pref": "windows",
}, timeout=20)
_assert(rbad.status_code == 422, "T7.bad rejects platform_pref=windows with 422", f"got {rbad.status_code}")


# T8 — GET /api/beta/stats
print("\n[T8] GET /api/beta/stats")
rs = requests.get(f"{API}/beta/stats", timeout=20)
_assert(rs.status_code == 200, "T8.1 status 200", f"got {rs.status_code}")
sb = rs.json() if rs.status_code == 200 else {}
_assert("total" in sb and "display" in sb, "T8.2 has total + display keys", f"body={sb}")
_assert(isinstance(sb.get("total"), int), "T8.3 total is int", f"got {type(sb.get('total'))}")
_assert(isinstance(sb.get("display"), int), "T8.4 display is int", f"got {type(sb.get('display'))}")
expected_display = (sb.get("total", 0) // 50) * 50
_assert(sb.get("display") == expected_display,
        f"T8.5 display==floor(total/50)*50  (total={sb.get('total')}, expected display={expected_display})",
        f"got display={sb.get('display')}")


# REGRESSION — Auth (auth_v2 OTP-based)
print("\n[T9] REGRESSION -- auth_v2 OTP send/verify (9876543210 / 123456)")
phone = "9876543210"
r_send = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
_assert(r_send.status_code == 200, "T9.1 /auth/send-otp returns 200", f"got {r_send.status_code} body={r_send.text[:200]}")
r_verify = requests.post(f"{API}/auth/verify-otp", json={
    "phone": phone, "otp": "123456",
    "device_id": "sdet-cli", "device_name": "SDET", "os": "web",
}, timeout=20)
_assert(r_verify.status_code == 200, "T9.2 /auth/verify-otp returns 200", f"got {r_verify.status_code} body={r_verify.text[:200]}")
token = ""
if r_verify.status_code == 200:
    token = r_verify.json().get("access_token", "")
_assert(bool(token) and len(token) > 50, "T9.3 access_token issued", f"len={len(token)}")

H = {"Authorization": f"Bearer {token}"} if token else {}


# T10 — POST /api/notifications/register-token (auth required)
print("\n[T10] REGRESSION -- POST /api/notifications/register-token")
rn1 = requests.post(f"{API}/notifications/register-token",
                    json={"push_token": "ExponentPushToken[abc]"}, timeout=20)
_assert(rn1.status_code in (401, 403), "T10.1 401/403 without auth", f"got {rn1.status_code}")
rn2 = requests.post(f"{API}/notifications/register-token",
                    headers=H, json={"push_token": "ExponentPushToken[sdet-test]"}, timeout=20)
_assert(rn2.status_code == 200, "T10.2 200 with bearer + push_token", f"got {rn2.status_code} body={rn2.text[:200]}")


# T11 — POST /api/notifications/send-test (auth required)
print("\n[T11] REGRESSION -- POST /api/notifications/send-test")
rs1 = requests.post(f"{API}/notifications/send-test", timeout=20)
_assert(rs1.status_code in (401, 403), "T11.1 401/403 without auth", f"got {rs1.status_code}")
rs2 = requests.post(f"{API}/notifications/send-test", headers=H, timeout=20)
_assert(rs2.status_code == 200, "T11.2 200 with bearer", f"got {rs2.status_code} body={rs2.text[:200]}")
sb2 = rs2.json() if rs2.status_code == 200 else {}
_assert("sent" in sb2 and "message" in sb2, "T11.3 has sent + message keys", f"body={sb2}")


# T12 — GET /api/intelligence/mood-score (auth required)
print("\n[T12] REGRESSION -- GET /api/intelligence/mood-score")
rm1 = requests.get(f"{API}/intelligence/mood-score", timeout=20)
_assert(rm1.status_code in (401, 403), "T12.1 401/403 without auth", f"got {rm1.status_code}")
rm2 = requests.get(f"{API}/intelligence/mood-score", headers=H, timeout=20)
_assert(rm2.status_code == 200, "T12.2 200 with bearer", f"got {rm2.status_code} body={rm2.text[:300]}")
mb = rm2.json() if rm2.status_code == 200 else {}
_assert("score" in mb or "mood_score" in mb or "band" in mb,
        "T12.3 response has score/mood_score/band key", f"body={json.dumps(mb)[:300]}")


print("\n=========================================================")
print(f"PASS={PASS}  FAIL={FAIL}")
if FAILURES:
    print("\nFAILURES:")
    for f in FAILURES:
        print(f"  - {f}")
sys.exit(0 if FAIL == 0 else 1)
