#!/usr/bin/env python3
"""Focused regression smoke test for MintU middleware fix.

Verifies that the recent RateLimitMiddleware and AuditLogMiddleware changes
(catching RuntimeError('No response returned') and returning 499) do NOT
cause any regressions on happy-path endpoints, and that audit_logs are still
being written to MongoDB.
"""
import os
import sys
import json
import requests
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []
counts = {"pass": 0, "fail": 0, "bad_499": 0, "bad_500": 0}


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    if ok:
        counts["pass"] += 1
    else:
        counts["fail"] += 1
    results.append(f"[{status}] {name} :: {detail}")
    print(f"[{status}] {name} :: {detail}")


def check_status(name, r, expected=200):
    code = r.status_code
    if code == 499:
        counts["bad_499"] += 1
    if code >= 500:
        counts["bad_500"] += 1
    ok = code == expected
    detail = f"status={code}"
    if not ok:
        try:
            detail += f" body={r.text[:200]}"
        except Exception:
            pass
    record(name, ok, detail)
    return ok


async def count_audit_logs():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "mintu_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    cnt = await db.audit_logs.count_documents({})
    client.close()
    return cnt


def main():
    # Read backend .env for Mongo creds
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception as e:
        print(f"Warning: could not read /app/backend/.env: {e}")

    # Count audit logs BEFORE
    audit_before = asyncio.run(count_audit_logs())
    print(f"\n=== audit_logs count BEFORE: {audit_before} ===\n")

    # A1 — Send OTP
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    check_status("A1 POST /auth/send-otp", r, 200)

    # A2 — Verify OTP
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    check_status("A2 POST /auth/verify-otp", r, 200)
    token = None
    try:
        token = r.json().get("token")
    except Exception:
        pass
    if not token:
        record("A2 token extraction", False, "no token in response")
        print("\n=== ABORT: no token; cannot proceed ===")
        summary()
        sys.exit(1)
    record("A2 token extraction", True, f"token_len={len(token)}")

    H = {"Authorization": f"Bearer {token}"}

    endpoints = [
        ("A3  GET /home/bundle?lang=en",          f"{BASE}/home/bundle?lang=en"),
        ("A4  GET /analytics/summary",            f"{BASE}/analytics/summary"),
        ("A5  GET /transactions",                 f"{BASE}/transactions"),
        ("A6  GET /budgets/achievements",         f"{BASE}/budgets/achievements"),
        ("A7  GET /coins/status",                 f"{BASE}/coins/status"),
        ("A8  GET /rewards/vouchers",             f"{BASE}/rewards/vouchers"),
        ("A9  GET /split/groups",                 f"{BASE}/split/groups"),
        ("A10 GET /user/notification-prefs",      f"{BASE}/user/notification-prefs"),
        ("A11 GET /user/payment-methods",         f"{BASE}/user/payment-methods"),
        ("A12 GET /gamification/status",          f"{BASE}/gamification/status"),
    ]

    for name, url in endpoints:
        try:
            r = requests.get(url, headers=H, timeout=60)
            check_status(name, r, 200)
        except Exception as e:
            record(name, False, f"exception: {e}")

    # B — verify no false 499s on the above normal requests (they should all be 200)
    if counts["bad_499"] == 0:
        record("B   No false 499s returned on any happy-path request", True,
               "middleware 499-synthesis branch correctly did NOT fire")
    else:
        record("B   No false 499s returned on any happy-path request", False,
               f"{counts['bad_499']} requests returned 499")

    # No 500s
    if counts["bad_500"] == 0:
        record("B   No 500s returned on any happy-path request", True, "")
    else:
        record("B   No 500s returned on any happy-path request", False,
               f"{counts['bad_500']} requests returned 5xx")

    # C — verify audit_logs grew
    import time as _t
    _t.sleep(1.5)  # allow async insert to flush
    audit_after = asyncio.run(count_audit_logs())
    grew = audit_after > audit_before
    record("C   audit_logs collection grew after calls",
           grew, f"before={audit_before} after={audit_after} delta={audit_after - audit_before}")

    summary()


def summary():
    print("\n\n=" * 1)
    print("=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    for line in results:
        print(line)
    print("=" * 70)
    total = counts["pass"] + counts["fail"]
    print(f"Total: {total}  Pass: {counts['pass']}  Fail: {counts['fail']}")
    print(f"Unexpected 499s: {counts['bad_499']}  Unexpected 5xx: {counts['bad_500']}")
    print("=" * 70)


if __name__ == "__main__":
    main()
