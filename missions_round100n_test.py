"""Round 100N — Mission Backbone routes E2E test.

Auth: phone 9445564707 / OTP 123456 (Rajawat).
Base URL: https://mintu-finance.preview.emergentagent.com/api
"""
from __future__ import annotations

import json
import sys
import uuid
from typing import Any, Dict, Optional

import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9445564707"
OTP = "123456"

passed = 0
failed = 0
results: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        results.append(f"  ✅ {name}")
    else:
        failed += 1
        results.append(f"  ❌ {name} — {detail}")


def login() -> str:
    r = requests.post(
        f"{BASE}/auth/send-otp",
        json={"phone": PHONE},
        timeout=15,
    )
    print(f"send-otp → {r.status_code}")
    r = requests.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": PHONE,
            "otp": OTP,
            "device_id": "round100n-cli",
            "device_name": "CLI",
            "os": "web",
        },
        timeout=15,
    )
    print(f"verify-otp → {r.status_code}")
    if r.status_code != 200:
        print(f"verify-otp body: {r.text[:500]}")
        sys.exit(1)
    body = r.json()
    token = body.get("access_token") or body.get("token")
    if not token:
        print(f"no token in body: {body}")
        sys.exit(1)
    return token


def auth_headers(token: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def main() -> int:
    print("=" * 70)
    print("Round 100N — Mission Backbone E2E")
    print("=" * 70)

    token = login()
    print(f"token acquired ({len(token)} chars)\n")

    # --- 1. GET /missions/current — hydrated derived fields present ---
    print("[1] GET /missions/current")
    r = requests.get(f"{BASE}/missions/current", headers=auth_headers(token), timeout=15)
    check("1a status==200", r.status_code == 200, f"got {r.status_code} body={r.text[:200]}")
    body1 = r.json() if r.status_code == 200 else {}
    m1 = body1.get("mission")
    check("1b mission present (not null)", isinstance(m1, dict), f"mission={m1!r}")
    if isinstance(m1, dict):
        print(f"   mission keys: {sorted(m1.keys())}")
        print(f"   mission preview: id={m1.get('id') or m1.get('_id')}, "
              f"target={m1.get('target_amount')}, saved={m1.get('saved_amount')}")
        # derived fields
        ppct = m1.get("progress_pct")
        gap = m1.get("gap_amount")
        days_left = m1.get("days_left")
        check("1c progress_pct is int", isinstance(ppct, int), f"got {ppct!r} type={type(ppct).__name__}")
        check("1d progress_pct in [0,100]", isinstance(ppct, int) and 0 <= ppct <= 100, f"got {ppct!r}")
        check("1e gap_amount is int", isinstance(gap, int), f"got {gap!r} type={type(gap).__name__}")
        check("1f gap_amount >= 0", isinstance(gap, int) and gap >= 0, f"got {gap!r}")
        check("1g days_left is int", isinstance(days_left, int), f"got {days_left!r}")
        check("1h days_left >= 0", isinstance(days_left, int) and days_left >= 0, f"got {days_left!r}")
        # period_end timezone sanity check
        from datetime import datetime, timezone
        pe = m1.get("period_end")
        if pe:
            try:
                # Attempt to parse if it's a string
                if isinstance(pe, str):
                    pe_dt = datetime.fromisoformat(pe.replace("Z", "+00:00"))
                else:
                    pe_dt = pe
                # If naive, force UTC
                if pe_dt.tzinfo is None:
                    pe_dt = pe_dt.replace(tzinfo=timezone.utc)
                now_utc = datetime.now(timezone.utc)
                # period_end of current month should be in the future (end of month)
                # but not absurdly far. Bug check: if tz-mismatch, period_end could
                # appear to be "in the past" relative to now.
                delta_days = (pe_dt - now_utc).total_seconds() / 86400
                print(f"   period_end={pe} | now_utc={now_utc.isoformat()} | delta_days={delta_days:.2f}")
                check("1i period_end is future (not tz-mismatch past)", delta_days >= -1.0,
                      f"period_end is in the past by {-delta_days:.2f} days")
            except Exception as e:
                check("1i period_end parseable", False, f"parse error: {e}; pe={pe!r}")
        else:
            print(f"   (no period_end key — full mission dump: {json.dumps(m1, default=str)[:600]})")

        baseline_saved = m1.get("saved_amount", 0)
    else:
        baseline_saved = 0

    # --- 2. POST /missions/seed — idempotent, returns same mission ---
    print("\n[2] POST /missions/seed")
    r = requests.post(
        f"{BASE}/missions/seed",
        headers=auth_headers(token),
        json={"income_monthly": 60000, "peer_pct": 12},
        timeout=15,
    )
    check("2a status==200", r.status_code == 200, f"got {r.status_code} body={r.text[:300]}")
    body2 = r.json() if r.status_code == 200 else {}
    m2 = body2.get("mission")
    check("2b mission present", isinstance(m2, dict))
    if isinstance(m2, dict) and isinstance(m1, dict):
        # Confirm same mission as the active one (same id, same period)
        id1 = m1.get("id") or m1.get("_id") or m1.get("mission_id")
        id2 = m2.get("id") or m2.get("_id") or m2.get("mission_id")
        check("2c idempotent (same id as /current)", id1 == id2, f"id1={id1} id2={id2}")
        ps1 = m1.get("period_start")
        ps2 = m2.get("period_start")
        check("2d period_start unchanged", str(ps1) == str(ps2), f"ps1={ps1} ps2={ps2}")

    # --- 3. POST /missions/contribute with Idempotency-Key ---
    print("\n[3] POST /missions/contribute (amount=1000, with Idempotency-Key)")
    idem = str(uuid.uuid4())
    r = requests.post(
        f"{BASE}/missions/contribute",
        headers=auth_headers(token, {"Idempotency-Key": idem}),
        json={"amount": 1000, "kind": "manual", "label": "R100N agent test"},
        timeout=15,
    )
    check("3a status==200", r.status_code == 200, f"got {r.status_code} body={r.text[:300]}")
    body3 = r.json() if r.status_code == 200 else {}
    m3 = body3.get("mission")
    check("3b mission present", isinstance(m3, dict))
    if isinstance(m3, dict):
        new_saved = m3.get("saved_amount", 0)
        print(f"   baseline_saved={baseline_saved}, after_contribute={new_saved}")
        check("3c saved_amount incremented by 1000",
              abs(float(new_saved) - float(baseline_saved) - 1000.0) < 0.01,
              f"baseline={baseline_saved} new={new_saved}")
        saved_after_first = new_saved
    else:
        saved_after_first = baseline_saved

    # --- 4. Idempotency replay — same key, no double-count ---
    print("\n[4] POST /missions/contribute REPLAY (same Idempotency-Key)")
    r = requests.post(
        f"{BASE}/missions/contribute",
        headers=auth_headers(token, {"Idempotency-Key": idem}),
        json={"amount": 1000, "kind": "manual", "label": "R100N agent test"},
        timeout=15,
    )
    check("4a status==200 on replay", r.status_code == 200, f"got {r.status_code} body={r.text[:300]}")
    body4 = r.json() if r.status_code == 200 else {}
    m4 = body4.get("mission")
    check("4b mission present", isinstance(m4, dict))
    if isinstance(m4, dict):
        replay_saved = m4.get("saved_amount", 0)
        print(f"   after_first={saved_after_first}, after_replay={replay_saved}")
        check("4c saved_amount UNCHANGED on replay (no double-count)",
              abs(float(replay_saved) - float(saved_after_first)) < 0.01,
              f"first={saved_after_first} replay={replay_saved}")

    # --- 5. Negative — amount=0 → 422 ---
    print("\n[5] POST /missions/contribute amount=0 → 422")
    r = requests.post(
        f"{BASE}/missions/contribute",
        headers=auth_headers(token, {"Idempotency-Key": str(uuid.uuid4())}),
        json={"amount": 0, "kind": "manual", "label": "neg test"},
        timeout=15,
    )
    check("5a status==422", r.status_code == 422, f"got {r.status_code} body={r.text[:200]}")

    # --- 6. Negative — no Authorization header → 401 ---
    print("\n[6] POST /missions/contribute no auth → 401")
    r = requests.post(
        f"{BASE}/missions/contribute",
        headers={"Content-Type": "application/json"},
        json={"amount": 100, "kind": "manual", "label": "no-auth test"},
        timeout=15,
    )
    # 401 expected; 403 also accepted as auth-failure equivalent
    check("6a status in {401,403}", r.status_code in (401, 403),
          f"got {r.status_code} body={r.text[:200]}")

    # --- 7. Idempotency missing — two POSTs without key → both increment ---
    print("\n[7] POST /missions/contribute (NO Idempotency-Key) twice")
    # First call
    saved_before_no_idem = None
    rc = requests.get(f"{BASE}/missions/current", headers=auth_headers(token), timeout=15)
    if rc.status_code == 200:
        saved_before_no_idem = rc.json().get("mission", {}).get("saved_amount", 0)
    print(f"   saved_before_no_idem={saved_before_no_idem}")

    r = requests.post(
        f"{BASE}/missions/contribute",
        headers=auth_headers(token),
        json={"amount": 250, "kind": "manual", "label": "R100N no-idem 1"},
        timeout=15,
    )
    check("7a first POST without idem → 200", r.status_code == 200,
          f"got {r.status_code} body={r.text[:200]}")
    body7a = r.json() if r.status_code == 200 else {}
    saved_after_7a = body7a.get("mission", {}).get("saved_amount", saved_before_no_idem or 0)

    r = requests.post(
        f"{BASE}/missions/contribute",
        headers=auth_headers(token),
        json={"amount": 250, "kind": "manual", "label": "R100N no-idem 2"},
        timeout=15,
    )
    check("7b second POST without idem → 200", r.status_code == 200,
          f"got {r.status_code} body={r.text[:200]}")
    body7b = r.json() if r.status_code == 200 else {}
    saved_after_7b = body7b.get("mission", {}).get("saved_amount", 0)

    if saved_before_no_idem is not None:
        delta = float(saved_after_7b) - float(saved_before_no_idem)
        print(f"   saved_before={saved_before_no_idem}, after_7a={saved_after_7a}, "
              f"after_7b={saved_after_7b}, total delta={delta}")
        check("7c saved_amount incremented twice (delta == 500)",
              abs(delta - 500.0) < 0.01, f"delta={delta}")

    # --- 8. Sanity check — GET /missions/current reflects latest ---
    print("\n[8] GET /missions/current — sanity after contributions")
    r = requests.get(f"{BASE}/missions/current", headers=auth_headers(token), timeout=15)
    check("8a status==200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code == 200:
        m8 = r.json().get("mission") or {}
        latest_saved = m8.get("saved_amount", 0)
        print(f"   final saved_amount = {latest_saved}")
        check("8b latest matches step 7 result",
              abs(float(latest_saved) - float(saved_after_7b)) < 0.01,
              f"latest={latest_saved} expected≈{saved_after_7b}")

    # --- Summary ---
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for line in results:
        print(line)
    print("\n" + ("-" * 70))
    print(f"PASSED: {passed}  FAILED: {failed}  TOTAL: {passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
