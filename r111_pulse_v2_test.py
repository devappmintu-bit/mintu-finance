"""R111 — Money Pulse v2 backend test suite."""
from __future__ import annotations

import os
import sys
import requests

BASE = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or "https://mintu-finance.preview.emergentagent.com"
).rstrip("/") + "/api"

PHONE = "9876543210"
OTP = "123456"

PASS = []
FAIL = []
SKIP = []


def ok(msg): print(f"  ✅ {msg}"); PASS.append(msg)
def bad(msg): print(f"  ❌ {msg}"); FAIL.append(msg)
def skip(msg): print(f"  ⏭️  SKIPPED: {msg}"); SKIP.append(msg)


def login() -> str:
    requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=10).raise_for_status()
    r = requests.post(f"{BASE}/auth/verify-otp", json={
        "phone": PHONE, "otp": OTP,
        "device_id": "tester", "device_name": "tester", "os": "web",
    }, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def hdr(tok): return {"Authorization": f"Bearer {tok}"}


def test_auth_guard():
    print("\n=== 1. AUTH GUARD ===")
    cases = [
        ("GET", "/pulse/v2/feed"),
        ("GET", "/pulse/v2/categories"),
        ("GET", "/pulse/v2/article/abc"),
        ("POST", "/pulse/v2/react"),
        ("POST", "/pulse/v2/refresh-now"),
    ]
    for method, path in cases:
        try:
            if method == "GET":
                r = requests.get(f"{BASE}{path}", timeout=10)
            else:
                r = requests.post(f"{BASE}{path}", json={}, timeout=10)
            if r.status_code == 401:
                ok(f"{method} {path} → 401 (no token)")
            else:
                bad(f"{method} {path} → {r.status_code} (expected 401)")
        except Exception as e:
            bad(f"{method} {path} threw: {e}")


def test_refresh_now(tok):
    print("\n=== 2. /pulse/v2/refresh-now ===")
    try:
        r = requests.post(f"{BASE}/pulse/v2/refresh-now", headers=hdr(tok), timeout=70)
    except Exception as e:
        bad(f"refresh-now threw: {e}")
        return {}
    if r.status_code != 200:
        bad(f"refresh-now status {r.status_code}: {r.text[:300]}")
        return {}
    ok("refresh-now status 200")
    body = r.json()
    for k in ("inserted", "skipped_dup", "by_source", "elapsed_ms"):
        if k in body: ok(f"contains '{k}' (={body.get(k)})")
        else: bad(f"missing '{k}'")
    by_src = body.get("by_source") or {}
    indian = ("Moneycontrol", "LiveMint", "Economic Times", "Business Standard", "RBI")
    matched = [k for k in by_src.keys() if any(s in k for s in indian)]
    if matched:
        ok(f"by_source has Indian outlets: {matched}")
    else:
        if body.get("inserted", 0) > 0:
            bad(f"by_source missing Indian outlets: {by_src}")
        else:
            skip("by_source empty (inserted=0); deferring Indian-source check")

    r2 = requests.post(f"{BASE}/pulse/v2/refresh-now", headers=hdr(tok), timeout=70)
    if r2.status_code == 200:
        body2 = r2.json()
        ok(f"2nd call: inserted={body2.get('inserted')}, skipped_dup={body2.get('skipped_dup')}")
        if body2.get("skipped_dup", 0) > 0:
            ok("2nd call skipped_dup > 0 (dedup working)")
        else:
            bad(f"2nd call skipped_dup={body2.get('skipped_dup')} (expected >0)")
    else:
        bad(f"2nd refresh-now → {r2.status_code}")


EXPECTED_CATS = [
    "markets", "mutual-funds", "loans", "credit-cards",
    "rbi", "tax", "inflation", "salary",
    "jobs", "ai-economy", "crypto", "startups",
    "consumer-spending", "gold", "real-estate", "general",
]


def test_categories(tok):
    print("\n=== 3. /pulse/v2/categories ===")
    r = requests.get(f"{BASE}/pulse/v2/categories", headers=hdr(tok), timeout=15)
    if r.status_code != 200:
        bad(f"status {r.status_code}: {r.text[:200]}")
        return
    ok("status 200")
    body = r.json()
    cats = body.get("categories", [])
    keys = [c.get("key") for c in cats]
    if keys == EXPECTED_CATS:
        ok("16 keys in exact spec order")
    else:
        bad(f"keys mismatch: got {keys}")
    if all(set(c) >= {"key", "label", "emoji", "count"} for c in cats):
        ok("each item has key/label/emoji/count")
    else:
        bad("some items missing required keys")
    s = sum(int(c.get("count") or 0) for c in cats)
    if body.get("total") == s:
        ok(f"total ({body.get('total')}) == sum counts ({s})")
    else:
        bad(f"total ({body.get('total')}) != sum ({s})")


REQUIRED_ART_KEYS = {
    "id", "url", "source", "verified", "category", "headline",
    "explainer", "generic_impact", "sentiment", "emoji",
    "published_at", "personal_impact", "reaction",
}


def test_feed_default(tok):
    print("\n=== 4. /pulse/v2/feed (no category) ===")
    r = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok), timeout=35)
    if r.status_code != 200:
        bad(f"status {r.status_code}: {r.text[:300]}")
        return []
    ok("status 200")
    body = r.json()
    if all(k in body for k in ("articles", "count", "profile")):
        ok("has articles/count/profile")
    else:
        bad(f"top-level keys: {list(body.keys())}")
    arts = body.get("articles", [])
    cnt = body.get("count")
    if cnt == len(arts): ok(f"count == articles.length ({cnt})")
    else: bad(f"count ({cnt}) != len ({len(arts)})")
    if cnt is not None and cnt <= 20: ok(f"count ≤ 20 ({cnt})")
    else: bad(f"count > 20")
    prof = body.get("profile") or {}
    if all(k in prof for k in ("has_sip", "has_loan_emi")):
        ok(f"profile keys ok: {prof}")
    else:
        bad(f"profile missing keys: {prof}")
    if arts:
        a = arts[0]
        miss = REQUIRED_ART_KEYS - set(a.keys())
        if not miss: ok("first article has all required keys")
        else: bad(f"missing keys on article: {miss}")
        if isinstance(a.get("verified"), bool): ok("verified is bool")
        else: bad(f"verified not bool")
        pi = a.get("personal_impact")
        if pi is None or isinstance(pi, dict): ok(f"personal_impact = dict|null")
        else: bad(f"personal_impact wrong type")
        rxn = a.get("reaction")
        if rxn is None or isinstance(rxn, dict): ok(f"reaction = dict|null")
        else: bad(f"reaction wrong type")
    else:
        skip("feed empty — cannot check article shape")
    return arts


