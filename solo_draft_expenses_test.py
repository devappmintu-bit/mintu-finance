"""Round 51j — Solo / Draft Expenses backend endpoint tests.

Endpoints under test (all under /api):
  POST   /split/expenses/draft
  GET    /split/expenses/drafts
  DELETE /split/expenses/drafts/{id}
  POST   /split/expenses/{draft_id}/attach-to-group

Plus regression on POST /split/expenses (real group expense).

Auth: mock OTP — phone 9876543210, OTP 123456.
Base URL: preview /api proxy.
"""
import os
import sys
import time
import json
from typing import Optional

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def log(tag: str, msg: str) -> None:
    print(f"[{tag}] {msg}")


def assert_eq(label: str, expected, actual, results):
    ok = expected == actual
    results.append((label, ok, f"expected={expected} actual={actual}"))
    print(("✅ " if ok else "❌ ") + f"{label}: expected={expected} actual={actual}")
    return ok


def assert_in(label: str, expected_set, actual, results):
    ok = actual in expected_set
    results.append((label, ok, f"expected in {expected_set}, got {actual}"))
    print(("✅ " if ok else "❌ ") + f"{label}: expected in {expected_set} actual={actual}")
    return ok


def assert_true(label: str, cond: bool, detail: str, results):
    results.append((label, bool(cond), detail))
    print(("✅ " if cond else "❌ ") + f"{label}: {detail}")
    return bool(cond)


