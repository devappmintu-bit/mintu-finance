"""Smoke test after server.py refactor — news + referral modular routers.
Verifies that extracted routers still return the correct shape and status codes.
"""
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def login():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    j = r.json()
    token = j.get("token") or j.get("access_token")
    assert token, f"no token in verify-otp response: {j}"
    return {"Authorization": f"Bearer {token}"}


def run():
    results = []
    try:
        headers = login()
        print("[auth] OK")
    except Exception as e:
        print(f"[auth] FAIL: {e}")
        sys.exit(1)

    # 1. news/india-finance
    r = requests.get(f"{BASE}/news/india-finance", headers=headers, timeout=60)
    ok = r.status_code == 200
    shape_ok = False
    if ok:
        j = r.json()
        shape_ok = "date" in j and "articles" in j and isinstance(j["articles"], list)
    detail = (
        f"date={r.json().get('date')}, articles={len(r.json().get('articles', []))}"
        if ok and shape_ok else r.text[:300]
    )
    results.append(("GET /news/india-finance", r.status_code, shape_ok, detail))

    # 2. referral/my-code
    r = requests.get(f"{BASE}/referral/my-code", headers=headers, timeout=30)
    ok = r.status_code == 200
    shape_ok = False
    if ok:
        j = r.json()
        shape_ok = all(k in j for k in ("referral_code", "tier", "rewards"))
    detail = (
        f"code={r.json().get('referral_code')}, tier={r.json().get('tier')}"
        if ok and shape_ok else r.text[:300]
    )
    results.append(("GET /referral/my-code", r.status_code, shape_ok, detail))

    # 3. referral/enhanced-status (8 fields)
    r = requests.get(f"{BASE}/referral/enhanced-status", headers=headers, timeout=30)
    ok = r.status_code == 200
    shape_ok = False
    missing = []
    if ok:
        j = r.json()
        required = [
            "referral_code", "referral_count", "total_pro_days_earned",
            "reward_tiers", "next_milestone", "recent_referrals",
            "share_text", "whatsapp_text",
        ]
        missing = [k for k in required if k not in j]
        shape_ok = len(missing) == 0
    detail = (
        f"8 fields OK, code={r.json().get('referral_code')}, tiers={len(r.json().get('reward_tiers', []))}"
        if ok and shape_ok else f"missing={missing} body={r.text[:200]}"
    )
    results.append(("GET /referral/enhanced-status", r.status_code, shape_ok, detail))

    # 4. referral/leaderboard
    r = requests.get(f"{BASE}/referral/leaderboard", timeout=30)
    ok = r.status_code == 200
    shape_ok = False
    if ok:
        j = r.json()
        shape_ok = "leaderboard" in j and isinstance(j["leaderboard"], list)
    detail = (
        f"leaderboard entries={len(r.json().get('leaderboard', []))}"
        if ok and shape_ok else r.text[:200]
    )
    results.append(("GET /referral/leaderboard", r.status_code, shape_ok, detail))

    # 5. referral/apply with bogus code → expect 404
    r = requests.post(f"{BASE}/referral/apply", headers=headers, json={"code": "BOGUSCODE"}, timeout=30)
    expected_404 = r.status_code == 404
    # Acceptable alternate: 400 "already used" — means user already applied a code earlier
    already_applied = r.status_code == 400 and "already" in r.text.lower()
    passed = expected_404 or already_applied
    detail = f"got {r.status_code}: {r.text[:200]}"
    results.append(("POST /referral/apply (BOGUSCODE → 404)", r.status_code, passed, detail))

    print("\n=== SMOKE TEST RESULTS ===")
    all_pass = True
    for name, status, shape_ok, detail in results:
        mark = "✅" if shape_ok else "❌"
        if not shape_ok:
            all_pass = False
        print(f"{mark} {name} → HTTP {status} | {detail}")

    any_500 = any(r[1] >= 500 for r in results)
    if any_500:
        print("\n❌❌❌ 500 ERROR DETECTED - refactor is broken!")
        sys.exit(2)

    apply_row = results[-1]
    if apply_row[1] == 400 and "already" in apply_row[3].lower():
        print("\nNOTE: /referral/apply returned 400 (already used) instead of 404. "
              "Acceptable — test user already has a referral record. "
              "The error-path plumbing is still intact (server did not 500).")

    if all_pass:
        print("\n🎉 ALL 5 ENDPOINTS PASSED — refactor is clean.")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    run()
