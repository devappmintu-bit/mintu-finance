"""MintU 2.0 Phase 4 — Premium monetization endpoints smoke test."""
import requests, json, sys

BASE = "https://mintu-finance.preview.emergentagent.com/api"

results = []

def rec(name, passed, detail=""):
    results.append((name, passed, detail))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} — {detail}")


# --- AUTH ---
r = requests.post(f"{BASE}/auth/login", json={"phone": "9876543210", "password": "test123"}, timeout=30)
if r.status_code != 200:
    print(f"AUTH FAIL: {r.status_code} {r.text}")
    sys.exit(1)
token = r.json().get("token") or r.json().get("access_token")
H = {"Authorization": f"Bearer {token}"}
print(f"Auth OK, token len={len(token)}")


# --- T1: Tax calculator happy path ---
body = {"annual_income": 1500000, "section_80c": 50000, "section_80d": 15000}
r = requests.post(f"{BASE}/premium/tax-calculator", json=body, headers=H, timeout=30)
if r.status_code != 200:
    rec("T1 tax-calculator 200", False, f"got {r.status_code}: {r.text[:200]}")
else:
    d = r.json()
    req_top = ["input", "new_regime", "old_regime", "recommended_regime",
               "savings_by_choosing_recommended", "suggestions", "disclaimer"]
    missing_top = [k for k in req_top if k not in d]
    rec("T1.a top-level keys", not missing_top, f"missing={missing_top}" if missing_top else "all 7 present")

    nr = d.get("new_regime", {})
    req_new = ["taxable_income", "tax_before_rebate", "rebate_87a", "tax_after_rebate",
               "cess_4pct", "total_tax", "effective_rate_pct"]
    missing_new = [k for k in req_new if k not in nr]
    not_num_new = [k for k in req_new if k in nr and not isinstance(nr[k], (int, float))]
    rec("T1.b new_regime keys+types", not missing_new and not not_num_new,
        f"missing={missing_new}, not_num={not_num_new}; values={nr}")

    orr = d.get("old_regime", {})
    req_old = req_new + ["total_deductions"]
    missing_old = [k for k in req_old if k not in orr]
    rec("T1.c old_regime keys", not missing_old, f"missing={missing_old}; values={orr}")

    rec("T1.d recommended_regime enum", d.get("recommended_regime") in {"new", "old"},
        f"got={d.get('recommended_regime')}")

    sv = d.get("savings_by_choosing_recommended")
    rec("T1.e savings non-negative number", isinstance(sv, (int, float)) and sv >= 0, f"val={sv}")

    sug = d.get("suggestions", [])
    rec("T1.f suggestions is array", isinstance(sug, list), f"type={type(sug).__name__}")

    # for income 15L + 80C=50K, expect "Invest ₹100,000 more in 80C"
    titles = [s.get("title", "") for s in sug]
    expected_sub = "100,000 more in 80C"
    match = any(expected_sub in t for t in titles)
    rec("T1.g 80C suggestion present", match, f"titles={titles}")


