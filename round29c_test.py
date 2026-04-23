"""Round 29c adversarial final verification tests (Apr 23 2026).

Validates three non-critical Round-29 fixes:
  V1 — Phone type validation (NoSQL injection via phone field)
  V2 — Phone-level OTP rate limit (brute force protection)
  V3 — Coin farm dedupe via dedupe_key

Fresh 9XXXXXXXXX phones only; canonical 9876543210 NOT mutated
(only used for a send-otp 200 regression per literal spec).
"""
import random
import string
import time
import asyncio
from typing import Any, Dict, List, Tuple

import httpx

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"

results: List[Tuple[str, bool, str]] = []


def rec(name: str, ok: bool, detail: str = "") -> None:
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {name} :: {detail}")
    results.append((name, ok, detail))


def rand_phone(prefix: str = "9022") -> str:
    """Generate a fresh 10-digit phone starting with the given prefix."""
    suffix_len = 10 - len(prefix)
    return prefix + "".join(random.choices(string.digits, k=suffix_len))


def post(client: httpx.Client, path: str, **kw) -> httpx.Response:
    return client.post(f"{BASE_URL}{path}", timeout=30, **kw)


def get(client: httpx.Client, path: str, **kw) -> httpx.Response:
    return client.get(f"{BASE_URL}{path}", timeout=30, **kw)


