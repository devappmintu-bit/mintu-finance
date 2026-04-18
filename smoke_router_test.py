"""
Smoke test after extracting gamification + content into modular routers.
Tests 5 endpoints per review request.
"""
import os
import sys
import requests
import json

BACKEND_URL = "https://mintu-finance.preview.emergentagent.com"
BASE = f"{BACKEND_URL}/api"

PHONE = "9876543210"
OTP = "123456"

results = []

def record(name, ok, detail=""):
    status = "✅" if ok else "❌"
    line = f"{status} {name} — {detail}"
    print(line)
    results.append((ok, name, detail))

def main():
    # Auth
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    if r.status_code != 200:
        record("Auth send-otp", False, f"HTTP {r.status_code}: {r.text[:200]}")
        return
    record("Auth send-otp", True, f"HTTP 200 in {r.elapsed.total_seconds()*1000:.0f}ms")

    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "name": "Test User"}, timeout=30)
    if r.status_code != 200:
        record("Auth verify-otp", False, f"HTTP {r.status_code}: {r.text[:200]}")
        return
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        record("Auth verify-otp token", False, f"No token in response: {r.text[:200]}")
        return
    record("Auth verify-otp", True, f"HTTP 200, got JWT")

    H = {"Authorization": f"Bearer {token}"}

    # 1. GET /api/gamification/status
    r = requests.get(f"{BASE}/gamification/status", headers=H, timeout=30)
    if r.status_code != 200:
        record("GET /gamification/status", False, f"HTTP {r.status_code}: {r.text[:300]}")
    else:
        body = r.json()
        required = ["streak", "badges_earned", "badges_available", "total_badges", "weekly_challenge", "new_badges"]
        missing = [k for k in required if k not in body]
        if missing:
            record("GET /gamification/status", False, f"Missing fields: {missing}. Keys: {list(body.keys())}")
        else:
            # verify shapes
            is_list_be = isinstance(body["badges_earned"], list)
            is_list_ba = isinstance(body["badges_available"], list)
            is_list_nb = isinstance(body["new_badges"], list)
            if not (is_list_be and is_list_ba and is_list_nb):
                record("GET /gamification/status", False, f"badges fields not lists. earned={type(body['badges_earned'])}, available={type(body['badges_available'])}, new={type(body['new_badges'])}")
            else:
                record("GET /gamification/status", True, f"200 OK, streak={body.get('streak')}, total_badges={body.get('total_badges')}, earned={len(body['badges_earned'])}, avail={len(body['badges_available'])}, new={len(body['new_badges'])}, weekly_challenge keys={list(body['weekly_challenge'].keys()) if isinstance(body['weekly_challenge'],dict) else type(body['weekly_challenge'])}")

    # 2. GET /api/card-of-the-day
    r = requests.get(f"{BASE}/card-of-the-day", headers=H, timeout=30)
    if r.status_code != 200:
        record("GET /card-of-the-day", False, f"HTTP {r.status_code}: {r.text[:300]}")
    else:
        body = r.json()
        required = ["type", "emoji", "title", "text", "color", "app_link"]
        missing = [k for k in required if k not in body]
        if missing:
            record("GET /card-of-the-day", False, f"Missing fields: {missing}. Keys: {list(body.keys())}")
        else:
            record("GET /card-of-the-day", True, f"200 OK, type={body['type']}, emoji={body['emoji']}, title={body['title'][:40]!r}")

    # 3. GET /api/card-of-the-day?refresh=true
    r = requests.get(f"{BASE}/card-of-the-day?refresh=true", headers=H, timeout=30)
    if r.status_code != 200:
        record("GET /card-of-the-day?refresh=true", False, f"HTTP {r.status_code}: {r.text[:300]}")
    else:
        body = r.json()
        required = ["type", "emoji", "title", "text", "color", "app_link"]
        missing = [k for k in required if k not in body]
        if missing:
            record("GET /card-of-the-day?refresh=true", False, f"Missing fields: {missing}. Keys: {list(body.keys())}")
        else:
            record("GET /card-of-the-day?refresh=true", True, f"200 OK, type={body['type']}, emoji={body['emoji']}, title={body['title'][:40]!r}")

    # 4. GET /api/news/india-finance (regression)
    r = requests.get(f"{BASE}/news/india-finance", headers=H, timeout=60)
    if r.status_code != 200:
        record("GET /news/india-finance", False, f"HTTP {r.status_code}: {r.text[:300]}")
    else:
        body = r.json()
        if "articles" in body and "date" in body:
            record("GET /news/india-finance", True, f"200 OK, date={body['date']}, articles={len(body['articles'])}")
        else:
            record("GET /news/india-finance", False, f"Unexpected shape. keys={list(body.keys())}")

    # 5. GET /api/referral/enhanced-status (regression)
    r = requests.get(f"{BASE}/referral/enhanced-status", headers=H, timeout=30)
    if r.status_code != 200:
        record("GET /referral/enhanced-status", False, f"HTTP {r.status_code}: {r.text[:300]}")
    else:
        body = r.json()
        required = ["referral_code", "referral_count", "reward_tiers", "share_text"]
        missing = [k for k in required if k not in body]
        if missing:
            record("GET /referral/enhanced-status", False, f"Missing fields: {missing}. Keys: {list(body.keys())}")
        else:
            record("GET /referral/enhanced-status", True, f"200 OK, code={body['referral_code']}, count={body['referral_count']}, tiers={len(body['reward_tiers'])}")

    # Summary
    passed = sum(1 for r in results if r[0])
    total = len(results)
    print(f"\n{'='*60}\nTOTAL: {passed}/{total} passed\n{'='*60}")
    if passed != total:
        print("\nFAILURES:")
        for ok, name, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
        sys.exit(1)

if __name__ == "__main__":
    main()
