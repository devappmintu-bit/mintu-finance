"""Round 18 Budget Phase-1 backend tests.

Tests /api/budgets/live, /api/budgets/smart-suggest cap, and regression endpoints
against the live preview backend.
"""
import os
import sys
import json
import time
import calendar
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

# Results tracker
PASSED: List[str] = []
FAILED: List[str] = []


def record(ok: bool, name: str, detail: str = "") -> None:
    if ok:
        PASSED.append(name)
        print(f"  ✅ {name}")
    else:
        FAILED.append(f"{name} — {detail}")
        print(f"  ❌ {name} — {detail}")


def auth_token() -> str:
    r = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(f"{BASE_URL}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in response: {data}"
    return tok


def H(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
def delete_all_budgets(tok: str) -> None:
    r = requests.get(f"{BASE_URL}/budgets", headers=H(tok), timeout=20)
    if r.status_code != 200:
        return
    for b in r.json():
        bid = b.get("id")
        if bid:
            requests.delete(f"{BASE_URL}/budgets/{bid}", headers=H(tok), timeout=20)


def delete_all_txns(tok: str, categories: List[str], only_marked: bool = False) -> None:
    """Delete ALL transactions in the given categories for the test user.
    Use only_marked=True to only remove our r18_test-marked txns.
    """
    r = requests.get(f"{BASE_URL}/transactions?limit=2000", headers=H(tok), timeout=30)
    if r.status_code != 200:
        return
    body = r.json()
    rows = body if isinstance(body, list) else body.get("transactions", [])
    for t in rows:
        if t.get("category") not in categories:
            continue
        if only_marked and not (t.get("description") or "").startswith("r18_test"):
            continue
        tid = t.get("id") or t.get("_id")
        if tid:
            requests.delete(f"{BASE_URL}/transactions/{tid}", headers=H(tok), timeout=20)


# ---------------------------------------------------------------------------
def days_in_current_month() -> int:
    now = datetime.utcnow()
    return calendar.monthrange(now.year, now.month)[1]


def today_iso() -> str:
    # send an ISO string with "T" separator that FastAPI will parse to a datetime
    return datetime.utcnow().replace(microsecond=0).isoformat()


def days_ago_iso(n: int) -> str:
    return (datetime.utcnow() - timedelta(days=n)).replace(microsecond=0).isoformat()


# ===========================================================================
def test_1_empty_state(tok: str) -> None:
    print("\n[Test 1] GET /api/budgets/live empty state")
    delete_all_budgets(tok)
    # wipe ALL txns in these categories so test-2 measures exactly what we insert
    delete_all_txns(tok, ["Food", "Transport", "Shopping", "Other", "Bills"])

    r = requests.get(f"{BASE_URL}/budgets/live", headers=H(tok), timeout=20)
    record(r.status_code == 200, "T1 status 200", f"got {r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    data = r.json()
    record(data.get("budgets") == [], "T1 budgets == []", f"got {data.get('budgets')}")
    s = data.get("summary") or {}
    record(s.get("total_budgeted") == 0, "T1 total_budgeted == 0", f"got {s.get('total_budgeted')}")
    record(s.get("total_spent") == 0, "T1 total_spent == 0", f"got {s.get('total_spent')}")
    record(s.get("total_remaining") == 0, "T1 total_remaining == 0", f"got {s.get('total_remaining')}")
    record(s.get("overall_pct") == 0, "T1 overall_pct == 0", f"got {s.get('overall_pct')}")
    sources = s.get("sources") or {}
    record(sources.get("transactions") == 0, "T1 sources.transactions == 0", f"got {sources}")
    record(sources.get("splits") == 0, "T1 sources.splits == 0", f"got {sources}")


# ===========================================================================
def test_2_monthly_food(tok: str) -> Dict[str, Any]:
    print("\n[Test 2] Monthly Food budget + 2 txns")

    # Create budget
    r = requests.post(
        f"{BASE_URL}/budgets",
        headers=H(tok),
        json={"category": "Food", "amount": 3000, "period": "monthly", "recurring": True},
        timeout=20,
    )
    record(r.status_code == 200, "T2 POST Food budget 200", f"{r.status_code} {r.text[:200]}")

    # 2 debit txns (use a backdated date to ensure elapsed_days > 0 even if run at midnight UTC)
    # Use today's UTC date at 12:00:00 to avoid boundary issues
    now = datetime.utcnow()
    d1 = now.replace(hour=0, minute=30, second=0, microsecond=0)
    for amt, desc in [(500, "r18_test food1"), (800, "r18_test food2")]:
        r = requests.post(
            f"{BASE_URL}/transactions",
            headers=H(tok),
            json={
                "category": "Food",
                "amount": amt,
                "type": "debit",
                "date": d1.isoformat(),
                "description": desc,
            },
            timeout=20,
        )
        record(r.status_code == 200, f"T2 txn Food {amt} inserted", f"{r.status_code} {r.text[:200]}")

    # GET live
    r = requests.get(f"{BASE_URL}/budgets/live", headers=H(tok), timeout=20)
    record(r.status_code == 200, "T2 GET live 200")
    data = r.json()
    food = next((b for b in data.get("budgets", []) if b["category"] == "Food"), None)
    record(food is not None, "T2 Food row present", f"budgets={data.get('budgets')}")
    if not food:
        return {}

    # Check txn-source vs split-source (the endpoint adds split shares too;
    # test env may have residual split_expenses the test-agent can't wipe).
    from_tx = food.get("from_transactions")
    from_sp = food.get("from_splits", 0)
    record(abs(from_tx - 1300) <= 1, "T2 from_transactions ≈ 1300 (our inserts)",
           f"got from_transactions={from_tx}, from_splits={from_sp}")
    record(abs(food["spent"] - (from_tx + from_sp)) <= 0.01,
           "T2 spent == from_transactions + from_splits",
           f"spent={food['spent']} tx={from_tx} sp={from_sp}")

    # Strict 1300 assertion only holds when there is no residual split pollution
    if from_sp == 0:
        record(abs(food["spent"] - 1300) <= 1, "T2 spent ≈ 1300 (no splits)",
               f"got {food['spent']}")
        record(abs(food["remaining"] - 1700) <= 1, "T2 remaining ≈ 1700",
               f"got {food['remaining']}")
        record(42 <= food["percentage"] <= 44, "T2 pct 42-44", f"got {food['percentage']}")
    else:
        print(f"    ℹ️  T2 residual split_expenses adding ₹{from_sp} to Food spent (env artifact, endpoint logic correct)")
        # sanity: pct should still be consistent with spent/limit
        exp_pct = round(food["spent"] / 3000 * 100, 1)
        record(abs(food["percentage"] - exp_pct) <= 0.2,
               "T2 pct consistent with spent/limit",
               f"got {food['percentage']}, expected {exp_pct}")
        record(abs(food["remaining"] - max(0, 3000 - food["spent"])) <= 0.5,
               "T2 remaining == max(0, 3000 - spent)",
               f"got {food['remaining']}")

    record(food.get("amount") == 3000, "T2 amount alias == 3000", f"got {food.get('amount')}")
    record(food.get("budget") == 3000, "T2 budget alias == 3000", f"got {food.get('budget')}")

    # burn_rate sanity
    elapsed = food.get("elapsed_days")
    burn = food.get("burn_rate")
    record(burn is not None and burn > 0, "T2 burn_rate > 0", f"got {burn}")
    # burn_rate = round(spent/elapsed, 2); elapsed_days in response is rounded to .1 so allow ±0.5 tolerance
    expected_burn = round(food["spent"] / max(1, elapsed), 2)
    record(abs(burn - expected_burn) <= 0.5, "T2 burn_rate ≈ round(spent/elapsed,2)",
           f"got {burn}, expected ~{expected_burn} (spent={food['spent']}, elapsed={elapsed})")

    # days_left
    dl = food.get("days_left")
    max_dl = days_in_current_month()
    record(dl is not None and 0 <= dl <= max_dl,
           f"T2 days_left 0..{max_dl}", f"got {dl}")

    # projected_spend ≈ burn_rate * period_days
    period_days = days_in_current_month()
    expected_proj = round(burn * period_days, 2)
    record(abs(food.get("projected_spend", 0) - expected_proj) <= 1.0,
           "T2 projected_spend ≈ burn × period_days",
           f"got {food.get('projected_spend')}, expected ~{expected_proj}")

    # projected_over = max(0, projected_spend - 3000)
    exp_over = max(0.0, round(food.get("projected_spend", 0) - 3000, 2))
    record(abs(food.get("projected_over", 0) - exp_over) <= 0.5,
           "T2 projected_over = max(0, projected_spend-3000)",
           f"got {food.get('projected_over')}, expected {exp_over}")

    # status sensible
    valid_statuses = {"healthy", "on_track", "warning", "risk_overspend", "exceeded"}
    record(food.get("status") in valid_statuses, "T2 status valid", f"got {food.get('status')}")

    pct = food["percentage"]
    if pct < 50:
        expected = "healthy" if food.get("projected_over", 0) == 0 else "risk_overspend"
    elif pct < 80:
        expected = "risk_overspend" if food.get("projected_over", 0) > 0 else "on_track"
    elif pct < 100:
        expected = "warning"
    else:
        expected = "exceeded"
    record(food.get("status") == expected, "T2 status matches rule",
           f"got {food.get('status')}, expected {expected} (pct={pct}, proj_over={food.get('projected_over')})")

    return {"food_id": food["id"], "food_spent": food["spent"]}


# ===========================================================================
def test_3_daily_transport(tok: str, food_spent_before: float) -> None:
    print("\n[Test 3] Daily Transport budget — period isolation")
    r = requests.post(
        f"{BASE_URL}/budgets",
        headers=H(tok),
        json={"category": "Transport", "amount": 200, "period": "daily"},
        timeout=20,
    )
    record(r.status_code == 200, "T3 POST Transport daily 200", f"{r.status_code} {r.text[:200]}")

    now = datetime.utcnow()
    r = requests.post(
        f"{BASE_URL}/transactions",
        headers=H(tok),
        json={
            "category": "Transport",
            "amount": 250,
            "type": "debit",
            "date": now.replace(hour=1, minute=0, second=0, microsecond=0).isoformat(),
            "description": "r18_test cab",
        },
        timeout=20,
    )
    record(r.status_code == 200, "T3 Transport txn today 250 inserted")

    # Old txn 3 days ago
    r = requests.post(
        f"{BASE_URL}/transactions",
        headers=H(tok),
        json={
            "category": "Transport",
            "amount": 999,
            "type": "debit",
            "date": (now - timedelta(days=3)).replace(hour=12, minute=0, second=0, microsecond=0).isoformat(),
            "description": "r18_test cab_old",
        },
        timeout=20,
    )
    record(r.status_code == 200, "T3 Transport txn 3d-ago inserted (should not count for daily)")

    r = requests.get(f"{BASE_URL}/budgets/live", headers=H(tok), timeout=20)
    record(r.status_code == 200, "T3 GET live 200")
    data = r.json()
    rows = data.get("budgets", [])
    transport = next((b for b in rows if b["category"] == "Transport"), None)
    food = next((b for b in rows if b["category"] == "Food"), None)

    record(transport is not None, "T3 Transport row present")
    if transport:
        record(transport["spent"] == 250, "T3 Transport spent == 250 (no bleed from old txn)",
               f"got {transport['spent']}")
        record(transport["over_by"] == 50, "T3 Transport over_by == 50", f"got {transport['over_by']}")
        record(transport["percentage"] == 125, "T3 Transport pct == 125", f"got {transport['percentage']}")
        record(transport["status"] == "exceeded", "T3 Transport status == exceeded",
               f"got {transport['status']}")

    record(food is not None, "T3 Food row still present")
    if food:
        record(abs(food["spent"] - food_spent_before) <= 0.5,
               "T3 Food spent UNCHANGED by Transport txn",
               f"before={food_spent_before} after={food['spent']}")


# ===========================================================================
def test_4_weekly_shopping(tok: str) -> None:
    print("\n[Test 4] Weekly Shopping budget, no txns")
    r = requests.post(
        f"{BASE_URL}/budgets",
        headers=H(tok),
        json={"category": "Shopping", "amount": 1000, "period": "weekly"},
        timeout=20,
    )
    record(r.status_code == 200, "T4 POST Shopping weekly 200", f"{r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE_URL}/budgets/live", headers=H(tok), timeout=20)
    data = r.json()
    shop = next((b for b in data.get("budgets", []) if b["category"] == "Shopping"), None)
    record(shop is not None, "T4 Shopping row present")
    if shop:
        record(shop["spent"] == 0, "T4 Shopping spent == 0", f"got {shop['spent']}")
        record(shop["percentage"] == 0, "T4 Shopping pct == 0", f"got {shop['percentage']}")
        record(shop["status"] == "healthy", "T4 Shopping status == healthy", f"got {shop['status']}")
        record(shop["remaining"] == 1000, "T4 Shopping remaining == 1000", f"got {shop['remaining']}")


# ===========================================================================
def test_5_summary_invariant(tok: str) -> None:
    print("\n[Test 5] Summary invariants")
    r = requests.get(f"{BASE_URL}/budgets/live", headers=H(tok), timeout=20)
    data = r.json()
    summ = data.get("summary") or {}
    rows = data.get("budgets") or []

    record(summ.get("total_budgeted") == 4200, "T5 total_budgeted == 4200",
           f"got {summ.get('total_budgeted')}")
    row_sum = round(sum(b["spent"] for b in rows), 2)
    record(abs(summ.get("total_spent", 0) - row_sum) < 0.01,
           "T5 total_spent == sum(row.spent)",
           f"summary={summ.get('total_spent')}, rows sum={row_sum}")
    expected_remaining = max(0, summ.get("total_budgeted", 0) - summ.get("total_spent", 0))
    record(abs(summ.get("total_remaining", 0) - expected_remaining) < 0.01,
           "T5 total_remaining == max(0, budgeted-spent)",
           f"got {summ.get('total_remaining')}, expected {expected_remaining}")


# ===========================================================================
def test_6_smart_suggest_cap(tok: str) -> None:
    print("\n[Test 6] Smart-suggest cap for 'Other'")
    # insert a 150k Other debit yesterday
    yesterday = (datetime.utcnow() - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    r = requests.post(
        f"{BASE_URL}/transactions",
        headers=H(tok),
        json={
            "category": "Other",
            "amount": 150000,
            "type": "debit",
            "date": yesterday.isoformat(),
            "description": "r18_test huge_other",
        },
        timeout=20,
    )
    record(r.status_code == 200, "T6 huge Other txn inserted", f"{r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE_URL}/budgets/smart-suggest", headers=H(tok), timeout=30)
    record(r.status_code == 200, "T6 smart-suggest 200", f"{r.status_code} {r.text[:200]}")
    data = r.json()
    other = next((s for s in data.get("suggestions", []) if s["category"] == "Other"), None)
    record(other is not None, "T6 Other suggestion present",
           f"got suggestions={[s.get('category') for s in data.get('suggestions', [])]}")
    if other:
        sb = other.get("suggested_budget", 0)
        record(sb <= 15000, f"T6 suggested_budget <= 15000 (got {sb})",
               f"cap should be 3 × 0.10 × 50k = 15000, got {sb}")
        record(sb < 100000, "T6 not the old ₹1.25L bug", f"got {sb}")


# ===========================================================================
def test_7_regression(tok: str) -> Dict[str, str]:
    print("\n[Test 7] Regression sanity")
    ids: Dict[str, str] = {}

    # POST create/upsert
    r = requests.post(
        f"{BASE_URL}/budgets",
        headers=H(tok),
        json={"category": "Bills", "amount": 1500, "period": "monthly"},
        timeout=20,
    )
    record(r.status_code == 200, "T7 POST /budgets 200", f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        ids["bills"] = r.json().get("id")

    # PUT
    if ids.get("bills"):
        r = requests.put(
            f"{BASE_URL}/budgets/{ids['bills']}",
            headers=H(tok),
            json={"amount": 1800},
            timeout=20,
        )
        record(r.status_code == 200, "T7 PUT /budgets/{id} 200", f"{r.status_code} {r.text[:200]}")

    # POST /budgets/categorize
    r = requests.post(
        f"{BASE_URL}/budgets/categorize",
        headers=H(tok),
        json={"description": "Paid electricity bill"},
        timeout=30,
    )
    record(r.status_code == 200, "T7 POST /budgets/categorize 200", f"{r.status_code} {r.text[:200]}")

    # DELETE
    if ids.get("bills"):
        r = requests.delete(f"{BASE_URL}/budgets/{ids['bills']}", headers=H(tok), timeout=20)
        record(r.status_code == 200, "T7 DELETE /budgets/{id} 200", f"{r.status_code} {r.text[:200]}")

    # GET gmail/status, premium/status
    r = requests.get(f"{BASE_URL}/gmail/status", headers=H(tok), timeout=20)
    record(r.status_code == 200, "T7 GET /gmail/status 200", f"{r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE_URL}/premium/status", headers=H(tok), timeout=20)
    record(r.status_code == 200, "T7 GET /premium/status 200", f"{r.status_code} {r.text[:200]}")

    return ids


# ===========================================================================
def cleanup(tok: str) -> None:
    print("\n[Cleanup] Removing test budgets + txns")
    delete_all_budgets(tok)
    delete_all_txns(tok, ["Food", "Transport", "Shopping", "Other", "Bills"])


# ===========================================================================
def main() -> int:
    print(f"== Round 18 Budget Phase-1 tests against {BASE_URL} ==")
    tok = auth_token()
    print(f"Auth OK, token length {len(tok)}")

    test_1_empty_state(tok)
    t2 = test_2_monthly_food(tok)
    test_3_daily_transport(tok, t2.get("food_spent", 1300))
    test_4_weekly_shopping(tok)
    test_5_summary_invariant(tok)
    test_6_smart_suggest_cap(tok)
    test_7_regression(tok)
    cleanup(tok)

    print("\n" + "=" * 60)
    print(f"PASSED: {len(PASSED)}")
    print(f"FAILED: {len(FAILED)}")
    for f in FAILED:
        print(f"  ❌ {f}")
    print("=" * 60)
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(main())
