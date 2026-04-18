"""Analytics router extraction smoke test + regression (Apr 18 2026).

Tests:
 1. GET /api/stats/overview
 2. GET /api/reports/weekly
 3. GET /api/leaderboard/savings
 4. GET /api/leaderboard/friends
 5. GET /api/transactions            (regression)
 6. GET /api/family/my-groups        (regression)
 7. GET /api/budgets                 (regression)
"""
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _check(name, r, required_keys=None, list_ok=False):
    if r.status_code != 200:
        return (name, False, r.status_code, r.text[:300])
    try:
        data = r.json()
    except Exception as e:
        return (name, False, r.status_code, f"JSON decode err: {e}; body={r.text[:200]}")
    if list_ok and isinstance(data, list):
        return (name, True, r.status_code, f"list(len={len(data)})")
    if required_keys:
        missing = [k for k in required_keys if k not in data]
        if missing:
            return (name, False, r.status_code, f"missing keys: {missing}; keys={list(data.keys())[:15]}")
    return (name, True, r.status_code, f"keys={list(data.keys())[:15]}" if isinstance(data, dict) else str(data)[:200])


def run():
    results = []
    token = auth()
    h = {"Authorization": f"Bearer {token}"}

    # 1. Stats overview
    r = requests.get(f"{BASE}/stats/overview", headers=h, timeout=30)
    results.append(_check(
        "1. GET /api/stats/overview", r,
        required_keys=["total_income", "total_expense", "balance", "transaction_count", "category_breakdown"],
    ))

    # 2. Weekly report
    r = requests.get(f"{BASE}/reports/weekly", headers=h, timeout=30)
    results.append(_check(
        "2. GET /api/reports/weekly", r,
        required_keys=["period", "total_spent", "mood", "top_category", "shareable_text"],
    ))

    # 3. Savings leaderboard
    r = requests.get(f"{BASE}/leaderboard/savings", headers=h, timeout=30)
    results.append(_check(
        "3. GET /api/leaderboard/savings", r,
        required_keys=["user_rank", "percentile", "top_10", "monthly_saved"],
    ))
    # extra sanity: top_10 is list
    if r.status_code == 200:
        try:
            d = r.json()
            assert isinstance(d.get("top_10"), list), "top_10 not list"
        except Exception as e:
            results.append(("3b. leaderboard/savings top_10 is list", False, r.status_code, str(e)))
        else:
            results.append(("3b. leaderboard/savings top_10 is list", True, 200, f"len={len(d['top_10'])}, rank={d.get('user_rank')}, pct={d.get('percentile')}"))

    # 4. Friends comparison (may return empty friends + message if no split groups)
    r = requests.get(f"{BASE}/leaderboard/friends", headers=h, timeout=30)
    if r.status_code == 200:
        data = r.json()
        has_friends_key = "friends" in data
        ok = has_friends_key and (
            isinstance(data.get("friends"), list)
        )
        results.append(("4. GET /api/leaderboard/friends", ok, 200,
                        f"friends_len={len(data.get('friends', []))}, has_message={'message' in data}, keys={list(data.keys())}"))
    else:
        results.append(("4. GET /api/leaderboard/friends", False, r.status_code, r.text[:300]))

    # 5. Transactions regression
    r = requests.get(f"{BASE}/transactions", headers=h, timeout=30)
    results.append(_check("5. GET /api/transactions", r, list_ok=True))

    # 6. Family my-groups regression
    r = requests.get(f"{BASE}/family/my-groups", headers=h, timeout=30)
    results.append(_check("6. GET /api/family/my-groups", r, list_ok=True))

    # 7. Budgets regression
    r = requests.get(f"{BASE}/budgets", headers=h, timeout=30)
    results.append(_check("7. GET /api/budgets", r, list_ok=True))

    return results


if __name__ == "__main__":
    try:
        results = run()
    except AssertionError as e:
        print("FATAL:", e)
        sys.exit(1)

    print("\n===== ANALYTICS ROUTER EXTRACTION SMOKE TEST =====")
    passed = 0
    for name, ok, status, body in results:
        flag = "PASS" if ok else "FAIL"
        print(f"[{flag}] {name} -> HTTP {status}")
        if not ok:
            print(f"       body: {body}")
        else:
            print(f"       {body}")
        passed += int(bool(ok))
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 2)
