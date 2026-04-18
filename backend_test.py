"""Smoke test for budgets router refactor + regression on transactions & gamification."""
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


def run():
    results = []
    token = auth()
    h = {"Authorization": f"Bearer {token}"}

    # Cleanup any leftover Food budget
    try:
        rc = requests.get(f"{BASE}/budgets", headers=h, timeout=30)
        if rc.status_code == 200:
            for b in rc.json():
                if b.get("category") == "Food":
                    requests.delete(f"{BASE}/budgets/{b['id']}", headers=h, timeout=30)
    except Exception:
        pass

    r = requests.post(f"{BASE}/budgets", json={"category": "Food", "amount": 5000, "period": "monthly"}, headers=h, timeout=30)
    ok1 = r.status_code == 200 and "id" in r.json()
    results.append(("1. POST /api/budgets create", ok1, r.status_code, r.text[:250]))
    if not ok1:
        return results
    budget_id = r.json()["id"]

    r = requests.get(f"{BASE}/budgets", headers=h, timeout=30)
    ok2 = False
    if r.status_code == 200 and isinstance(r.json(), list):
        food = [b for b in r.json() if b.get("category") == "Food"]
        ok2 = len(food) >= 1 and "spent" in food[0]
    results.append(("2. GET /api/budgets (Food + spent)", ok2, r.status_code, str(r.json())[:250]))

    r = requests.post(f"{BASE}/budgets", json={"category": "Food", "amount": 6000, "period": "monthly"}, headers=h, timeout=30)
    upsert_id = r.json().get("id") if r.status_code == 200 else None
    ok3 = r.status_code == 200 and upsert_id == budget_id and r.json().get("amount") == 6000
    results.append(("3. POST upsert same category", ok3, r.status_code, r.text[:250]))

    r = requests.delete(f"{BASE}/budgets/{budget_id}", headers=h, timeout=30)
    ok4 = r.status_code == 200 and r.json().get("message") == "Budget deleted"
    results.append(("4. DELETE /api/budgets/{id}", ok4, r.status_code, r.text[:250]))

    r = requests.delete(f"{BASE}/budgets/000000000000000000000000", headers=h, timeout=30)
    ok5 = r.status_code == 404
    results.append(("5. DELETE invalid id -> 404", ok5, r.status_code, r.text[:250]))

    r = requests.get(f"{BASE}/transactions", headers=h, timeout=30)
    ok6 = r.status_code == 200 and isinstance(r.json(), list)
    results.append(("6. GET /api/transactions", ok6, r.status_code, str(r.json())[:150]))

    r = requests.get(f"{BASE}/gamification/status", headers=h, timeout=30)
    ok7 = r.status_code == 200 and "streak" in r.json()
    results.append(("7. GET /api/gamification/status", ok7, r.status_code, str(r.json())[:200]))

    return results


if __name__ == "__main__":
    try:
        results = run()
    except AssertionError as e:
        print("FATAL:", e)
        sys.exit(1)

    print("\n===== BUDGETS REFACTOR SMOKE TEST =====")
    passed = 0
    for name, ok, status, body in results:
        flag = "PASS" if ok else "FAIL"
        print(f"[{flag}] {name} -> HTTP {status}")
        if not ok:
            print(f"       body: {body}")
        passed += int(bool(ok))
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 2)
