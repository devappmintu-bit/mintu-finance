"""V10 AI Context Engine focused smoke test.

Endpoint under test: POST /api/ai-coach/context-response
Auth: phone 9876543210 / OTP 123456 (mock OTP).
"""
from __future__ import annotations
import json
import os
import statistics
import sys
import time
import requests
import concurrent.futures as cf

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

results = []  # list of (label, ok, info)


def record(label: str, ok: bool, info: str = ""):
    sym = "PASS" if ok else "FAIL"
    print(f"[{sym}] {label}: {info}")
    results.append((label, ok, info))


def get_token() -> str:
    requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    r = requests.post(
        f"{BASE_URL}/auth/verify-otp",
        json={"phone": PHONE, "otp": OTP},
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    if not tok:
        raise RuntimeError(f"No token in body: {body}")
    return tok


CTX_FULL = {
    "profile": {"name": "Demo", "isPro": False},
    "score": {"value": 62, "delta": 3},
    "transactions": {
        "count": 24,
        "monthlySpend": 34500,
        "categories": {"Food": 12500, "Rent": 15000},
        "lastTxnDate": None,
    },
    "budgets": {
        "total": 40000,
        "used": 34500,
        "categories": {"Food": {"limit": 8000, "spent": 12500}},
    },
    "goals": {
        "count": 2,
        "totalTarget": 120000,
        "totalSaved": 32000,
        "topGoal": {"name": "Goa", "saved": 18000, "target": 50000},
    },
    "splits": {"groups": 3, "owed": 2400, "owe": 600},
    "streak": {"days": 6},
    "insights": {
        "overspending": ["Food over budget by ₹4500"],
        "anomalies": [],
        "recommendations": [],
    },
}


def post_ctx(token: str | None, payload: dict, timeout: int = 30) -> requests.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(
        f"{BASE_URL}/ai-coach/context-response",
        json=payload,
        headers=headers,
        timeout=timeout,
    )


def assert_shape(label: str, body: dict, *, expect_mode: str | None = None) -> bool:
    ok = True
    if not isinstance(body, dict):
        record(f"{label}.body_dict", False, f"got {type(body)}")
        return False
    if not body.get("ok"):
        record(f"{label}.ok_true", False, f"ok={body.get('ok')}")
        ok = False
    if expect_mode is not None and body.get("mode") != expect_mode:
        record(
            f"{label}.mode_echoed",
            False,
            f"expected {expect_mode!r} got {body.get('mode')!r}",
        )
        ok = False
    data = body.get("data") or {}
    insight = data.get("insight")
    if not insight or not isinstance(insight, str):
        record(f"{label}.insight_nonempty", False, f"insight={insight!r}")
        ok = False
    else:
        if len(insight) > 400:
            record(
                f"{label}.insight_le_400",
                False,
                f"len={len(insight)}",
            )
            ok = False
    actions = data.get("actions")
    if not isinstance(actions, list):
        record(f"{label}.actions_list", False, f"actions={actions!r}")
        ok = False
    else:
        for i, a in enumerate(actions):
            if not isinstance(a, dict) or "label" not in a or "cta" not in a:
                record(
                    f"{label}.action_shape_{i}",
                    False,
                    f"a={a!r}",
                )
                ok = False
                break
    deep = data.get("deep_analysis")
    if not isinstance(deep, list):
        record(f"{label}.deep_analysis_list", False, f"deep={type(deep)}")
        ok = False
    pri = data.get("priority")
    if pri not in ("low", "med", "high"):
        record(f"{label}.priority_enum", False, f"priority={pri!r}")
        ok = False
    if ok:
        record(
            f"{label}.shape",
            True,
            f"insight_len={len(insight or '')}, actions={len(actions or [])}, priority={pri}",
        )
    return ok


def main():
    print(f"BASE_URL={BASE_URL}")
    token = get_token()
    print(f"Got token: {token[:18]}...")

    # ---- SCENARIO 1: HAPPY PATH (3 calls, latency tracked)
    print("\n=== SCENARIO 1: HAPPY PATH (mode=budget_optimize) ===")
    latencies_s1 = []
    for i in range(3):
        t0 = time.time()
        r = post_ctx(
            token,
            {
                "mode": "budget_optimize",
                "source": "brain_dashboard",
                "lang": "en",
                "context": CTX_FULL,
            },
        )
        dt = (time.time() - t0) * 1000
        latencies_s1.append(dt)
        record(
            f"S1.call{i+1}.status",
            r.status_code == 200,
            f"http={r.status_code} in {dt:.0f}ms",
        )
        if r.status_code == 200:
            assert_shape(f"S1.call{i+1}", r.json(), expect_mode="budget_optimize")
    if latencies_s1:
        record(
            "S1.latency_under_500ms",
            latencies_s1[0] < 500,
            f"first={latencies_s1[0]:.0f}ms, all={[f'{x:.0f}ms' for x in latencies_s1]}",
        )

    # ---- SCENARIO 2: EMPTY STATE
    print("\n=== SCENARIO 2: EMPTY STATE (mode=free, count=0) ===")
    r = post_ctx(
        token,
        {
            "mode": "free",
            "lang": "en",
            "context": {"transactions": {"count": 0}},
        },
    )
    record("S2.status", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        b = r.json()
        assert_shape("S2", b, expect_mode="free")
        d = b.get("data") or {}
        record(
            "S2.priority_high",
            d.get("priority") == "high",
            f"priority={d.get('priority')}",
        )
        actions = d.get("actions") or []
        has_onboarding = any(
            (a.get("cta") == "open_expense")
            or ("first expense" in (a.get("label") or "").lower())
            or ("add first" in (a.get("label") or "").lower())
            for a in actions
        )
        record(
            "S2.has_onboarding_cta",
            has_onboarding,
            f"actions={[a.get('label') + '/' + a.get('cta') for a in actions]}",
        )

    # ---- SCENARIO 3: MODE MATRIX
    print("\n=== SCENARIO 3: MODE MATRIX ===")
    modes = [
        "score_boost",
        "plan_build",
        "expense_help",
        "budget_optimize",
        "goal_strategy",
        "split_advice",
        "daily_brief",
        "free",
    ]
    for m in modes:
        r = post_ctx(
            token,
            {"mode": m, "lang": "en", "context": CTX_FULL},
        )
        ok = r.status_code == 200
        record(f"S3.{m}.status", ok, f"http={r.status_code}")
        if ok:
            assert_shape(f"S3.{m}", r.json(), expect_mode=m)

    # ---- SCENARIO 4: INVALID MODE
    print("\n=== SCENARIO 4: INVALID MODE ===")
    r = post_ctx(
        token,
        {"mode": "garbage_mode_xyz", "lang": "en", "context": CTX_FULL},
    )
    record(
        "S4.no_500",
        r.status_code != 500,
        f"http={r.status_code}",
    )
    if r.status_code == 200:
        assert_shape("S4", r.json())

    # ---- SCENARIO 5: NO AUTH
    print("\n=== SCENARIO 5: NO AUTH ===")
    r = post_ctx(
        None,
        {"mode": "free", "lang": "en", "context": CTX_FULL},
    )
    record(
        "S5.401_or_422",
        r.status_code in (401, 422, 403),
        f"http={r.status_code}",
    )

    # ---- SCENARIO 6: BAD TOKEN
    print("\n=== SCENARIO 6: BAD TOKEN ===")
    r = post_ctx(
        "garbage",
        {"mode": "free", "lang": "en", "context": CTX_FULL},
    )
    record("S6.401", r.status_code == 401, f"http={r.status_code}")

    # ---- SCENARIO 7: LLM WARM (wait 20s for bg regen, retest)
    print("\n=== SCENARIO 7: LLM WARM (wait 22s) ===")
    payload = {
        "mode": "budget_optimize",
        "source": "brain_dashboard",
        "lang": "en",
        "context": CTX_FULL,
    }
    # Issue first call
    r1 = post_ctx(token, payload)
    record("S7.first_call", r1.status_code == 200, f"http={r1.status_code}")
    insight1 = (r1.json().get("data") or {}).get("insight") if r1.status_code == 200 else ""
    print(f"  insight1 (len={len(insight1)}): {insight1[:140]}")
    print("  Waiting 22s for background regen...")
    time.sleep(22)
    r2 = post_ctx(token, payload)
    record("S7.second_call", r2.status_code == 200, f"http={r2.status_code}")
    if r2.status_code == 200:
        b2 = r2.json()
        assert_shape("S7.second", b2, expect_mode="budget_optimize")
        insight2 = (b2.get("data") or {}).get("insight") or ""
        print(f"  insight2 (len={len(insight2)}): {insight2[:140]}")
        record(
            "S7.insight2_nonempty",
            bool(insight2),
            f"len={len(insight2)}",
        )
        # Note: richness is best-effort, just log whether different
        if insight1 != insight2:
            print(f"  [INFO] Insight changed after warm-up (likely LLM-generated).")
        else:
            print(f"  [INFO] Insight unchanged — fallback still in use (acceptable).")

    # ---- SCENARIO 8: OVERSPEND INSIGHT
    print("\n=== SCENARIO 8: OVERSPEND INSIGHT ===")
    r = post_ctx(
        token,
        {
            "mode": "budget_optimize",
            "lang": "en",
            "context": CTX_FULL,  # has overspending
        },
    )
    record("S8.status", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        b = r.json()
        assert_shape("S8", b, expect_mode="budget_optimize")
        d = b.get("data") or {}
        record(
            "S8.priority_high",
            d.get("priority") == "high",
            f"priority={d.get('priority')}",
        )
        ins = (d.get("insight") or "").lower()
        # references overspend OR ₹4500 OR food OR over budget
        has_ref = (
            "over" in ins
            or "4500" in ins or "4,500" in ins
            or "food" in ins
        )
        record(
            "S8.insight_references_overspend",
            has_ref,
            f"insight={d.get('insight')!r}",
        )

    # ---- SCENARIO 9: GOAL STRATEGY
    print("\n=== SCENARIO 9: GOAL STRATEGY ===")
    # Use a fresh ctx_shard so we get a fresh fallback (different from S1-S8 cache).
    ctx_goal = dict(CTX_FULL)
    ctx_goal["goals"] = {
        "count": 1,
        "totalTarget": 50000,
        "totalSaved": 18000,
        "topGoal": {"name": "Goa", "saved": 18000, "target": 50000},
    }
    r = post_ctx(
        token,
        {"mode": "goal_strategy", "lang": "en", "context": ctx_goal},
    )
    record("S9.status", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        b = r.json()
        assert_shape("S9", b, expect_mode="goal_strategy")
        d = b.get("data") or {}
        ins = d.get("insight") or ""
        ins_l = ins.lower()
        has_goal_ref = (
            "goa" in ins_l
            or "day" in ins_l
            or "month" in ins_l
            or "week" in ins_l
        )
        record(
            "S9.insight_mentions_goal_or_projection",
            has_goal_ref,
            f"insight={ins!r}",
        )

    # ---- LATENCY p50/p95 (extra samples, async)
    print("\n=== LATENCY SAMPLE (10 parallel calls) ===")
    def one_call():
        t0 = time.time()
        r = post_ctx(
            token,
            {"mode": "free", "lang": "en", "context": {"transactions": {"count": 5}}},
        )
        return (time.time() - t0) * 1000, r.status_code

    samples = []
    with cf.ThreadPoolExecutor(max_workers=5) as ex:
        for dt, sc in ex.map(lambda _: one_call(), range(10)):
            samples.append((dt, sc))
    okct = sum(1 for _, sc in samples if sc == 200)
    lats = sorted(dt for dt, _ in samples)
    p50 = lats[len(lats) // 2]
    p95 = lats[int(len(lats) * 0.95) - 1] if len(lats) >= 2 else lats[-1]
    record("LAT.all_200", okct == 10, f"{okct}/10 ok, lats={[f'{l:.0f}' for l in lats]}ms")
    print(f"  p50={p50:.0f}ms, p95={p95:.0f}ms")

    # ---- SUMMARY
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"SUMMARY: {passed}/{total} assertions passed")
    failed = [(l, i) for l, ok, i in results if not ok]
    if failed:
        print("FAILED:")
        for l, i in failed:
            print(f"  - {l}: {i}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
