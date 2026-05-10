"""R118 SLICE A — Intelligence endpoints test.

Tests:
  GET /api/intelligence/subscriptions
  GET /api/intelligence/mood-score
  GET /api/intelligence/money-story (default + ?month=YYYY-MM)
  Auth check (401 without bearer)
"""
import os, sys, json, time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

P = lambda *a: print(*a, flush=True)

passed = 0
failed = 0
notes = []

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        P(f"  ✅ {name}")
    else:
        failed += 1
        P(f"  ❌ {name} -- {detail}")

def get_token():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    P(f"send-otp: {r.status_code}")
    if r.status_code != 200:
        P(r.text[:300])
    r2 = requests.post(f"{BASE}/auth/verify-otp",
                       json={"phone": PHONE, "otp": OTP, "device_id": "cli", "device_name": "CLI", "os": "web"},
                       timeout=20)
    P(f"verify-otp: {r2.status_code}")
    j = r2.json()
    return j["access_token"]

def main():
    token = get_token()
    H = {"Authorization": f"Bearer {token}"}

    # ── Auth checks (no token → 401) ───────────────────────────────
    P("\n[T0] Auth guard (no Authorization header → 401)")
    for path in ["/intelligence/subscriptions", "/intelligence/mood-score", "/intelligence/money-story"]:
        r = requests.get(f"{BASE}{path}", timeout=20)
        check(f"GET {path} no-auth", r.status_code == 401, f"got {r.status_code} body={r.text[:200]}")

    # ── 1) Subscriptions ───────────────────────────────────────────
    P("\n[T1] GET /intelligence/subscriptions")
    r = requests.get(f"{BASE}/intelligence/subscriptions", headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"{r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        check("has subscriptions array", isinstance(body.get("subscriptions"), list))
        check("has summary object", isinstance(body.get("summary"), dict))
        summary = body.get("summary", {})
        for k in ["count", "monthly_total", "annual_projection", "horizon_days"]:
            check(f"summary.{k} present", k in summary)
        check("monthly_total is number", isinstance(summary.get("monthly_total"), (int, float)))
        check("tone == encouraging", body.get("tone") == "encouraging")

        subs = body.get("subscriptions", [])
        P(f"  → {len(subs)} subscription(s) detected; monthly_total=₹{summary.get('monthly_total')}")
        notes.append(f"subscriptions count={len(subs)}, monthly_total={summary.get('monthly_total')}")

        if subs:
            required = ["id", "merchant", "monthly_cost", "last_charge", "last_seen_iso",
                        "next_predicted_iso", "occurrences", "lifetime_spent",
                        "amount_stability", "cadence", "confidence", "is_known"]
            first = subs[0]
            for k in required:
                check(f"sub[0].{k} present", k in first, f"missing {k}; keys={list(first.keys())}")
            # confidence between 0..1
            all_conf = all(0.0 <= s.get("confidence", -1) <= 1.0 for s in subs)
            check("all confidence in [0,1]", all_conf)
            # sorted DESC by monthly_cost
            costs = [s["monthly_cost"] for s in subs]
            check("sorted by monthly_cost DESC", costs == sorted(costs, reverse=True),
                  f"got {costs}")
        else:
            check("count==0 with empty array tolerated", summary.get("count", -1) == 0)

    # ── 2) Mood score ──────────────────────────────────────────────
    P("\n[T2] GET /intelligence/mood-score")
    r = requests.get(f"{BASE}/intelligence/mood-score", headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"{r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        for k in ["score", "band", "label", "emoji", "tone", "headline",
                  "sub_scores", "weights", "drags", "computed_at",
                  "window_days", "tx_count"]:
            check(f"key '{k}' present", k in body)
        score = body.get("score")
        check("0 <= score <= 100", isinstance(score, int) and 0 <= score <= 100,
              f"score={score}")
        band = body.get("band")
        valid_bands = {"critical", "stressed", "stable", "healthy", "thriving"}
        check(f"band ∈ {valid_bands}", band in valid_bands, f"got {band!r}")

        subs_d = body.get("sub_scores", {})
        for k in ["savings_trend", "spending_stability", "recurring_burden",
                  "impulse_behavior", "cash_runway", "bill_safety"]:
            v = subs_d.get(k)
            check(f"sub_scores.{k} ∈ [0,1]",
                  isinstance(v, (int, float)) and 0 <= v <= 1,
                  f"got {v!r}")

        weights = body.get("weights", {})
        wsum = sum(weights.values()) if isinstance(weights, dict) else 0
        check("weights sum == 1.0", abs(wsum - 1.0) < 1e-6, f"sum={wsum}")

        # band ↔ score correctness
        if score is not None and band is not None:
            if score < 21:    expected = "critical"
            elif score < 41:  expected = "stressed"
            elif score < 61:  expected = "stable"
            elif score < 81:  expected = "healthy"
            else:             expected = "thriving"
            check("band matches score thresholds", band == expected,
                  f"score={score} → expected {expected}, got {band}")
        notes.append(f"mood score={score} band={band} tx_count={body.get('tx_count')}")

    # ── 3) Money story default ─────────────────────────────────────
    P("\n[T3] GET /intelligence/money-story (default = last full month)")
    r = requests.get(f"{BASE}/intelligence/money-story", headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"{r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        for k in ["month", "month_label", "panels", "totals", "tx_count"]:
            check(f"key '{k}' present", k in body)
        panels = body.get("panels", [])
        check("panels has ≥3 items", isinstance(panels, list) and len(panels) >= 3,
              f"got {len(panels) if isinstance(panels, list) else 'not list'}")
        if panels:
            for i, p in enumerate(panels):
                ok = all(k in p for k in ("kind", "title", "copy"))
                check(f"panel[{i}] has kind/title/copy", ok, f"keys={list(p.keys())}")
            check("first panel kind=='hero'", panels[0].get("kind") == "hero",
                  f"got {panels[0].get('kind')}")
            kinds = [p.get("kind") for p in panels]
            check("has savings_delta panel", "savings_delta" in kinds, f"kinds={kinds}")
        totals = body.get("totals", {})
        for k in ["in", "out", "net"]:
            check(f"totals.{k} present", k in totals)
        notes.append(f"money-story month={body.get('month')} panels={len(panels)} tx_count={body.get('tx_count')}")

    # ── 4) Money story specific month ──────────────────────────────
    P("\n[T4] GET /intelligence/money-story?month=2025-04")
    r = requests.get(f"{BASE}/intelligence/money-story", params={"month": "2025-04"}, headers=H, timeout=30)
    check("status 200", r.status_code == 200, f"{r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        body = r.json()
        check("month == '2025-04'", body.get("month") == "2025-04",
              f"got {body.get('month')!r}")
        notes.append(f"specific-month month={body.get('month')} panels={len(body.get('panels', []))}")

    P(f"\n══════════ RESULTS ══════════")
    P(f"PASS: {passed}   FAIL: {failed}")
    for n in notes:
        P(f"  · {n}")
    return failed

if __name__ == "__main__":
    sys.exit(main())
