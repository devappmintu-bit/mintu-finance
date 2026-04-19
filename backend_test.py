"""Round 14 regression test — premium router refactor + deep-report validation.

Tests:
A) Core premium endpoints after the refactor (status, mock-activate, paywall, tax, invest, catalog)
B) NEW GET /api/premium/deep-report — 403 before premium, 200 after
C) Previously crashing AI endpoints (insights/daily, waste-detector, money-school/dynamic, ai/agents, ai/chat)
D) Sanity on other routers (splits, transactions, analytics)
"""
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []


def check(name, cond, info=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}{' — ' + info if info else ''}")
    results.append((name, cond, info))
    return cond


def post(path, token=None, **kwargs):
    h = kwargs.pop("headers", {})
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(BASE + path, headers=h, timeout=60, **kwargs)


def get(path, token=None, **kwargs):
    h = kwargs.pop("headers", {})
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(BASE + path, headers=h, timeout=60, **kwargs)


# ---------- AUTH ----------
print("\n===== AUTH =====")
r = post("/auth/send-otp", json={"phone": PHONE})
check("send-otp", r.status_code == 200, f"status={r.status_code}")
r = post("/auth/verify-otp", json={"phone": PHONE, "otp": OTP})
check("verify-otp", r.status_code == 200, f"status={r.status_code}")
token = r.json().get("access_token") or r.json().get("token")
check("token present", bool(token))


# ---------- A) PREMIUM CORE ----------
print("\n===== A) PREMIUM CORE =====")
r = get("/premium/status", token)
check("GET /premium/status (200)", r.status_code == 200, f"status={r.status_code}")
status_body = r.json() if r.status_code == 200 else {}
was_premium_before = status_body.get("is_premium", False)
check("/premium/status has expected keys",
      all(k in status_body for k in ["is_premium", "tier", "features", "pricing"]),
      f"keys={list(status_body.keys())}")
print(f"   (was_premium_before={was_premium_before})")

