"""Round 19 — Budget Phase-2 AI Insights endpoints test.

Tests the new endpoints in /app/backend/routers/budgets_ext.py:
  - GET /api/budgets/ai-insights/{category}
  - POST /api/budgets/ai-apply/{category}

Auth: Phone 9876543210 / OTP 123456 (mock). Token field is `token`.
"""
import os
import json
import time
from datetime import datetime, timedelta
from typing import Optional

import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com").rstrip("/") + "/api"
PHONE = "9876543210"
OTP = "123456"

passed = 0
failed = 0
failures = []


def _assert(cond: bool, label: str, extra: str = ""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {label}")
    else:
        failed += 1
        failures.append(f"{label} | {extra}")
        print(f"  ❌ {label}  {extra}")


def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=30)
    assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=30)
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
    data = r.json()
    return data["token"]


def H(t: str):
    return {"Authorization": f"Bearer {t}"}


def main():
    print("\n=== Round 19 — Budget Phase-2 AI Insights tests ===\n")
    token = auth()
    print(f"Authenticated. token={token[:20]}...\n")
    hdr = H(token)

    created_txn_ids = []

    # Pre-clean any prior Food/NoData budgets + Food/NoData txns
    try:
        r = requests.get(f"{BASE}/budgets", headers=hdr, timeout=30)
        if r.status_code == 200:
            bl = r.json() if isinstance(r.json(), list) else r.json().get("budgets", [])
            for b in bl:
                if b.get("category") in ("Food", "NoData"):
                    bid = b.get("id") or b.get("_id")
                    if bid:
                        requests.delete(f"{BASE}/budgets/{bid}", headers=hdr, timeout=30)
    except Exception as e:
        print(f"  (pre-clean budgets: {e})")

    try:
        r = requests.get(f"{BASE}/transactions", headers=hdr, timeout=30)
        if r.status_code == 200:
            txns = r.json() if isinstance(r.json(), list) else r.json().get("transactions", [])
            for t in txns:
                if t.get("category") in ("Food", "NoData") and t.get("type") in ("debit", "expense"):
                    tid = t.get("id") or t.get("_id")
                    if tid:
                        requests.delete(f"{BASE}/transactions/{tid}", headers=hdr, timeout=30)
    except Exception as e:
        print(f"  (pre-clean txns: {e})")

    # ─────────────────────────────────────────────────────────
    # T1 — GET /budgets/ai-insights/NoData (empty-data branch)
    # ─────────────────────────────────────────────────────────
    print("[T1] GET /api/budgets/ai-insights/NoData")
    r = requests.get(f"{BASE}/budgets/ai-insights/NoData", headers=hdr, timeout=30)
    _assert(r.status_code == 200, "T1 status=200", f"got {r.status_code}: {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    _assert(body.get("category") == "NoData", "T1 category==NoData", f"got {body.get('category')}")
    _assert(isinstance(body.get("tags"), list) and len(body["tags"]) >= 1,
            "T1 tags non-empty list", f"got {body.get('tags')}")
    _assert(isinstance(body.get("tips"), list) and len(body["tips"]) >= 1,
            "T1 tips non-empty list", f"got {body.get('tips')}")
    _assert(isinstance(body.get("auto_apply"), list),
            "T1 auto_apply is list", f"got {body.get('auto_apply')}")
    first_tag = (body.get("tags") or [{}])[0]
    _assert("label" in first_tag and "tone" in first_tag,
            "T1 first tag has label+tone", f"got {first_tag}")

    # ─────────────────────────────────────────────────────────
    # T2 — Setup Food budget + 5 debit txns, then ai-insights
    # ─────────────────────────────────────────────────────────
    print("\n[T2] Setup Food budget=3000 + txns")
    r = requests.post(f"{BASE}/budgets", headers=hdr,
                      json={"category": "Food", "amount": 3000, "period": "monthly"},
                      timeout=30)
    _assert(r.status_code == 200, "T2 create Food budget 3000",
            f"{r.status_code}: {r.text[:200]}")

    now = datetime.utcnow()
    # (amount, days_ago, hour) — mix night (>=21 or <3) + weekday/saturday
    specs = [
        (500, 5, 22),
        (450, 10, 23),
        (600, 15, 14),
        (750, 20, 21),
        (400, 25, 13),
    ]
    for amt, ago, hr in specs:
        dt = (now - timedelta(days=ago)).replace(hour=hr, minute=0, second=0, microsecond=0)
        payload = {
            "category": "Food", "amount": amt, "type": "debit",
            "date": dt.isoformat() + "Z",
            "description": f"Food test txn {amt} at {dt.isoformat()}",
        }
        rr = requests.post(f"{BASE}/transactions", headers=hdr, json=payload, timeout=30)
        if rr.status_code == 200:
            jj = rr.json()
            tid = jj.get("id") or jj.get("_id") or (jj.get("transaction") or {}).get("id")
            if tid:
                created_txn_ids.append(tid)
        else:
            print(f"    txn create failed {rr.status_code}: {rr.text[:200]}")

    # Add one Saturday txn (hour 20, night>=21? Let's pick 22 for night+Saturday)
    today = datetime.utcnow()
    # Find nearest past Saturday
    days_back = (today.weekday() - 5) % 7 or 7
    sat_dt = (today - timedelta(days=days_back)).replace(hour=22, minute=0, second=0, microsecond=0)
    rr = requests.post(f"{BASE}/transactions", headers=hdr, json={
        "category": "Food", "amount": 550, "type": "debit",
        "date": sat_dt.isoformat() + "Z", "description": "Saturday food outing"
    }, timeout=30)
    if rr.status_code == 200:
        jj = rr.json()
        tid = jj.get("id") or jj.get("_id") or (jj.get("transaction") or {}).get("id")
        if tid:
            created_txn_ids.append(tid)

    _assert(len(created_txn_ids) >= 5, f"T2 created >=5 Food txns (got {len(created_txn_ids)})")

    # Call ai-insights
    print("[T2] GET /api/budgets/ai-insights/Food")
    r = requests.get(f"{BASE}/budgets/ai-insights/Food", headers=hdr, timeout=30)
    _assert(r.status_code == 200, "T2 status=200", f"{r.status_code}: {r.text[:300]}")
    body = r.json() if r.status_code == 200 else {}

    _assert(body.get("category") == "Food", "T2 category==Food")
    tags = body.get("tags") or []
    _assert(isinstance(tags, list) and len(tags) >= 1, "T2 tags non-empty", f"got {tags}")
    tags_ok = all(isinstance(t, dict) and isinstance(t.get("label"), str) and isinstance(t.get("tone"), str) for t in tags)
    _assert(tags_ok, "T2 each tag has label(str)+tone(str)", f"got {tags}")

    tips = body.get("tips") or []
    _assert(isinstance(tips, list) and len(tips) >= 1, "T2 tips non-empty", f"got {tips}")
    tips_ok = all(isinstance(t, dict) and "text" in t and isinstance(t.get("save"), (int, float)) for t in tips)
    _assert(tips_ok, "T2 each tip has text+numeric save", f"got {tips}")

    aa = body.get("auto_apply") or []
    _assert(isinstance(aa, list) and len(aa) >= 1, "T2 auto_apply non-empty", f"got {aa}")
    alert_entry = next((x for x in aa if x.get("action") == "enable_alert"), None)
    _assert(alert_entry is not None, "T2 auto_apply contains enable_alert")
    if alert_entry:
        pl = alert_entry.get("payload") or {}
        _assert(pl.get("threshold") == 0.8, f"T2 enable_alert payload threshold==0.8 (got {pl})")

    stats = body.get("stats") or {}
    _assert(isinstance(stats, dict) and len(stats) > 0, "T2 stats present")
    _assert(isinstance(stats.get("txn_count_60d"), int) and stats.get("txn_count_60d", 0) >= 5,
            f"T2 stats.txn_count_60d>=5 (got {stats.get('txn_count_60d')})")
    _assert(isinstance(stats.get("monthly_avg"), (int, float)) and stats.get("monthly_avg", 0) > 0,
            f"T2 stats.monthly_avg>0 (got {stats.get('monthly_avg')})")
    _assert(isinstance(stats.get("night_pct"), (int, float)), f"T2 night_pct numeric (got {stats.get('night_pct')})")
    _assert(isinstance(stats.get("weekend_pct"), (int, float)), f"T2 weekend_pct numeric (got {stats.get('weekend_pct')})")
    _assert(isinstance(stats.get("delta_pct"), (int, float)), f"T2 delta_pct numeric (got {stats.get('delta_pct')})")

    # ─────────────────────────────────────────────────────────
    # T3 — POST /budgets/ai-apply/Food  adjust_budget → 2500
    # ─────────────────────────────────────────────────────────
    print("\n[T3] POST /api/budgets/ai-apply/Food adjust_budget amount=2500")
    r = requests.post(f"{BASE}/budgets/ai-apply/Food", headers=hdr,
                      json={"action": "adjust_budget", "payload": {"amount": 2500}}, timeout=30)
    _assert(r.status_code == 200, "T3 status=200", f"{r.status_code}: {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    _assert(body.get("ok") is True, f"T3 ok==True (got {body.get('ok')})")
    _assert(body.get("applied") == "adjust_budget", f"T3 applied==adjust_budget (got {body.get('applied')})")
    _assert(body.get("new_amount") == 2500, f"T3 new_amount==2500 (got {body.get('new_amount')})")

    r = requests.get(f"{BASE}/budgets", headers=hdr, timeout=30)
    _assert(r.status_code == 200, "T3 GET /budgets status=200")
    bl = r.json() if r.status_code == 200 else []
    if isinstance(bl, dict):
        bl = bl.get("budgets", [])
    food_row = next((b for b in bl if b.get("category") == "Food"), None)
    _assert(food_row is not None, "T3 Food budget still exists")
    if food_row:
        _assert(float(food_row.get("amount", 0)) == 2500.0,
                f"T3 Food budget amount==2500 (got {food_row.get('amount')})")

    # ─────────────────────────────────────────────────────────
    # T4 — POST /budgets/ai-apply/Food  enable_alert → 0.75
    # ─────────────────────────────────────────────────────────
    print("\n[T4] POST /api/budgets/ai-apply/Food enable_alert threshold=0.75")
    r = requests.post(f"{BASE}/budgets/ai-apply/Food", headers=hdr,
                      json={"action": "enable_alert", "payload": {"threshold": 0.75}}, timeout=30)
    _assert(r.status_code == 200, "T4 status=200", f"{r.status_code}: {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    _assert(body.get("ok") is True, f"T4 ok==True (got {body.get('ok')})")
    _assert(body.get("applied") == "enable_alert", f"T4 applied==enable_alert (got {body.get('applied')})")
    _assert(body.get("threshold") == 0.75, f"T4 threshold==0.75 (got {body.get('threshold')})")

    # ─────────────────────────────────────────────────────────
    # T5 — POST /budgets/ai-apply/Food unknown action
    # ─────────────────────────────────────────────────────────
    print("\n[T5] POST /api/budgets/ai-apply/Food unknown_xyz")
    r = requests.post(f"{BASE}/budgets/ai-apply/Food", headers=hdr,
                      json={"action": "unknown_xyz"}, timeout=30)
    _assert(r.status_code == 200, "T5 status=200", f"{r.status_code}: {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    _assert(body.get("ok") is False, f"T5 ok==False (got {body.get('ok')})")
    _assert(body.get("error") == "unknown_action", f"T5 error==unknown_action (got {body.get('error')})")

    # ─────────────────────────────────────────────────────────
    # T6 — Auth guard
    # ─────────────────────────────────────────────────────────
    print("\n[T6] GET /api/budgets/ai-insights/Food (no bearer)")
    r = requests.get(f"{BASE}/budgets/ai-insights/Food", timeout=30)
    _assert(r.status_code in (401, 422), f"T6 status in (401,422) (got {r.status_code})")

    # ─────────────────────────────────────────────────────────
    # T7 — Regression
    # ─────────────────────────────────────────────────────────
    print("\n[T7] Regression sanity")
    for ep in ["/budgets/live", "/budgets/smart-suggest", "/premium/status", "/gmail/status"]:
        r = requests.get(f"{BASE}{ep}", headers=hdr, timeout=30)
        _assert(r.status_code == 200, f"T7 GET {ep} == 200",
                f"{r.status_code}: {r.text[:150]}")

    # ─────────────────────────────────────────────────────────
    # T8 — Cleanup
    # ─────────────────────────────────────────────────────────
    print("\n[T8] Cleanup")
    try:
        r = requests.get(f"{BASE}/budgets", headers=hdr, timeout=30)
        if r.status_code == 200:
            bl = r.json()
            if isinstance(bl, dict):
                bl = bl.get("budgets", [])
            for b in bl:
                if b.get("category") in ("Food", "NoData"):
                    bid = b.get("id") or b.get("_id")
                    if bid:
                        rr = requests.delete(f"{BASE}/budgets/{bid}", headers=hdr, timeout=30)
                        print(f"    deleted {b.get('category')} budget {bid}: {rr.status_code}")
    except Exception as e:
        print(f"    cleanup budget err: {e}")

    cleaned = 0
    for tid in created_txn_ids:
        try:
            rr = requests.delete(f"{BASE}/transactions/{tid}", headers=hdr, timeout=30)
            if rr.status_code == 200:
                cleaned += 1
        except Exception:
            pass
    print(f"    deleted {cleaned}/{len(created_txn_ids)} tracked Food txns")

    try:
        r = requests.get(f"{BASE}/transactions", headers=hdr, timeout=30)
        if r.status_code == 200:
            txns = r.json() if isinstance(r.json(), list) else r.json().get("transactions", [])
            extras = 0
            for t in txns:
                if t.get("category") == "Food":
                    tid = t.get("id") or t.get("_id")
                    if tid:
                        rr = requests.delete(f"{BASE}/transactions/{tid}", headers=hdr, timeout=30)
                        if rr.status_code == 200:
                            extras += 1
            print(f"    extra Food txn cleanup: {extras}")
    except Exception as e:
        print(f"    cleanup txns err: {e}")

    total = passed + failed
    print(f"\n=== RESULT: {passed}/{total} assertions passed, {failed} failed ===\n")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(f"  - {f}")
    return failed == 0


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
