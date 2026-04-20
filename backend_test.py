"""
Round 20 — GET /api/home/bundle fan-out endpoint tests.

Tests against the live deployed preview URL (EXPO_PUBLIC_BACKEND_URL from frontend/.env).
"""
import json
import time
import sys
import requests

BASE_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE_URL}/api"

PHONE = "9876543210"
OTP = "123456"

results = []

def record(name, ok, detail=""):
    tag = "PASS" if ok else "FAIL"
    results.append((ok, f"[{tag}] {name} :: {detail}"))
    print(f"[{tag}] {name} :: {detail}")


def auth_login():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    if r.status_code != 200:
        record("auth.send-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    if r.status_code != 200:
        record("auth.verify-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        record("auth.verify-otp.token", False, f"no token in body: {json.dumps(data)[:200]}")
        return None
    record("auth.login", True, f"token obtained, len={len(token)}")
    return token


def test_home_bundle(token):
    H = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = requests.get(f"{API}/home/bundle", headers=H, timeout=60)
    t1 = time.time()
    record("T1.status_200", r.status_code == 200, f"status={r.status_code} ms={int((t1-t0)*1000)}")
    if r.status_code != 200:
        print("Response body:", r.text[:500])
        return None
    body = r.json()
    required_keys = ["user", "stats", "recent_txns", "avatar", "snapshot", "alerts",
                     "weekly_report", "leaderboard", "gamification", "card_of_the_day",
                     "fomo_feed", "ai_predict", "coins", "cached_at", "cache_ttl_s"]
    missing = [k for k in required_keys if k not in body]
    record("T1.all_keys_present", not missing, f"missing={missing}" if missing else "all 15 keys present")
    record("T1.cache_ttl_s_eq_25", body.get("cache_ttl_s") == 25, f"got {body.get('cache_ttl_s')}")
    record("T1.recent_txns_is_list", isinstance(body.get("recent_txns"), list), f"type={type(body.get('recent_txns')).__name__}")
    cached_at = body.get("cached_at")
    iso_ok = isinstance(cached_at, str) and ("T" in cached_at) and len(cached_at) >= 19
    record("T1.cached_at_iso", iso_ok, f"cached_at={cached_at}")
    return body


def test_lang_variant(token):
    H = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}/home/bundle?lang=hi", headers=H, timeout=60)
    record("T2.lang_hi_status_200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        record("T2.lang_hi_cache_ttl_25", body.get("cache_ttl_s") == 25, f"got {body.get('cache_ttl_s')}")
        record("T2.lang_hi_has_user_stats", "user" in body and "stats" in body, "")


def test_cache_behaviour(token):
    H = {"Authorization": f"Bearer {token}"}
    # Use a unique lang to guarantee fresh cache key
    lang = f"cachetest{int(time.time())}"
    t0 = time.time()
    r1 = requests.get(f"{API}/home/bundle?lang={lang}", headers=H, timeout=60)
    ms1 = int((time.time() - t0) * 1000)
    t0 = time.time()
    r2 = requests.get(f"{API}/home/bundle?lang={lang}", headers=H, timeout=60)
    ms2 = int((time.time() - t0) * 1000)
    record("T3.both_200", r1.status_code == 200 and r2.status_code == 200, f"r1={r1.status_code} r2={r2.status_code}")
    if r1.status_code == 200 and r2.status_code == 200:
        b1 = r1.json(); b2 = r2.json()
        same = b1.get("cached_at") == b2.get("cached_at")
        record("T3.same_cached_at", same, f"c1={b1.get('cached_at')} c2={b2.get('cached_at')} ms1={ms1} ms2={ms2}")
        record("T3.second_call_fast", ms2 < ms1 or ms2 < 300, f"ms1={ms1} ms2={ms2}")


def test_auth_guard():
    r = requests.get(f"{API}/home/bundle", timeout=20)
    ok = r.status_code in (401, 422)
    record("T5.no_auth_rejected", ok, f"status={r.status_code}")


def test_regression(token):
    H = {"Authorization": f"Bearer {token}"}
    endpoints = [
        "/home/snapshot",
        "/stats/overview",
        "/coins/status",
        "/gamification/status",
        "/card-of-the-day",
        "/alerts/smart",
    ]
    for ep in endpoints:
        r = requests.get(f"{API}{ep}", headers=H, timeout=30)
        record(f"T6.{ep}", r.status_code == 200, f"status={r.status_code}")


def test_startup_index_log():
    import subprocess
    try:
        out = subprocess.run(
            ["bash", "-lc", "grep -c 'MongoDB indexes created' /var/log/supervisor/backend.err.log || true"],
            capture_output=True, text=True, timeout=5,
        )
        cnt = out.stdout.strip()
        record("T7.indexes_logged", int(cnt) > 0 if cnt.isdigit() else False, f"occurrences={cnt}")
        err = subprocess.run(
            ["bash", "-lc", "tail -n 500 /var/log/supervisor/backend.err.log | grep -iE 'index.*(error|fail)' | head -5"],
            capture_output=True, text=True, timeout=5,
        )
        lines = err.stdout.strip()
        record("T7.no_recent_index_errors", not lines, f"errs={lines[:200] if lines else 'none'}")
    except Exception as e:
        record("T7.startup_check", False, f"exception: {e}")


def main():
    print("=" * 70)
    print("Round 20 — /api/home/bundle tests")
    print("=" * 70)

    token = auth_login()
    if not token:
        print("\nAborting — no token.")
        sys.exit(1)

    test_home_bundle(token)
    test_lang_variant(token)
    test_cache_behaviour(token)
    test_auth_guard()
    test_regression(token)
    test_startup_index_log()

    print("\n" + "=" * 70)
    passed = sum(1 for ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} checks passed")
    print("=" * 70)
    failed = [msg for ok, msg in results if not ok]
    if failed:
        print("\nFAILURES:")
        for m in failed:
            print("  " + m)
        sys.exit(1)


if __name__ == "__main__":
    main()
