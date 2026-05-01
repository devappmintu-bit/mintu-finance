"""Round 54b smoke test — Structured JSON logging + access middleware."""
import json
import re
import time
import uuid
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def login() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body.get("access_token")


def assert_xrid(resp, label: str):
    rid = resp.headers.get("X-Request-Id") or resp.headers.get("x-request-id")
    assert rid, f"{label}: missing X-Request-Id header. Headers: {dict(resp.headers)}"
    assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", rid, re.I), \
        f"{label}: X-Request-Id not UUID format: {rid}"
    return rid


def main():
    results = []

    # 1. Health probes 200
    r = requests.get(f"{BASE}/health/live", timeout=10)
    results.append(("GET /api/health/live", r.status_code == 200, r.status_code))
    r = requests.get(f"{BASE}/health/ready", timeout=10)
    deps_ok = False
    try:
        deps_ok = r.json().get("deps", {}).get("mongo") == "ok"
    except Exception:
        pass
    results.append(("GET /api/health/ready (deps.mongo=ok)", r.status_code == 200 and deps_ok, f"{r.status_code} mongo={deps_ok}"))

    # 2. X-Request-Id on /api/health
    r = requests.get(f"{BASE}/health", timeout=10)
    rid_health = None
    if r.status_code == 200:
        try:
            rid_health = assert_xrid(r, "/api/health")
            results.append(("GET /api/health → 200 + X-Request-Id (UUID)", True, f"rid={rid_health[:8]}"))
        except AssertionError as e:
            results.append(("GET /api/health → 200 + X-Request-Id (UUID)", False, str(e)))
    else:
        results.append(("GET /api/health", False, f"status={r.status_code}"))

    # Auth
    token = login()
    headers = {"Authorization": f"Bearer {token}"}
    results.append(("POST /api/auth/send-otp + verify-otp", bool(token), "token obtained" if token else "no token"))

    r = requests.get(f"{BASE}/user/me", headers=headers, timeout=10)
    rid_me = None
    if r.status_code == 200:
        try:
            rid_me = assert_xrid(r, "/api/user/me")
            results.append(("GET /api/user/me → 200 + X-Request-Id", True, f"rid={rid_me[:8]}"))
        except AssertionError as e:
            results.append(("GET /api/user/me → 200 + X-Request-Id", False, str(e)))
    else:
        results.append(("GET /api/user/me", False, f"status={r.status_code}"))

    # Hit a few more times to populate logs
    for _ in range(3):
        requests.get(f"{BASE}/user/me", headers=headers, timeout=10)

    # 4. Regression smoke
    smoke = [
        ("GET /api/home/snapshot", requests.get(f"{BASE}/home/snapshot", headers=headers, timeout=20)),
        ("GET /api/transactions?limit=5", requests.get(f"{BASE}/transactions?limit=5", headers=headers, timeout=15)),
        ("GET /api/notifications/unread-count", requests.get(f"{BASE}/notifications/unread-count", headers=headers, timeout=10)),
        ("GET /api/oauth/gmail/start", requests.get(f"{BASE}/oauth/gmail/start", headers=headers, timeout=10)),
        ("GET /api/gmail/status", requests.get(f"{BASE}/gmail/status", headers=headers, timeout=10)),
    ]
    for label, r in smoke:
        ok = r.status_code == 200
        extra = ""
        if "oauth/gmail/start" in label and ok:
            try:
                au = r.json().get("auth_url")
                extra = f" auth_url={'yes' if au else 'no'}"
                ok = ok and bool(au)
            except Exception:
                ok = False
        results.append((label, ok, f"status={r.status_code}{extra}"))

    print("\n=== ROUND 54b SMOKE RESULTS ===\n")
    passed = 0
    for label, ok, info in results:
        mark = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print(f"[{mark}] {label} :: {info}")
    print(f"\n{passed}/{len(results)} assertions passed")
    return rid_me


if __name__ == "__main__":
    rid = main()
    print(f"\nLast /api/user/me request_id: {rid}")
