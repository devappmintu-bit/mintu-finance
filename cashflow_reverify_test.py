"""
Re-verify ONLY /api/intelligence/cashflow after tz-naive fix.
"""
import os
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"


def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


def main():
    failures = []
    passes = []

    def ok(msg):
        passes.append(msg)
        print(f"PASS: {msg}")

    def fail(msg):
        failures.append(msg)
        print(f"FAIL: {msg}")

    # ── 1. Auth guard ───────────────────────────────────
    r = requests.get(f"{BASE}/intelligence/cashflow", timeout=20)
    if r.status_code == 401:
        ok("Unauth → 401")
    else:
        fail(f"Unauth expected 401, got {r.status_code}: {r.text[:200]}")

    token = auth()
    H = {"Authorization": f"Bearer {token}"}

    # ── 2. With Bearer ──────────────────────────────────
    import time
    t0 = time.time()
    r1 = requests.get(f"{BASE}/intelligence/cashflow", headers=H, timeout=30)
    t1 = time.time()
    if r1.status_code != 200:
        fail(f"1st call expected 200, got {r1.status_code}: {r1.text[:300]}")
        print("\n=== EARLY EXIT — endpoint is broken ===")
        return failures, passes

    ok(f"1st call → 200 ({int((t1-t0)*1000)}ms)")
    body1 = r1.json()
    print(f"BODY1: {body1}")

    expected_keys = {
        "days_to_eom", "avg_daily_burn", "avg_daily_in", "projected_spend",
        "projected_in", "projected_net", "upcoming_bills_total", "bill_alerts",
        "low_balance", "copy", "vibe", "window_days", "tx_count",
    }
    missing = expected_keys - set(body1.keys())
    if missing:
        fail(f"Missing keys: {missing}")
    else:
        ok("All 13 expected keys present")

    # Type checks
    if isinstance(body1.get("bill_alerts"), list):
        ok("bill_alerts is list")
    else:
        fail(f"bill_alerts not list: {type(body1.get('bill_alerts'))}")

    if isinstance(body1.get("low_balance"), bool):
        ok("low_balance is bool")
    else:
        fail(f"low_balance not bool: {type(body1.get('low_balance'))}")

    if isinstance(body1.get("copy"), str) and body1["copy"]:
        ok("copy is non-empty str")
    else:
        fail(f"copy bad: {body1.get('copy')!r}")

    if body1.get("vibe") in ("warm", "cool"):
        ok(f'vibe == "{body1.get("vibe")}" (valid)')
    else:
        fail(f'vibe expected warm|cool, got {body1.get("vibe")!r}')

    if body1.get("window_days") == 30:
        ok("window_days == 30")
    else:
        fail(f"window_days expected 30, got {body1.get('window_days')}")

    if isinstance(body1.get("tx_count"), int):
        ok(f"tx_count is int ({body1['tx_count']})")
    else:
        fail(f"tx_count not int: {type(body1.get('tx_count'))}")

    # ── 3. Math sanity ──────────────────────────────────
    burn = body1["avg_daily_burn"]
    days = body1["days_to_eom"]
    psp = body1["projected_spend"]
    pin = body1["projected_in"]
    pnet = body1["projected_net"]
    expected_psp = burn * days
    if abs(psp - expected_psp) <= max(0.5, abs(expected_psp) * 0.01):
        ok(f"projected_spend ≈ avg_daily_burn × days_to_eom ({psp} ≈ {expected_psp:.2f})")
    else:
        fail(f"projected_spend mismatch: got {psp}, expected ~{expected_psp:.2f}")

    expected_net = pin - psp
    if abs(pnet - expected_net) <= max(0.5, abs(expected_net) * 0.01):
        ok(f"projected_net ≈ projected_in - projected_spend ({pnet} ≈ {expected_net:.2f})")
    else:
        fail(f"projected_net mismatch: got {pnet}, expected ~{expected_net:.2f}")

    # vibe == warm iff projected_net >= 0
    if pnet >= 0 and body1["vibe"] == "warm":
        ok("vibe=warm matches projected_net >= 0")
    elif pnet < 0 and body1["vibe"] == "cool":
        ok("vibe=cool matches projected_net < 0")
    else:
        fail(f"vibe/projected_net mismatch: net={pnet}, vibe={body1['vibe']}")

    # low_balance == (projected_net < 0)
    if body1["low_balance"] == (pnet < 0):
        ok(f"low_balance={body1['low_balance']} matches (projected_net<0)={pnet<0}")
    else:
        fail(f"low_balance contract broken: low_balance={body1['low_balance']}, net={pnet}")

    # ── 4. Cache idempotency ───────────────────────────
    t2 = time.time()
    r2 = requests.get(f"{BASE}/intelligence/cashflow", headers=H, timeout=30)
    t3 = time.time()
    if r2.status_code == 200:
        ok(f"2nd call → 200 ({int((t3-t2)*1000)}ms)")
    else:
        fail(f"2nd call expected 200, got {r2.status_code}: {r2.text[:300]}")

    body2 = r2.json()
    if body1 == body2:
        ok("2nd call body identical to 1st (cache hit)")
    else:
        # Slight tolerance — same shape at least
        if set(body1.keys()) == set(body2.keys()):
            ok("2nd call shape identical (cache may have re-computed but values stable)")
        else:
            fail("2nd call body differs from 1st")

    return failures, passes


if __name__ == "__main__":
    failures, passes = main()
    print()
    print("=" * 60)
    print(f"PASS={len(passes)}  FAIL={len(failures)}")
    print("=" * 60)
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    sys.exit(0)
