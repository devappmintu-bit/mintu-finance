"""Round 25C Backend ObjectId hardening regression test.

Validates:
- TEST 1: Malformed path IDs now return 400, not 500 (11 endpoints)
- TEST 2: Happy path non-regression (7 endpoints)
- TEST 3: Non-split endpoints still work (6 endpoints)
"""
import os
import sys
import json
import time
import requests

BASE = os.environ.get("BACKEND_URL", "https://mintu-finance.preview.emergentagent.com") + "/api"
PHONE = "9876543210"
OTP = "123456"

failed = []
passed = []

def rec(name, ok, detail=""):
    tag = "✅" if ok else "❌"
    print(f"{tag} {name}  {detail}")
    (passed if ok else failed).append((name, detail))


def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # review request clearly states the key is `token`
    tok = body.get("token") or body.get("access_token")
    assert tok, f"No token in {body}"
    return tok


def main():
    tok = auth()
    H = {"Authorization": f"Bearer {tok}"}
    print(f"\n== TOKEN OBTAINED (len={len(tok)}) ==\n")

    # =================================================================
    # TEST 1: Malformed IDs → MUST be 400 (NOT 500)
    # =================================================================
    print("\n=== TEST 1 — Malformed ID guards (expect 400, forbid 500) ===")
    cases = [
        ("GET", "/split/pay-intent/bogus", {"amount": 100}, None),
        ("GET", "/split/groups/bogus/summary", None, None),
        ("GET", "/split/groups/bogus/manage", None, None),
        ("DELETE", "/split/groups/bogus", None, None),
        ("DELETE", "/split/groups/bogus/leave", None, None),
        ("DELETE", "/split/expenses/bogus", None, None),
        ("PUT", "/split/expenses/bogus", None, {}),
        ("GET", "/split/groups/bogus/messages", None, None),
        ("POST", "/split/groups/bogus/messages", None, {"content": "hi"}),
        ("PUT", "/split/groups/bogus/name", None, {"name": "x"}),
        ("POST", "/split/groups/bogus/members", None, {"phones": []}),
    ]
    for method, path, params, body in cases:
        url = BASE + path
        try:
            r = requests.request(method, url, headers=H, params=params, json=body, timeout=20)
            code = r.status_code
        except Exception as e:
            rec(f"{method} {path}", False, f"EXC {e}")
            continue
        ok = code == 400
        detail = f"→ {code}"
        if code >= 500:
            detail += f"  BODY={r.text[:160]}"
        rec(f"T1 {method} {path}", ok, detail)

    # =================================================================
    # TEST 2: Happy path non-regression
    # =================================================================
    print("\n=== TEST 2 — Happy path non-regression ===")

    def expect(method, path, *, params=None, body=None, allowed=(200,), name=None):
        url = BASE + path
        r = requests.request(method, url, headers=H, params=params, json=body, timeout=30)
        ok = r.status_code in allowed
        detail = f"→ {r.status_code}"
        if not ok:
            detail += f"  BODY={r.text[:200]}"
        rec(f"T2 {name or (method + ' ' + path)}", ok, detail)
        return r

    expect("GET", "/split/groups")
    expect("GET", "/split/balances")
    expect("GET", "/split/activity", params={"limit": 5})
    expect("GET", "/split/reminders")
    expect("GET", "/split/settlement-leaderboard")

    # POST /split/groups is allowed 200/4xx per spec
    r = requests.post(f"{BASE}/split/groups", headers=H, json={"name": "Test", "members": []}, timeout=20)
    ok = r.status_code < 500
    rec("T2 POST /split/groups", ok, f"→ {r.status_code}")

    # Valid ObjectId shape, no doc → 404
    r = requests.get(f"{BASE}/split/groups/000000000000000000000000/summary", headers=H, timeout=20)
    ok = r.status_code == 404
    detail = f"→ {r.status_code}"
    if not ok:
        detail += f"  BODY={r.text[:200]}"
    rec("T2 GET /split/groups/000000.../summary (valid shape, missing doc)", ok, detail)

    # =================================================================
    # TEST 3: Non-split endpoints still work
    # =================================================================
    print("\n=== TEST 3 — Non-split endpoints regression ===")
    expect("GET", "/budgets")
    expect("GET", "/budgets/live")
    expect("GET", "/budgets/achievements")
    expect("GET", "/transactions")
    expect("GET", "/user/me")

    r = requests.post(f"{BASE}/coins/award", headers=H, json={"action": "open_app_daily"}, timeout=20)
    ok = r.status_code == 200
    detail = f"→ {r.status_code}"
    if not ok:
        detail += f"  BODY={r.text[:200]}"
    rec("T3 POST /coins/award {open_app_daily}", ok, detail)

    # =================================================================
    # SUMMARY
    # =================================================================
    print("\n" + "="*60)
    print(f"PASSED: {len(passed)}   FAILED: {len(failed)}")
    if failed:
        print("\n--- FAILED ---")
        for n, d in failed:
            print(f"  ❌ {n}  {d}")
    print("="*60)
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
