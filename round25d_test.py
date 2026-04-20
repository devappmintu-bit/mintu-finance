#!/usr/bin/env python3
"""Round 25D regression test — analytics router split + home_bundle extraction."""
import os
import sys
import requests
import json

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

def log(ok, name, detail=""):
    sym = "✅" if ok else "❌"
    print(f"{sym} {name} {detail}")
    return 1 if ok else 0

results = {"pass": 0, "fail": 0, "details": []}

def check(ok, name, detail=""):
    if ok:
        results["pass"] += 1
    else:
        results["fail"] += 1
        results["details"].append(f"FAIL {name}: {detail}")
    log(ok, name, detail)

# --- AUTH ---
print("\n=== AUTH ===")
try:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    check(r.status_code == 200, "send-otp", f"status={r.status_code} body={r.text[:200]}")
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    check(r.status_code == 200, "verify-otp", f"status={r.status_code}")
    token = r.json().get("token") or r.json().get("access_token")
    if not token:
        print("NO TOKEN! Body:", r.text)
        sys.exit(1)
    print(f"Token: {token[:40]}...")
except Exception as e:
    print(f"AUTH FAILED: {e}")
    sys.exit(1)

H = {"Authorization": f"Bearer {token}"}

def get(path, params=None, expected=(200,), name=None):
    n = name or f"GET {path}"
    try:
        r = requests.get(f"{BASE}{path}", headers=H, params=params, timeout=60)
        ok = r.status_code in expected
        detail = f"status={r.status_code}"
        if not ok:
            detail += f" body={r.text[:300]}"
        check(ok, n, detail)
        return r
    except Exception as e:
        check(False, n, f"exception={e}")
        return None

def post(path, body=None, expected=(200,), name=None):
    n = name or f"POST {path}"
    try:
        r = requests.post(f"{BASE}{path}", headers=H, json=body or {}, timeout=60)
        ok = r.status_code in expected
        detail = f"status={r.status_code}"
        if not ok:
            detail += f" body={r.text[:300]}"
        check(ok, n, detail)
        return r
    except Exception as e:
        check(False, n, f"exception={e}")
        return None

# --- HOME BUNDLE ---
print("\n=== HOME BUNDLE (moved file) ===")
r = get("/home/bundle", {"lang": "en"})
if r and r.status_code == 200:
    try:
        body = r.json()
        required_keys = {"user","stats","recent_txns","avatar","snapshot","alerts","weekly_report","leaderboard","gamification","card_of_the_day","fomo_feed","ai_predict","coins","cached_at","cache_ttl_s"}
        missing = required_keys - set(body.keys())
        check(not missing, "home/bundle has all 15 keys", f"missing={missing}" if missing else f"all keys present")
        check(body.get("cache_ttl_s") == 25, "cache_ttl_s==25", f"got {body.get('cache_ttl_s')}")
    except Exception as e:
        check(False, "home/bundle json parse", str(e))

# --- ANALYTICS CORE ---
print("\n=== ANALYTICS CORE (stayed in analytics.py) ===")
get("/stats/overview")
get("/analytics/summary")
get("/analytics/monthly")
get("/analytics/yearly", {"year": 2026})
get("/reports/weekly")
get("/leaderboard/savings")
get("/leaderboard/unified", {"scope": "contacts"})
get("/leaderboard/friends")
get("/home/snapshot")
get("/ai/predict")
get("/coins/status")
post("/coins/award", {"action": "open_app_daily"})

# --- FRONTEND-MIGRATED ---
print("\n=== FRONTEND-MIGRATED endpoints ===")
get("/referral/my-code")
get("/referral/enhanced-status")
get("/gamification/status")
get("/premium/status")
get("/premium/paywall-trigger")
get("/share/score-card")
get("/ab/paywall-group")
post("/ab/track-event", {"event": "test_event", "group": "A", "placement": "rewards"}, expected=(200, 204))
get("/gmail/status")
get("/oauth/gmail/start")

# --- REPORT ---
print("\n" + "=" * 60)
print(f"TOTAL: {results['pass']} PASS / {results['fail']} FAIL")
print("=" * 60)
if results["fail"]:
    print("\nFAILURES:")
    for d in results["details"]:
        print(f"  {d}")
    sys.exit(1)
sys.exit(0)