def login() -> str:
    # Respect rate limit — loop send-otp gently
    for attempt in range(3):
        r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
        if r.status_code == 200:
            break
        if r.status_code == 429:
            time.sleep(5)
            continue
        raise RuntimeError(f"send-otp failed: {r.status_code} {r.text}")
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"] if "token" in body else body["access_token"]


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    results = []
    print("=" * 78)
    print("SOLO / DRAFT EXPENSES — BACKEND TEST")
    print(f"BASE = {BASE}")
    print("=" * 78)

    # ── A. AUTH COVERAGE — all four endpoints must 401 without bearer ────
    print("\n── A. Auth coverage ──")
    # 1) POST draft
    r = requests.post(f"{BASE}/split/expenses/draft",
                      json={"description": "x", "amount": 10}, timeout=20)
    assert_in("A1 POST draft no-auth → 401/403", {401, 403}, r.status_code, results)

    # 2) GET drafts
    r = requests.get(f"{BASE}/split/expenses/drafts", timeout=20)
    assert_in("A2 GET drafts no-auth → 401/403", {401, 403}, r.status_code, results)

    # 3) DELETE draft
    r = requests.delete(f"{BASE}/split/expenses/drafts/507f1f77bcf86cd799439011", timeout=20)
    assert_in("A3 DELETE draft no-auth → 401/403", {401, 403}, r.status_code, results)

    # 4) attach-to-group
    r = requests.post(f"{BASE}/split/expenses/507f1f77bcf86cd799439011/attach-to-group",
                      json={"group_id": "507f1f77bcf86cd799439011"}, timeout=20)
    assert_in("A4 POST attach-to-group no-auth → 401/403", {401, 403}, r.status_code, results)

    # ── LOGIN ────────────────────────────────────────────────────────────
    print("\n── Login ──")
    token = login()
    assert_true("LOGIN obtained bearer token", bool(token), f"len={len(token or '')}", results)

    # ── C. VALIDATION CHECKS ─────────────────────────────────────────────
    print("\n── C. Validation ──")
    # amount=0
    r = requests.post(f"{BASE}/split/expenses/draft",
                      headers=h(token),
                      json={"description": "zero", "amount": 0}, timeout=20)
    assert_in("C1 amount=0 → 400/422", {400, 422}, r.status_code, results)

    # amount=-5
    r = requests.post(f"{BASE}/split/expenses/draft",
                      headers=h(token),
                      json={"description": "neg", "amount": -5}, timeout=20)
    assert_in("C2 amount=-5 → 400/422", {400, 422}, r.status_code, results)

    # empty description
    r = requests.post(f"{BASE}/split/expenses/draft",
                      headers=h(token),
                      json={"description": "", "amount": 50}, timeout=20)
    assert_in("C3 empty description → 400/422", {400, 422}, r.status_code, results)

    # invalid ObjectId delete
    r = requests.delete(f"{BASE}/split/expenses/drafts/abcdef", headers=h(token), timeout=20)
    assert_eq("C4 DELETE invalid ObjectId → 400", 400, r.status_code, results)

    # valid-but-unknown
    r = requests.delete(f"{BASE}/split/expenses/drafts/507f1f77bcf86cd799439011",
                        headers=h(token), timeout=20)
    assert_eq("C5 DELETE unknown valid OID → 404", 404, r.status_code, results)

    # attach — missing group_id
    r = requests.post(f"{BASE}/split/expenses/507f1f77bcf86cd799439011/attach-to-group",
                      headers=h(token), json={}, timeout=20)
    assert_eq("C6 attach missing group_id → 400", 400, r.status_code, results)

    # attach — invalid draft_id
    r = requests.post(f"{BASE}/split/expenses/not-an-oid/attach-to-group",
                      headers=h(token), json={"group_id": "507f1f77bcf86cd799439011"}, timeout=20)
    assert_eq("C7 attach invalid draft_id → 400", 400, r.status_code, results)

    # attach — valid draft but unknown group_id. Need a real draft first.
    draft_resp = requests.post(f"{BASE}/split/expenses/draft",
                               headers=h(token),
                               json={"description": "Probe", "amount": 99}, timeout=20)
    assert_eq("C8-setup create probe draft → 200", 200, draft_resp.status_code, results)
    probe_id = draft_resp.json().get("id")
    r = requests.post(f"{BASE}/split/expenses/{probe_id}/attach-to-group",
                      headers=h(token),
                      json={"group_id": "507f1f77bcf86cd799439011"}, timeout=20)
    assert_eq("C9 attach valid draft + unknown group → 404", 404, r.status_code, results)
    # Cleanup probe
    requests.delete(f"{BASE}/split/expenses/drafts/{probe_id}", headers=h(token))

    # ── B. ROUND-TRIP HAPPY PATH ─────────────────────────────────────────
    print("\n── B. Round-trip happy path ──")
    # 1) POST draft description="Lunch" amount=450
    r = requests.post(f"{BASE}/split/expenses/draft",
                      headers=h(token),
                      json={"description": "Lunch", "amount": 450}, timeout=20)
    assert_eq("B1 POST Lunch draft → 200", 200, r.status_code, results)
    body = r.json()
    assert_true("B1.1 draft id returned", "id" in body, f"body keys={list(body.keys())}", results)
    assert_eq("B1.2 description=Lunch", "Lunch", body.get("description"), results)
    assert_eq("B1.3 amount=450", 450.0, float(body.get("amount") or 0), results)
    assert_true("B1.4 paid_by present", bool(body.get("paid_by")), f"paid_by={body.get('paid_by')}", results)
    assert_true("B1.5 split_type present", "split_type" in body, f"st={body.get('split_type')}", results)
    assert_true("B1.6 splits_hint present", "splits_hint" in body, f"sh={body.get('splits_hint')}", results)
    assert_true("B1.7 created_at present", "created_at" in body, f"ca={body.get('created_at')}", results)
    lunch_id = body["id"]

    # 2) GET drafts — id present, count >=1
    r = requests.get(f"{BASE}/split/expenses/drafts", headers=h(token), timeout=20)
    assert_eq("B2 GET drafts → 200", 200, r.status_code, results)
    gbody = r.json()
    ids = [d["id"] for d in gbody.get("drafts", [])]
    assert_true("B2.1 Lunch draft appears", lunch_id in ids, f"present? count={len(ids)}", results)
    assert_true("B2.2 count >= 1", gbody.get("count", 0) >= 1, f"count={gbody.get('count')}", results)

    # 3) Obtain a group — prefer existing
    r = requests.get(f"{BASE}/split/groups", headers=h(token), timeout=20)
    assert_eq("B3 GET /split/groups → 200", 200, r.status_code, results)
    groups_body = r.json()
    groups_list = groups_body if isinstance(groups_body, list) else groups_body.get("groups", [])
    gid: Optional[str] = None
    if groups_list:
        # pick first group we're a member of
        gid = groups_list[0].get("id") or groups_list[0].get("_id")
    if not gid:
        rc = requests.post(f"{BASE}/split/groups",
                           headers=h(token),
                           json={"name": "DraftTest", "members": ["9999888877"]}, timeout=20)
        assert_eq("B3-fallback create group → 200", 200, rc.status_code, results)
        gid = rc.json().get("id")
    assert_true("B3.1 group_id obtained", bool(gid), f"gid={gid}", results)

    # 4) POST attach-to-group → 200, expense returned
    r = requests.post(f"{BASE}/split/expenses/{lunch_id}/attach-to-group",
                      headers=h(token),
                      json={"group_id": gid}, timeout=30)
    assert_eq("B4 attach Lunch draft to group → 200", 200, r.status_code, results)
    ab = r.json()
    assert_true("B4.1 new expense id returned", "id" in ab, f"body={ab}", results)
    assert_eq("B4.2 expense.group_id == group", gid, ab.get("group_id"), results)
    assert_eq("B4.3 expense amount=450", 450.0, float(ab.get("amount") or 0), results)
    assert_eq("B4.4 attached_from_draft tracks source", lunch_id, ab.get("attached_from_draft"), results)
    new_expense_id = ab.get("id")

    # 5) GET drafts — Lunch draft must be gone
    r = requests.get(f"{BASE}/split/expenses/drafts", headers=h(token), timeout=20)
    assert_eq("B5 GET drafts post-attach → 200", 200, r.status_code, results)
    ids_after = [d["id"] for d in r.json().get("drafts", [])]
    assert_true("B5.1 Lunch draft no longer present", lunch_id not in ids_after,
                f"remaining_count={len(ids_after)}", results)

    # ── D. Re-attaching same draft_id must fail with 404 ─────────────────
    print("\n── D. Draft is actually deleted ──")
    r = requests.post(f"{BASE}/split/expenses/{lunch_id}/attach-to-group",
                      headers=h(token), json={"group_id": gid}, timeout=20)
    assert_eq("D1 re-attach same draft → 404", 404, r.status_code, results)

    # ── E. No regression on POST /split/expenses (real) ──────────────────
    print("\n── E. Regression: POST /split/expenses real ──")
    r = requests.post(f"{BASE}/split/expenses", headers=h(token),
                      json={"group_id": gid, "description": "Regression real exp", "amount": 100,
                            "split_type": "equal"}, timeout=30)
    assert_eq("E1 POST real expense → 200", 200, r.status_code, results)
    eb = r.json()
    assert_true("E1.1 id returned", "id" in eb, f"body={list(eb.keys())}", results)
    assert_eq("E1.2 amount persisted", 100.0, float(eb.get("amount") or 0), results)

    # Cleanup: delete regression expense + the attached expense
    try:
        requests.delete(f"{BASE}/split/expenses/{eb['id']}", headers=h(token), timeout=10)
    except Exception:
        pass
    try:
        if new_expense_id:
            requests.delete(f"{BASE}/split/expenses/{new_expense_id}", headers=h(token), timeout=10)
    except Exception:
        pass

    # ── SUMMARY ──────────────────────────────────────────────────────────
    print("\n" + "=" * 78)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"PASSED: {passed}")
    print(f"FAILED: {failed}")
    print(f"TOTAL:  {len(results)}")
    print("=" * 78)
    if failed:
        print("\nFAILURES:")
        for label, ok, detail in results:
            if not ok:
                print(f"  ❌ {label} — {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
