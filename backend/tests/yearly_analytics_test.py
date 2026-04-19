"""MintU — Smoke test for GET /api/analytics/yearly endpoint."""
import os
import sys
import json
import requests

BASE_URL = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com") + "/api"

PASS = []
FAIL = []


def assert_true(cond, msg):
    if cond:
        PASS.append(msg)
        print(f"  ✅ {msg}")
    else:
        FAIL.append(msg)
        print(f"  ❌ {msg}")


def section(name):
    print(f"\n=== {name} ===")


# ---------- AUTH ----------
section("AUTH")
r = requests.post(
    f"{BASE_URL}/auth/login",
    json={"phone": "9876543210", "password": "test123"},
    timeout=30,
)
assert_true(r.status_code == 200, f"POST /api/auth/login → 200 (got {r.status_code})")
token = r.json().get("token") or r.json().get("access_token")
assert_true(bool(token), f"JWT present (len={len(token) if token else 0})")
H = {"Authorization": f"Bearer {token}"}


# ---------- T1: default yearly (trailing 12) ----------
section("T1: GET /api/analytics/yearly (default trailing 12)")
r = requests.get(f"{BASE_URL}/analytics/yearly", headers=H, timeout=60)
assert_true(r.status_code == 200, f"Status 200 (got {r.status_code})")
try:
    d = r.json()
except Exception as e:
    FAIL.append(f"JSON parse error: {e}")
    print("FATAL: cannot continue without JSON body")
    sys.exit(1)

# Top level keys
for k in ["mode", "label", "year", "monthly", "yearly", "top_categories", "momentum", "highlights", "headline"]:
    assert_true(k in d, f"Top-level key '{k}' present")

assert_true(d.get("mode") == "trailing_12", f"mode == 'trailing_12' (got {d.get('mode')!r})")
assert_true(isinstance(d.get("label"), str) and len(d["label"]) > 0, "label is non-empty string")
assert_true(isinstance(d.get("year"), int), "year is int")

# monthly array of exactly 12
monthly = d.get("monthly", [])
assert_true(isinstance(monthly, list), "monthly is list")
assert_true(len(monthly) == 12, f"monthly length == 12 (got {len(monthly)})")

# Each monthly item keys
required_month_keys = ["label", "month_num", "year", "income", "expense", "savings", "savings_rate", "txn_count", "top_category"]
all_items_ok = True
for i, m in enumerate(monthly):
    missing = [k for k in required_month_keys if k not in m]
    if missing:
        all_items_ok = False
        print(f"    monthly[{i}] missing: {missing}")
assert_true(all_items_ok, f"All 12 monthly items have required keys {required_month_keys}")

# yearly
yr = d.get("yearly", {})
for k in ["income", "expense", "savings", "savings_rate", "avg_monthly_spend", "avg_monthly_income", "txn_count"]:
    assert_true(k in yr, f"yearly.{k} present")
    assert_true(isinstance(yr.get(k), (int, float)), f"yearly.{k} is number (got {type(yr.get(k)).__name__})")

# top_categories
top_cats = d.get("top_categories", [])
assert_true(isinstance(top_cats, list) and len(top_cats) <= 5, f"top_categories list, len ≤ 5 (got {len(top_cats)})")
for i, tc in enumerate(top_cats):
    for k in ["name", "amount", "pct"]:
        if k not in tc:
            FAIL.append(f"top_categories[{i}] missing '{k}'")
assert_true(all(("name" in tc and "amount" in tc and "pct" in tc) for tc in top_cats), "All top_categories items have {name, amount, pct}")

# momentum
mom = d.get("momentum", {})
assert_true(mom.get("direction") in ("rising", "falling", "steady"), f"momentum.direction ∈ enum (got {mom.get('direction')!r})")
assert_true("change_pct" in mom, "momentum.change_pct present")
assert_true(isinstance(mom.get("commentary"), str) and len(mom["commentary"]) > 0, "momentum.commentary non-empty string")

# highlights
hl = d.get("highlights", {})
for k in ["highest_spend_month", "lowest_spend_month", "best_savings_month"]:
    assert_true(k in hl, f"highlights.{k} present")
    v = hl.get(k)
    assert_true(v is None or isinstance(v, dict), f"highlights.{k} is null or dict")

# headline
hl_text = d.get("headline")
assert_true(isinstance(hl_text, str) and len(hl_text) > 0, f"headline non-empty string (len={len(hl_text) if hl_text else 0})")

# Save for T3 / T4
t1_data = d
print(f"    Info: yearly income=₹{yr.get('income')}, expense=₹{yr.get('expense')}, txn_count={yr.get('txn_count')}")
print(f"    Info: headline={hl_text!r}")