# ──────────────────────────────────────────────────────────────────────
# V1 — Phone type validation
# ──────────────────────────────────────────────────────────────────────
def test_v1(client: httpx.Client) -> None:
    print("\n======  V1 — Phone type validation  ======")

    # 1. NoSQL operator injection via dict
    r = post(client, "/auth/send-otp", json={"phone": {"$ne": None}})
    rec("V1.1 send-otp phone={$ne:null} → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 2. phone null
    r = post(client, "/auth/send-otp", json={"phone": None})
    rec("V1.2 send-otp phone=null → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 3. phone as number
    r = post(client, "/auth/send-otp", json={"phone": 9876543210})
    rec("V1.3 send-otp phone=number → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 4. phone as list
    r = post(client, "/auth/send-otp", json={"phone": ["9876543210"]})
    rec("V1.4 send-otp phone=list → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 5. phone with non-digit chars
    r = post(client, "/auth/send-otp", json={"phone": "98765abcdef"})
    rec("V1.5 send-otp phone='98765abcdef' → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 6. Happy path regression — literal spec says "9876543210".
    #    The canonical phone may hit the 30s rate limit; retry with a
    #    fresh phone if rate-limited (note that 9876 is the canonical
    #    account; the review instructs we should never MUTATE it, but
    #    send-otp is idempotent — it re-creates a mock OTP record only).
    r = post(client, "/auth/send-otp", json={"phone": "9876543210"})
    if r.status_code == 429:
        # 30s cool-down — wait & retry once
        time.sleep(32)
        r = post(client, "/auth/send-otp", json={"phone": "9876543210"})
    rec("V1.6 send-otp phone='9876543210' → 200 (regression)",
        r.status_code == 200, f"got {r.status_code} body={r.text[:120]}")

    # 7. verify-otp with dict phone
    r = post(client, "/auth/verify-otp",
             json={"phone": {"$ne": None}, "otp": "123456"})
    rec("V1.7 verify-otp phone={$ne:null} → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")

    # 8. verify-otp with dict otp
    r = post(client, "/auth/verify-otp",
             json={"phone": "9876543210", "otp": {"$ne": None}})
    rec("V1.8 verify-otp otp={$ne:null} → 422/400",
        r.status_code in (422, 400), f"got {r.status_code}")


# ──────────────────────────────────────────────────────────────────────
# V2 — Phone-level OTP rate limit
# ──────────────────────────────────────────────────────────────────────
def test_v2(client: httpx.Client) -> None:
    print("\n======  V2 — Phone-level OTP rate limit  ======")

    phone = rand_phone("90222")  # fresh unused phone
    print(f"   using fresh phone {phone}")

    # Step 1 — seed OTP
    r = post(client, "/auth/send-otp", json={"phone": phone})
    rec("V2.1 send-otp fresh phone → 200",
        r.status_code == 200, f"got {r.status_code}")

    # Step 2 — burn through OTPs with wrong codes until 15+ audit fails
    total_fails = 0
    cycles = 0
    max_cycles = 20  # safety bound
    got_429 = False
    last_status = None
    last_body = None

    while cycles < max_cycles:
        cycles += 1
        # Try up to MAX_OTP_ATTEMPTS (3) wrong OTPs on this cycle
        for _ in range(3):
            wrong = "".join(random.choices(string.digits, k=6))
            if wrong == "123456":
                wrong = "000000"
            r = post(client, "/auth/verify-otp",
                     json={"phone": phone, "otp": wrong})
            last_status = r.status_code
            last_body = r.text
            if r.status_code == 429:
                got_429 = True
                break
            if r.status_code == 400 and "Too many attempts" in r.text:
                # OTP exhausted (need new one)
                break
            if r.status_code == 400 and "Invalid OTP" in r.text:
                total_fails += 1
                continue
            if r.status_code == 400 and ("expired" in r.text
                                         or "not found" in r.text):
                break
            # Unexpected
            break

        if got_429:
            break

        # Request a new OTP — the 30s cooldown only fires if the old
        # OTP doc is still present. After "Too many attempts" it's
        # deleted, so a new send-otp should succeed immediately.
        if total_fails >= 15:
            # next verify should trigger the phone-level rate limit
            break

        r2 = post(client, "/auth/send-otp", json={"phone": phone})
        if r2.status_code == 429:
            # 30s cooldown leaked; wait once
            time.sleep(31)
            r2 = post(client, "/auth/send-otp", json={"phone": phone})
        if r2.status_code != 200:
            rec(f"V2.2 send-otp cycle#{cycles} after burn → 200",
                False, f"got {r2.status_code} body={r2.text[:120]}")
            return

    rec("V2.2 accumulated ≥15 failed verify attempts",
        total_fails >= 15,
        f"got total_fails={total_fails} after {cycles} cycles")

    # Step 3 — one more verify-otp; either phone-level 429 kicks in
    # or if an OTP is still present, issue one more send + verify.
    # Send a fresh OTP so the phone-level guard (which checks audit
    # count, not OTP attempts) is the one that fires.
    r = post(client, "/auth/send-otp", json={"phone": phone})
    if r.status_code not in (200, 429):
        rec("V2.3 send-otp before final verify", False,
            f"got {r.status_code}")
        return

    if r.status_code == 429 and "Please wait" in r.text:
        # Canonical send-otp cool-down, wait briefly
        time.sleep(31)
        r = post(client, "/auth/send-otp", json={"phone": phone})

    wrong = "000000"
    r = post(client, "/auth/verify-otp",
             json={"phone": phone, "otp": wrong})
    is_locked = (r.status_code == 429
                 and "Too many failed attempts" in r.text
                 and "1 hour" in r.text)
    rec("V2.3 one more verify → 429 'Too many failed attempts...1 hour'",
        is_locked, f"got {r.status_code} body={r.text[:160]}")

    # Step 4 — regression: DIFFERENT fresh phone should NOT inherit lock
    phone2 = rand_phone("90222")
    # Ensure different from phone1
    while phone2 == phone:
        phone2 = rand_phone("90222")
    print(f"   regression fresh phone {phone2}")

    r = post(client, "/auth/send-otp", json={"phone": phone2})
    ok_send = r.status_code == 200
    rec("V2.4a regression send-otp fresh phone2 → 200",
        ok_send, f"got {r.status_code}")

    if ok_send:
        r = post(client, "/auth/verify-otp",
                 json={"phone": phone2, "otp": "123456",
                       "name": "Round29c Tester"})
        rec("V2.4b regression verify-otp fresh phone2 + correct → 200",
            r.status_code == 200, f"got {r.status_code} body={r.text[:160]}")


# ──────────────────────────────────────────────────────────────────────
# V3 — Coin farm dedupe via dedupe_key
# ──────────────────────────────────────────────────────────────────────
def _seed_user_and_token(client: httpx.Client, phone: str,
                         name: str) -> str:
    r = post(client, "/auth/send-otp", json={"phone": phone})
    if r.status_code == 429:
        time.sleep(32)
        r = post(client, "/auth/send-otp", json={"phone": phone})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    r = post(client, "/auth/verify-otp",
             json={"phone": phone, "otp": "123456", "name": name})
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return tok


def test_v3(client: httpx.Client) -> None:
    print("\n======  V3 — Coin farm dedupe via dedupe_key  ======")

    phone = rand_phone("90333")
    print(f"   using fresh phone {phone}")
    try:
        token = _seed_user_and_token(client, phone, "Round29c Coin Tester")
    except AssertionError as e:
        rec("V3.setup seed fresh user", False, str(e))
        return
    rec("V3.setup seed fresh user + token", True, f"phone={phone}")

    hdr = {"Authorization": f"Bearer {token}"}

    # 1. First award with dedupe_key → awarded>0, reason=ok
    body1 = {"action": "add_transaction", "dedupe_key": "txn_abc_123"}
    r = post(client, "/coins/award", json=body1, headers=hdr)
    ok1 = (r.status_code == 200
           and r.json().get("awarded", 0) > 0
           and r.json().get("reason") == "ok")
    first_balance = r.json().get("balance", 0) if r.status_code == 200 else 0
    rec("V3.1 first /coins/award dedupe=txn_abc_123 → awarded>0 reason=ok",
        ok1, f"got {r.status_code} body={r.text[:200]}")

    # 2. Same body again → awarded=0, reason=already_awarded
    r = post(client, "/coins/award", json=body1, headers=hdr)
    jb = r.json() if r.status_code == 200 else {}
    ok2 = (r.status_code == 200
           and jb.get("awarded") == 0
           and jb.get("reason") == "already_awarded")
    rec("V3.2 repeat same dedupe → awarded=0 reason=already_awarded",
        ok2, f"got {r.status_code} body={r.text[:200]}")

    # Balance should NOT grow on repeat
    second_balance = jb.get("balance", 0)
    rec("V3.2b repeat dedupe did NOT grow balance",
        second_balance == first_balance,
        f"first={first_balance} second={second_balance}")

    # 3. Different dedupe_key → awarded>0 (until daily cap).
    # daily_cap=50, per-event=5 → up to 10 distinct keys give +coins.
    body2 = {"action": "add_transaction", "dedupe_key": "txn_def_456"}
    r = post(client, "/coins/award", json=body2, headers=hdr)
    jb = r.json() if r.status_code == 200 else {}
    ok3 = (r.status_code == 200
           and jb.get("awarded", 0) > 0
           and jb.get("reason") == "ok")
    rec("V3.3 DIFFERENT dedupe_key → awarded>0 (under cap)",
        ok3, f"got {r.status_code} body={r.text[:200]}")

    # 4. No dedupe_key → legacy behaviour; should award (under cap)
    body3 = {"action": "add_transaction"}  # no dedupe_key
    r = post(client, "/coins/award", json=body3, headers=hdr)
    jb = r.json() if r.status_code == 200 else {}
    # Either awarded>0 reason=ok, or awarded=0 reason=daily_cap_reached.
    # We want: backward-compat → not rejected / no crash. Preferred
    # outcome: awarded>0.
    ok4 = (r.status_code == 200
           and jb.get("reason") in ("ok", "daily_cap_reached"))
    preferred = (r.status_code == 200 and jb.get("awarded", 0) > 0
                 and jb.get("reason") == "ok")
    rec("V3.4 no dedupe_key → legacy behaviour (awards if under cap)",
        ok4, f"got {r.status_code} body={r.text[:200]} preferred_ok={preferred}")


# ──────────────────────────────────────────────────────────────────────
def main() -> None:
    with httpx.Client(follow_redirects=True) as client:
        test_v1(client)
        try:
            test_v2(client)
        except Exception as e:
            rec("V2.ERROR unhandled exception", False, repr(e))
        test_v3(client)

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed
    pct = 100.0 * passed / total if total else 0
    print(f"\n\n═══════════  ROUND 29c FINAL RESULTS  ═══════════")
    print(f"TOTAL: {total}   PASS: {passed}   FAIL: {failed}   → {pct:.1f}%")
    if failed:
        print("FAILS:")
        for name, ok, detail in results:
            if not ok:
                print(f"  ❌ {name} :: {detail}")
    print("═══════════════════════════════════════════════════")


if __name__ == "__main__":
    main()
