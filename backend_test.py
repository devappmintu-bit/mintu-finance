"""Round-13 post-refactor smoke regression (Apr 20 2026).

Covers 10 items from the review request:
  1. GET /api/stats/overview
  2. GET /api/analytics/summary
  3. GET /api/analytics/monthly
  4. GET /api/leaderboard/unified?scope=contacts
  5. GET /api/news/india-finance  (6 articles with source_url pointing to Google News topic search)
  6. POST /api/premium/mock-activate {plan:"yearly"}
  7. Transactions full lifecycle (POST → PUT → DELETE)
  8. Budgets full lifecycle (POST → PUT → DELETE)
  9. Split lifecycle (POST /split/groups → POST /split/expenses → DELETE /split/expenses/{id})
      — and verify DELETE does NOT collide with /split/groups/{id}/leave
 10. Rate-limit sanity — 10 rapid GETs /api/user/me, none 429
"""
import json
import os
import time
from pathlib import Path
from typing import Tuple

import httpx

# ── Resolve public backend URL from frontend/.env ──
ROOT = Path(__file__).parent
env_path = ROOT / "frontend" / ".env"
BASE = None
for line in env_path.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("REACT_APP_BACKEND_URL="):
        BASE = line.split("=", 1)[1].strip()
        break
assert BASE, "Could not resolve backend URL from frontend/.env"
BASE = BASE.rstrip("/") + "/api"

PHONE = "9876543210"
OTP = "123456"

results: list[Tuple[str, bool, str]] = []


def _log(label: str, ok: bool, msg: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label} — {msg}")
    results.append((label, ok, msg))


def auth_token(cli: httpx.Client) -> str:
    r1 = cli.post(f"{BASE}/auth/send-otp", json={"phone": PHONE})
    assert r1.status_code == 200, f"send-otp failed: {r1.status_code} {r1.text[:200]}"
    r2 = cli.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP, "name": "Test User"})
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text[:200]}"
    tok = r2.json()["token"]
    return tok


