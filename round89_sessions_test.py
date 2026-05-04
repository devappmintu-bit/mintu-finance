#!/usr/bin/env python3
"""
Round 89 — Per-session revoke endpoints test.

Tests:
  - GET    /api/auth/sessions
  - DELETE /api/auth/sessions/{session_id}

Plus regression on existing Auth V2 endpoints.
"""
import json
import os
import sys
import time
import uuid

import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001") + "/api"
PHONE_A = "9876543210"
PHONE_B = "9876543211"
OTP = "123456"

_results = []


def _record(name: str, passed: bool, detail: str = ""):
    flag = "✅" if passed else "❌"
    _results.append((flag, name, detail))
    print(f"{flag} {name} :: {detail}")


def _send_otp(phone: str):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=15)
    return r


def _verify_otp(phone: str, device_id: str, device_name: str, os_name: str, name: str = "Test User"):
    body = {
        "phone": phone,
        "otp": OTP,
        "name": name,
        "device_id": device_id,
        "device_name": device_name,
        "os": os_name,
    }
    r = requests.post(f"{BASE}/auth/verify-otp", json=body, timeout=15)
    return r


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(phone: str, device_id: str, device_name: str, os_name: str):
    """Send + verify OTP. Returns the verify-otp JSON dict."""
    r = _send_otp(phone)
    if r.status_code != 200:
        raise RuntimeError(f"send-otp {phone} failed: {r.status_code} {r.text}")
    # respect rate limiting
    time.sleep(0.5)
    r = _verify_otp(phone, device_id, device_name, os_name)
    if r.status_code != 200:
        raise RuntimeError(f"verify-otp {phone} failed: {r.status_code} {r.text}")
    return r.json()


