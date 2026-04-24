"""Phase 6 smoke test — verify /split/activity and /split/settlement-leaderboard
still work after extraction to routers/split_activity.py, plus regression on
/split/balances and /split/settle.
"""
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

failures = []
passed = []

def check(cond, name, extra=""):
    if cond:
        passed.append(name)
        print(f"✅ {name}")
    else:
        failures.append(f"{name} — {extra}")
        print(f"❌ {name} — {extra}")


def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code in (200, 429), f"send-otp HTTP {r.status_code}: {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp HTTP {r.status_code}: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


def main():
    tok = auth()
    H = {"Authorization": f"Bearer {tok}"}

    # ── CHECK 1: GET /split/activity ─────────────────────
    r = requests.get(f"{BASE}/split/activity", headers=H, timeout=30)
    check(r.status_code == 200, "1. GET /split/activity → 200", f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        j = r.json()
        check("feed" in j, "1a. response has 'feed' key")
        check("headline" in j, "1b. response has 'headline' key")
        check("settled_this_month" in j, "1c. response has 'settled_this_month' key")
        check("top_friend" in j, "1d. response has 'top_friend' key")
        check(isinstance(j.get("feed"), list), "1e. feed is a list",
              f"type={type(j.get('feed'))}")
        if isinstance(j.get("settled_this_month"), dict):
            check("count" in j["settled_this_month"] and "amount" in j["settled_this_month"],
                  "1f. settled_this_month has count+amount")

    # ── CHECK 2: GET /split/activity?limit=5 ─────────────
    r = requests.get(f"{BASE}/split/activity?limit=5", headers=H, timeout=30)
    check(r.status_code == 200, "2. GET /split/activity?limit=5 → 200", f"got {r.status_code}")
    if r.status_code == 200:
        feed = r.json().get("feed", [])
        check(len(feed) <= 5, "2a. feed.length <= 5", f"got len={len(feed)}")

    # ── CHECK 3: GET /split/settlement-leaderboard ─────
    r = requests.get(f"{BASE}/split/settlement-leaderboard", headers=H, timeout=30)
    check(r.status_code == 200, "3. GET /split/settlement-leaderboard → 200",
          f"got {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        j = r.json()
        check("leaderboard" in j, "3a. has 'leaderboard'")
        check("my_stats" in j, "3b. has 'my_stats'")
        ms = j.get("my_stats", {})
        for k in ("rank", "coins", "settlements", "cashback_available", "badges"):
            check(k in ms, f"3c. my_stats has '{k}'")
        check(isinstance(ms.get("badges"), list), "3d. my_stats.badges is list")
        check(isinstance(j.get("leaderboard"), list), "3e. leaderboard is list")

    # ── CHECK 4a: GET /split/balances regression ───────
    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=30)
    check(r.status_code == 200, "4a. GET /split/balances → 200", f"got {r.status_code}")
    if r.status_code == 200:
        j = r.json()
        # expected balance payload commonly has 'balances' or similar
        check(isinstance(j, dict), "4a1. balances response is dict")

    # ── CHECK 4b: POST /split/settle regression ────────
    # spec "same shape as before" — just confirm it returns something sane
    # (empty body should NOT produce a 5xx; expect 400/422 validation).
    r = requests.post(f"{BASE}/split/settle", headers=H, json={}, timeout=30)
    check(r.status_code < 500, "4b. POST /split/settle empty body → not 5xx",
          f"got {r.status_code}: {r.text[:200]}")
    # With required fields missing, expect 400/422
    check(r.status_code in (400, 422, 404), "4b1. POST /split/settle empty → 400/422/404",
          f"got {r.status_code}")

    # ── Summary ────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"RESULT: {len(passed)} passed, {len(failures)} failed")
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("All phase 6 smoke-test assertions PASS ✅")


if __name__ == "__main__":
    main()
