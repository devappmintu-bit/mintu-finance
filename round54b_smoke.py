#!/usr/bin/env python3
"""Round 54b smoke test — verify request.state.user_id wiring."""
import os
import json
import time
import re
import requests
import subprocess

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

OUT_LOG = "/var/log/supervisor/backend.out.log"
ERR_LOG = "/var/log/supervisor/backend.err.log"

results = []


def record(name, ok, detail=""):
    status = "✅" if ok else "❌"
    print(f"{status} {name}: {detail}")
    results.append((name, ok, detail))


def tail_log(path, n=300):
    try:
        out = subprocess.check_output(["tail", "-n", str(n), path]).decode()
        return out
    except Exception as e:
        return f"[err reading {path}: {e}]"


def find_access_log_for_route(route_substr, since_ts=None, method=None, status=None):
    """Find the most recent access log line for a given route substring."""
    content = tail_log(OUT_LOG, 1500)
    matches = []
    for line in content.splitlines():
        if '"logger":"access"' not in line and '"logger": "access"' not in line:
            continue
        try:
            # Find JSON substring
            m = re.search(r"\{.*\}", line)
            if not m:
                continue
            obj = json.loads(m.group(0))
        except Exception:
            continue
        if obj.get("logger") != "access":
            continue
        route = obj.get("route") or obj.get("path") or ""
        if route_substr not in route:
            continue
        if method and obj.get("method") != method:
            continue
        if status is not None and obj.get("status") != status:
            continue
        matches.append(obj)
    return matches


