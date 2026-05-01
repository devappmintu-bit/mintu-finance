"""Phase 7 — End-to-End Flow Validation (10 flows).

Exercises every major user-journey against the live backend at
`$REACT_APP_BACKEND_URL/api` using mock-OTP auth 9876543210 / 123456.
Logs PASS/FAIL per step and aggregates results per flow.
"""
from __future__ import annotations
import os
import sys
import uuid
import json
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

HEADERS: Dict[str, str] = {}
SESSION = requests.Session()
SESSION.headers.update({"Content-Type": "application/json"})

RESULTS: Dict[str, List[Tuple[str, bool, str]]] = {}


def log(flow: str, step: str, ok: bool, detail: str = "") -> None:
    RESULTS.setdefault(flow, []).append((step, ok, detail))
    tag = "✅ PASS" if ok else "❌ FAIL"
    print(f"[{flow}] {tag} — {step}  {detail[:300]}")


def req(method: str, path: str, *, json_body=None, params=None, token: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None, timeout: int = 60) -> requests.Response:
    h = dict(SESSION.headers)
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    url = f"{BASE}{path}"
    return SESSION.request(method, url, json=json_body, params=params, headers=h, timeout=timeout)


TOKEN: Optional[str] = None
USER_ID: Optional[str] = None


def flow_1_auth() -> bool:
    global TOKEN, USER_ID
    flow = "FLOW 1 - AUTH"
    all_ok = True

    r = req("POST", "/auth/send-otp", json_body={"phone": PHONE})
    ok = r.status_code == 200 and r.json().get("success") is True
    log(flow, "POST /auth/send-otp", ok, f"status={r.status_code} body={r.text[:120]}")
    all_ok &= ok

    r = req("POST", "/auth/verify-otp", json_body={"phone": PHONE, "otp": OTP})
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and "token" in body
    if ok:
        TOKEN = body["token"]
    log(flow, "POST /auth/verify-otp", ok, f"status={r.status_code} has_token={bool(TOKEN)}")
    all_ok &= ok

    if not TOKEN:
        return False

    r = req("GET", "/user/me", token=TOKEN)
    try:
        body = r.json()
    except Exception:
        body = {}
    ok = r.status_code == 200 and all(k in body for k in ("name", "phone", "money_score"))
    if ok:
        USER_ID = body.get("id")
    log(flow, "GET /user/me", ok, f"status={r.status_code} keys={list(body.keys())[:8]}")
    all_ok &= ok

    for i, path in enumerate(["/home/snapshot", "/alerts/smart", "/coins/status"]):
        r = req("GET", path, token=TOKEN)
        ok = r.status_code == 200
        log(flow, f"token reuse #{i+1} GET {path}", ok, f"status={r.status_code}")
        all_ok &= ok

    return all_ok


