"""MintU 2.0 Phase 2 — Coins/Rewards backend tests.

Tests:
  T1 POST /api/coins/award happy path
  T2 daily cap enforcement (open_app_daily cap=3)
  T3 invalid action
  T4 multiple action types
  T5 GET /api/coins/status
  T6 regression on prior MintU 2.0 endpoints
"""
import os, sys, json, time
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
PASSWORD = "test123"

results = []

def log(name, passed, info=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}  {name}  {info}")
    results.append((name, passed, info))

def login():
    r = requests.post(f"{BASE}/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        print("LOGIN FAILED:", r.status_code, r.text)
        sys.exit(1)
    tok = r.json().get("access_token") or r.json().get("token")
    print(f"JWT token len: {len(tok)}")
    return tok

def main():
    tok = login()
    H = {"Authorization": f"Bearer {tok}"}

    # Clear today's coin_ledger for this user to get deterministic results for T2 (daily cap)
    # We can't do DB ops here, so instead: run T2 first and handle already-capped scenario.

    # ===== T1: happy path =====
    r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": "add_transaction"}, timeout=30)
    ok = r.status_code == 200
    log("T1.status_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        required = {"awarded", "reason", "balance"}
        log("T1.required_keys", required.issubset(j.keys()), f"keys={list(j.keys())}")
        log("T1.awarded_gte_0", isinstance(j.get("awarded"), (int, float)) and j["awarded"] >= 0, f"awarded={j.get('awarded')}")
        log("T1.balance_gte_0", isinstance(j.get("balance"), (int, float)) and j["balance"] >= 0, f"balance={j.get('balance')}")
        log("T1.reason_in_enum", j.get("reason") in {"ok", "daily_cap_reached"}, f"reason={j.get('reason')}")

    # ===== T2: daily cap enforcement for open_app_daily (cap=3, amount=3) =====
    # Call 3 times. We can't reset, so gather all responses.
    open_responses = []
    for i in range(3):
        r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": "open_app_daily"}, timeout=30)
        open_responses.append((r.status_code, r.json() if r.status_code == 200 else r.text))
        time.sleep(0.15)

    # All three calls must return 200
    log("T2.all_200", all(s == 200 for s, _ in open_responses), f"statuses={[s for s,_ in open_responses]}")

    # open_app_daily rule: amount=3, daily_cap=3 — so only the FIRST grant ever yields awarded=3; subsequent → 0/daily_cap_reached
    # However, since cap is PER DAY and we cannot reset, we can still reason:
    # Either first call of the day was awarded=3 with reason=ok, OR already capped (reason=daily_cap_reached, awarded=0).
    first_awarded = open_responses[0][1].get("awarded") if isinstance(open_responses[0][1], dict) else None
    first_reason = open_responses[0][1].get("reason") if isinstance(open_responses[0][1], dict) else None
    # Valid first-call outcomes:
    #  (a) awarded=3, reason=ok (if this is first open_app_daily call today)
    #  (b) awarded=0, reason=daily_cap_reached (if cap already hit previously today in another test run)
    first_valid = (first_awarded == 3 and first_reason == "ok") or (first_awarded == 0 and first_reason == "daily_cap_reached")
    log("T2.first_call_valid", first_valid, f"awarded={first_awarded} reason={first_reason}")

    # 2nd and 3rd calls must both be awarded=0, reason=daily_cap_reached
    for i in (1, 2):
        j = open_responses[i][1] if isinstance(open_responses[i][1], dict) else {}
        cap_reached = j.get("awarded") == 0 and j.get("reason") == "daily_cap_reached"
        log(f"T2.call{i+1}_cap_reached", cap_reached, f"awarded={j.get('awarded')} reason={j.get('reason')}")

    # When cap_reached, response should include daily_cap and daily_awarded
    last_json = open_responses[-1][1] if isinstance(open_responses[-1][1], dict) else {}
    log("T2.has_daily_cap_field", "daily_cap" in last_json and last_json.get("daily_cap") == 3, f"daily_cap={last_json.get('daily_cap')}")
    log("T2.has_daily_awarded_field", "daily_awarded" in last_json, f"daily_awarded={last_json.get('daily_awarded')}")

    # ===== T3: invalid action =====
    r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": "nonexistent_action"}, timeout=30)
    ok = r.status_code == 200
    log("T3.status_200_not_500", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        log("T3.awarded_0", j.get("awarded") == 0, f"awarded={j.get('awarded')}")
        log("T3.reason_invalid_action", j.get("reason") == "invalid_action", f"reason={j.get('reason')}")

    # ===== T4: multiple action types =====
    expected_amounts = {"add_transaction": 5, "scan_sms": 10, "settle_split": 15}
    balance_track = None
    for action, exp in expected_amounts.items():
        r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": action}, timeout=30)
        ok = r.status_code == 200
        log(f"T4.{action}.status_200", ok, f"status={r.status_code}")
        if not ok:
            continue
        j = r.json()
        # Award may be 0 if daily cap reached; accept either exp or 0 (with reason=daily_cap_reached)
        awarded = j.get("awarded")
        reason = j.get("reason")
        valid = (awarded == exp and reason == "ok") or (awarded == 0 and reason == "daily_cap_reached")
        log(f"T4.{action}.awarded_correct", valid, f"awarded={awarded} reason={reason} expected={exp}")
        # Balance non-decreasing
        bal = j.get("balance")
        if balance_track is not None:
            log(f"T4.{action}.balance_monotone", bal >= balance_track, f"prev={balance_track} new={bal}")
        balance_track = bal

    # ===== T5: GET /api/coins/status =====
    r = requests.get(f"{BASE}/coins/status", headers=H, timeout=30)
    ok = r.status_code == 200
    log("T5.status_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        required = {"balance", "today_earned", "today_breakdown", "next_actions", "streak_days", "rules"}
        log("T5.required_keys", required.issubset(j.keys()), f"missing={required - set(j.keys())}")
        log("T5.balance_num_nonneg", isinstance(j.get("balance"), (int, float)) and j["balance"] >= 0, f"balance={j.get('balance')}")
        # today_earned == sum of today_breakdown[*].total
        tb = j.get("today_breakdown", {})
        total_sum = sum(v.get("total", 0) for v in tb.values())
        log("T5.today_earned_eq_breakdown_sum", j.get("today_earned") == total_sum, f"today_earned={j.get('today_earned')} sum={total_sum}")
        # next_actions is list of dicts with id,label,reward
        na = j.get("next_actions", [])
        log("T5.next_actions_is_list", isinstance(na, list), f"type={type(na).__name__}")
        if isinstance(na, list) and na:
            shape_ok = all(isinstance(x, dict) and {"id", "label", "reward"}.issubset(x.keys()) for x in na)
            log("T5.next_actions_shape", shape_ok, f"first={na[0]}")
        # rules contains all 8 action types
        rules = j.get("rules", {})
        expected_rules = {"open_app_daily", "add_transaction", "scan_sms", "settle_split", "complete_lesson", "set_budget", "add_income", "share_report"}
        log("T5.rules_has_8_actions", expected_rules.issubset(set(rules.keys())), f"missing={expected_rules - set(rules.keys())}")

    # ===== T6: Regression — previous MintU 2.0 endpoints =====
    # T6a: /home/snapshot
    r = requests.get(f"{BASE}/home/snapshot", headers=H, timeout=30)
    ok = r.status_code == 200
    log("T6a.home_snapshot_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        log("T6a.has_tier_sparkline_pace", "tier" in j and "sparkline" in j and "pace_headline" in j,
            f"tier={('tier' in j)} sparkline={('sparkline' in j)} pace={('pace_headline' in j)}")

    # T6b: /ai/predict
    r = requests.get(f"{BASE}/ai/predict", headers=H, timeout=45)
    ok = r.status_code == 200
    log("T6b.ai_predict_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        log("T6b.has_overspend_alerts_waste", "overspend_alerts" in j and "waste_comparisons" in j,
            f"keys_present={'overspend_alerts' in j},{'waste_comparisons' in j}")

    # T6c: POST /ai/agent-chat
    r = requests.post(f"{BASE}/ai/agent-chat", headers=H, json={"message": "hi", "lang": "en"}, timeout=90)
    ok = r.status_code == 200
    log("T6c.agent_chat_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        log("T6c.has_mode_issues_ctas", "mode" in j and "issues" in j and "ctas" in j,
            f"keys={list(j.keys())}")

    # T6d: /leaderboard/savings
    r = requests.get(f"{BASE}/leaderboard/savings", headers=H, timeout=30)
    ok = r.status_code == 200
    log("T6d.leaderboard_200", ok, f"status={r.status_code}")
    if ok:
        j = r.json()
        log("T6d.has_percentile", "percentile" in j, f"percentile={j.get('percentile')}")

    # Summary
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    print(f"\n===== {passed}/{total} assertions passed =====")
    failures = [(n, i) for n, p, i in results if not p]
    if failures:
        print("\nFailures:")
        for n, i in failures:
            print(f"  ❌ {n}  {i}")
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