def main():
    # Clear marker — log current time for filtering
    start_ts = time.time()
    print(f"\n=== Round 54b smoke test @ {start_ts} ===\n")

    # ============ Section 1: Health endpoints ============
    r = requests.get(f"{BASE}/health/live", timeout=10)
    record("1a. GET /api/health/live → 200", r.status_code == 200, f"got {r.status_code}")

    r = requests.get(f"{BASE}/health/ready", timeout=10)
    ok = r.status_code == 200
    mongo_ok = False
    try:
        body = r.json()
        mongo_ok = body.get("deps", {}).get("mongo") == "ok"
    except Exception:
        pass
    record("1b. GET /api/health/ready → 200 & mongo=ok", ok and mongo_ok, f"status={r.status_code}, mongo_ok={mongo_ok}")

    # ============ Section 2: Auth flow ============
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=10)
    record("2a. POST /api/auth/send-otp → 200", r.status_code == 200, f"got {r.status_code}")

    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=10)
    token = None
    user_id = None
    if r.status_code == 200:
        j = r.json()
        token = j.get("token") or j.get("access_token")
        user_id = j.get("user", {}).get("id") or j.get("user_id")
    record("2b. POST /api/auth/verify-otp → 200", r.status_code == 200 and bool(token), f"status={r.status_code}, token={'set' if token else 'MISSING'}, user_id={user_id}")

    if not token:
        print("❌ FATAL — No token. Aborting further tests.")
        return

    H = {"Authorization": f"Bearer {token}"}

    # GET /api/user/me
    time.sleep(1)
    r = requests.get(f"{BASE}/user/me", headers=H, timeout=10)
    record("2c. GET /api/user/me (auth) → 200", r.status_code == 200, f"status={r.status_code}")

    # Wait briefly for log flush
    time.sleep(1.5)

    # Verify user_id in access log for /api/user/me
    matches = find_access_log_for_route("/api/user/me", method="GET", status=200)
    if matches:
        latest = matches[-1]
        uid_in_log = latest.get("user_id")
        has_real_uid = bool(uid_in_log) and isinstance(uid_in_log, str) and re.match(r"^[0-9a-fA-F]{24}$", uid_in_log)
        record("2d. Access log /api/user/me carries real user_id (24-hex)", bool(has_real_uid), f"user_id={uid_in_log} vs token_uid={user_id}")
    else:
        record("2d. Access log /api/user/me carries real user_id", False, "no access log line found for /api/user/me")

    # ============ Section 3: Pre-auth endpoints (user_id=null expected) ============
    # Check that send-otp / verify-otp log lines have user_id=null
    otp_matches = find_access_log_for_route("/api/auth/send-otp", method="POST", status=200)
    if otp_matches:
        uid = otp_matches[-1].get("user_id")
        record("3a. /api/auth/send-otp access log user_id is null", uid is None, f"user_id={uid!r}")
    else:
        record("3a. /api/auth/send-otp access log found", False, "no log line")

    verify_matches = find_access_log_for_route("/api/auth/verify-otp", method="POST", status=200)
    if verify_matches:
        uid = verify_matches[-1].get("user_id")
        record("3b. /api/auth/verify-otp access log user_id is null", uid is None, f"user_id={uid!r}")
    else:
        record("3b. /api/auth/verify-otp access log found", False, "no log line")

    # ============ Section 4: Regression smoke — 10 auth endpoints ============
    auth_endpoints = [
        ("GET", "/home/snapshot", None),
        ("GET", "/home/bundle", None),
        ("GET", "/transactions?limit=5", None),
        ("GET", "/notifications/unread-count", None),
        ("GET", "/oauth/gmail/start", None),
        ("GET", "/oauth/gmail/start?return_uri=mintu://gmail-connected", None),
        ("GET", "/oauth/gmail/start?return_uri=https://evil.com/x", None),
        ("GET", "/gmail/status", None),
        ("GET", "/budgets", None),
        ("GET", "/leaderboard/unified", None),
    ]

    endpoint_hits = []
    for method, path, body in auth_endpoints:
        url = f"{BASE}{path}"
        try:
            if method == "GET":
                r = requests.get(url, headers=H, timeout=30)
            else:
                r = requests.post(url, headers=H, json=body or {}, timeout=30)
            endpoint_hits.append((method, path, r.status_code))
            record(f"4. {method} {path} → 200", r.status_code == 200, f"got {r.status_code}")
        except Exception as e:
            record(f"4. {method} {path}", False, f"exception: {e}")
            endpoint_hits.append((method, path, None))

    time.sleep(2)

    # Verify user_id in access log for each auth endpoint that returned 200
    for method, path, status in endpoint_hits:
        if status != 200:
            continue
        # Extract just the route path (strip query string) for matching
        route_only = path.split("?")[0]
        ms = find_access_log_for_route(route_only, method=method, status=200)
        if ms:
            # Take the most recent
            uid = ms[-1].get("user_id")
            has_real_uid = bool(uid) and isinstance(uid, str) and re.match(r"^[0-9a-fA-F]{24}$", uid)
            record(f"4log. {method} {path} access log user_id is real", bool(has_real_uid), f"user_id={uid!r}")
        else:
            record(f"4log. {method} {path} access log found", False, "no log line matched")

    # Check for "Rejected return_uri" in err log for evil.com case
    err_content = tail_log(ERR_LOG, 500)
    has_rejected = "Rejected return_uri" in err_content and "evil.com" in err_content
    record("4x. err log contains 'Rejected return_uri' for evil.com", has_rejected, f"found={has_rejected}")

    # ============ Section 5: 401 path ============
    r = requests.get(f"{BASE}/user/me", timeout=10)  # no header
    record("5a. GET /api/user/me without bearer → 401", r.status_code == 401, f"got {r.status_code}")

    time.sleep(1.5)
    # Find 401 access log line for /api/user/me
    ms = find_access_log_for_route("/api/user/me", method="GET", status=401)
    if ms:
        uid = ms[-1].get("user_id")
        record("5b. 401 access log line for /api/user/me exists, user_id=null", uid is None, f"user_id={uid!r}")
    else:
        record("5b. 401 access log line for /api/user/me exists", False, "no 401 log line found")

    # ============ Summary ============
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n=== {passed}/{total} passed ===")
    failed = [(n, d) for n, ok, d in results if not ok]
    if failed:
        print("FAILED:")
        for n, d in failed:
            print(f"  ❌ {n} — {d}")


if __name__ == "__main__":
    main()
