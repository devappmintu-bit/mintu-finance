"""Family router smoke test (Apr 18 2026)."""
import requests, json, sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

def pp(label, r):
    print(f"[{r.status_code}] {label}")
    try:
        print(json.dumps(r.json(), indent=2, default=str)[:800])
    except Exception:
        print(r.text[:400])
    print("---")

def main():
    # Auth
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE})
    pp("send-otp", r)
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP})
    pp("verify-otp", r)
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}

    results = {}

    # 1. Create family group
    r = requests.post(f"{BASE}/family/create", json={"name": "Test Family"}, headers=H)
    pp("POST /family/create", r)
    results["create"] = r.status_code
    group_id = r.json().get("id") if r.status_code == 200 else None

    # 2. My groups
    r = requests.get(f"{BASE}/family/my-groups", headers=H)
    pp("GET /family/my-groups", r)
    results["my-groups"] = r.status_code
    if r.status_code == 200:
        groups = r.json()
        found = any(g.get("id") == group_id for g in groups)
        print(f"  Includes new family: {found}")
        results["my-groups-includes"] = found

    # 3. Create family budget
    if group_id:
        r = requests.post(f"{BASE}/family/{group_id}/budget",
                          json={"category": "Groceries", "amount": 10000, "period": "monthly"},
                          headers=H)
        pp("POST /family/{id}/budget", r)
        results["budget-create"] = r.status_code

        # 4. Get budgets
        r = requests.get(f"{BASE}/family/{group_id}/budgets", headers=H)
        pp("GET /family/{id}/budgets", r)
        results["budgets-get"] = r.status_code
        if r.status_code == 200:
            data = r.json()
            for k in ("group_name", "members", "budgets"):
                print(f"  has '{k}': {k in data}")

        # 5. Summary
        r = requests.get(f"{BASE}/family/{group_id}/summary", headers=H)
        pp("GET /family/{id}/summary", r)
        results["summary"] = r.status_code
        if r.status_code == 200:
            data = r.json()
            for k in ("total_income", "total_expense", "member_stats"):
                print(f"  has '{k}': {k in data}")

    # 6. Regression - personal budgets router
    r = requests.get(f"{BASE}/budgets", headers=H)
    pp("GET /budgets (regression)", r)
    results["budgets-regression"] = r.status_code

    # 7. Regression - transactions
    r = requests.get(f"{BASE}/transactions?limit=5", headers=H)
    pp("GET /transactions (regression)", r)
    results["transactions-regression"] = r.status_code

    print("\n\n=== SUMMARY ===")
    for k, v in results.items():
        print(f"  {k}: {v}")

    has_500 = any(isinstance(v, int) and v >= 500 for v in results.values())
    all_ok = all((v == 200 or v is True) for k, v in results.items() if k != "my-groups-includes") and results.get("my-groups-includes") is not False
    print(f"\nAny 500s: {has_500}")
    print(f"All OK: {all_ok}")
    sys.exit(0 if all_ok and not has_500 else 1)

if __name__ == "__main__":
    main()