def test_feed_category(tok):
    print("\n=== 5. /pulse/v2/feed?category=markets ===")
    r = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok),
                     params={"category": "markets"}, timeout=15)
    if r.status_code != 200:
        bad(f"status {r.status_code}")
        return
    ok("status 200")
    arts = r.json().get("articles", [])
    bad_cats = [a.get("category") for a in arts if a.get("category") != "markets"]
    if not bad_cats:
        ok(f"all {len(arts)} articles category=='markets' (or empty)")
    else:
        bad(f"non-markets leaked: {set(bad_cats)}")


def test_feed_limit(tok):
    print("\n=== 6. /pulse/v2/feed?limit=5 ===")
    r = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok),
                     params={"limit": 5}, timeout=15)
    if r.status_code != 200:
        bad(f"status {r.status_code}")
        return
    ok("status 200")
    n = len(r.json().get("articles", []))
    if n <= 5: ok(f"returned {n} articles (≤5)")
    else: bad(f"returned {n} (>5)")


def test_article(tok, arts):
    print("\n=== 7. /pulse/v2/article/{id} ===")
    if arts:
        aid = arts[0]["id"]
        r = requests.get(f"{BASE}/pulse/v2/article/{aid}", headers=hdr(tok), timeout=20)
        if r.status_code == 200:
            ok("valid id → 200")
            if r.json().get("id") == aid: ok("body.id matches request")
            else: bad(f"body.id={r.json().get('id')} != {aid}")
        else:
            bad(f"valid id → {r.status_code}: {r.text[:200]}")
    else:
        skip("no articles to test valid id")

    r = requests.get(f"{BASE}/pulse/v2/article/not-an-oid", headers=hdr(tok), timeout=10)
    if r.status_code == 400:
        ok("malformed id → 400")
        d = r.json().get("detail", "")
        if "Invalid article id" in d: ok("detail contains 'Invalid article id'")
        else: bad(f"detail: {d!r}")
    else:
        bad(f"malformed id → {r.status_code}")

    r = requests.get(f"{BASE}/pulse/v2/article/000000000000000000000000",
                     headers=hdr(tok), timeout=10)
    if r.status_code == 404:
        ok("nonexistent OID → 404")
        d = r.json().get("detail", "")
        if "Article not found" in d: ok("detail == 'Article not found'")
        else: bad(f"detail: {d!r}")
    else:
        bad(f"nonexistent OID → {r.status_code}")


