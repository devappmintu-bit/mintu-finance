"""Round 16 — Gmail OAuth + bank email auto-import — backend tests.

Run: python /app/backend_test.py
Auth: Phone 9876543210 / OTP 123456 (mock).
"""
import os
import sys
import json
import urllib.parse as up
import requests

BASE_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE_URL}/api"

PASS = 0
FAIL = 0
FAILS = []


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        FAILS.append(f"{name} :: {detail}")
        print(f"  ❌ {name} :: {detail}")


def auth_token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": "9876543210"}, timeout=15)
    assert r.status_code == 200, f"send-otp {r.status_code} {r.text}"
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": "9876543210", "otp": "123456"}, timeout=15)
    assert r.status_code == 200, f"verify-otp {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in verify-otp response: {data}"
    return tok


def main():
    print("\n═══ AUTH ═══")
    token = auth_token()
    h = {"Authorization": f"Bearer {token}"}
    check("Auth token obtained", bool(token))

    # ────────────────────────────────────────────────────
    # 1. GET /api/oauth/gmail/start (authed)
    # ────────────────────────────────────────────────────
    print("\n═══ 1. GET /api/oauth/gmail/start (authed) ═══")
    r1 = requests.get(f"{API}/oauth/gmail/start", headers=h, timeout=15)
    check("oauth/gmail/start status=200", r1.status_code == 200, f"got {r1.status_code} body={r1.text[:200]}")
    auth_url_1 = None
    state_1 = None
    if r1.status_code == 200:
        d1 = r1.json()
        auth_url_1 = d1.get("auth_url", "")
        check("auth_url starts with https://accounts.google.com/o/oauth2/auth",
              auth_url_1.startswith("https://accounts.google.com/o/oauth2/auth"),
              f"got {auth_url_1[:100]}")
        check("auth_url contains client_id=820132719285-",
              "client_id=820132719285-" in auth_url_1)
        parsed = up.urlparse(auth_url_1)
        qs = up.parse_qs(parsed.query)
        check("auth_url has scope=", "scope" in qs)
        check("scope contains gmail.readonly",
              any("gmail.readonly" in s for s in qs.get("scope", [])),
              f"scope={qs.get('scope')}")
        check("auth_url has state=", "state" in qs and bool(qs["state"][0]))
        state_1 = qs.get("state", [None])[0]
        check("redirect_uri URL-encoded callback present",
              "redirect_uri" in qs and qs["redirect_uri"][0].endswith("/api/oauth/gmail/callback"),
              f"redirect_uri={qs.get('redirect_uri')}")
        check("access_type=offline", qs.get("access_type", [None])[0] == "offline")
        check("prompt=consent", qs.get("prompt", [None])[0] == "consent")

    # Call twice → different state
    r1b = requests.get(f"{API}/oauth/gmail/start", headers=h, timeout=15)
    state_2 = None
    if r1b.status_code == 200:
        auth_url_2 = r1b.json().get("auth_url", "")
        parsed2 = up.urlparse(auth_url_2)
        state_2 = up.parse_qs(parsed2.query).get("state", [None])[0]
    check("second call returns different state", bool(state_1) and bool(state_2) and state_1 != state_2,
          f"s1={state_1} s2={state_2}")

    # ────────────────────────────────────────────────────
    # 2. GET /api/oauth/gmail/callback (no auth)
    # ────────────────────────────────────────────────────
    print("\n═══ 2. GET /api/oauth/gmail/callback ═══")
    # 2a: no query
    r2a = requests.get(f"{API}/oauth/gmail/callback", allow_redirects=False, timeout=15)
    check("callback no query → 400", r2a.status_code == 400, f"got {r2a.status_code}")
    try:
        detail = r2a.json().get("detail", "")
    except Exception:
        detail = r2a.text
    check("callback no query detail contains 'Missing code or state'",
          "Missing code or state" in detail, f"detail={detail}")

    # 2b: bogus state
    r2b = requests.get(f"{API}/oauth/gmail/callback",
                       params={"code": "abc", "state": "bogus_state_123"},
                       allow_redirects=False, timeout=15)
    check("callback bogus state → 400", r2b.status_code == 400, f"got {r2b.status_code}")
    try:
        detail2 = r2b.json().get("detail", "")
    except Exception:
        detail2 = r2b.text
    check("callback bogus state detail contains 'Invalid or expired state'",
          "Invalid or expired state" in detail2, f"detail={detail2}")

    # 2c: error=access_denied → 302/307 redirect
    r2c = requests.get(f"{API}/oauth/gmail/callback",
                       params={"error": "access_denied"},
                       allow_redirects=False, timeout=15)
    check("callback error=access_denied → 302/307", r2c.status_code in (302, 307),
          f"got {r2c.status_code}")
    loc = r2c.headers.get("location", "")
    check("redirect location contains /gmail-connected?success=0&error=access_denied",
          "/gmail-connected?success=0&error=access_denied" in loc,
          f"location={loc}")

    # ────────────────────────────────────────────────────
    # 3. GET /api/gmail/status (authed, not connected)
    # ────────────────────────────────────────────────────
    print("\n═══ 3. GET /api/gmail/status (not connected) ═══")
    # First ensure disconnected
    requests.delete(f"{API}/gmail/disconnect", headers=h, timeout=15)
    r3 = requests.get(f"{API}/gmail/status", headers=h, timeout=15)
    check("gmail/status → 200", r3.status_code == 200, f"got {r3.status_code}")
    if r3.status_code == 200:
        d3 = r3.json()
        check("status connected=false", d3.get("connected") is False, f"body={d3}")

    # ────────────────────────────────────────────────────
    # 4. POST /api/gmail/sync-now (authed, not connected)
    # ────────────────────────────────────────────────────
    print("\n═══ 4. POST /api/gmail/sync-now (not connected) ═══")
    r4 = requests.post(f"{API}/gmail/sync-now", headers=h, timeout=30)
    check("sync-now → 200", r4.status_code == 200, f"got {r4.status_code} body={r4.text[:200]}")
    if r4.status_code == 200:
        d4 = r4.json()
        check("sync-now fetched=0", d4.get("fetched") == 0)
        check("sync-now imported=0", d4.get("imported") == 0)
        check("sync-now skipped=0", d4.get("skipped") == 0)
        check("sync-now error='not_connected'", d4.get("error") == "not_connected", f"body={d4}")

    # ────────────────────────────────────────────────────
    # 5. DELETE /api/gmail/disconnect (not connected)
    # ────────────────────────────────────────────────────
    print("\n═══ 5. DELETE /api/gmail/disconnect (not connected) ═══")
    r5 = requests.delete(f"{API}/gmail/disconnect", headers=h, timeout=15)
    check("disconnect → 200", r5.status_code == 200, f"got {r5.status_code}")
    if r5.status_code == 200:
        d5 = r5.json()
        check("disconnect disconnected=false", d5.get("disconnected") is False, f"body={d5}")
        check("disconnect message='Gmail disconnected'",
              d5.get("message") == "Gmail disconnected", f"body={d5}")

    # ────────────────────────────────────────────────────
    # 6. No-auth guard on /api/oauth/gmail/start
    # ────────────────────────────────────────────────────
    print("\n═══ 6. No-auth guard on /api/oauth/gmail/start ═══")
    r6 = requests.get(f"{API}/oauth/gmail/start", timeout=15)
    check("no-auth → 401 or 422", r6.status_code in (401, 422), f"got {r6.status_code}")

    # ────────────────────────────────────────────────────
    # 7. Parser unit sanity
    # ────────────────────────────────────────────────────
    print("\n═══ 7. Parser unit sanity (routers.gmail_parser.parse_bank_body) ═══")
    sys.path.insert(0, "/app/backend")
    try:
        from routers.gmail_parser import parse_bank_body
        check("parse_bank_body importable", True)
    except Exception as e:
        check("parse_bank_body importable", False, f"import error: {e}")
        parse_bank_body = None

    if parse_bank_body:
        # (a) HDFC debit
        body_a = ("Dear Customer, Rs.450.00 has been debited from a/c XXXXXX1234 on "
                  "18-Apr-2026 at SWIGGY BANGALORE. Avl Bal: Rs.25,000. Not you? Call 18002586161.")
        pa = parse_bank_body(body_a)
        check("(a) HDFC debit parsed non-None", pa is not None, f"parsed={pa}")
        if pa:
            check("(a) amount=450.0", pa.get("amount") == 450.0, f"amount={pa.get('amount')}")
            check("(a) type=debit", pa.get("type") == "debit", f"type={pa.get('type')}")
            merch_a = pa.get("merchant", "")
            check("(a) merchant contains 'Swiggy' (title-cased)",
                  "Swiggy" in merch_a, f"merchant={merch_a}")
            check("(a) last4='1234'", pa.get("last4") == "1234", f"last4={pa.get('last4')}")
            check("(a) category='Food'", pa.get("category") == "Food",
                  f"category={pa.get('category')}")

        # (b) SBI credit
        body_b = ("INR 50,000 credited to A/C XX4567 from NEFT on 17-04-2026. "
                  "Avl Bal: INR 1,20,000. -SBI")
        pb = parse_bank_body(body_b)
        check("(b) SBI credit parsed non-None", pb is not None, f"parsed={pb}")
        if pb:
            check("(b) amount=50000.0", pb.get("amount") == 50000.0, f"amount={pb.get('amount')}")
            check("(b) type=credit", pb.get("type") == "credit", f"type={pb.get('type')}")
            check("(b) last4='4567'", pb.get("last4") == "4567", f"last4={pb.get('last4')}")
            check("(b) category in (Transfer, Other)",
                  pb.get("category") in ("Transfer", "Other"),
                  f"category={pb.get('category')}")

        # (c) ICICI debit
        body_c = ("ICICI Bank Acct XX7788 debited with Rs 1,299.00 on 19-04-26 at "
                  "AMAZON PAY. Avl Bal Rs 5,432.10.")
        pc = parse_bank_body(body_c)
        check("(c) ICICI debit parsed non-None", pc is not None, f"parsed={pc}")
        if pc:
            check("(c) amount=1299.0", pc.get("amount") == 1299.0, f"amount={pc.get('amount')}")
            check("(c) type=debit", pc.get("type") == "debit", f"type={pc.get('type')}")
            merch_c = pc.get("merchant", "")
            check("(c) merchant contains 'Amazon'",
                  "Amazon" in merch_c, f"merchant={merch_c}")
            check("(c) last4='7788'", pc.get("last4") == "7788", f"last4={pc.get('last4')}")
            check("(c) category='Shopping'", pc.get("category") == "Shopping",
                  f"category={pc.get('category')}")

        # (d) Non-txn email
        body_d = "Dear customer, your statement is ready. No action needed."
        pd = parse_bank_body(body_d)
        check("(d) non-txn returns None", pd is None, f"got {pd}")

    # ────────────────────────────────────────────────────
    # 8. Regression sanity
    # ────────────────────────────────────────────────────
    print("\n═══ 8. Regression sanity ═══")
    for path in ["/transactions", "/split/groups", "/coins/status", "/news/india-finance"]:
        rr = requests.get(f"{API}{path}", headers=h, timeout=30)
        check(f"GET /api{path} → 200", rr.status_code == 200, f"got {rr.status_code}")

    # ────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAILS:
        print("FAILURES:")
        for f in FAILS:
            print(f"  - {f}")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