def main():
    with httpx.Client(timeout=60.0) as cli:
        token = auth_token(cli)
        H = {"Authorization": f"Bearer {token}"}

        # ── 1. stats/overview ──
        r = cli.get(f"{BASE}/stats/overview", headers=H)
        ok = r.status_code == 200 and all(k in r.json() for k in ("total_income", "total_expense", "balance", "category_breakdown"))
        _log("1. GET /api/stats/overview", ok, f"{r.status_code} keys={list(r.json().keys()) if r.status_code==200 else 'n/a'}")

        # ── 2. analytics/summary (same payload) ──
        r = cli.get(f"{BASE}/analytics/summary", headers=H)
        ok = r.status_code == 200 and "total_income" in r.json() and "total_expense" in r.json()
        _log("2. GET /api/analytics/summary", ok, f"{r.status_code}")

        # ── 3. analytics/monthly (same payload) ──
        r = cli.get(f"{BASE}/analytics/monthly", headers=H)
        ok = r.status_code == 200 and "total_income" in r.json() and "category_breakdown" in r.json()
        _log("3. GET /api/analytics/monthly", ok, f"{r.status_code}")

        # ── 4. leaderboard/unified ──
        r = cli.get(f"{BASE}/leaderboard/unified?scope=contacts", headers=H)
        body = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and "contenders" in body and "scope" in body and body.get("scope") == "contacts"
        _log("4. GET /api/leaderboard/unified?scope=contacts", ok,
             f"{r.status_code} total={body.get('total')} contenders={len(body.get('contenders', []))}")

        # ── 5. news/india-finance ──
        r = cli.get(f"{BASE}/news/india-finance", headers=H, timeout=30.0)
        body = r.json() if r.status_code == 200 else {}
        articles = body.get("articles", [])
        has_6 = len(articles) == 6
        all_have_source_url = all(isinstance(a.get("source_url"), str) and a["source_url"].startswith("http") for a in articles)
        all_google_news = all("news.google.com/search" in (a.get("source_url") or "") for a in articles)
        ok = r.status_code == 200 and has_6 and all_have_source_url and all_google_news
        sample = articles[0].get("source_url", "")[:90] if articles else ""
        _log("5. GET /api/news/india-finance", ok,
             f"{r.status_code} n={len(articles)} all_google_news={all_google_news} sample={sample!r}")

        # ── 6. premium/mock-activate yearly ──
        r = cli.post(f"{BASE}/premium/mock-activate", headers=H, json={"plan": "yearly"})
        body = r.json() if r.status_code == 200 else {}
        ok = r.status_code == 200 and body.get("is_premium") is True and body.get("plan") == "yearly" and body.get("tier") == "premium"
        _log("6. POST /api/premium/mock-activate {yearly}", ok,
             f"{r.status_code} tier={body.get('tier')} plan={body.get('plan')} until={body.get('premium_until')}")

        # ── 7. Transactions lifecycle ──
        create = cli.post(f"{BASE}/transactions", headers=H, json={
            "amount": 425.50, "category": "Food", "description": "Zomato biryani", "type": "debit"
        })
        ok_c = create.status_code == 200 and "id" in create.json()
        txn_id = create.json().get("id") if ok_c else None
        _log("7a. POST /api/transactions", ok_c, f"{create.status_code} id={txn_id}")

        if txn_id:
            upd = cli.put(f"{BASE}/transactions/{txn_id}", headers=H, json={
                "amount": 500.0, "description": "Zomato biryani (updated)"
            })
            ok_u = upd.status_code == 200 and float(upd.json().get("amount", 0)) == 500.0
            _log("7b. PUT /api/transactions/{id}", ok_u, f"{upd.status_code} amount={upd.json().get('amount')}")

            dele = cli.delete(f"{BASE}/transactions/{txn_id}", headers=H)
            ok_d = dele.status_code == 200
            _log("7c. DELETE /api/transactions/{id}", ok_d, f"{dele.status_code}")
        else:
            _log("7b. PUT /api/transactions/{id}", False, "skipped (create failed)")
            _log("7c. DELETE /api/transactions/{id}", False, "skipped (create failed)")

        # ── 8. Budgets lifecycle ──
        # Use a unique category to avoid upsert collision with pre-existing budget
        unique_cat = f"SmokeCat_{int(time.time())}"
        bcreate = cli.post(f"{BASE}/budgets", headers=H, json={
            "category": unique_cat, "amount": 4000, "period": "monthly"
        })
        ok_bc = bcreate.status_code == 200 and "id" in bcreate.json()
        b_id = bcreate.json().get("id") if ok_bc else None
        _log("8a. POST /api/budgets", ok_bc, f"{bcreate.status_code} id={b_id}")

        if b_id:
            bupd = cli.put(f"{BASE}/budgets/{b_id}", headers=H, json={"amount": 5500})
            ok_bu = bupd.status_code == 200 and float(bupd.json().get("amount", 0)) == 5500.0
            _log("8b. PUT /api/budgets/{id}", ok_bu, f"{bupd.status_code} amount={bupd.json().get('amount')}")

            bdel = cli.delete(f"{BASE}/budgets/{b_id}", headers=H)
            ok_bd = bdel.status_code == 200
            _log("8c. DELETE /api/budgets/{id}", ok_bd, f"{bdel.status_code}")
        else:
            _log("8b. PUT /api/budgets/{id}", False, "skipped (create failed)")
            _log("8c. DELETE /api/budgets/{id}", False, "skipped (create failed)")

        # ── 9. Split lifecycle ──
        # Create a split group with 2 members (creator + a second registered phone)
        gc = cli.post(f"{BASE}/split/groups", headers=H, json={
            "name": f"Smoke Group {int(time.time())}",
            "members": ["9999888877"],  # Rahul Sharma test user
        })
        ok_gc = gc.status_code == 200 and "id" in gc.json()
        gid = gc.json().get("id") if ok_gc else None
        member_ids = [m["user_id"] for m in gc.json().get("members", [])] if ok_gc else []
        _log("9a. POST /api/split/groups", ok_gc,
             f"{gc.status_code} id={gid} members={len(member_ids)}")

        exp_id = None
        if gid and len(member_ids) >= 2:
            # Build equal splits between creator and second member
            splits = {uid: 250.0 for uid in member_ids}
            ec = cli.post(f"{BASE}/split/expenses", headers=H, json={
                "group_id": gid,
                "description": "Smoke dinner",
                "amount": 500.0,
                "paid_by": member_ids[0],
                "split_type": "equal",
                "splits": splits,
            })
            ok_ec = ec.status_code == 200 and "id" in ec.json()
            exp_id = ec.json().get("id") if ok_ec else None
            _log("9b. POST /api/split/expenses", ok_ec, f"{ec.status_code} id={exp_id}")
        else:
            _log("9b. POST /api/split/expenses", False, "skipped (group create failed or <2 members)")

        if exp_id:
            # DELETE the expense — verify it routes to delete_expense (not leave_group)
            ed = cli.delete(f"{BASE}/split/expenses/{exp_id}", headers=H)
            body = ed.json() if ed.status_code == 200 else {}
            msg = body.get("message", "")
            ok_ed = ed.status_code == 200 and msg == "Expense deleted"
            _log("9c. DELETE /api/split/expenses/{id} (no collision w/ /leave)", ok_ed,
                 f"{ed.status_code} message={msg!r}")
        else:
            _log("9c. DELETE /api/split/expenses/{id} (no collision w/ /leave)", False,
                 "skipped (expense create failed)")

        # Cleanup: delete the test group
        if gid:
            cli.delete(f"{BASE}/split/groups/{gid}", headers=H)

        # ── 10. Rate-limit sanity — 10 rapid GETs /api/user/me, none 429 ──
        codes = []
        for _ in range(10):
            r = cli.get(f"{BASE}/user/me", headers=H)
            codes.append(r.status_code)
        no_429 = all(c != 429 for c in codes)
        all_200 = all(c == 200 for c in codes)
        _log("10. 10x GET /api/user/me — no 429", no_429, f"codes={codes} all_200={all_200}")

    # ── Summary ──
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print("\n" + "=" * 70)
    print(f"RESULT: {passed}/{total} assertions passed")
    print("=" * 70)
    for label, ok, msg in results:
        marker = "✅" if ok else "❌"
        print(f"{marker} {label}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