# ---------- T2: calendar year 2025 ----------
section("T2: GET /api/analytics/yearly?year=2025")
r = requests.get(f"{BASE_URL}/analytics/yearly", params={"year": 2025}, headers=H, timeout=60)
assert_true(r.status_code == 200, f"Status 200 (got {r.status_code})")
d2 = r.json()
assert_true(d2.get("mode") == "calendar", f"mode == 'calendar' (got {d2.get('mode')!r})")
assert_true(d2.get("label") == "Calendar 2025", f"label == 'Calendar 2025' (got {d2.get('label')!r})")
m2 = d2.get("monthly", [])
assert_true(len(m2) == 12, f"monthly length 12 (got {len(m2)})")
months_ok = all(
    (item.get("month_num") == (i + 1) and item.get("year") == 2025)
    for i, item in enumerate(m2)
)
assert_true(months_ok, "monthly has month_num 1..12 all year==2025")
first_label = m2[0].get("label", "") if m2 else ""
assert_true(first_label.startswith("Jan"), f"monthly[0].label starts with 'Jan' (got {first_label!r})")


# ---------- T3: Data consistency ----------
section("T3: Data consistency")
d = t1_data
monthly = d["monthly"]
yr = d["yearly"]

sum_income = round(sum(m["income"] for m in monthly), 2)
sum_expense = round(sum(m["expense"] for m in monthly), 2)
sum_txn_count = sum(m["txn_count"] for m in monthly)

assert_true(abs(sum_income - yr["income"]) <= 1.0,
            f"Σ monthly.income ({sum_income}) == yearly.income ({yr['income']}) within ₹1")
assert_true(abs(sum_expense - yr["expense"]) <= 1.0,
            f"Σ monthly.expense ({sum_expense}) == yearly.expense ({yr['expense']}) within ₹1")
expected_savings = yr["income"] - yr["expense"]
assert_true(abs(yr["savings"] - expected_savings) <= 1.0,
            f"yearly.savings ({yr['savings']}) == income − expense ({expected_savings}) within ₹1")
assert_true(sum_txn_count == yr["txn_count"],
            f"Σ monthly.txn_count ({sum_txn_count}) == yearly.txn_count ({yr['txn_count']})")


# ---------- T4: Edge cases ----------
section("T4: Edge cases")
assert_true("No spending tracked" not in d["headline"],
            f"headline does NOT contain 'No spending tracked' (got {d['headline']!r})")
if d["top_categories"]:
    pct0 = d["top_categories"][0].get("pct")
    assert_true(isinstance(pct0, (int, float)) and 0 <= pct0 <= 100,
                f"top_categories[0].pct in [0,100] (got {pct0})")
else:
    FAIL.append("top_categories is empty — but user has substantial data")
    print("  ❌ top_categories empty despite substantial data")


# ---------- T5: Regression ----------
section("T5: Regression — previous MintU 2.0 endpoints")

def check_get(path, label, status_expected=200):
    try:
        r = requests.get(f"{BASE_URL}{path}", headers=H, timeout=60)
        assert_true(r.status_code == status_expected, f"GET {path} → {status_expected} (got {r.status_code})")
    except Exception as e:
        FAIL.append(f"GET {path} → EXCEPTION {e}")
        print(f"  ❌ GET {path} EXCEPTION: {e}")

def check_post(path, body, label):
    try:
        r = requests.post(f"{BASE_URL}{path}", json=body, headers=H, timeout=60)
        assert_true(r.status_code == 200, f"POST {path} → 200 (got {r.status_code})")
    except Exception as e:
        FAIL.append(f"POST {path} → EXCEPTION {e}")
        print(f"  ❌ POST {path} EXCEPTION: {e}")

check_get("/home/snapshot", "home/snapshot")
check_get("/ai/predict", "ai/predict")
check_get("/split/activity", "split/activity")
check_post("/premium/tax-calculator", {"annual_income": 1000000}, "premium/tax-calculator")
check_post("/premium/investment-suggest", {"monthly_income": 50000}, "premium/investment-suggest")
check_get("/coins/status", "coins/status")


# ---------- SUMMARY ----------
print("\n" + "=" * 70)
print(f"RESULTS: {len(PASS)} PASSED · {len(FAIL)} FAILED")
print("=" * 70)
if FAIL:
    print("\nFAILURES:")
    for f in FAIL:
        print(f"  ❌ {f}")
    sys.exit(1)
else:
    print("✅ ALL ASSERTIONS PASSED")
    sys.exit(0)