# If user was already premium from a previous test run, reset tier for 403 check
if was_premium_before:
    print("   -> downgrading user to free tier (direct DB) so we can test 403 path")
    try:
        import pymongo
        mongo_url = "mongodb://localhost:27017"
        db_name = "test_database"
        with open("/app/backend/.env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("MONGO_URL"):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("DB_NAME"):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
        cli = pymongo.MongoClient(mongo_url)
        dbh = cli[db_name]
        res = dbh.users.update_one(
            {"phone": PHONE},
            {"$set": {"premium_tier": "free", "premium_until": None, "premium_plan": None}}
        )
        print(f"      downgrade result: matched={res.matched_count} modified={res.modified_count}")
    except Exception as e:
        print(f"   downgrade failed: {e}")

# B) Deep-report 403 BEFORE premium
print("\n===== B) DEEP-REPORT 403 BEFORE PREMIUM =====")
r = get("/premium/deep-report?months=6", token)
check("GET /premium/deep-report?months=6 BEFORE activation -> 403",
      r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")

# Now mock-activate monthly
print("\n===== A) MOCK-ACTIVATE monthly =====")
r = post("/premium/mock-activate", token, json={"plan": "monthly"})
check("POST /premium/mock-activate monthly", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")
if r.status_code == 200:
    body = r.json()
    check("mock-activate -> is_premium true", body.get("is_premium") is True)
    check("mock-activate -> tier=premium", body.get("tier") == "premium")
    check("mock-activate -> plan=monthly", body.get("plan") == "monthly")
    check("mock-activate -> premium_until set", bool(body.get("premium_until")))

# Confirm /premium/status reflects premium
r = get("/premium/status", token)
check("/premium/status after activation -> is_premium true",
      r.status_code == 200 and r.json().get("is_premium") is True,
      f"body={r.text[:200]}")

# Paywall trigger
r = get("/premium/paywall-trigger", token)
check("GET /premium/paywall-trigger", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    body = r.json()
    check("paywall has total_spent / hook_text / pricing",
          all(k in body for k in ["total_spent", "hook_text", "pricing", "features"]),
          f"keys={list(body.keys())}")

# Tax calculator
r = post("/premium/tax-calculator", token,
         json={"annual_income": 1200000, "section_80c": 50000})
check("POST /premium/tax-calculator", r.status_code == 200,
      f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    body = r.json()
    has_fields = any(k in body for k in ["new_regime", "old_regime", "recommended"])
    check("tax-calc shape", has_fields, f"keys={list(body.keys())}")

# Investment suggest
r = post("/premium/investment-suggest", token,
         json={"monthly_income": 80000, "age": 28, "risk": "medium"})
check("POST /premium/investment-suggest", r.status_code == 200,
      f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    body = r.json()
    check("investment-suggest returns data", bool(body),
          f"keys={list(body.keys())}")

# Features catalog
r = get("/premium/features-catalog", token)
check("GET /premium/features-catalog", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    body = r.json()
    check("features-catalog sections >=4", len(body.get("sections", [])) >= 4,
          f"sections={len(body.get('sections', []))}")

# B) Deep-report AFTER premium
print("\n===== B) DEEP-REPORT AFTER PREMIUM =====")
r = get("/premium/deep-report?months=6", token)
check("GET /premium/deep-report?months=6 AFTER activation -> 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    body = r.json()
    required = ["totals", "averages", "predicted", "monthly_series",
                "top_categories", "top_merchants", "exec_summary", "generated_at"]
    missing = [k for k in required if k not in body]
    check("deep-report top-level keys", not missing, f"missing={missing}")

    totals = body.get("totals", {})
    check("totals has income/expense/savings/savings_rate/transaction_count",
          all(k in totals for k in ["income", "expense", "savings",
                                     "savings_rate", "transaction_count"]),
          f"totals keys={list(totals.keys())}")

    averages = body.get("averages", {})
    check("averages has monthly_income/expense/mom_expense_growth_pct",
          all(k in averages for k in ["monthly_income", "monthly_expense",
                                       "mom_expense_growth_pct"]),
          f"averages keys={list(averages.keys())}")

    predicted = body.get("predicted", {})
    check("predicted has year_expense/year_savings",
          all(k in predicted for k in ["year_expense", "year_savings"]),
          f"predicted keys={list(predicted.keys())}")

    ms = body.get("monthly_series", [])
    if ms:
        check("monthly_series items have month/income/expense/net",
              all(k in ms[0] for k in ["month", "income", "expense", "net"]),
              f"first item keys={list(ms[0].keys())}")

    tc = body.get("top_categories", [])
    if tc:
        check("top_categories items have name/amount/pct",
              all(k in tc[0] for k in ["name", "amount", "pct"]),
              f"first item keys={list(tc[0].keys())}")

    tm = body.get("top_merchants", [])
    if tm:
        check("top_merchants items have name/amount/pct",
              all(k in tm[0] for k in ["name", "amount", "pct"]),
              f"first item keys={list(tm[0].keys())}")

    check("exec_summary is string", isinstance(body.get("exec_summary"), str))
    check("generated_at is iso", bool(body.get("generated_at")))
    print(f"   deep-report sample: txn_count={totals.get('transaction_count')}, "
          f"income={totals.get('income')}, expense={totals.get('expense')}, "
          f"months_in_series={len(body.get('monthly_series', []))}, "
          f"top_cats={len(body.get('top_categories', []))}, "
          f"exec_summary_len={len(body.get('exec_summary', ''))}")

# Also test months=12 and months=3
r = get("/premium/deep-report?months=12", token)
check("GET /premium/deep-report?months=12 -> 200", r.status_code == 200, f"status={r.status_code}")
r = get("/premium/deep-report?months=3", token)
check("GET /premium/deep-report?months=3 -> 200", r.status_code == 200, f"status={r.status_code}")

# ---------- C) Previously crashing AI endpoints ----------
print("\n===== C) AI ENDPOINTS (verify no NameError) =====")
r = get("/insights/daily", token)
check("GET /api/insights/daily", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")

r = get("/waste-detector", token)
check("GET /api/waste-detector", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")

r = get("/money-school/dynamic?lang=en", token)
check("GET /api/money-school/dynamic?lang=en", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")

r = get("/ai/agents", token)
check("GET /api/ai/agents", r.status_code == 200, f"status={r.status_code}")

r = post("/ai/chat", token, json={"message": "Hi", "lang": "en"})
check("POST /api/ai/chat", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")

# ---------- D) SANITY OTHER ROUTERS ----------
print("\n===== D) OTHER ROUTER SANITY =====")
r = get("/split/groups", token)
check("GET /api/split/groups", r.status_code == 200, f"status={r.status_code}")

r = get("/transactions", token)
check("GET /api/transactions", r.status_code == 200, f"status={r.status_code}")

r = get("/analytics/summary", token)
check("GET /api/analytics/summary", r.status_code == 200, f"status={r.status_code}")

# ---------- SUMMARY ----------
print("\n" + "=" * 60)
passed = sum(1 for _, c, _ in results if c)
total = len(results)
print(f"RESULT: {passed}/{total} passed")
for n, c, info in results:
    if not c:
        print(f"  FAIL: {n} — {info}")
sys.exit(0 if passed == total else 1)