def main():
    print(f"\n=== Round 89 sessions test against {BASE} ===\n")

    # ── Step 0 — login user A from device 1 ────────────────────────────
    dev1 = f"dev1-{uuid.uuid4().hex[:8]}"
    dev2 = f"dev2-{uuid.uuid4().hex[:8]}"

    a1 = login(PHONE_A, dev1, "iPhone 15 Pro", "iOS 17")
    access_a1 = a1.get("access_token")
    refresh_a1 = a1.get("refresh_token")
    _record(
        "Login A device1: access_token + refresh_token returned",
        bool(access_a1) and bool(refresh_a1),
        f"access_len={len(access_a1 or '')} refresh_len={len(refresh_a1 or '')}",
    )
    user_a_id = a1.get("user", {}).get("id")

    # Step 0b — login user A again from device 2
    time.sleep(31)  # send-otp rate-limit is 30s per phone
    a2 = login(PHONE_A, dev2, "Pixel 8", "Android 14")
    access_a2 = a2.get("access_token")
    refresh_a2 = a2.get("refresh_token")
    _record(
        "Login A device2: access_token + refresh_token returned",
        bool(access_a2) and bool(refresh_a2),
        f"device_id={dev2}",
    )

    # ── Test 1: GET /api/auth/sessions returns BOTH sessions ───────────
    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_a2), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    sessions = body.get("sessions", [])
    devices = body.get("devices", [])
    _record(
        "T1 GET /auth/sessions → 200 with sessions+devices keys",
        r.status_code == 200 and "sessions" in body and "devices" in body,
        f"status={r.status_code} sessions={len(sessions)} devices={len(devices)}",
    )
    dev_ids = {s.get("device_id") for s in sessions}
    _record(
        "T1 Both device_ids present in sessions list",
        dev1 in dev_ids and dev2 in dev_ids,
        f"got={sorted(dev_ids)} expected_includes={[dev1, dev2]}",
    )

    # Pick the dev1 session id (so we revoke device1 using device2's access token)
    target_session = next((s for s in sessions if s.get("device_id") == dev1), None)
    target_id = target_session.get("id") if target_session else None
    _record(
        "T1 Found session id for device1",
        bool(target_id),
        f"session_id={target_id}",
    )

    # ── Test 2: DELETE one session — only the other remains ───────────
    r = requests.delete(f"{BASE}/auth/sessions/{target_id}", headers=_bearer(access_a2), timeout=15)
    rb = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    _record(
        "T2 DELETE /auth/sessions/{id} → 200 {revoked:true}",
        r.status_code == 200 and rb.get("revoked") is True,
        f"status={r.status_code} body={rb}",
    )

    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_a2), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    sessions = body.get("sessions", [])
    remaining = {s.get("device_id") for s in sessions}
    _record(
        "T2 Follow-up GET — only device2 remains",
        r.status_code == 200 and dev1 not in remaining and dev2 in remaining and len(sessions) == 1,
        f"status={r.status_code} remaining={sorted(remaining)}",
    )

    # ── Test 3: DELETE invalid session_id (non-ObjectId) ──────────────
    r = requests.delete(f"{BASE}/auth/sessions/not-an-objectid", headers=_bearer(access_a2), timeout=15)
    rb = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    _record(
        "T3 DELETE invalid id → 200 {revoked:false} (no 500)",
        r.status_code == 200 and rb.get("revoked") is False,
        f"status={r.status_code} body={rb}",
    )

    # ── Test 4: DELETE valid-looking but nonexistent ObjectId ─────────
    fake_oid = "0123456789abcdef01234567"
    r = requests.delete(f"{BASE}/auth/sessions/{fake_oid}", headers=_bearer(access_a2), timeout=15)
    rb = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    _record(
        "T4 DELETE non-existent ObjectId → 200 {revoked:false}",
        r.status_code == 200 and rb.get("revoked") is False,
        f"status={r.status_code} body={rb}",
    )

    # ── Test 5: cross-user revoke must fail (ownership enforced) ──────
    # Sign in user B from a fresh device
    time.sleep(31)
    devB = f"devB-{uuid.uuid4().hex[:8]}"
    b1 = login(PHONE_B, devB, "OnePlus 12", "Android 14")
    access_b = b1.get("access_token")
    user_b_id = b1.get("user", {}).get("id")
    _record(
        "T5 setup: login user B",
        bool(access_b) and user_b_id != user_a_id,
        f"user_b={user_b_id}",
    )

    # Get B's sessions, grab a session id
    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_b), timeout=15)
    bsess = r.json().get("sessions", []) if r.status_code == 200 else []
    b_session_id = bsess[0].get("id") if bsess else None
    _record(
        "T5 setup: user B has ≥1 active session",
        bool(b_session_id),
        f"sessions={len(bsess)} first_id={b_session_id}",
    )

    # User A's access token tries to delete user B's session → must NOT revoke
    r = requests.delete(f"{BASE}/auth/sessions/{b_session_id}", headers=_bearer(access_a2), timeout=15)
    rb = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    _record(
        "T5 cross-user revoke → {revoked:false}",
        r.status_code == 200 and rb.get("revoked") is False,
        f"status={r.status_code} body={rb}",
    )

    # Verify B's session is still alive
    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_b), timeout=15)
    bsess_after = r.json().get("sessions", []) if r.status_code == 200 else []
    b_ids_after = {s.get("id") for s in bsess_after}
    _record(
        "T5 user B's session survived attempted cross-user revoke",
        b_session_id in b_ids_after,
        f"b_sessions_after={len(bsess_after)}",
    )

    # ── Regression: refresh rotation ───────────────────────────────────
    r = requests.post(
        f"{BASE}/auth/refresh",
        json={"refresh_token": refresh_a2, "device_id": dev2, "device_name": "Pixel 8", "os": "Android 14"},
        timeout=15,
    )
    rj = r.json() if r.status_code == 200 else {}
    new_access = rj.get("access_token")
    new_refresh = rj.get("refresh_token")
    _record(
        "REG /auth/refresh — rotates and returns new pair",
        r.status_code == 200 and bool(new_access) and bool(new_refresh) and new_refresh != refresh_a2,
        f"status={r.status_code} refresh_rotated={new_refresh != refresh_a2}",
    )
    # use rotated token going forward for user A
    access_a2 = new_access
    refresh_a2 = new_refresh

    # ── Regression: GET /auth/me ───────────────────────────────────────
    r = requests.get(f"{BASE}/auth/me", headers=_bearer(access_a2), timeout=15)
    me_body = r.json() if r.status_code == 200 else {}
    _record(
        "REG GET /auth/me — returns user+sessions+devices",
        r.status_code == 200 and "user" in me_body and "sessions" in me_body and "devices" in me_body,
        f"status={r.status_code} keys={list(me_body.keys())}",
    )

    # ── Test 7/8: auth-guard checks ────────────────────────────────────
    r = requests.get(f"{BASE}/auth/sessions", timeout=15)
    _record(
        "T7 GET /auth/sessions without bearer → 401 (or 422)",
        r.status_code in (401, 422),
        f"status={r.status_code}",
    )
    r = requests.delete(f"{BASE}/auth/sessions/{fake_oid}", timeout=15)
    _record(
        "T8 DELETE /auth/sessions/{id} without bearer → 401 (or 422)",
        r.status_code in (401, 422),
        f"status={r.status_code}",
    )

    # ── Regression: single-device logout via refresh body ─────────────
    # Use user B's refresh token (we still have it from login)
    refresh_b = b1.get("refresh_token")
    r = requests.post(f"{BASE}/auth/logout", json={"refresh_token": refresh_b}, timeout=15)
    rb = r.json() if r.status_code == 200 else {}
    _record(
        "REG POST /auth/logout — single-device revoke via refresh body",
        r.status_code == 200 and rb.get("revoked") is True,
        f"status={r.status_code} body={rb}",
    )

    # B should now have 0 active sessions
    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_b), timeout=15)
    # access_b is a JWT independent of refresh; might still validate or might not
    # If still valid (15-min JWT), expect 0 active sessions returned
    if r.status_code == 200:
        _record(
            "REG B sessions after logout → empty",
            len(r.json().get("sessions", [])) == 0,
            f"sessions={len(r.json().get('sessions', []))}",
        )
    else:
        _record(
            "REG B sessions after logout → 401/expected",
            r.status_code in (401, 403),
            f"status={r.status_code}",
        )

    # ── Test 6: logout-all then GET /auth/sessions → empty ────────────
    r = requests.post(f"{BASE}/auth/logout-all", headers=_bearer(access_a2), timeout=15)
    rb = r.json() if r.status_code == 200 else {}
    _record(
        "T6 POST /auth/logout-all → 200 with revoked count",
        r.status_code == 200 and isinstance(rb.get("revoked"), int),
        f"status={r.status_code} body={rb}",
    )

    r = requests.get(f"{BASE}/auth/sessions", headers=_bearer(access_a2), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    sessions = body.get("sessions", [])
    _record(
        "T6 GET /auth/sessions after logout-all → sessions=[]",
        r.status_code == 200 and sessions == [],
        f"status={r.status_code} sessions={len(sessions)}",
    )

    # Cleanup — log out user B fully too (idempotent)
    # access_b is JWT; we already revoked their session via /auth/logout above
    # but if a B logged in earlier left other sessions, kill them:
    try:
        r = requests.post(f"{BASE}/auth/logout-all", headers=_bearer(access_b), timeout=15)
    except Exception:
        pass

    # ── Summary ────────────────────────────────────────────────────────
    print("\n=== SUMMARY ===")
    fails = [r for r in _results if r[0] == "❌"]
    for flag, name, det in _results:
        print(f"  {flag} {name}")
    print(f"\n{len(_results) - len(fails)}/{len(_results)} passed; {len(fails)} failed")
    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
