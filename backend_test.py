"""
Round 89c — Setu Account Aggregator MOCKED endpoint tests.

Covers:
  A) Public GET /setu/status
  B) Happy path (init → poll → fetch 409 → callback → poll → fetch 200 → accounts)
  C) Ownership isolation (user B cannot read user A's consent)
  D) Auth guard on all non-/status endpoints
  E) Regression on /auth/sessions (GET + DELETE) from Round 89
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

import requests

# Read backend URL from frontend/.env (EXPO_PUBLIC_BACKEND_URL)
ENV_FILE = Path("/app/frontend/.env")
BASE = None
for line in ENV_FILE.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE = line.split("=", 1)[1].strip().strip('"')
        break
if not BASE:
    print("ERROR: could not find EXPO_PUBLIC_BACKEND_URL")
    sys.exit(1)

API = f"{BASE}/api"
print(f"Testing against: {API}")

PHONE_A = "9876543210"
PHONE_B = "9876543211"
OTP = "123456"


passed: list[str] = []
failed: list[tuple[str, str]] = []


def ok(name: str):
    passed.append(name)
    print(f"  ✅ {name}")


def bad(name: str, reason: str):
    failed.append((name, reason))
    print(f"  ❌ {name} — {reason}")


def sign_in(phone: str) -> tuple[str, str, str | None]:
    """Return (access_token_or_token, user_id, refresh_token)."""
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"send-otp failed for {phone}: {r.status_code} {r.text}")

    device_id = f"dev_{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={
            "phone": phone,
            "otp": OTP,
            "name": "Test User" if phone == PHONE_A else "Second User",
            "device_id": device_id,
            "device_name": "pytest",
            "os": "linux",
        },
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"verify-otp failed for {phone}: {r.status_code} {r.text}")
    body = r.json()
    # Prefer access_token (Auth V2) but fall back to legacy `token`
    tok = body.get("access_token") or body.get("token")
    if not tok:
        raise RuntimeError(f"no token in verify-otp response: {body}")
    return tok, body["user"]["id"], body.get("refresh_token")


def auth_headers(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ═══════════════════════════════════════════════════════════════════
# A) Public /setu/status
# ═══════════════════════════════════════════════════════════════════
print("\n[A] Public GET /setu/status")
try:
    r = requests.get(f"{API}/setu/status", timeout=15)
    if r.status_code != 200:
        bad("A1 status 200", f"got {r.status_code} {r.text[:200]}")
    else:
        ok("A1 status 200")
        body = r.json()
        if body.get("live") is False:
            ok("A2 live=false")
        else:
            bad("A2 live=false", f"got live={body.get('live')!r}")
        if body.get("mock") is True:
            ok("A3 mock=true")
        else:
            bad("A3 mock=true", f"got mock={body.get('mock')!r}")
        if body.get("base_url") is None:
            ok("A4 base_url=null")
        else:
            bad("A4 base_url=null", f"got base_url={body.get('base_url')!r}")
except Exception as e:
    bad("A public status", str(e))


# ═══════════════════════════════════════════════════════════════════
# B) Happy path
# ═══════════════════════════════════════════════════════════════════
print("\n[B] Happy path as user A")
tok_a, uid_a, refresh_a = sign_in(PHONE_A)
ok(f"B0 signed in as {PHONE_A} uid={uid_a[:8]}…")

H = auth_headers(tok_a)
consent_id = None

# B1 POST /setu/consent/init
r = requests.post(f"{API}/setu/consent/init", json={}, headers=H, timeout=30)
if r.status_code != 200:
    bad("B1 consent/init 200", f"got {r.status_code} {r.text[:200]}")
else:
    body = r.json()
    consent_id = body.get("consent_id")
    if consent_id and body.get("status") == "PENDING" and body.get("consent_handle") and body.get("redirect_url") and body.get("expires_at"):
        ok(f"B1 consent/init PENDING consent_id={consent_id}")
    else:
        bad("B1 consent/init response shape", f"body={body}")

if not consent_id:
    print("  ⛔ Aborting happy path — no consent_id")
else:
    # B2 GET /setu/consent/{id} — PENDING
    r = requests.get(f"{API}/setu/consent/{consent_id}", headers=H, timeout=15)
    if r.status_code == 200 and r.json().get("status") == "PENDING" and r.json().get("consent_id") == consent_id:
        ok("B2 consent/{id} returns PENDING doc")
    else:
        bad("B2 consent/{id} PENDING", f"got {r.status_code} {r.text[:200]}")

    # B3 POST /setu/fi-data/fetch → 409 (no active consent)
    r = requests.post(f"{API}/setu/fi-data/fetch", headers=H, timeout=15)
    if r.status_code == 409:
        ok("B3 fi-data/fetch returns 409 when no active consent")
    else:
        bad("B3 fi-data/fetch 409", f"got {r.status_code} {r.text[:200]}")

    # B4 POST /setu/consent/callback → ACTIVE
    r = requests.post(f"{API}/setu/consent/callback", json={"consent_id": consent_id}, headers=H, timeout=15)
    if r.status_code == 200:
        b = r.json()
        if b.get("ok") is True and b.get("status") == "ACTIVE":
            ok("B4 consent/callback flips to ACTIVE")
        else:
            bad("B4 consent/callback payload", f"body={b}")
    else:
        bad("B4 consent/callback 200", f"got {r.status_code} {r.text[:200]}")

    # B5 GET /setu/consent/{id} — ACTIVE
    r = requests.get(f"{API}/setu/consent/{consent_id}", headers=H, timeout=15)
    if r.status_code == 200 and r.json().get("status") == "ACTIVE":
        ok("B5 consent/{id} now ACTIVE")
    else:
        bad("B5 consent/{id} ACTIVE", f"got {r.status_code} {r.text[:200]}")

    # B6 POST /setu/fi-data/fetch → 200 with 2 accounts + 3 txns
    r = requests.post(f"{API}/setu/fi-data/fetch", headers=H, timeout=15)
    if r.status_code == 200:
        b = r.json()
        accs = b.get("accounts", [])
        txns = b.get("transactions", [])
        if len(accs) == 2 and len(txns) == 3:
            ok(f"B6 fi-data/fetch returns 2 accounts + 3 txns")
        else:
            bad("B6 fi-data/fetch counts", f"accounts={len(accs)} txns={len(txns)}")
        if b.get("last_synced_at"):
            ok("B6b last_synced_at present")
        else:
            bad("B6b last_synced_at", f"missing in {b}")
        # Check shapes
        if accs and all(k in accs[0] for k in ("id", "masked_acc_number", "bank", "account_type", "linked_at")):
            ok("B6c account shape correct")
        else:
            bad("B6c account shape", f"accs[0]={accs[0] if accs else None}")
    else:
        bad("B6 fi-data/fetch 200", f"got {r.status_code} {r.text[:200]}")

    # B7 GET /setu/accounts → connected=true
    r = requests.get(f"{API}/setu/accounts", headers=H, timeout=15)
    if r.status_code == 200:
        b = r.json()
        if b.get("connected") is True and isinstance(b.get("accounts"), list) and len(b["accounts"]) == 2:
            ok("B7 /setu/accounts connected=true, 2 accounts")
        else:
            bad("B7 /setu/accounts shape", f"body={b}")
    else:
        bad("B7 /setu/accounts 200", f"got {r.status_code} {r.text[:200]}")


# ═══════════════════════════════════════════════════════════════════
# C) Ownership — user B cannot read user A's consent
# ═══════════════════════════════════════════════════════════════════
print("\n[C] Ownership isolation")
try:
    tok_b, uid_b, refresh_b = sign_in(PHONE_B)
    ok(f"C0 signed in as {PHONE_B} uid={uid_b[:8]}…")
    H_b = auth_headers(tok_b)
    if consent_id:
        r = requests.get(f"{API}/setu/consent/{consent_id}", headers=H_b, timeout=15)
        if r.status_code == 404:
            ok("C1 user B gets 404 on user A's consent_id")
        else:
            bad("C1 ownership 404", f"got {r.status_code} {r.text[:200]}")
        # Also verify /setu/accounts for user B — no active consent → connected=false
        r = requests.get(f"{API}/setu/accounts", headers=H_b, timeout=15)
        if r.status_code == 200 and r.json().get("connected") is False and r.json().get("accounts") == []:
            ok("C2 user B /setu/accounts connected=false")
        else:
            bad("C2 user B accounts", f"got {r.status_code} {r.text[:200]}")
        # User B tries to flip user A's consent via callback → should 404
        r = requests.post(f"{API}/setu/consent/callback", json={"consent_id": consent_id}, headers=H_b, timeout=15)
        if r.status_code == 404:
            ok("C3 user B cannot activate user A's consent (404)")
        else:
            bad("C3 user B callback on other consent", f"got {r.status_code} {r.text[:200]}")
except Exception as e:
    bad("C ownership setup", str(e))


# ═══════════════════════════════════════════════════════════════════
# D) Auth guard on non-/status endpoints
# ═══════════════════════════════════════════════════════════════════
print("\n[D] Auth guard")
cases = [
    ("POST", "/setu/consent/init", {}),
    ("GET", f"/setu/consent/anything", None),
    ("POST", "/setu/consent/callback", {"consent_id": "x"}),
    ("POST", "/setu/fi-data/fetch", None),
    ("GET", "/setu/accounts", None),
]
for method, path, body in cases:
    try:
        if method == "POST":
            r = requests.post(f"{API}{path}", json=(body or {}), timeout=15)
        else:
            r = requests.get(f"{API}{path}", timeout=15)
        if r.status_code in (401, 403):
            ok(f"D {method} {path} → {r.status_code}")
        else:
            bad(f"D {method} {path} guard", f"got {r.status_code} body={r.text[:200]}")
    except Exception as e:
        bad(f"D {method} {path}", str(e))


# ═══════════════════════════════════════════════════════════════════
# E) Regression — Round 89 /auth/sessions endpoints
# ═══════════════════════════════════════════════════════════════════
print("\n[E] Regression /auth/sessions")
try:
    r = requests.get(f"{API}/auth/sessions", headers=H, timeout=15)
    if r.status_code == 200:
        b = r.json()
        if isinstance(b, dict) and "sessions" in b and "devices" in b:
            ok(f"E1 GET /auth/sessions 200 (sessions={len(b['sessions'])}, devices={len(b['devices'])})")
            sessions = b["sessions"]
            # Try deleting the FIRST session if exists and not current
            if sessions:
                sid = sessions[0].get("id") or sessions[0].get("session_id")
                if sid:
                    r2 = requests.delete(f"{API}/auth/sessions/{sid}", headers=H, timeout=15)
                    if r2.status_code == 200 and "revoked" in r2.json():
                        ok(f"E2 DELETE /auth/sessions/{{id}} 200, revoked={r2.json()['revoked']}")
                    else:
                        bad("E2 DELETE /auth/sessions/{id}", f"got {r2.status_code} {r2.text[:200]}")
                else:
                    bad("E2 session id shape", f"no id/session_id in {sessions[0]}")
            else:
                # Empty sessions is OK — at least GET works; try a bogus id to verify 200 idempotent
                r2 = requests.delete(f"{API}/auth/sessions/nonexistent_{uuid.uuid4().hex}", headers=H, timeout=15)
                if r2.status_code == 200:
                    ok(f"E2 DELETE bogus id idempotent 200, revoked={r2.json().get('revoked')}")
                else:
                    bad("E2 DELETE bogus id", f"got {r2.status_code} {r2.text[:200]}")
        else:
            bad("E1 /auth/sessions shape", f"body={b}")
    else:
        bad("E1 GET /auth/sessions 200", f"got {r.status_code} {r.text[:200]}")
except Exception as e:
    bad("E regression", str(e))


# ═══════════════════════════════════════════════════════════════════
# Cleanup: logout-all for both users
# ═══════════════════════════════════════════════════════════════════
print("\n[Cleanup] logout-all")
try:
    r = requests.post(f"{API}/auth/logout-all", headers=H, timeout=15)
    print(f"  user A logout-all → {r.status_code} revoked={r.json().get('revoked') if r.ok else 'err'}")
except Exception as e:
    print(f"  user A logout-all err: {e}")

try:
    r = requests.post(f"{API}/auth/logout-all", headers=auth_headers(tok_b), timeout=15)
    print(f"  user B logout-all → {r.status_code} revoked={r.json().get('revoked') if r.ok else 'err'}")
except Exception:
    pass


# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print(f"PASSED: {len(passed)}")
print(f"FAILED: {len(failed)}")
if failed:
    print("\nFailed assertions:")
    for name, reason in failed:
        print(f"  ❌ {name}: {reason}")
    sys.exit(1)
else:
    print("\n🎉 All Round 89c assertions passed.")
