"""
ROUND 25B smoke test — split.tsx tab migrated to services/split.ts
No backend code changed. Validate 20 assertions (shape + happy path).
"""
import requests
import json
import sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def record(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}  {detail}")


def get_token():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
    r = requests.post(
        f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15
    )
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token")


def main():
    token = get_token()
    H = {"Authorization": f"Bearer {token}"}

    # 1. GET /api/split/groups
    r = requests.get(f"{BASE}/split/groups", headers=H, timeout=15)
    record("1 GET /split/groups", r.status_code == 200 and isinstance(r.json(), list),
           f"status={r.status_code}")
    groups = r.json() if r.status_code == 200 else []
    valid_group_id = groups[0]["id"] if groups else None

    # 2. GET /api/split/balances — returns dict (NOT list) with totals/owe_you/you_owe
    r = requests.get(f"{BASE}/split/balances", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else None
    record("2 GET /split/balances",
           r.status_code == 200 and isinstance(body, dict)
           and "total_owed_to_you" in body,
           f"status={r.status_code}")

    # 3. GET /api/split/activity?limit=5 — returns {feed:[...]}
    r = requests.get(f"{BASE}/split/activity?limit=5", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else None
    record("3 GET /split/activity?limit=5",
           r.status_code == 200 and isinstance(body, dict) and "feed" in body,
           f"status={r.status_code}")

    # 4. GET /api/split/reminders → object with received/sent
    r = requests.get(f"{BASE}/split/reminders", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("4 GET /split/reminders",
           r.status_code == 200 and isinstance(body, dict)
           and "received" in body and "sent" in body,
           f"status={r.status_code} keys={list(body.keys()) if isinstance(body, dict) else body}")

    # 5. GET /api/split/settlement-leaderboard
    r = requests.get(f"{BASE}/split/settlement-leaderboard", headers=H, timeout=15)
    record("5 GET /split/settlement-leaderboard", r.status_code == 200,
           f"status={r.status_code}")

    # 6. POST /api/split/groups → 400/422 empty, 200 valid
    r1 = requests.post(f"{BASE}/split/groups", json={}, headers=H, timeout=15)
    record("6a POST /split/groups empty → 400/422",
           r1.status_code in (400, 422), f"status={r1.status_code}")
    r2 = requests.post(
        f"{BASE}/split/groups",
        json={"name": "Round25B Test Group",
              "members": ["9876543210", "9111222333"]},
        headers=H, timeout=20,
    )
    created_group_id = None
    if r2.status_code == 200:
        try:
            created_group_id = r2.json().get("id") or r2.json().get("group_id")
        except Exception:
            pass
    record("6b POST /split/groups valid → 200",
           r2.status_code == 200, f"status={r2.status_code} id={created_group_id}")

    test_gid = created_group_id or valid_group_id

    # 7. GET /api/split/groups/{id}/summary — use valid-format but nonexistent hex id
    BAD_OID = "000000000000000000000000"
    r1 = requests.get(f"{BASE}/split/groups/{BAD_OID}/summary", headers=H, timeout=15)
    record("7a GET /split/groups/{bad_hex}/summary → 404",
           r1.status_code == 404, f"status={r1.status_code}")
    if test_gid:
        r2 = requests.get(f"{BASE}/split/groups/{test_gid}/summary", headers=H, timeout=15)
        record("7b GET /split/groups/{valid}/summary → 200",
               r2.status_code == 200, f"status={r2.status_code}")
    else:
        record("7b GET /split/groups/{valid}/summary → 200", False, "no valid group id")

    # 8. GET /api/split/groups/{id}/manage — use valid-format but nonexistent hex id
    r1 = requests.get(f"{BASE}/split/groups/{BAD_OID}/manage", headers=H, timeout=15)
    record("8a GET /split/groups/{bad_hex}/manage → 404",
           r1.status_code == 404, f"status={r1.status_code}")
    if test_gid:
        r2 = requests.get(f"{BASE}/split/groups/{test_gid}/manage", headers=H, timeout=15)
        record("8b GET /split/groups/{valid}/manage → 200",
               r2.status_code == 200, f"status={r2.status_code}")
    else:
        record("8b GET /split/groups/{valid}/manage → 200", False, "no valid group id")

    # 9. PUT /api/split/groups/{id}/name → input validation
    if test_gid:
        r1 = requests.put(f"{BASE}/split/groups/{test_gid}/name",
                          json={}, headers=H, timeout=15)
        record("9a PUT /split/groups/{id}/name empty → 400/422",
               r1.status_code in (400, 422), f"status={r1.status_code}")
        r2 = requests.put(f"{BASE}/split/groups/{test_gid}/name",
                          json={"name": "Round25B Renamed"}, headers=H, timeout=15)
        record("9b PUT /split/groups/{id}/name valid → 200",
               r2.status_code == 200, f"status={r2.status_code}")
    else:
        record("9a PUT /split/groups/{id}/name empty", False, "no group id")
        record("9b PUT /split/groups/{id}/name valid", False, "no group id")

    # 10. POST /api/split/groups/{id}/members → input validation
    if test_gid:
        r1 = requests.post(f"{BASE}/split/groups/{test_gid}/members",
                           json={}, headers=H, timeout=15)
        record("10a POST /split/groups/{id}/members empty → 400/422",
               r1.status_code in (400, 422), f"status={r1.status_code}")
        r2 = requests.post(f"{BASE}/split/groups/{test_gid}/members",
                           json={"name": "Priya", "phone": "9333444555"},
                           headers=H, timeout=15)
        record("10b POST /split/groups/{id}/members valid → 200",
               r2.status_code == 200, f"status={r2.status_code}")
    else:
        record("10a POST /split/groups/{id}/members empty", False, "no group id")
        record("10b POST /split/groups/{id}/members valid", False, "no group id")

    # 11. DELETE /api/split/groups/{id}/members/{mid} → 404 on unknown
    if test_gid:
        r = requests.delete(f"{BASE}/split/groups/{test_gid}/members/nonexistent_mid_xyz",
                            headers=H, timeout=15)
        record("11 DELETE /split/groups/{id}/members/{bad_mid} → 404",
               r.status_code == 404, f"status={r.status_code}")
    else:
        record("11 DELETE /split/groups/{id}/members/{bad_mid}", False, "no group id")

    # 12. DELETE /api/split/groups/{id}/leave → 400/404
    r = requests.delete(f"{BASE}/split/groups/{BAD_OID}/leave", headers=H, timeout=15)
    record("12 DELETE /split/groups/{bad_hex}/leave → 400/404",
           r.status_code in (400, 404), f"status={r.status_code}")

    # 13. POST /api/split/expenses → 400/422 on empty
    r = requests.post(f"{BASE}/split/expenses", json={}, headers=H, timeout=15)
    record("13 POST /split/expenses empty → 400/422",
           r.status_code in (400, 422), f"status={r.status_code}")

    # 14. PUT /api/split/expenses/{id} → 404 on bad id
    r = requests.put(f"{BASE}/split/expenses/{BAD_OID}",
                     json={"amount": 100, "description": "x", "category": "Food"},
                     headers=H, timeout=15)
    record("14 PUT /split/expenses/{bad_hex} → 404",
           r.status_code == 404, f"status={r.status_code}")

    # 15. DELETE /api/split/expenses/{id} → 404 on bad id
    r = requests.delete(f"{BASE}/split/expenses/{BAD_OID}", headers=H, timeout=15)
    record("15 DELETE /split/expenses/{bad_hex} → 404",
           r.status_code == 404, f"status={r.status_code}")

    # 16. GET /api/split/pay-intent/{uid}?amount=100 → 200/404
    r = requests.get(f"{BASE}/split/pay-intent/{BAD_OID}?amount=100",
                     headers=H, timeout=15)
    record("16 GET /split/pay-intent/{bad_hex}?amount=100 → 200/404",
           r.status_code in (200, 404), f"status={r.status_code}")

    # 17. POST /api/split/settle-with-rewards → 400 on empty
    r = requests.post(f"{BASE}/split/settle-with-rewards", json={}, headers=H, timeout=15)
    record("17 POST /split/settle-with-rewards empty → 400",
           r.status_code in (400, 422), f"status={r.status_code}")

    # 18. POST /api/split/partial-settle → 400 on empty
    r = requests.post(f"{BASE}/split/partial-settle", json={}, headers=H, timeout=15)
    record("18 POST /split/partial-settle empty → 400",
           r.status_code in (400, 422), f"status={r.status_code}")

    # 19. POST /api/split/mark-paid-offline → 400 on empty
    r = requests.post(f"{BASE}/split/mark-paid-offline", json={}, headers=H, timeout=15)
    record("19 POST /split/mark-paid-offline empty → 400",
           r.status_code in (400, 422), f"status={r.status_code}")

    # 20. POST /api/split/remind → 400 on empty
    r = requests.post(f"{BASE}/split/remind", json={}, headers=H, timeout=15)
    record("20 POST /split/remind empty → 400",
           r.status_code in (400, 422), f"status={r.status_code}")

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    print(f"TOTAL: {passed} PASS / {failed} FAIL / {len(results)} total")
    for n, s, d in results:
        if s == "FAIL":
            print(f"  FAIL: {n}  {d}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
