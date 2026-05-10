"""
R118 SLICE B + D — Behavioral + Cashflow Intelligence
Test script for /api/intelligence/behavior and /api/intelligence/cashflow

Target: https://mintu-finance.preview.emergentagent.com/api
Auth:   phone 9876543210 / OTP 123456
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Tuple

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

PASS = 0
FAIL = 0
FAILS: List[str] = []


def ok(msg: str):
    global PASS
    PASS += 1
    print(f"  ✅ {msg}")


def bad(msg: str):
    global FAIL
    FAIL += 1
    FAILS.append(msg)
    print(f"  ❌ {msg}")


def check(cond: bool, msg: str):
    if cond:
        ok(msg)
    else:
        bad(msg)


def login() -> str:
    r = requests.post(
        f"{BASE}/auth/send-otp",
        json={"phone": PHONE},
        timeout=20,
    )
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": PHONE,
            "otp": OTP,
            "device_id": "sdet-r118-bd",
            "device_name": "SDET",
            "os": "web",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    print(f"AUTH OK · token len={len(tok)}")
    return tok


def t0_auth_guard():
    print("\nT0 — AUTH guard (both 401 without Authorization)")
    r = requests.get(f"{BASE}/intelligence/behavior", timeout=20)
    check(r.status_code == 401, f"GET /intelligence/behavior no-auth → 401 (got {r.status_code})")
    r = requests.get(f"{BASE}/intelligence/cashflow", timeout=20)
    check(r.status_code == 401, f"GET /intelligence/cashflow no-auth → 401 (got {r.status_code})")


def t1_behavior(token: str) -> Tuple[Dict[str, Any], float]:
    print("\nT1 — GET /intelligence/behavior")
    h = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = requests.get(f"{BASE}/intelligence/behavior", headers=h, timeout=30)
    dt = time.time() - t0
    check(r.status_code == 200, f"status 200 (got {r.status_code}); body={r.text[:300] if r.status_code != 200 else ''}")
    if r.status_code != 200:
        return {}, dt
    body = r.json()

    expected_top = {"insights", "active_count", "headline", "headline_kind", "window_days", "tx_count", "tone"}
    actual_top = set(body.keys())
    check(
        actual_top == expected_top,
        f"top-level keys exactly {sorted(expected_top)} (got {sorted(actual_top)})"
    )

    insights = body.get("insights", [])
    check(isinstance(insights, list), "insights is list")
    check(len(insights) == 4, f"insights length == 4 (got {len(insights)})")

    expected_kinds = {"late_night_impulse", "weekend_overspend", "payday_inflation", "stress_pattern"}
    seen_kinds: List[str] = []
    insight_keys = {"kind", "title", "emoji", "is_active", "confidence", "signal_text", "copy", "evidence"}
    for idx, ins in enumerate(insights):
        ks = set(ins.keys())
        check(insight_keys.issubset(ks), f"insight[{idx}] has all required keys (kind/title/emoji/is_active/confidence/signal_text/copy/evidence)")
        seen_kinds.append(ins.get("kind"))
        c = ins.get("confidence")
        check(isinstance(c, (int, float)) and 0.0 <= c <= 1.0, f"insight[{idx}] confidence ∈ [0,1] (got {c})")
        check(isinstance(ins.get("is_active"), bool), f"insight[{idx}] is_active is bool")
        check(isinstance(ins.get("signal_text"), str) and len(ins["signal_text"]) > 0, f"insight[{idx}] signal_text non-empty str")
        check(isinstance(ins.get("copy"), str) and len(ins["copy"]) > 0, f"insight[{idx}] copy non-empty str")
        check(isinstance(ins.get("evidence"), dict), f"insight[{idx}] evidence is dict")

    check(set(seen_kinds) == expected_kinds and len(seen_kinds) == 4,
          f"4 distinct kinds == {sorted(expected_kinds)} (got {sorted(seen_kinds)})")

    check(body.get("tone") == "encouraging", f'tone == "encouraging" (got {body.get("tone")!r})')
    check(body.get("window_days") == 60, f"window_days == 60 (got {body.get('window_days')})")
    check(isinstance(body.get("tx_count"), int) and body["tx_count"] >= 0, f"tx_count is int ≥ 0 (got {body.get('tx_count')})")

    headline = body.get("headline")
    headline_kind = body.get("headline_kind")
    check(headline is None or isinstance(headline, str), "headline is null or str")
    check(headline_kind is None or headline_kind in expected_kinds,
          f"headline_kind null or one of 4 kinds (got {headline_kind!r})")

    # Insights sorted active first
    seen_inactive = False
    sort_ok = True
    for ins in insights:
        if not ins["is_active"]:
            seen_inactive = True
        elif seen_inactive:
            sort_ok = False
            break
    check(sort_ok, "insights sorted with active patterns FIRST")

    print(f"   active_count={body.get('active_count')} tx_count={body.get('tx_count')} headline_kind={headline_kind}")
    return body, dt


def t2_cashflow(token: str) -> Tuple[Dict[str, Any], float]:
    print("\nT2 — GET /intelligence/cashflow")
    h = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = requests.get(f"{BASE}/intelligence/cashflow", headers=h, timeout=30)
    dt = time.time() - t0
    check(r.status_code == 200, f"status 200 (got {r.status_code}); body={r.text[:300] if r.status_code != 200 else ''}")
    if r.status_code != 200:
        return {}, dt
    body = r.json()

    expected_top = {
        "days_to_eom", "avg_daily_burn", "avg_daily_in", "projected_spend",
        "projected_in", "projected_net", "upcoming_bills_total", "bill_alerts",
        "low_balance", "copy", "vibe", "window_days", "tx_count"
    }
    actual_top = set(body.keys())
    check(actual_top == expected_top,
          f"top-level keys exactly {sorted(expected_top)} (got {sorted(actual_top)})")

    d = body.get("days_to_eom")
    check(isinstance(d, int) and 1 <= d <= 31, f"days_to_eom ∈ [1,31] (got {d})")

    for k in ("avg_daily_burn", "avg_daily_in", "projected_spend", "projected_in", "projected_net", "upcoming_bills_total"):
        v = body.get(k)
        check(isinstance(v, (int, float)), f"{k} is number (got {type(v).__name__}={v})")

    # Math sanity
    adb = body.get("avg_daily_burn", 0)
    adi = body.get("avg_daily_in", 0)
    ps = body.get("projected_spend", 0)
    pi = body.get("projected_in", 0)
    pn = body.get("projected_net", 0)

    expected_ps = adb * d
    expected_pi = adi * d
    expected_pn = pi - ps
    check(abs(ps - expected_ps) <= 1.0, f"projected_spend ≈ avg_daily_burn × days_to_eom (got {ps}, expected ~{expected_ps:.2f})")
    check(abs(pi - expected_pi) <= 1.0, f"projected_in ≈ avg_daily_in × days_to_eom (got {pi}, expected ~{expected_pi:.2f})")
    check(abs(pn - expected_pn) <= 1.0, f"projected_net == projected_in - projected_spend (got {pn}, expected ~{expected_pn:.2f})")

    bill_alerts = body.get("bill_alerts")
    check(isinstance(bill_alerts, list), f"bill_alerts is list (got {type(bill_alerts).__name__})")
    if bill_alerts:
        bill_keys = {"merchant", "emoji", "amount", "due_iso", "days_until", "category"}
        for idx, b in enumerate(bill_alerts):
            check(bill_keys.issubset(set(b.keys())), f"bill_alerts[{idx}] has required keys")
            check(isinstance(b.get("days_until"), int) and b["days_until"] <= 7, f"bill_alerts[{idx}] days_until ≤ 7 (got {b.get('days_until')})")

    lb = body.get("low_balance")
    check(isinstance(lb, bool), "low_balance is bool")
    check(lb == (pn < 0), f"low_balance == (projected_net < 0) (got low_balance={lb}, projected_net={pn})")

    vibe = body.get("vibe")
    check(vibe in ("warm", "cool"), f"vibe in ('warm','cool') (got {vibe!r})")
    expected_vibe = "warm" if pn >= 0 else "cool"
    check(vibe == expected_vibe, f"vibe == 'warm' iff projected_net >= 0 (got vibe={vibe!r}, projected_net={pn})")

    copy = body.get("copy")
    check(isinstance(copy, str) and len(copy) > 0, "copy is non-empty str")

    check(body.get("window_days") == 30, f"window_days == 30 (got {body.get('window_days')})")
    check(isinstance(body.get("tx_count"), int) and body["tx_count"] >= 0, f"tx_count is int ≥ 0 (got {body.get('tx_count')})")

    print(f"   days_to_eom={d} avg_burn=₹{adb} avg_in=₹{adi} net=₹{pn} vibe={vibe} bills={len(bill_alerts) if isinstance(bill_alerts, list) else 0}")
    return body, dt


def t3_cache(token: str, first_behavior_dt: float, first_cashflow_dt: float):
    print("\nT3 — Cache idempotency smoke")
    h = {"Authorization": f"Bearer {token}"}

    t0 = time.time()
    r1 = requests.get(f"{BASE}/intelligence/behavior", headers=h, timeout=30)
    dt1 = time.time() - t0
    t0 = time.time()
    r2 = requests.get(f"{BASE}/intelligence/behavior", headers=h, timeout=30)
    dt2 = time.time() - t0
    check(r1.status_code == 200 and r2.status_code == 200, f"behavior x2 both 200 (got {r1.status_code},{r2.status_code})")
    print(f"   /behavior call#1={dt1*1000:.0f}ms  call#2={dt2*1000:.0f}ms (cached)")
    # network round-trip dominates; cache should make 2nd call shorter than 1st
    check(dt2 < dt1 or dt2 < 0.5, f"behavior 2nd call faster (or <500ms) (got {dt2*1000:.0f}ms vs {dt1*1000:.0f}ms)")

    t0 = time.time()
    r1 = requests.get(f"{BASE}/intelligence/cashflow", headers=h, timeout=30)
    dt1 = time.time() - t0
    t0 = time.time()
    r2 = requests.get(f"{BASE}/intelligence/cashflow", headers=h, timeout=30)
    dt2 = time.time() - t0
    check(r1.status_code == 200 and r2.status_code == 200, f"cashflow x2 both 200 (got {r1.status_code},{r2.status_code})")
    print(f"   /cashflow call#1={dt1*1000:.0f}ms  call#2={dt2*1000:.0f}ms (cached)")
    check(dt2 < dt1 or dt2 < 0.5, f"cashflow 2nd call faster (or <500ms) (got {dt2*1000:.0f}ms vs {dt1*1000:.0f}ms)")


def main():
    print("=" * 80)
    print(" R118 SLICE B + D BACKEND VERIFICATION")
    print(f" Target: {BASE}")
    print("=" * 80)

    t0_auth_guard()
    token = login()
    behavior_body, beh_dt = t1_behavior(token)
    cashflow_body, cf_dt = t2_cashflow(token)
    t3_cache(token, beh_dt, cf_dt)

    print("\n" + "=" * 80)
    print(f" RESULTS: PASS={PASS}  FAIL={FAIL}")
    print("=" * 80)
    if FAIL:
        print("\nFAILURES:")
        for f in FAILS:
            print(f"  - {f}")

    # Pretty-dump small samples for the report
    print("\n--- SAMPLE BEHAVIOR (truncated) ---")
    if behavior_body:
        bb = dict(behavior_body)
        if "insights" in bb:
            bb["insights"] = [
                {k: v for k, v in ins.items() if k in ("kind", "is_active", "confidence", "signal_text")}
                for ins in bb["insights"]
            ]
        print(json.dumps(bb, indent=2, default=str)[:2000])

    print("\n--- SAMPLE CASHFLOW (truncated) ---")
    if cashflow_body:
        print(json.dumps(cashflow_body, indent=2, default=str)[:2000])


if __name__ == "__main__":
    main()
