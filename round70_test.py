#!/usr/bin/env python3
"""Round 70 — LLM cache migration backend test."""
import json
import time
import sys
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

def log(msg): print(msg, flush=True)

def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=10)
    r.raise_for_status()
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=10)
    r.raise_for_status()
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token: {r.json()}"
    return tok

def timed_get(url, headers):
    t0 = time.time()
    r = requests.get(url, headers=headers, timeout=30)
    dt = (time.time() - t0) * 1000
    return r, dt

def check(endpoint, validator, headers):
    log(f"\n=== {endpoint} ===")
    r1, dt1 = timed_get(f"{BASE}{endpoint}", headers)
    log(f"Call 1: HTTP {r1.status_code} in {dt1:.0f} ms")
    if r1.status_code != 200:
        log(f"  Body: {r1.text[:500]}")
        return False, dt1, None
    try:
        body1 = r1.json()
    except Exception as e:
        log(f"  Non-JSON: {e}")
        return False, dt1, None
    ok1, msg1 = validator(body1)
    log(f"  Shape check call1: {'OK' if ok1 else 'FAIL'} — {msg1}")

    # short wait to let background regen complete
    time.sleep(35)

    r2, dt2 = timed_get(f"{BASE}{endpoint}", headers)
    log(f"Call 2 (after 35s): HTTP {r2.status_code} in {dt2:.0f} ms")
    if r2.status_code != 200:
        log(f"  Body: {r2.text[:500]}")
        return False, dt2, None
    body2 = r2.json()
    ok2, msg2 = validator(body2)
    log(f"  Shape check call2: {'OK' if ok2 else 'FAIL'} — {msg2}")

    latency_pass = dt1 < 2000 and dt2 < 2000
    if not latency_pass:
        log(f"  ⚠️ Latency FAIL: call1={dt1:.0f}ms, call2={dt2:.0f}ms (both must be <2000ms)")

    return (ok1 and ok2 and latency_pass), dt1, dt2

def v_split_insights(b):
    if "fun_fact" not in b: return False, "missing fun_fact"
    if not isinstance(b["fun_fact"], str): return False, f"fun_fact is {type(b['fun_fact']).__name__}, not str"
    return True, f"fun_fact='{b['fun_fact'][:60]}...' len={len(b['fun_fact'])}"

def v_school_daily(b):
    if "lesson" not in b or not isinstance(b["lesson"], dict): return False, "missing lesson dict"
    if "personal_tip" not in b or not isinstance(b["personal_tip"], str): return False, "missing personal_tip str"
    if "lesson_number" not in b or not isinstance(b["lesson_number"], int): return False, "missing lesson_number int"
    return True, f"lesson_number={b['lesson_number']}, personal_tip len={len(b['personal_tip'])}"

def v_school_dynamic(b):
    cards = b.get("cards")
    if not isinstance(cards, list): return False, "cards not list"
    if len(cards) < 6: return False, f"only {len(cards)} cards (<6)"
    return True, f"{len(cards)} cards"

def v_school_personalized(b):
    cards = b.get("cards")
    if not isinstance(cards, list): return False, "cards not list"
    if len(cards) < 1: return False, f"only {len(cards)} cards (<1)"
    return True, f"{len(cards)} cards"

def v_vouchers(b):
    vs = b.get("vouchers")
    if not isinstance(vs, list): return False, "vouchers not list"
    if len(vs) != 8: return False, f"got {len(vs)} vouchers, expected 8"
    return True, f"{len(vs)} vouchers"

def v_insights_daily(b):
    if "insight_text" not in b: return False, "missing insight_text"
    if "recommendations" not in b: return False, "missing recommendations"
    return True, f"insight_text len={len(str(b['insight_text']))}, recs={len(b.get('recommendations') or [])}"

def v_expense_card(b):
    rep = b.get("report")
    if not isinstance(rep, dict): return False, "report not dict"
    if "headline" not in rep: return False, "report missing headline"
    return True, f"headline='{rep['headline'][:50]}...'"

def main():
    tok = auth()
    h = {"Authorization": f"Bearer {tok}"}
    log(f"✅ Auth OK, token prefix: {tok[:20]}...")

    results = {}

    tests = [
        ("/split/insights", v_split_insights),
        ("/money-school/daily", v_school_daily),
        ("/money-school/dynamic", v_school_dynamic),
        ("/money-school/personalized", v_school_personalized),
        ("/rewards/vouchers?category=food", v_vouchers),
        ("/insights/daily", v_insights_daily),
        ("/reports/ai-expense-card", v_expense_card),
    ]

    for ep, validator in tests:
        try:
            ok, dt1, dt2 = check(ep, validator, h)
            results[ep] = (ok, dt1, dt2)
        except Exception as e:
            log(f"  EXCEPTION: {e}")
            results[ep] = (False, None, None)

    log("\n\n======== SUMMARY ========")
    for ep, (ok, dt1, dt2) in results.items():
        dt1s = f"{dt1:.0f}ms" if dt1 is not None else "ERR"
        dt2s = f"{dt2:.0f}ms" if dt2 is not None else "ERR"
        log(f"{'✅' if ok else '❌'} {ep}: call1={dt1s}, call2={dt2s}")
    fails = [ep for ep, (ok, *_) in results.items() if not ok]
    log(f"\nFAILED: {len(fails)}/{len(results)}")
    return 0 if not fails else 1

if __name__ == "__main__":
    sys.exit(main())
