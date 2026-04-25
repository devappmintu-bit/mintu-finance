"""
Round 45 — Comprehensive backend regression sweep + new
POST /api/premium/investment-suggester verification.

Tests against the live preview URL using documented test creds:
  Phone: 9876543210, OTP: 123456 (mock mode)
"""
from __future__ import annotations
import json
import time
import uuid
import sys
from datetime import datetime, timezone
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []  # list of (label, ok, detail)

def rec(label: str, ok: bool, detail: str = "") -> bool:
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {label} {('— ' + detail) if detail else ''}")
    results.append((label, ok, detail))
    return ok

def hdr(token: str | None = None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def authenticate() -> str | None:
    t0 = time.time()
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    rec("auth/send-otp", r.status_code == 200, f"{r.status_code} in {int((time.time()-t0)*1000)}ms")
    if r.status_code != 200:
        return None
    t0 = time.time()
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    token = body.get("token") or body.get("access_token")
    rec("auth/verify-otp", r.status_code == 200 and bool(token), f"{r.status_code} token={'yes' if token else 'no'} in {int((time.time()-t0)*1000)}ms")
    return token


def get_check(label: str, path: str, token: str, *, fast_ms: int | None = None) -> dict | list | None:
    t0 = time.time()
    r = requests.get(f"{BASE}{path}", headers=hdr(token), timeout=30)
    dt = int((time.time() - t0) * 1000)
    ok = r.status_code == 200
    detail = f"{r.status_code} in {dt}ms"
    if fast_ms is not None and dt > fast_ms and ok:
        detail += f" SLOW (target<{fast_ms}ms)"
    rec(label, ok, detail)
    if not ok:
        try:
            print("    body:", json.dumps(r.json())[:300])
        except Exception:
            print("    body:", r.text[:300])
        return None
    try:
        return r.json()
    except Exception:
        return None


def post_check(label: str, path: str, token: str, body: dict, expected: int = 200) -> dict | None:
    t0 = time.time()
    r = requests.post(f"{BASE}{path}", headers=hdr(token), json=body, timeout=30)
    dt = int((time.time() - t0) * 1000)
    ok = r.status_code == expected
    detail = f"{r.status_code} in {dt}ms"
    rec(label, ok, detail)
    if not ok:
        try:
            print("    body:", json.dumps(r.json())[:400])
        except Exception:
            print("    body:", r.text[:400])
        return None
    try:
        return r.json()
    except Exception:
        return None


def main() -> int:
    print(f"\n=== Round 45 backend regression — {datetime.now(timezone.utc).isoformat()} ===\n")
    token = authenticate()
    if not token:
        print("ABORT: authentication failed.")
        return 1

    # 1) USER PROFILE
    me = get_check("GET /user/me", "/user/me", token)
    if me is not None:
        rec("user/me has phone", isinstance(me, dict) and ("phone" in me or "user" in me))

    # 2) TRANSACTIONS
    get_check("GET /transactions", "/transactions", token)
    txn_body = {
        "amount": 250.50,
        "category": "Food",
        "type": "debit",
        "description": "Round 45 lunch test",
        "date": datetime.now(timezone.utc).isoformat(),
    }
    txn_res = post_check("POST /transactions", "/transactions", token, txn_body)
    if isinstance(txn_res, dict):
        rec("POST /transactions has id", "id" in txn_res or "_id" in txn_res or "transaction_id" in txn_res)

    # 3) BUDGETS
    get_check("GET /budgets", "/budgets", token)
    get_check("GET /budgets/live", "/budgets/live", token)
    bud_res = post_check("POST /budgets", "/budgets", token, {"category": "Food", "amount": 5000, "period": "monthly"})
    if isinstance(bud_res, dict):
        rec("POST /budgets has id", "id" in bud_res or "_id" in bud_res)

    # 4) GOALS
    goals = get_check("GET /goals", "/goals", token)
    goal_res = post_check("POST /goals", "/goals", token, {
        "name": "Round45 Emergency Fund",
        "target_amount": 50000,
        "saved_amount": 1000,
        "target_date": "2026-12-31",
    })
    goal_id = None
    if isinstance(goal_res, dict):
        # backend returns {ok:true, goal:{...id...}}
        goal_obj = goal_res.get("goal") or goal_res
        goal_id = goal_obj.get("id") or goal_obj.get("_id") or goal_res.get("id")
        rec("POST /goals has id", bool(goal_id))
    if goal_id:
        # NOTE: Backend has no POST /goals/{id}/contribute route. Frontend contributes
        # via PATCH /goals/{id} updating saved_amount. Verify that path instead.
        t0 = time.time()
        r = requests.patch(f"{BASE}/goals/{goal_id}", headers=hdr(token), json={"saved_amount": 1500}, timeout=15)
        dt = int((time.time() - t0) * 1000)
        rec("PATCH /goals/{id} (contribute)", r.status_code == 200, f"{r.status_code} in {dt}ms")
        # Also confirm the literal /contribute route truly does not exist (informational)
        r2 = requests.post(f"{BASE}/goals/{goal_id}/contribute", headers=hdr(token), json={"amount": 500}, timeout=10)
        rec("POST /goals/{id}/contribute is NOT implemented (informational)", r2.status_code == 404, f"{r2.status_code} (404 expected — backend has no such route)")

    # 5) SPLIT GROUPS / EXPENSES
    get_check("GET /split/groups", "/split/groups", token)
    grp_body = {"name": f"R45 Trip {uuid.uuid4().hex[:6]}", "members": ["9999888877"]}
    grp_res = post_check("POST /split/groups", "/split/groups", token, grp_body)
    grp_id = None
    if isinstance(grp_res, dict):
        grp_id = grp_res.get("id") or grp_res.get("_id") or (grp_res.get("group") or {}).get("id")
        rec("POST /split/groups has id", bool(grp_id))
    if grp_id:
        # The actual route is POST /split/expenses (not nested under /groups/{id}/expenses).
        # Frontend services/split.ts uses this; review request listed the nested form, but it does not exist.
        members = (grp_res.get("members") if isinstance(grp_res, dict) else None) or []
        my_id = (me.get("id") if isinstance(me, dict) else None)
        paid_by = my_id or (members[0].get("user_id") if members and isinstance(members[0], dict) else None)
        exp_body = {
            "group_id": grp_id,
            "description": "Round 45 dinner",
            "amount": 600,
            "category": "Food",
            "split_type": "equal",
            "paid_by": paid_by,
        }
        post_check(
            "POST /split/expenses (group expense)",
            "/split/expenses",
            token,
            exp_body,
        )

    # 6) NOTIFICATIONS
    get_check("GET /notifications", "/notifications", token)
    get_check("GET /notifications/unread-count", "/notifications/unread-count", token)

    # 7) COINS / REWARDS
    get_check("GET /coins/ledger", "/coins/ledger", token)
    get_check("GET /rewards/summary", "/rewards/summary", token)
    get_check("GET /rewards/marketplace", "/rewards/marketplace", token)

    # 8) SEARCH
    get_check("GET /search?q=test", "/search?q=test", token)

    # 9) WASTE DETECTOR (should return immediately, fire-and-forget AI in bg)
    t0 = time.time()
    r = requests.get(f"{BASE}/waste-detector", headers=hdr(token), timeout=15)
    dt = int((time.time() - t0) * 1000)
    rec("GET /waste-detector fast (<3s)", r.status_code == 200 and dt < 3000, f"{r.status_code} in {dt}ms")

    # 10) STATS / GAMIFICATION
    get_check("GET /stats/overview", "/stats/overview", token)
    get_check("GET /gamification/status", "/gamification/status", token)

    # 11) NEW: /premium/investment-suggester — three risk levels
    print("\n--- NEW Round 45: POST /premium/investment-suggester ---")

    def check_suggester(risk: str, expected_alloc: tuple[int, int, int]):
        body = {"monthly_income": 100000, "monthly_expenses": 60000, "risk_tolerance": risk}
        t0 = time.time()
        r = requests.post(f"{BASE}/premium/investment-suggester", headers=hdr(token), json=body, timeout=15)
        dt = int((time.time() - t0) * 1000)
        if r.status_code != 200:
            rec(f"investment-suggester[{risk}] 200", False, f"{r.status_code} in {dt}ms — body={r.text[:200]}")
            return
        rec(f"investment-suggester[{risk}] 200", True, f"in {dt}ms")
        data = r.json()
        # surplus
        rec(f"  [{risk}] investable_surplus=40000", data.get("investable_surplus") == 40000, f"got {data.get('investable_surplus')}")
        alloc = data.get("allocation_pct") or {}
        eq, debt, gold = expected_alloc
        rec(f"  [{risk}] allocation_pct equity={eq}", alloc.get("equity") == eq, f"got {alloc.get('equity')}")
        rec(f"  [{risk}] allocation_pct debt={debt}", alloc.get("debt") == debt, f"got {alloc.get('debt')}")
        rec(f"  [{risk}] allocation_pct gold={gold}", alloc.get("gold") == gold, f"got {alloc.get('gold')}")
        ma = data.get("monthly_amounts") or {}
        rec(f"  [{risk}] monthly_amounts.equity match", ma.get("equity") == round(40000 * eq / 100))
        rec(f"  [{risk}] monthly_amounts.debt match", ma.get("debt") == round(40000 * debt / 100))
        rec(f"  [{risk}] monthly_amounts.gold match", ma.get("gold") == round(40000 * gold / 100))
        recs = data.get("recommendations") or []
        rec(f"  [{risk}] recommendations is 3-element list",
            isinstance(recs, list) and len(recs) == 3 and all(isinstance(x, dict) and "asset" in x and "vehicles" in x for x in recs))
        rec(f"  [{risk}] returns risk_tolerance echo", data.get("risk_tolerance") == risk)

    check_suggester("conservative", (30, 60, 10))
    check_suggester("moderate", (60, 30, 10))
    check_suggester("aggressive", (75, 15, 10))

    # Edge case — expenses > income → surplus must clamp to 0
    body = {"monthly_income": 50000, "monthly_expenses": 80000, "risk_tolerance": "moderate"}
    r = requests.post(f"{BASE}/premium/investment-suggester", headers=hdr(token), json=body, timeout=10)
    if r.status_code == 200:
        d = r.json()
        rec("investment-suggester surplus clamped to 0 when expenses>income",
            d.get("investable_surplus") == 0 and (d.get("monthly_amounts") or {}).get("equity") == 0)
    else:
        rec("investment-suggester edge case 200", False, f"{r.status_code}")

    # Auth-guard sanity: missing bearer should not be 200
    r = requests.post(f"{BASE}/premium/investment-suggester", json={"monthly_income": 100000, "monthly_expenses": 60000, "risk_tolerance": "moderate"}, timeout=10)
    rec("investment-suggester requires auth", r.status_code in (401, 403, 422), f"{r.status_code}")

    # ─── Summary ───
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"\n========== {n_pass} PASS / {n_fail} FAIL out of {len(results)} ==========")
    if n_fail:
        print("\nFAILURES:")
        for label, ok, detail in results:
            if not ok:
                print(f"  - {label}  ({detail})")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