def test_react(tok, arts):
    print("\n=== 8. /pulse/v2/react ===")
    if not arts:
        skip("no articles to react on")
        return
    aid = arts[0]["id"]
    r = requests.post(f"{BASE}/pulse/v2/react", headers=hdr(tok),
                      json={"article_id": aid, "kind": "like"}, timeout=10)
    if r.status_code == 200 and r.json().get("ok") is True and r.json().get("kind") == "like":
        ok("like → 200 ok=true kind=like")
    else:
        bad(f"like → {r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok), timeout=15)
    found = next((a for a in r.json().get("articles", []) if a.get("id") == aid), None)
    if found and (found.get("reaction") or {}).get("kind") == "like":
        ok("feed shows reaction.kind=='like'")
    else:
        bad(f"feed reaction not 'like': {found.get('reaction') if found else 'no article'}")

    r = requests.post(f"{BASE}/pulse/v2/react", headers=hdr(tok),
                      json={"article_id": aid, "kind": "unlike"}, timeout=10)
    if r.status_code == 200 and r.json().get("ok") is True and r.json().get("removed") == "like":
        ok("unlike → 200 ok=true removed=like")
    else:
        bad(f"unlike → {r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok), timeout=15)
    found = next((a for a in r.json().get("articles", []) if a.get("id") == aid), None)
    if found and found.get("reaction") in (None, {}):
        ok("feed reaction == null after unlike")
    else:
        bad(f"reaction still set: {found.get('reaction') if found else 'no article'}")

    r = requests.post(f"{BASE}/pulse/v2/react", headers=hdr(tok),
                      json={"article_id": aid, "kind": "bogus"}, timeout=10)
    if r.status_code == 400: ok("invalid kind → 400")
    else: bad(f"invalid kind → {r.status_code}")

    r = requests.post(f"{BASE}/pulse/v2/react", headers=hdr(tok),
                      json={"kind": "like"}, timeout=10)
    if r.status_code == 400: ok("missing article_id → 400")
    else: bad(f"missing article_id → {r.status_code}")


def test_personalization(tok):
    print("\n=== 9. PERSONALIZATION ===")
    r = requests.post(f"{BASE}/transactions", headers=hdr(tok), json={
        "description": "Home loan EMI",
        "amount": 15000,
        "category": "Loan",
        "type": "debit",
    }, timeout=15)
    if r.status_code in (200, 201):
        ok(f"created Loan EMI txn (status {r.status_code})")
    else:
        bad(f"create txn → {r.status_code}: {r.text[:200]}")
        return
    try:
        requests.post(f"{BASE}/pulse/v2/refresh-now", headers=hdr(tok), timeout=70)
    except Exception:
        pass
    r1 = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok),
                      params={"category": "rbi", "limit": 20}, timeout=20)
    r2 = requests.get(f"{BASE}/pulse/v2/feed", headers=hdr(tok),
                      params={"category": "loans", "limit": 20}, timeout=20)
    arts = (r1.json().get("articles", []) if r1.status_code == 200 else []) + \
           (r2.json().get("articles", []) if r2.status_code == 200 else [])
    cands = [a for a in arts if a.get("personal_impact")]
    if not cands:
        skip("no rbi/loans articles with personal_impact in window")
        return
    pi = cands[0]["personal_impact"]
    if pi.get("label") == "EMI Impact": ok("label == 'EMI Impact'")
    else: bad(f"label = {pi.get('label')!r}")
    msg = (pi.get("message") or "").lower()
    if "emi" in msg or "loan" in msg:
        ok(f"message mentions EMI/loan: {pi.get('message')!r}")
    else:
        bad(f"message: {pi.get('message')!r}")


def main():
    print(f"BASE: {BASE}")
    test_auth_guard()
    try:
        tok = login()
    except Exception as e:
        bad(f"login failed: {e}"); summary(); sys.exit(1)
    print(f"Logged in (token len={len(tok)})")
    test_refresh_now(tok)
    test_categories(tok)
    arts = test_feed_default(tok)
    test_feed_category(tok)
    test_feed_limit(tok)
    test_article(tok, arts)
    test_react(tok, arts)
    test_personalization(tok)
    summary()


def summary():
    print("\n═══════ SUMMARY ═══════")
    print(f"PASS: {len(PASS)}  FAIL: {len(FAIL)}  SKIP: {len(SKIP)}")
    if FAIL:
        print("\nFAILURES:")
        for f in FAIL: print(f"  ❌ {f}")
    if SKIP:
        print("\nSKIPPED:")
        for s in SKIP: print(f"  ⏭️  {s}")


if __name__ == "__main__":
    main()
