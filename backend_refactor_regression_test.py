#!/usr/bin/env python3
"""
Regression test for MintU backend after refactor (Apr 19 2026):
- server.py slimmed 1339 → ~570 lines
- Constants extracted to core/constants.py
- Merged duplicate startup handlers
- routers/ai.py imports directly from core.constants
- Back-compat via re-exports in server.py
"""
import os
import sys
import json
import time
import requests
from pathlib import Path

# Load frontend .env to get BACKEND URL
FRONTEND_ENV = Path("/app/frontend/.env")
BASE = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not BASE:
    print("❌ No backend URL in frontend/.env")
    sys.exit(1)

API = f"{BASE}/api"
PHONE = "9876543210"
OTP = "123456"
PASSWORD = "test123"

results = []  # list of (name, status, detail)

def record(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    status = "✅" if ok else "❌"
    print(f"{status} {name} — {detail}"[:240])

def safe_get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d

# ---- Auth ----
print(f"\n=== AUTH ({API}) ===")
s = requests.Session()
s.headers.update({"Content-Type": "application/json"})

# send-otp
try:
    r = s.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    ok = r.status_code == 200 and r.json().get("mock_mode") in (True, "true", 1)
    record("POST /api/auth/send-otp", ok, f"{r.status_code} {r.text[:150]}")
except Exception as e:
    record("POST /api/auth/send-otp", False, f"EXC: {e}")

# verify-otp
token = None
try:
    r = s.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    j = r.json() if r.status_code == 200 else {}
    token = j.get("token") or j.get("access_token")
    ok = r.status_code == 200 and bool(token)
    record("POST /api/auth/verify-otp", ok, f"{r.status_code} token_len={len(token) if token else 0}")
except Exception as e:
    record("POST /api/auth/verify-otp", False, f"EXC: {e}")

# login (password)
try:
    r = s.post(f"{API}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=20)
    j = r.json() if r.status_code == 200 else {}
    tok2 = j.get("token") or j.get("access_token")
    ok = r.status_code == 200 and bool(tok2)
    record("POST /api/auth/login", ok, f"{r.status_code} token_len={len(tok2) if tok2 else 0}")
    if tok2 and not token:
        token = tok2
except Exception as e:
    record("POST /api/auth/login", False, f"EXC: {e}")

if not token:
    print("\n❌ Cannot continue without auth token")
    sys.exit(2)

AUTH = {"Authorization": f"Bearer {token}"}

def GET(path, name=None, check=None, params=None, timeout=30):
    name = name or f"GET {path}"
    try:
        r = requests.get(f"{API}{path}", headers=AUTH, params=params, timeout=timeout)
        ok = r.status_code == 200
        body = None
        try:
            body = r.json()
        except Exception:
            pass
        extra = ""
        if ok and check is not None and body is not None:
            try:
                ok = check(body)
                extra = f" shape_ok={ok}"
            except Exception as e:
                ok = False
                extra = f" shape_check_exc={e}"
        keys = ",".join(list(body.keys())[:6]) if isinstance(body, dict) else (f"list[{len(body)}]" if isinstance(body, list) else "")
        record(name, ok, f"{r.status_code} {keys}{extra}")
        return body if ok else None
    except Exception as e:
        record(name, False, f"EXC: {e}")
        return None

def POST(path, name=None, json_body=None, check=None, timeout=45):
    name = name or f"POST {path}"
    try:
        r = requests.post(f"{API}{path}", headers=AUTH, json=json_body or {}, timeout=timeout)
        ok = r.status_code == 200
        body = None
        try:
            body = r.json()
        except Exception:
            pass
        extra = ""
        if ok and check is not None and body is not None:
            try:
                ok = check(body)
                extra = f" shape_ok={ok}"
            except Exception as e:
                ok = False
                extra = f" shape_check_exc={e}"
        keys = ",".join(list(body.keys())[:6]) if isinstance(body, dict) else (f"list[{len(body)}]" if isinstance(body, list) else "")
        record(name, ok, f"{r.status_code} {keys}{extra}")
        return body if ok else None
    except Exception as e:
        record(name, False, f"EXC: {e}")
        return None

# ---- AI ----
print("\n=== AI (biggest refactor target) ===")
GET("/ai/predict", check=lambda j: all(k in j for k in ("mtd_spend", "projected_month_end", "headline")))
POST("/ai/chat", json_body={"message": "how do I save money", "lang": "en"},
     check=lambda j: isinstance(j, dict) and ("reply" in j or "response" in j or "message" in j or "text" in j or "answer" in j))
GET("/money-school/daily", check=lambda j: isinstance(j, dict) and len(j) > 0)
GET("/insights/daily", check=lambda j: isinstance(j, dict))
GET("/insights/weekly", check=lambda j: isinstance(j, dict))

# ---- Premium ----
print("\n=== PREMIUM (uses PREMIUM_FEATURES, PRICING) ===")
GET("/premium/status", check=lambda j: isinstance(j, dict))
POST("/premium/tax-calculator", json_body={"annual_income": 1000000},
     check=lambda j: "new_regime" in j and "old_regime" in j and "recommended_regime" in j)
POST("/premium/investment-suggest", json_body={"monthly_income": 50000, "monthly_expenses": 30000},
     check=lambda j: "investible_monthly" in j and "allocations" in j)
GET("/premium/features-catalog", check=lambda j: "sections" in j and "price" in j)

# ---- Splits ----
print("\n=== SPLITS (uses SETTLEMENT_REWARDS) ===")
GET("/split/groups", check=lambda j: isinstance(j, (list, dict)))
GET("/split/activity", check=lambda j: "feed" in j and "headline" in j)
GET("/split/settlement-leaderboard", check=lambda j: isinstance(j, (dict, list)))

# ---- Analytics ----
print("\n=== ANALYTICS ===")
GET("/analytics/yearly", check=lambda j: "monthly" in j and "yearly" in j and isinstance(j.get("monthly"), list) and len(j["monthly"]) == 12)
GET("/home/snapshot", check=lambda j: "mtd_spend" in j and "sparkline" in j and "tier" in j)

# ---- Other ----
print("\n=== OTHER ===")
GET("/gamification/status", check=lambda j: isinstance(j, dict))
GET("/coins/status", check=lambda j: "balance" in j and "rules" in j)

# news — should be fast (<200ms as per review)
t0 = time.time()
body = GET("/news/india-finance", check=lambda j: "articles" in j and isinstance(j["articles"], list))
elapsed_ms = (time.time() - t0) * 1000
if body is not None:
    record("  /news/india-finance latency<500ms", elapsed_ms < 500, f"{elapsed_ms:.0f}ms")

GET("/upi/apps", check=lambda j: isinstance(j, (list, dict)))
GET("/sms/sample-inbox", check=lambda j: isinstance(j, (list, dict)))

# ---- Summary ----
print("\n" + "=" * 70)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"RESULT: {passed}/{total} passed")
failed = [(n, d) for n, ok, d in results if not ok]
if failed:
    print("\nFAILURES:")
    for n, d in failed:
        print(f"  ❌ {n} — {d}")
sys.exit(0 if passed == total else 3)
