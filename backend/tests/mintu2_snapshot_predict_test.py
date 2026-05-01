"""MintU 2.0 — /api/home/snapshot + /api/ai/predict tests (Apr 18 2026)."""
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
PW = "test123"

results = []
from core.time import utc_now


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}  {detail}")
    return cond


def auth():
    r = requests.post(f"{BASE}/auth/login", json={"phone": PHONE, "password": PW}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    print(f"Auth OK, JWT len={len(token)}")
    return {"Authorization": f"Bearer {token}"}


def t1_home_snapshot(headers):
    print("\n=== T1: GET /api/home/snapshot — shape ===")
    r = requests.get(f"{BASE}/home/snapshot", headers=headers, timeout=30)
    check("T1.0 status=200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(r.text[:500])
        return None
    d = r.json()

    # Numbers
    for k in ("mtd_spend", "mtd_income", "savings_rate", "projected_month_end", "daily_avg",
              "this_week_total", "last_week_total", "week_change_pct"):
        check(f"T1.{k} is number", isinstance(d.get(k), (int, float)) and not isinstance(d.get(k), bool), f"type={type(d.get(k)).__name__} val={d.get(k)}")

    # Ints
    dom = d.get("day_of_month")
    check("T1.day_of_month int 1-31", isinstance(dom, int) and 1 <= dom <= 31, f"val={dom}")
    dim = d.get("days_in_month")
    check("T1.days_in_month int 28-31", isinstance(dim, int) and 28 <= dim <= 31, f"val={dim}")

    # Sparkline
    sp = d.get("sparkline")
    check("T1.sparkline is list", isinstance(sp, list), f"type={type(sp).__name__}")
    if isinstance(sp, list):
        check("T1.sparkline len==7", len(sp) == 7, f"len={len(sp)}")
        ok_items = True
        for i, item in enumerate(sp):
            if not (isinstance(item, dict) and "day" in item and "date" in item and "amount" in item):
                ok_items = False
                print(f"   sparkline[{i}] missing fields: {item}")
                break
        check("T1.sparkline items have {day,date,amount}", ok_items)

    # Top category
    tc = d.get("top_category")
    if tc is None:
        check("T1.top_category null-or-obj", True, "null")
    else:
        ok = isinstance(tc, dict) and all(k in tc for k in ("name", "amount", "pct"))
        check("T1.top_category has {name,amount,pct}", ok, f"val={tc}")

    # Pace
    ph = d.get("pace_headline")
    check("T1.pace_headline non-empty str", isinstance(ph, str) and len(ph) > 0, f"val={ph!r}")
    pe = d.get("pace_emoji")
    check("T1.pace_emoji str", isinstance(pe, str), f"val={pe!r}")

    # Tier
    tier = d.get("tier")
    check("T1.tier is dict", isinstance(tier, dict), f"type={type(tier).__name__}")
    if isinstance(tier, dict):
        cur = tier.get("current")
        ok_cur = isinstance(cur, dict) and all(k in cur for k in ("name", "emoji", "color", "min"))
        check("T1.tier.current has {name,emoji,color,min}", ok_cur, f"val={cur}")
        nxt = tier.get("next")
        ok_nxt = (nxt is None) or (isinstance(nxt, dict) and all(k in nxt for k in ("name", "emoji", "color", "min")))
        check("T1.tier.next null-or-obj", ok_nxt, f"val={nxt}")
        pp = tier.get("progress_pct")
        check("T1.tier.progress_pct in 0-100", isinstance(pp, (int, float)) and 0 <= pp <= 100, f"val={pp}")
        sc = tier.get("score")
        check("T1.tier.score in 0-100", isinstance(sc, (int, float)) and 0 <= sc <= 100, f"val={sc}")
        sd = tier.get("streak_days")
        check("T1.tier.streak_days int >=0", isinstance(sd, int) and sd >= 0, f"val={sd}")

    tc_cnt = d.get("transaction_count")
    check("T1.transaction_count int >=0", isinstance(tc_cnt, int) and tc_cnt >= 0, f"val={tc_cnt}")

    return d


def t2_sparkline(d):
    print("\n=== T2: Sparkline chronological ===")
    if not d:
        check("T2 skipped (T1 fail)", False)
        return
    sp = d.get("sparkline", [])
    check("T2.len==7", len(sp) == 7, f"len={len(sp)}")
    if len(sp) == 7:
        from datetime import datetime, timezone
        # last entry date should be today or yesterday
        try:
            last_date_str = sp[-1]["date"]  # e.g. "Apr 18"
            now = utc_now()
            expected_today = now.strftime("%b %d")
            from datetime import timedelta
            expected_yesterday = (now - timedelta(days=1)).strftime("%b %d")
            check("T2.last_entry date = today (or yesterday UTC)", last_date_str in (expected_today, expected_yesterday),
                  f"last={last_date_str} today={expected_today} yesterday={expected_yesterday}")
        except Exception as e:
            check("T2.last_entry date check", False, str(e))
        # amounts non-negative
        all_nn = all(isinstance(it.get("amount"), (int, float)) and it["amount"] >= 0 for it in sp)
        check("T2.all amounts non-negative", all_nn)


def t3_ai_predict(headers):
    print("\n=== T3: GET /api/ai/predict — shape ===")
    r = requests.get(f"{BASE}/ai/predict", headers=headers, timeout=30)
    check("T3.0 status=200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(r.text[:500])
        return None
    d = r.json()

    for k in ("mtd_spend", "daily_avg", "projected_month_end"):
        check(f"T3.{k} is number", isinstance(d.get(k), (int, float)), f"val={d.get(k)}")
    dom = d.get("day_of_month")
    check("T3.day_of_month int 1-31", isinstance(dom, int) and 1 <= dom <= 31, f"val={dom}")
    dim = d.get("days_in_month")
    check("T3.days_in_month int 28-31", isinstance(dim, int) and 28 <= dim <= 31, f"val={dim}")

    oa = d.get("overspend_alerts")
    check("T3.overspend_alerts is list", isinstance(oa, list), f"type={type(oa).__name__}")
    if isinstance(oa, list):
        ok = True
        for it in oa:
            if not (isinstance(it, dict) and all(k in it for k in ("category", "spent", "budget", "pct", "severity", "message"))):
                ok = False
                break
            if it["severity"] not in ("critical", "warning"):
                ok = False
                break
        check("T3.overspend_alerts items shape + severity enum", ok, f"count={len(oa)}")

    wc = d.get("waste_comparisons")
    check("T3.waste_comparisons is list", isinstance(wc, list), f"type={type(wc).__name__}")
    if isinstance(wc, list):
        ok = all(isinstance(it, dict) and all(k in it for k in ("icon", "title", "amount", "comparison")) for it in wc)
        check("T3.waste_comparisons items have {icon,title,amount,comparison}", ok, f"count={len(wc)}")

    cp = d.get("category_predictions")
    check("T3.category_predictions is list", isinstance(cp, list), f"type={type(cp).__name__}")
    if isinstance(cp, list):
        check("T3.category_predictions len<=5", len(cp) <= 5, f"len={len(cp)}")
        ok = all(isinstance(it, dict) and all(k in it for k in ("category", "mtd", "projected", "daily_avg")) for it in cp)
        check("T3.category_predictions items shape", ok)

    hd = d.get("headline")
    check("T3.headline non-empty str", isinstance(hd, str) and len(hd) > 0, f"val={hd!r}")
    return d


def t4_consistency(snap, pred):
    print("\n=== T4: Consistency ===")
    if not (snap and pred):
        check("T4 skipped", False)
        return
    check("T4.snap.mtd_spend == pred.mtd_spend", abs(snap["mtd_spend"] - pred["mtd_spend"]) < 0.01,
          f"snap={snap['mtd_spend']} pred={pred['mtd_spend']}")
    if snap["mtd_spend"] > 0:
        check("T4.projected_month_end >= mtd_spend", snap["projected_month_end"] >= snap["mtd_spend"],
              f"proj={snap['projected_month_end']} mtd={snap['mtd_spend']}")


def t5_regression(headers):
    print("\n=== T5: Regression ===")

    # POST /api/ai/agent-chat
    r = requests.post(f"{BASE}/ai/agent-chat", headers=headers, json={"message": "test", "lang": "en"}, timeout=60)
    check("T5.agent-chat status=200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        ok = all(k in d for k in ("mode", "issues", "ctas"))
        check("T5.agent-chat has mode/issues/ctas", ok, f"keys={list(d.keys())}")

    # POST /api/ai/chat
    r = requests.post(f"{BASE}/ai/chat", headers=headers, json={"message": "test", "lang": "en"}, timeout=60)
    check("T5.ai/chat status=200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        ok = all(k in d for k in ("mode", "issues", "ctas"))
        check("T5.ai/chat has mode/issues/ctas", ok, f"keys={list(d.keys())}")

    # GET /api/reports/weekly
    r = requests.get(f"{BASE}/reports/weekly", headers=headers, timeout=30)
    check("T5.reports/weekly status=200", r.status_code == 200, f"got {r.status_code}")

    # GET /api/analytics/summary
    r = requests.get(f"{BASE}/analytics/summary", headers=headers, timeout=30)
    check("T5.analytics/summary status=200", r.status_code == 200, f"got {r.status_code}")

    # GET /api/leaderboard/savings
    r = requests.get(f"{BASE}/leaderboard/savings", headers=headers, timeout=30)
    check("T5.leaderboard/savings status=200", r.status_code == 200, f"got {r.status_code}")

    # GET /api/split/groups
    r = requests.get(f"{BASE}/split/groups", headers=headers, timeout=30)
    check("T5.split/groups status=200", r.status_code == 200, f"got {r.status_code}")


def main():
    headers = auth()
    snap = t1_home_snapshot(headers)
    t2_sparkline(snap)
    pred = t3_ai_predict(headers)
    t4_consistency(snap, pred)
    t5_regression(headers)

    print("\n==== SUMMARY ====")
    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"PASSED: {passed}   FAILED: {failed}   TOTAL: {len(results)}")
    if failed:
        print("\nFAILURES:")
        for s, n, d in results:
            if s == "FAIL":
                print(f"  - {n}: {d}")
        sys.exit(1)


if __name__ == "__main__":
    main()