def flow_2_home() -> bool:
    flow = "FLOW 2 - HOME"
    all_ok = True

    r = req("GET", "/home/snapshot", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    sparkline = body.get("sparkline") or body.get("daily_spend") or []
    sparkline_ok = isinstance(sparkline, list) and len(sparkline) == 7
    mtd_ok = "mtd_spend" in body or "mtd" in body
    tier_ok = "tier" in body or "score_level" in body or "level" in body
    ok = r.status_code == 200 and sparkline_ok
    log(flow, "GET /home/snapshot", ok,
        f"status={r.status_code} sparkline_len={len(sparkline)} mtd_present={mtd_ok} tier_present={tier_ok}")
    all_ok &= ok

    r = req("GET", "/alerts/smart", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts")
    count = body.get("count")
    ok = r.status_code == 200 and isinstance(alerts, list) and isinstance(count, int)
    log(flow, "GET /alerts/smart", ok, f"status={r.status_code} count={count}")
    all_ok &= ok

    r = req("GET", "/analytics/summary", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    required = {"total_income", "total_expense", "balance", "transaction_count", "category_breakdown"}
    ok = r.status_code == 200 and required.issubset(body.keys())
    log(flow, "GET /analytics/summary", ok, f"status={r.status_code} keys={sorted(body.keys())}")
    all_ok &= ok

    r = req("GET", "/coins/status", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and "balance" in body and ("today_earned" in body or "earned_today" in body)
    log(flow, "GET /coins/status", ok,
        f"status={r.status_code} balance={body.get('balance')} today_earned={body.get('today_earned', body.get('earned_today'))}")
    all_ok &= ok

    r = req("GET", "/ai/predict", token=TOKEN, timeout=60)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and ("headline" in body or "prediction" in body or "summary" in body)
    log(flow, "GET /ai/predict", ok, f"status={r.status_code} keys={list(body.keys())[:8]}")
    all_ok &= ok

    r = req("GET", "/news/india-finance", token=TOKEN, timeout=30)
    body = r.json() if r.status_code == 200 else {}
    articles = body.get("articles")
    ok = r.status_code == 200 and isinstance(articles, list)
    log(flow, "GET /news/india-finance", ok,
        f"status={r.status_code} articles_len={len(articles) if isinstance(articles, list) else 'N/A'}")
    all_ok &= ok

    r = req("GET", "/notifications/unread-count", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and isinstance(body.get("count"), int)
    log(flow, "GET /notifications/unread-count", ok, f"status={r.status_code} body={body}")
    all_ok &= ok

    return all_ok


def flow_3_transactions() -> bool:
    flow = "FLOW 3 - TRANSACTIONS"
    all_ok = True

    r = req("GET", "/transactions", token=TOKEN)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    initial_count = len(r.json()) if ok else 0
    log(flow, "GET /transactions (initial)", ok, f"status={r.status_code} count={initial_count}")
    all_ok &= ok

    payload = {"amount": 123, "category": "Food", "type": "debit", "description": "E2E test"}
    r = req("POST", "/transactions", json_body=payload, token=TOKEN)
    body = r.json() if r.status_code in (200, 201) else {}
    ok = r.status_code in (200, 201) and "id" in body
    txn_id = body.get("id") if ok else None
    log(flow, "POST /transactions", ok, f"status={r.status_code} id={txn_id}")
    all_ok &= ok

    r = req("GET", "/transactions", token=TOKEN)
    data = r.json() if r.status_code == 200 else []
    new_count = len(data)
    visible = any(t.get("id") == txn_id for t in data) if txn_id else False
    ok = r.status_code == 200 and new_count == initial_count + 1 and visible
    log(flow, "GET /transactions (after POST)", ok,
        f"status={r.status_code} count={new_count} (expected {initial_count+1}) visible={visible}")
    all_ok &= ok

    if txn_id:
        r = req("PUT", f"/transactions/{txn_id}",
                json_body={"description": "E2E updated"}, token=TOKEN)
        ok = r.status_code == 200
        log(flow, "PUT /transactions/{id}", ok, f"status={r.status_code}")
        all_ok &= ok

        r = req("DELETE", f"/transactions/{txn_id}", token=TOKEN)
        ok = r.status_code == 200
        log(flow, "DELETE /transactions/{id}", ok, f"status={r.status_code}")
        all_ok &= ok

        r = req("GET", "/transactions", token=TOKEN)
        final_count = len(r.json()) if r.status_code == 200 else -1
        ok = final_count == initial_count
        log(flow, "GET /transactions (after DELETE)", ok,
            f"status={r.status_code} count={final_count} (expected {initial_count})")
        all_ok &= ok

    return all_ok


def flow_4_budgets() -> bool:
    flow = "FLOW 4 - BUDGETS"
    all_ok = True

    r = req("GET", "/budgets", token=TOKEN)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    log(flow, "GET /budgets", ok, f"status={r.status_code} count={len(r.json()) if ok else 'N/A'}")
    all_ok &= ok

    unique_cat = f"E2ECat-{uuid.uuid4().hex[:6]}"
    r = req("POST", "/budgets",
            json_body={"category": unique_cat, "amount": 5000, "period": "monthly"}, token=TOKEN)
    body = r.json() if r.status_code in (200, 201) else {}
    ok = r.status_code in (200, 201) and "id" in body
    budget_id = body.get("id") if ok else None
    log(flow, "POST /budgets", ok, f"status={r.status_code} id={budget_id}")
    all_ok &= ok

    r = req("GET", "/budgets/live", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    is_dict = isinstance(body, dict)
    ok = r.status_code == 200 and (is_dict or isinstance(body, list))
    log(flow, "GET /budgets/live", ok,
        f"status={r.status_code} keys={list(body.keys())[:6] if is_dict else 'list'}")
    all_ok &= ok

    if budget_id:
        r = req("PUT", f"/budgets/{budget_id}", json_body={"amount": 6000}, token=TOKEN)
        body = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and body.get("amount") == 6000
        log(flow, "PUT /budgets/{id}", ok, f"status={r.status_code} amount={body.get('amount')}")
        all_ok &= ok

        r = req("DELETE", f"/budgets/{budget_id}", token=TOKEN)
        ok = r.status_code == 200
        log(flow, "DELETE /budgets/{id}", ok, f"status={r.status_code}")
        all_ok &= ok

    return all_ok


def flow_5_goals() -> bool:
    flow = "FLOW 5 - GOALS"
    all_ok = True

    r = req("GET", "/goals", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    goals = body.get("goals") if isinstance(body, dict) else body
    ok = r.status_code == 200 and isinstance(goals, list)
    log(flow, "GET /goals", ok, f"status={r.status_code} count={len(goals) if isinstance(goals,list) else 'N/A'}")
    all_ok &= ok

    payload = {"name": "E2E Goal", "target_amount": 50000, "saved_amount": 0}
    r = req("POST", "/goals", json_body=payload, token=TOKEN)
    body = r.json() if r.status_code in (200, 201) else {}
    goal_doc = body.get("goal") if isinstance(body, dict) else {}
    goal_id = (goal_doc or {}).get("id") or (body.get("id") if isinstance(body, dict) else None)
    ok = r.status_code in (200, 201) and bool(goal_id)
    log(flow, "POST /goals", ok, f"status={r.status_code} id={goal_id}")
    all_ok &= ok

    if goal_id:
        r_put = req("PUT", f"/goals/{goal_id}", json_body={"saved_amount": 1000}, token=TOKEN)
        put_ok = r_put.status_code in (200, 201)
        if put_ok:
            log(flow, "PUT /goals/{id}", True, f"status={r_put.status_code}")
        else:
            log(flow, "PUT /goals/{id}", False,
                f"status={r_put.status_code} — review-spec expected PUT; backend only exposes PATCH")
            r_patch = req("PATCH", f"/goals/{goal_id}", json_body={"saved_amount": 1000}, token=TOKEN)
            patch_ok = r_patch.status_code == 200
            log(flow, "PATCH /goals/{id} (actual backend)", patch_ok, f"status={r_patch.status_code}")
        all_ok &= put_ok

        r = req("DELETE", f"/goals/{goal_id}", token=TOKEN)
        ok = r.status_code == 200
        log(flow, "DELETE /goals/{id}", ok, f"status={r.status_code}")
        all_ok &= ok

    return all_ok


def flow_6_split() -> bool:
    flow = "FLOW 6 - SPLIT"
    all_ok = True
    group_id = None

    r = req("POST", "/split/groups",
            json_body={"name": "E2E Group", "members": ["9876543210", "9999988888"]},
            token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    group_id = body.get("id")
    ok = r.status_code == 200 and bool(group_id)
    log(flow, "POST /split/groups", ok, f"status={r.status_code} id={group_id}")
    all_ok &= ok

    if group_id:
        r1 = req("GET", f"/split/groups/{group_id}/members", token=TOKEN)
        if r1.status_code == 200:
            log(flow, "GET /split/groups/{id}/members", True, f"status={r1.status_code}")
        else:
            log(flow, "GET /split/groups/{id}/members", False,
                f"status={r1.status_code} — review-spec endpoint does NOT exist; canonical is /manage")
            r2 = req("GET", f"/split/groups/{group_id}/manage", token=TOKEN)
            manage_ok = r2.status_code == 200 and isinstance(r2.json().get("members"), list)
            log(flow, "GET /split/groups/{id}/manage (actual)", manage_ok, f"status={r2.status_code}")
        all_ok &= (r1.status_code == 200)

        expense_payload = {
            "group_id": group_id,
            "description": "Dinner",
            "amount": 500,
            "paid_by": USER_ID,
            "split_type": "equal",
        }
        r = req("POST", "/split/expenses", json_body=expense_payload, token=TOKEN)
        body = r.json() if r.status_code == 200 else {}
        expense_id = body.get("id")
        ok = r.status_code == 200 and bool(expense_id)
        log(flow, "POST /split/expenses", ok, f"status={r.status_code} id={expense_id}")
        all_ok &= ok

        r = req("GET", "/split/settlements", token=TOKEN, params={"group_id": group_id})
        ok = r.status_code == 200 and isinstance(r.json(), list)
        log(flow, "GET /split/settlements", ok, f"status={r.status_code} count={len(r.json()) if ok else 'N/A'}")
        all_ok &= ok

        r = req("DELETE", f"/split/groups/{group_id}", token=TOKEN)
        ok = r.status_code in (200, 204)
        log(flow, "DELETE /split/groups/{id}", ok, f"status={r.status_code}")
        all_ok &= ok

    return all_ok


def flow_7_rewards() -> bool:
    flow = "FLOW 7 - REWARDS"
    all_ok = True

    r = req("GET", "/rewards/summary", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and isinstance(body, dict)
    log(flow, "GET /rewards/summary", ok,
        f"status={r.status_code} keys={list(body.keys())[:8]}")
    all_ok &= ok

    r = req("POST", "/streak/check-in", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and isinstance(body, dict)
    log(flow, "POST /streak/check-in", ok, f"status={r.status_code} body={str(body)[:180]}")
    all_ok &= ok

    r = req("GET", "/coins/ledger", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    entries = body if isinstance(body, list) else (
        body.get("entries") or body.get("ledger") or body.get("transactions") or body.get("history") or []
    )
    ok = r.status_code == 200 and isinstance(entries, list)
    log(flow, "GET /coins/ledger", ok,
        f"status={r.status_code} entries_len={len(entries) if isinstance(entries, list) else 'N/A'}")
    all_ok &= ok

    return all_ok


def flow_8_profile() -> bool:
    flow = "FLOW 8 - PROFILE"
    all_ok = True

    r = req("GET", "/profile/identity", token=TOKEN)
    body = r.json() if r.status_code == 200 else {}
    required_any = {"name", "score", "percentile", "badges"}
    present = required_any.intersection(body.keys()) if isinstance(body, dict) else set()
    ok = r.status_code == 200 and len(present) >= 2
    log(flow, "GET /profile/identity", ok,
        f"status={r.status_code} found_keys={sorted(present)} all_keys={list(body.keys())[:10] if isinstance(body, dict) else 'N/A'}")
    all_ok &= ok

    r = req("PUT", "/user/me", json_body={"name": "E2E Test User"}, token=TOKEN)
    ok = r.status_code == 200
    log(flow, "PUT /user/me (set name)", ok, f"status={r.status_code}")
    all_ok &= ok

    req("PUT", "/user/me", json_body={"name": "Test User"}, token=TOKEN)

    return all_ok


def flow_9_ai() -> bool:
    flow = "FLOW 9 - AI INSIGHTS"
    all_ok = True

    r = req("GET", "/ai/predict", token=TOKEN, timeout=60)
    ok = r.status_code == 200
    log(flow, "GET /ai/predict", ok, f"status={r.status_code}")
    all_ok &= ok

    r = req("GET", "/waste-detector", token=TOKEN, timeout=30)
    body = r.json() if r.status_code == 200 else {}
    ok = r.status_code == 200 and isinstance(body, dict)
    log(flow, "GET /waste-detector", ok,
        f"status={r.status_code} keys={list(body.keys())[:8] if isinstance(body, dict) else 'N/A'}")
    all_ok &= ok

    r = req("GET", "/split/insights", token=TOKEN, timeout=30)
    ok = r.status_code == 200
    log(flow, "GET /split/insights", ok, f"status={r.status_code}")
    all_ok &= ok

    return all_ok


def flow_10_edge() -> bool:
    flow = "FLOW 10 - EDGE CASES"
    all_ok = True

    r = req("GET", "/user/me")
    ok = r.status_code in (401, 403, 422)
    log(flow, "GET /user/me without token", ok, f"status={r.status_code} (accepts 401/403/422)")
    all_ok &= ok

    r = req("GET", "/transactions/invalid-id-format", token=TOKEN)
    ok = r.status_code < 500
    log(flow, "GET /transactions/invalid-id-format", ok, f"status={r.status_code} (not 500)")
    all_ok &= ok

    r = req("POST", "/transactions", json_body={"amount": 100}, token=TOKEN)
    ok = r.status_code == 422
    log(flow, "POST /transactions missing field", ok, f"status={r.status_code}")
    all_ok &= ok

    r = req("PUT", "/budgets/000000000000000000000000",
            json_body={"amount": 999}, token=TOKEN)
    ok = r.status_code == 404
    log(flow, "PUT /budgets/{nonexistent} → 404", ok, f"status={r.status_code}")
    all_ok &= ok

    r = req("POST", "/split/groups", json_body={"name": "Solo", "members": []}, token=TOKEN)
    ok = r.status_code < 500
    log(flow, "POST /split/groups empty members", ok, f"status={r.status_code} (not 500)")
    all_ok &= ok

    return all_ok


def main() -> int:
    print(f"═══ Phase 7 E2E Flow Validation — {BASE} ═══\n")
    flow1 = flow_1_auth()
    if not TOKEN:
        print("No token — aborting remaining flows")
        return 1

    flow_2_home()
    flow_3_transactions()
    flow_4_budgets()
    flow_5_goals()
    flow_6_split()
    flow_7_rewards()
    flow_8_profile()
    flow_9_ai()
    flow_10_edge()

    print("\n═══ SUMMARY ═══")
    total_pass = total_fail = 0
    for flow, steps in RESULTS.items():
        p = sum(1 for _, ok, _ in steps if ok)
        f = sum(1 for _, ok, _ in steps if not ok)
        total_pass += p
        total_fail += f
        status = "✅" if f == 0 else "❌"
        print(f"  {status} {flow}: {p} pass, {f} fail")
        for step, ok, detail in steps:
            if not ok:
                print(f"      ✗ {step} — {detail}")
    print(f"\nTOTAL: {total_pass} pass, {total_fail} fail across {len(RESULTS)} flows")
    return 0 if total_fail == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