# --- T2: zero income ---
r = requests.post(f"{BASE}/premium/tax-calculator", json={"annual_income": 0}, headers=H, timeout=15)
rec("T2 zero income → 400", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")


# --- T3: low income rebate ---
r = requests.post(f"{BASE}/premium/tax-calculator", json={"annual_income": 800000}, headers=H, timeout=15)
if r.status_code != 200:
    rec("T3 low income 200", False, f"got {r.status_code}")
else:
    d = r.json()
    tt = d.get("new_regime", {}).get("total_tax")
    rec("T3 new_regime.total_tax == 0 (rebate)", tt == 0, f"total_tax={tt}")


# --- T4: investment-suggest happy path ---
body = {"monthly_income": 75000, "monthly_expenses": 50000, "age": 28, "risk": "medium"}
r = requests.post(f"{BASE}/premium/investment-suggest", json=body, headers=H, timeout=15)
if r.status_code != 200:
    rec("T4 investment-suggest 200", False, f"got {r.status_code}: {r.text[:200]}")
else:
    d = r.json()
    req_top = ["investible_monthly", "allocations", "annual_investment", "projected_10yr",
               "emergency_fund_target", "disclaimer"]
    missing = [k for k in req_top if k not in d]
    rec("T4.a top keys", not missing, f"missing={missing}")

    rec("T4.b investible_monthly==25000", d.get("investible_monthly") == 25000,
        f"got={d.get('investible_monthly')}")

    allocs = d.get("allocations", [])
    rec("T4.c allocations >=5", len(allocs) >= 5, f"got {len(allocs)}")

    if allocs:
        required_fields = ["id", "title", "amount", "pct", "why", "products", "platform", "icon", "color"]
        bad = []
        for i, a in enumerate(allocs):
            missing_f = [f for f in required_fields if f not in a]
            if missing_f:
                bad.append(f"alloc[{i}] missing {missing_f}")
            if "products" in a and not isinstance(a["products"], list):
                bad.append(f"alloc[{i}] products not list")
        rec("T4.d allocation fields", not bad, "; ".join(bad) if bad else "all fields present")


# --- T5: no surplus ---
body = {"monthly_income": 40000, "monthly_expenses": 45000}
r = requests.post(f"{BASE}/premium/investment-suggest", json=body, headers=H, timeout=15)
if r.status_code != 200:
    rec("T5 no surplus 200", False, f"got {r.status_code}")
else:
    d = r.json()
    rec("T5.a investible_monthly==0", d.get("investible_monthly") == 0,
        f"got={d.get('investible_monthly')}")
    hl = d.get("headline", "").lower()
    match = "no surplus" in hl or "reducing expenses" in hl
    rec("T5.b headline mentions no surplus/reducing expenses", match, f"headline='{d.get('headline')}'")


# --- T6: features catalog ---
r = requests.get(f"{BASE}/premium/features-catalog", headers=H, timeout=15)
if r.status_code != 200:
    rec("T6 features-catalog 200", False, f"got {r.status_code}: {r.text[:200]}")
else:
    d = r.json()
    req_top = ["is_premium", "tier", "price", "sections", "cta_text", "cta_highlight"]
    missing = [k for k in req_top if k not in d]
    rec("T6.a top keys", not missing, f"missing={missing}")
    rec("T6.b is_premium bool", isinstance(d.get("is_premium"), bool), f"val={d.get('is_premium')}")

    p = d.get("price", {})
    price_keys = ["monthly", "annual", "annual_savings_pct"]
    missing_p = [k for k in price_keys if k not in p]
    rec("T6.c price keys", not missing_p, f"missing={missing_p}; price={p}")

    secs = d.get("sections", [])
    rec("T6.d sections is list of 4", isinstance(secs, list) and len(secs) == 4,
        f"count={len(secs) if isinstance(secs, list) else 'N/A'}")

    bad = []
    for i, s in enumerate(secs):
        for f in ["id", "title", "emoji", "features"]:
            if f not in s:
                bad.append(f"section[{i}] missing {f}")
        feats = s.get("features", [])
        if not isinstance(feats, list):
            bad.append(f"section[{i}].features not list")
            continue
        for j, ft in enumerate(feats):
            for f in ["name", "free", "premium"]:
                if f not in ft:
                    bad.append(f"section[{i}].feat[{j}] missing {f}")
            if "free" in ft and not isinstance(ft["free"], bool):
                bad.append(f"section[{i}].feat[{j}].free not bool")
            if "premium" in ft and not isinstance(ft["premium"], bool):
                bad.append(f"section[{i}].feat[{j}].premium not bool")
    rec("T6.e section+feature shape", not bad, "; ".join(bad[:5]) if bad else "all sections+features valid")


# --- T7: Validation ---
r = requests.post(f"{BASE}/premium/tax-calculator", json={"annual_income": -1000}, headers=H, timeout=15)
rec("T7.a tax -1000 → 400", r.status_code == 400, f"got {r.status_code}: {r.text[:100]}")

r = requests.post(f"{BASE}/premium/investment-suggest", json={"monthly_income": 0}, headers=H, timeout=15)
rec("T7.b invest 0 → 400", r.status_code == 400, f"got {r.status_code}: {r.text[:100]}")

r = requests.post(f"{BASE}/premium/investment-suggest", json={"monthly_income": -500}, headers=H, timeout=15)
rec("T7.c invest -500 → 400", r.status_code == 400, f"got {r.status_code}: {r.text[:100]}")


# --- T8: Regression ---
r = requests.get(f"{BASE}/home/snapshot", headers=H, timeout=20)
rec("T8.a GET /home/snapshot 200", r.status_code == 200, f"got {r.status_code}")

r = requests.get(f"{BASE}/ai/predict", headers=H, timeout=30)
rec("T8.b GET /ai/predict 200", r.status_code == 200, f"got {r.status_code}")

r = requests.get(f"{BASE}/split/activity", headers=H, timeout=15)
rec("T8.c GET /split/activity 200", r.status_code == 200, f"got {r.status_code}")

r = requests.post(f"{BASE}/split/invite-to-settle",
                  json={"target_name": "Riya", "amount": 500, "group_name": "Goa Trip"},
                  headers=H, timeout=15)
rec("T8.d POST /split/invite-to-settle 200", r.status_code == 200, f"got {r.status_code}: {r.text[:150]}")

r = requests.post(f"{BASE}/coins/award", json={"action": "add_transaction"}, headers=H, timeout=15)
rec("T8.e POST /coins/award 200", r.status_code == 200, f"got {r.status_code}: {r.text[:150]}")

r = requests.get(f"{BASE}/coins/status", headers=H, timeout=15)
rec("T8.f GET /coins/status 200", r.status_code == 200, f"got {r.status_code}")


# --- Summary ---
print("\n" + "=" * 60)
passed = sum(1 for _, p, _ in results if p)
total = len(results)
print(f"TOTAL: {passed}/{total} passed")
failed = [(n, d) for n, p, d in results if not p]
if failed:
    print("\nFAILED:")
    for n, d in failed:
        print(f"  ✗ {n}: {d}")
else:
    print("ALL PASS ✅")

sys.exit(0 if passed == total else 1)
