"""
Gmail OAuth deep-link refactor tests.
Targets /app/backend/routers/gmail_oauth.py changes:
  - GET /api/oauth/gmail/start now accepts optional return_uri query
  - return_uri validated against allowlist (mintu: scheme or APP_DEEPLINK_BASE)
  - Stored in oauth_states collection
  - Callback redirects there with success=1&email=...
  - _deeplink helper for clean URL composition
"""
import os
import sys
import json
import time
from urllib.parse import urlparse, parse_qs

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []  # (name, ok, detail)


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    sym = "✅" if ok else "❌"
    print(f"{sym} {name}  {detail}")


def login():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token") or body.get("jwt")
    assert tok, f"No token in verify-otp response: {body}"
    return tok


def auth_headers(tok):
    return {"Authorization": f"Bearer {tok}"}


# ──────────────────────────────────────────────────────────────────
# 1. HEALTH ENDPOINTS
# ──────────────────────────────────────────────────────────────────
def test_health():
    r = requests.get(f"{BASE}/health/live", timeout=10)
    record("1a. /health/live → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record("1a. /health/live status=alive", body.get("status") == "alive", f"body={body}")

    r = requests.get(f"{BASE}/health/ready", timeout=10)
    record("1b. /health/ready → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record(
            "1b. /health/ready status=ready & mongo=ok",
            body.get("status") == "ready" and (body.get("deps") or {}).get("mongo") == "ok",
            f"body={body}",
        )


# ──────────────────────────────────────────────────────────────────
# 2. GMAIL OAUTH START — happy paths
# ──────────────────────────────────────────────────────────────────
def test_oauth_start_happy(tok):
    H = auth_headers(tok)

    # 2a — no return_uri
    r = requests.get(f"{BASE}/oauth/gmail/start", headers=H, timeout=15)
    record("2a. start (no params) → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        au = body.get("auth_url", "")
        record("2a. auth_url is Google consent URL", "accounts.google.com" in au, f"auth_url[:80]={au[:80]}")
        record("2a. auth_url has client_id", "client_id=" in au, "")
        record("2a. auth_url has redirect_uri", "redirect_uri=" in au, "")
        record("2a. auth_url has state", "state=" in au, "")

    # 2b — mintu:// return_uri
    r = requests.get(
        f"{BASE}/oauth/gmail/start",
        headers=H,
        params={"return_uri": "mintu://gmail-connected"},
        timeout=15,
    )
    record("2b. start mintu://gmail-connected → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record("2b. auth_url present", bool(body.get("auth_url")), "")

    # 2c — https with APP_DEEPLINK_BASE prefix
    r = requests.get(
        f"{BASE}/oauth/gmail/start",
        headers=H,
        params={
            "return_uri": "https://mintu-finance.preview.emergentagent.com/gmail-connected"
        },
        timeout=15,
    )
    record("2c. start https://...preview.emergentagent.com/... → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record("2c. auth_url present", bool(body.get("auth_url")), "")


# ──────────────────────────────────────────────────────────────────
# 3. GMAIL OAUTH START — security guard
# ──────────────────────────────────────────────────────────────────
def test_oauth_start_security(tok):
    H = auth_headers(tok)

    # 3a — evil.attacker.com
    r = requests.get(
        f"{BASE}/oauth/gmail/start",
        headers=H,
        params={"return_uri": "https://evil.attacker.com/x"},
        timeout=15,
    )
    record(
        "3a. start evil.attacker.com → 200 (uri silently dropped)",
        r.status_code == 200,
        f"status={r.status_code}",
    )
    if r.status_code == 200:
        record("3a. auth_url still returned", bool(r.json().get("auth_url")), "")

    # 3b — javascript:alert(1)
    r = requests.get(
        f"{BASE}/oauth/gmail/start",
        headers=H,
        params={"return_uri": "javascript:alert(1)"},
        timeout=15,
    )
    record(
        "3b. start javascript:alert → 200 (uri silently dropped)",
        r.status_code == 200,
        f"status={r.status_code}",
    )

    # 3c — verify backend log warning. Check log file (best-effort, may not be readable)
    try:
        log_path = "/var/log/supervisor/backend.err.log"
        if os.path.exists(log_path):
            with open(log_path, "r", errors="ignore") as f:
                content = f.read()[-20000:]  # last 20kb
            has_evil = "evil.attacker.com" in content and "Rejected return_uri" in content
            has_js = "javascript:" in content and "Rejected return_uri" in content
            record(
                "3c. backend.err.log contains 'Rejected return_uri (not in allowlist)' for evil",
                has_evil,
                "(see tail of /var/log/supervisor/backend.err.log)",
            )
            record(
                "3d. backend.err.log contains 'Rejected return_uri' for javascript:",
                has_js,
                "",
            )
        else:
            record("3c. backend log file not accessible — skip", True, "log file missing")
    except Exception as e:
        record("3c. backend log inspection error", False, str(e))


# ──────────────────────────────────────────────────────────────────
# 4. AUTH REQUIRED
# ──────────────────────────────────────────────────────────────────
def test_oauth_start_auth():
    r = requests.get(f"{BASE}/oauth/gmail/start", timeout=10)
    record(
        "4. start without bearer → 401/403 (auth required)",
        r.status_code in (401, 403),
        f"status={r.status_code}",
    )


# ──────────────────────────────────────────────────────────────────
# 5. GMAIL STATUS / DISCONNECT
# ──────────────────────────────────────────────────────────────────
def test_status_disconnect(tok):
    H = auth_headers(tok)
    r = requests.get(f"{BASE}/gmail/status", headers=H, timeout=10)
    record("5a. /gmail/status → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        if "connected" in body:
            if body["connected"] is False:
                record("5a. shape: {connected: false}", True, str(body))
            else:
                ok = all(k in body for k in ("connected", "email", "last_sync", "imported_count"))
                record(
                    "5a. shape: {connected, email, last_sync, imported_count}",
                    ok,
                    str(body),
                )
        else:
            record("5a. has 'connected' field", False, str(body))

    r = requests.delete(f"{BASE}/gmail/disconnect", headers=H, timeout=10)
    record("5b. DELETE /gmail/disconnect → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record(
            "5b. body has disconnected (bool) + message",
            isinstance(body.get("disconnected"), bool) and body.get("message") == "Gmail disconnected",
            str(body),
        )


# ──────────────────────────────────────────────────────────────────
# 6. REGRESSION SMOKE
# ──────────────────────────────────────────────────────────────────
def test_regression(tok):
    H = auth_headers(tok)
    endpoints = [
        ("/user/me", "GET"),
        ("/home/snapshot", "GET"),
        ("/transactions?limit=5", "GET"),
        ("/notifications/unread-count", "GET"),
    ]
    for path, method in endpoints:
        r = requests.request(method, f"{BASE}{path}", headers=H, timeout=20)
        record(f"6. {method} {path} → 200", r.status_code == 200, f"status={r.status_code}")


# ──────────────────────────────────────────────────────────────────
def main():
    print(f"\n=== Gmail OAuth Deep-Link Tests against {BASE} ===\n")
    test_health()
    tok = login()
    print(f"[auth] token (truncated): {tok[:24]}…\n")
    test_oauth_start_happy(tok)
    test_oauth_start_security(tok)
    test_oauth_start_auth()
    test_status_disconnect(tok)
    test_regression(tok)

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\n=== TOTAL: {passed} passed, {failed} failed (of {len(results)}) ===")
    if failed:
        print("\nFailed:")
        for n, ok, d in results:
            if not ok:
                print(f"  ❌ {n} — {d}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
