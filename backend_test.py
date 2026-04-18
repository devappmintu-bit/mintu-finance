"""
Post lazy-proxy patch smoke test.
Hits the endpoints called out in the review request and asserts:
- ZERO 500s
- ZERO NameError / ImportError in backend.err.log during the run
- /premium/status returns PRICING (the previously-flagged lazy proxy)
"""
import os
import json
import time
import subprocess
import requests

BACKEND_URL = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
PASSWORD = "test123"

session = requests.Session()
results = []


def rec(name, status_code, ok, note=""):
    icon = "✅" if ok else "❌"
    line = f"{icon} {name}: HTTP {status_code} {note}".strip()
    print(line)
    results.append({"name": name, "status": status_code, "ok": ok, "note": note})


def login():
    r = session.post(f"{BACKEND_URL}/auth/login",
                     json={"phone": PHONE, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text[:200]}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token, f"no token field in response: {body}"
    session.headers.update({"Authorization": f"Bearer {token}"})
    print(f"✅ Auth OK, JWT len={len(token)}")
    return token


def hit(method, path, expect=(200,), note="", json_body=None):
    url = f"{BACKEND_URL}{path}"
    try:
        r = session.request(method, url, json=json_body, timeout=30)
    except Exception as e:
        rec(f"{method} {path}", 0, False, f"exception: {e}")
        return None
    ok = r.status_code in expect
    extra = note
    try:
        body = r.json()
        if isinstance(body, dict) and "detail" in body and not ok:
            extra = f"detail={body['detail']}"
    except Exception:
        body = None
    rec(f"{method} {path}", r.status_code, ok, extra)
    return r


def snapshot_errlog_markers():
    """Return current line count so we only grep lines added during the test."""
    try:
        with open("/var/log/supervisor/backend.err.log", "r", errors="replace") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0


def grep_errlog_from(line_offset):
    try:
        with open("/var/log/supervisor/backend.err.log", "r", errors="replace") as f:
            all_lines = f.readlines()
        new_lines = all_lines[line_offset:]
        hits = [ln.rstrip() for ln in new_lines if "NameError" in ln or "ImportError" in ln]
        return hits
    except Exception as e:
        return [f"(could not read err.log: {e})"]


def main():
    print(f"Backend: {BACKEND_URL}")
    start_offset = snapshot_errlog_markers()

    login()

    # Core smoke
    hit("GET", "/user/me")
    hit("GET", "/split/groups")
    hit("GET", "/split/balances")
    hit("GET", "/split/reminders")

    # Referral / growth
    r = hit("GET", "/referral/fomo-feed")
    if r is not None and r.status_code == 200:
        try:
            body = r.json()
            assert "items" in body and "count" in body, "missing items/count"
            print(f"   fomo-feed: {body.get('count')} items")
        except Exception as e:
            rec("fomo-feed shape", r.status_code, False, str(e))

    r = hit("GET", "/referral/money-score-card")
    if r is not None and r.status_code == 200:
        body = r.json()
        required = ["score", "title", "emoji", "badges_count", "code", "share_text", "ig_story_text", "whatsapp_text", "gradient"]
        missing = [k for k in required if k not in body]
        if missing:
            rec("money-score-card fields", r.status_code, False, f"missing {missing}")
        else:
            print(f"   money-score-card: score={body['score']} title={body['title']} emoji={body['emoji']}")

    hit("GET", "/referral/enhanced-status")

    # Premium — the key lazy-proxy PRICING test. Per review, 200/401/403 all acceptable
    # but MUST NOT be 500 NameError.
    r = hit("GET", "/premium/status", expect=(200, 401, 403))
    if r is not None and r.status_code == 200:
        body = r.json()
        assert "pricing" in body, "pricing missing"
        pricing = body["pricing"]
        # PRICING dict should have plan entries e.g. 'monthly', 'yearly'
        print(f"   premium/status pricing keys: {list(pricing.keys()) if isinstance(pricing, dict) else pricing}")
        if isinstance(pricing, dict):
            # Verify each plan has a price
            for plan_name, plan_data in pricing.items():
                if not isinstance(plan_data, dict) or "price" not in plan_data:
                    rec("premium pricing shape", 200, False, f"plan {plan_name} missing 'price'")
                    break
            else:
                print(f"   ✅ PRICING lazy proxy resolves correctly with {len(pricing)} plans")

    # Explicitly test /premium/pricing if it exists (review mentioned it). Acceptable
    # to 404 if never implemented, but MUST NOT be 500.
    r = hit("GET", "/premium/pricing", expect=(200, 404, 401, 403))
    if r is not None and r.status_code == 200:
        try:
            body = r.json()
            print(f"   premium/pricing body keys: {list(body.keys()) if isinstance(body, dict) else 'list'}")
        except Exception:
            pass

    # /premium/paywall-trigger also exercises PRICING lazy proxy
    hit("GET", "/premium/paywall-trigger", expect=(200, 401, 403))

    # UPI proxy — only /upi/apps exists in router
    r = hit("GET", "/upi/apps", expect=(200, 401, 403))
    if r is not None and r.status_code == 200:
        body = r.json()
        if isinstance(body, dict) and "apps" in body:
            print(f"   upi/apps: {len(body['apps'])} apps")
        elif isinstance(body, list):
            print(f"   upi/apps: {len(body)} apps")

    # SMS proxy — only /sms/sample-inbox exists
    r = hit("GET", "/sms/sample-inbox", expect=(200, 401, 403))
    if r is not None and r.status_code == 200:
        body = r.json()
        if isinstance(body, dict) and "messages" in body:
            print(f"   sms/sample-inbox: {len(body['messages'])} messages")

    # Privacy proxy (DATA_RETENTION_DAYS lazy was flagged before)
    r = hit("GET", "/privacy/policy", expect=(200, 401, 403))
    if r is not None and r.status_code == 200:
        body = r.json()
        keys = list(body.keys()) if isinstance(body, dict) else None
        print(f"   privacy/policy keys: {keys}")

    # ---- Error-log grep ----
    time.sleep(1.5)  # let log flush
    name_import_hits = grep_errlog_from(start_offset)
    print("\n=== Backend err.log (NameError|ImportError) new lines since test start ===")
    if name_import_hits:
        for ln in name_import_hits[:40]:
            print(f"   {ln}")
        rec("err.log grep", 0, False, f"{len(name_import_hits)} NameError/ImportError lines")
    else:
        print("   (none)")
        rec("err.log grep", 0, True, "no NameError/ImportError")

    # Summary
    print("\n==== RESULT ====")
    failed = [r for r in results if not r["ok"]]
    passed = [r for r in results if r["ok"]]
    print(f"passed: {len(passed)}  failed: {len(failed)}")
    for r in failed:
        print(f"   FAIL: {r['name']} (HTTP {r['status']}) {r['note']}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
