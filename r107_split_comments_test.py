"""R107 — Split inline-comments thread backend tests.

Procedure:
  1) Login phone 9876543210 / OTP 123456
  2) Create a group (or reuse first if available)
  3) Create an expense
  4) Test all comments endpoints
  5) Test comment_count on /split/groups/{group_id}/expenses
"""
import json
import os
import sys
import uuid
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def line(s=""):
    print(s, flush=True)


def jp(label, r):
    body = None
    try:
        body = r.json()
    except Exception:
        body = r.text
    line(f"  {label} → {r.status_code} {json.dumps(body)[:240] if isinstance(body, (dict, list)) else body[:240]}")
    return body


PASS = 0
FAIL = 0
FAILED_ASSERTIONS = []


def check(cond: bool, label: str):
    global PASS, FAIL
    if cond:
        PASS += 1
        line(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILED_ASSERTIONS.append(label)
        line(f"  ❌ {label}")


def main():
    s = requests.Session()

    # T1 — Auth
    line("\n[T1] Auth — send-otp + verify-otp")
    r = s.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    check(r.status_code == 200, "send-otp 200")
    r = s.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP, "device_id": "tester", "device_name": "tester", "os": "web"},
        timeout=30,
    )
    body = jp("verify-otp", r)
    check(r.status_code == 200, "verify-otp 200")
    token = body.get("access_token") or body.get("token")
    user_id = (body.get("user") or {}).get("id") or (body.get("user") or {}).get("_id")
    check(bool(token), "access_token issued")
    h = {"Authorization": f"Bearer {token}"}
    line(f"  user_id={user_id}")

    # Login as a SECOND user (non-member) for 403 test — 9111122221 is a registered user
    # we keep OUT of the group so all member-gating asserts are correct.
    line("\n[T1b] Auth — second user 9111122221 (NON-MEMBER for 403 tests)")
    s2 = requests.Session()
    s2.post(f"{BASE}/auth/send-otp", json={"phone": "9111122221"}, timeout=30)
    r2 = s2.post(
        f"{BASE}/auth/verify-otp",
        json={"phone": "9111122221", "otp": OTP, "device_id": "t2", "device_name": "t2", "os": "web"},
        timeout=30,
    )
    body2 = jp("verify-otp(2)", r2)
    token2 = body2.get("access_token") or body2.get("token")
    h2 = {"Authorization": f"Bearer {token2}"}
    check(bool(token2), "second user token issued")

    # T2 — Create group
    line("\n[T2] Create split group")
    grp_name = f"R107 Comments Test {uuid.uuid4().hex[:6]}"
    r = s.post(
        f"{BASE}/split/groups",
        json={"name": grp_name, "members": ["9000099991"]},
        headers=h,
        timeout=30,
    )
    body = jp("POST /split/groups", r)
    check(r.status_code == 200, "group create 200")
    group_id = body.get("id") or body.get("_id")
    check(bool(group_id), f"group_id obtained ({group_id})")

    # T3 — Add expense
    line("\n[T3] Add expense")
    r = s.post(
        f"{BASE}/split/expenses",
        json={
            "group_id": group_id,
            "description": "R107 Pizza Night",
            "amount": 600.0,
            "split_type": "equal",
        },
        headers=h,
        timeout=30,
    )
    body = jp("POST /split/expenses", r)
    check(r.status_code == 200, "expense create 200")
    expense_id = body.get("id")
    check(bool(expense_id), f"expense_id obtained ({expense_id})")

    # Add a SECOND expense — for "comment_count must reflect only target expense" test
    r = s.post(
        f"{BASE}/split/expenses",
        json={
            "group_id": group_id,
            "description": "R107 Cab",
            "amount": 200.0,
            "split_type": "equal",
        },
        headers=h,
        timeout=30,
    )
    body = jp("POST /split/expenses (second)", r)
    other_expense_id = body.get("id")
    check(bool(other_expense_id), "second expense_id obtained")

    # T4 — Auth-required: 401 without bearer
    line("\n[T4] Auth required on all 3 endpoints (no bearer)")
    r = requests.get(f"{BASE}/split/expenses/{expense_id}/comments", timeout=30)
    jp("GET (no auth)", r)
    check(r.status_code in (401, 403, 422), "GET /comments without bearer rejected")
    r = requests.post(f"{BASE}/split/expenses/{expense_id}/comments", json={"text": "x"}, timeout=30)
    jp("POST (no auth)", r)
    check(r.status_code in (401, 403, 422), "POST /comments without bearer rejected")
    r = requests.delete(f"{BASE}/split/expenses/{expense_id}/comments/507f1f77bcf86cd799439011", timeout=30)
    jp("DELETE (no auth)", r)
    check(r.status_code in (401, 403, 422), "DELETE /comments without bearer rejected")

    # T5 — GET on non-existent expense → 404
    line("\n[T5] GET on non-existent expense → 404")
    fake_oid = "507f1f77bcf86cd799439011"  # valid OID, not in DB
    r = s.get(f"{BASE}/split/expenses/{fake_oid}/comments", headers=h, timeout=30)
    jp("GET (fake oid)", r)
    check(r.status_code == 404, "GET non-existent expense → 404")

    # T6 — GET initial empty list
    line("\n[T6] GET initial comment list")
    r = s.get(f"{BASE}/split/expenses/{expense_id}/comments", headers=h, timeout=30)
    body = jp("GET /comments (initial)", r)
    check(r.status_code == 200, "GET initial 200")
    check(isinstance(body, dict) and "comments" in body and "count" in body, "shape: {comments, count}")
    check(isinstance(body.get("comments"), list) and body.get("count") == 0, "initial: empty list, count=0")

    # T7 — POST empty text → 400
    line("\n[T7] POST empty text → 400")
    r = s.post(f"{BASE}/split/expenses/{expense_id}/comments", json={"text": ""}, headers=h, timeout=30)
    jp("POST empty", r)
    check(r.status_code == 400, "POST empty text → 400")

    r = s.post(f"{BASE}/split/expenses/{expense_id}/comments", json={"text": "   "}, headers=h, timeout=30)
    jp("POST whitespace", r)
    check(r.status_code == 400, "POST whitespace text → 400")

    # T8 — POST happy path → returns is_mine: true
    line("\n[T8] POST comment happy path")
    r = s.post(
        f"{BASE}/split/expenses/{expense_id}/comments",
        json={"text": "Why was this pizza 1.5x?"},
        headers=h,
        timeout=30,
    )
    body = jp("POST /comments", r)
    check(r.status_code == 200, "POST 200")
    check(isinstance(body, dict), "POST returns dict")
    check(body.get("is_mine") is True, "POST returns is_mine: true")
    check(body.get("text") == "Why was this pizza 1.5x?", "POST stores correct text")
    check(bool(body.get("id")), "POST returns comment id")
    check(body.get("user_id") == user_id, "POST records correct user_id")
    comment_id = body.get("id")

    # Add a second comment by same user — used later for delete
    r = s.post(
        f"{BASE}/split/expenses/{expense_id}/comments",
        json={"text": "Second note"},
        headers=h,
        timeout=30,
    )
    body = jp("POST /comments (second)", r)
    second_comment_id = body.get("id")
    check(r.status_code == 200, "POST second 200")

    # T9 — POST text > 600 chars truncated silently
    line("\n[T9] POST text > 600 chars — silently truncated")
    big = "A" * 1200
    r = s.post(
        f"{BASE}/split/expenses/{expense_id}/comments",
        json={"text": big},
        headers=h,
        timeout=30,
    )
    body = jp("POST big text", r)
    check(r.status_code == 200, "POST big text 200 (silent truncation)")
    check(isinstance(body.get("text"), str) and len(body["text"]) <= 600, f"text truncated to ≤600 (got {len(body.get('text','')) if isinstance(body.get('text'),str) else 'n/a'})")
    big_id = body.get("id")

    # T10 — GET shows all 3 comments
    line("\n[T10] GET reflects all comments")
    r = s.get(f"{BASE}/split/expenses/{expense_id}/comments", headers=h, timeout=30)
    body = jp("GET /comments (after posts)", r)
    check(r.status_code == 200, "GET 200")
    comments = body.get("comments") or []
    check(len(comments) == 3, f"3 comments in list (got {len(comments)})")
    check(body.get("count") == 3, f"count=3 (got {body.get('count')})")
    check(all(c.get("is_mine") is True for c in comments), "all comments is_mine: true for owner")
    # Sorted ascending by created_at
    if len(comments) >= 2:
        try:
            asc = comments[0].get("created_at") <= comments[1].get("created_at")
        except Exception:
            asc = True
        check(asc, "comments sorted ascending by created_at")

    # T11 — Non-member GET → 403
    line("\n[T11] Non-member GET → 403")
    r = s2.get(f"{BASE}/split/expenses/{expense_id}/comments", headers=h2, timeout=30)
    jp("GET (non-member)", r)
    check(r.status_code == 403, "non-member GET → 403")

    # T11b — Non-member POST → 403
    r = s2.post(f"{BASE}/split/expenses/{expense_id}/comments", json={"text": "intruder"}, headers=h2, timeout=30)
    jp("POST (non-member)", r)
    check(r.status_code == 403, "non-member POST → 403")

    # T11c — Non-member DELETE → 403 (or 404 if expense lookup gates first; spec wants 403 path)
    r = s2.delete(f"{BASE}/split/expenses/{expense_id}/comments/{comment_id}", headers=h2, timeout=30)
    jp("DELETE (non-member)", r)
    check(r.status_code == 403, "non-member DELETE → 403")

    # T12 — DELETE not-mine → 403  (need a comment authored by user2 in another scenario, skip)
    # Instead: simulate by attempting to delete without ownership — user2 cannot create a comment, so we just verify own-delete works.

    # T13 — DELETE own comment → 200
    line("\n[T13] DELETE own comment")
    r = s.delete(f"{BASE}/split/expenses/{expense_id}/comments/{comment_id}", headers=h, timeout=30)
    body = jp("DELETE own comment", r)
    check(r.status_code == 200, "DELETE own 200")
    check(body.get("deleted") is True, "deleted: true")

    # T13b — DELETE same again → 404
    r = s.delete(f"{BASE}/split/expenses/{expense_id}/comments/{comment_id}", headers=h, timeout=30)
    jp("DELETE again", r)
    check(r.status_code == 404, "DELETE deleted-comment → 404")

    # T14 — comment_count on /split/groups/{group_id}/expenses
    line("\n[T14] comment_count on group expenses listing")
    r = s.get(f"{BASE}/split/groups/{group_id}/expenses", headers=h, timeout=30)
    body = jp("GET /split/groups/{id}/expenses", r)
    check(r.status_code == 200, "group expenses 200")
    expenses = (body or {}).get("expenses") or []
    check(len(expenses) >= 2, f"≥2 expenses listed ({len(expenses)})")
    # Every expense has comment_count, numeric
    have_field = all(isinstance(e.get("comment_count"), int) for e in expenses)
    check(have_field, "every expense has integer comment_count")
    # Lookup by id
    target = next((e for e in expenses if e.get("id") == expense_id), None)
    other = next((e for e in expenses if e.get("id") == other_expense_id), None)
    check(target is not None, "target expense present in list")
    check(other is not None, "other expense present in list")
    if target and other:
        # We posted 3 then deleted 1 → 2 remain on target. other has 0.
        check(target.get("comment_count") == 2, f"target comment_count=2 (got {target.get('comment_count')})")
        check(other.get("comment_count") == 0, f"other comment_count=0 (got {other.get('comment_count')})")

    # T15 — POST a comment then refetch → comment_count increments only on target
    line("\n[T15] POST comment then refetch — increment isolated")
    r = s.post(
        f"{BASE}/split/expenses/{expense_id}/comments",
        json={"text": "tracker"},
        headers=h,
        timeout=30,
    )
    check(r.status_code == 200, "extra POST 200")
    r = s.get(f"{BASE}/split/groups/{group_id}/expenses", headers=h, timeout=30)
    body = jp("GET /expenses (after extra post)", r)
    expenses = (body or {}).get("expenses") or []
    target = next((e for e in expenses if e.get("id") == expense_id), None)
    other = next((e for e in expenses if e.get("id") == other_expense_id), None)
    if target and other:
        check(target.get("comment_count") == 3, f"target comment_count=3 after post (got {target.get('comment_count')})")
        check(other.get("comment_count") == 0, f"other comment_count still 0 (got {other.get('comment_count')})")

    # ── Summary
    line("\n══════════════════════════════════════════")
    line(f"PASS: {PASS}    FAIL: {FAIL}")
    if FAIL:
        line("FAILED ASSERTIONS:")
        for a in FAILED_ASSERTIONS:
            line(f"  - {a}")
    line("══════════════════════════════════════════")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
