"""Backend tests for MintU growth-loop endpoints (FOMO feed + Money Score Card).

Targets:
  - GET /api/referral/fomo-feed
  - GET /api/referral/money-score-card
  - Regression: /api/referral/status | /api/referral/enhanced-status | /api/referral/leaderboard
"""
import os
import re
import sys
import time
import json
import requests

BASE = "https://mintu-finance.preview.emergentagent.com/api"

LOGIN_PHONE = "9876543210"
LOGIN_PW = "test123"


def log(status, msg):
    sym = "✅" if status == "PASS" else "❌" if status == "FAIL" else "ℹ️"
    print(f"{sym} [{status}] {msg}")


def login():
    r = requests.post(f"{BASE}/auth/login", json={"phone": LOGIN_PHONE, "password": LOGIN_PW}, timeout=30)
    if r.status_code != 200:
        log("FAIL", f"Auth login failed: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        log("FAIL", f"No token returned: {r.json()}")
        sys.exit(1)
    log("PASS", f"Auth login OK (token len={len(token)})")
    return token


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


results = {"pass": 0, "fail": 0, "issues": []}


def passed(label):
    results["pass"] += 1
    log("PASS", label)


def failed(label, detail=""):
    results["fail"] += 1
    results["issues"].append(f"{label}: {detail}")
    log("FAIL", f"{label} - {detail}")


def get_with_retry(url, token, max_tries=5, base_wait=15):
    """GET with retries on 429."""
    for attempt in range(max_tries):
        r = requests.get(url, headers=headers(token), timeout=30)
        if r.status_code != 429:
            return r
        wait = base_wait * (attempt + 1)
        log("INFO", f"429 on {url.split('/api')[-1]}, backing off {wait}s (attempt {attempt+1}/{max_tries})")
        time.sleep(wait)
    return r


# ---------- TEST A - FOMO FEED ----------
def test_fomo_feed(token):
    print("\n=== TEST A — FOMO Feed ===")
    r = get_with_retry(f"{BASE}/referral/fomo-feed", token)
    if r.status_code != 200:
        failed("A1 fomo-feed status", f"expected 200 got {r.status_code}: {r.text[:300]}")
        return
    data = r.json()
    if "items" not in data or "count" not in data:
        failed("A1 fomo-feed shape", f"missing keys: {data}")
        return
    items = data["items"]
    if not isinstance(items, list) or len(items) < 1 or len(items) > 3:
        failed("A1 items length", f"expected 1-3 got {len(items) if isinstance(items, list) else type(items)}")
        return
    if data["count"] != len(items):
        failed("A1 count matches items length", f"count={data['count']} items={len(items)}")
        return
    passed(f"A1 fomo-feed shape: items={len(items)} count={data['count']}")

    allowed_types = {"friend_saving", "community", "invite_nudge", "streak_break"}
    for i, it in enumerate(items):
        for field in ("id", "type", "icon", "text", "cta"):
            if field not in it:
                failed(f"A1 item[{i}] field", f"missing '{field}' in {it}")
                return
        if it["type"] not in allowed_types:
            failed(f"A1 item[{i}] type", f"'{it['type']}' not in {allowed_types}")
            return
        if not isinstance(it["text"], str) or len(it["text"]) < 1:
            failed(f"A1 item[{i}] text", "empty or not string")
            return
        if not isinstance(it["icon"], str) or not (1 <= len(it["icon"]) <= 4):
            failed(f"A1 item[{i}] icon", f"len={len(it.get('icon', ''))}")
            return
    passed("A1 items structure valid (id/type/icon/text/cta all present; type enum OK)")

    # A2 — Idempotency (3x succession, with small delay to avoid rate limiter)
    statuses = []
    for i in range(3):
        time.sleep(8)
        r2 = get_with_retry(f"{BASE}/referral/fomo-feed", token, max_tries=3, base_wait=20)
        statuses.append(r2.status_code)
    if not all(s == 200 for s in statuses):
        failed("A2 idempotency", f"statuses: {statuses}")
        return
    passed(f"A2 idempotency: 3x calls all 200 {statuses}")

    # A2b — invite_nudge check
    time.sleep(8)
    r3 = get_with_retry(f"{BASE}/referral/fomo-feed", token)
    items3 = r3.json().get("items", [])
    nudges = [x for x in items3 if x["type"] == "invite_nudge"]
    if nudges:
        nudge_text = nudges[0]["text"]
        if re.search(r"Invite\s+\d+\s+more\s+friend", nudge_text, re.IGNORECASE):
            passed(f"A2b invite_nudge present with remaining count: '{nudge_text}'")
        else:
            failed("A2b invite_nudge content", f"text does not mention remaining count: '{nudge_text}'")
    else:
        log("INFO", "A2b no invite_nudge item (user may not be 'free' tier or already 3+ refs) — soft-skip")

    # A3 — Fallback
    if len(items) < 1:
        failed("A3 fallback", "no items returned; violates 'at least 1 item always'")
        return
    has_default = any(x.get("cta") == "Get started" and "23%" in x.get("text", "") for x in items)
    if has_default:
        passed("A3 default community fallback item detected (contains '23%' + 'Get started')")
    else:
        log("INFO", "A3 default fallback not triggered (real data present) — acceptable per spec")


# ---------- TEST B - MONEY SCORE SHARE CARD ----------
def test_money_score_card(token):
    print("\n=== TEST B — Money Score Share Card ===")
    time.sleep(10)
    r = get_with_retry(f"{BASE}/referral/money-score-card", token)
    if r.status_code != 200:
        failed("B1 money-score-card status", f"expected 200 got {r.status_code}: {r.text[:300]}")
        return
    data = r.json()

    required = ["score", "title", "emoji", "badges_count", "code", "share_text", "ig_story_text", "whatsapp_text", "gradient"]
    missing = [k for k in required if k not in data]
    if missing:
        failed("B1 required fields", f"missing: {missing}")
        return
    for k in required:
        if data[k] is None:
            failed(f"B1 field '{k}' is null", "")
            return
    passed("B1 all required fields present & non-null")

    score = data["score"]
    if not isinstance(score, (int, float)) or not (0 <= score <= 100):
        failed("B1 score range", f"got {score}")
        return
    passed(f"B1 score OK: {score}")

    allowed_titles = {"Money Master", "Money Pro", "Getting Better", "Just Starting"}
    if data["title"] not in allowed_titles:
        failed("B1 title enum", f"'{data['title']}' not in {allowed_titles}")
        return
    passed(f"B1 title OK: {data['title']}")

    if not isinstance(data["emoji"], str) or len(data["emoji"]) < 1:
        failed("B1 emoji", f"'{data['emoji']}'")
        return
    passed(f"B1 emoji OK: {data['emoji']}")

    if not isinstance(data["badges_count"], int) or data["badges_count"] < 0:
        failed("B1 badges_count", f"got {data['badges_count']}")
        return
    passed(f"B1 badges_count OK: {data['badges_count']}")

    code = data["code"]
    if not isinstance(code, str) or not code:
        failed("B1 code", f"'{code}'")
        return
    passed(f"B1 code OK: {code}")

    share_text = data["share_text"]
    if str(score) not in share_text or code not in share_text:
        failed("B1 share_text contains score+code", f"score={score} code={code} text={share_text!r}")
        return
    if not re.search(r"https?://\S+", share_text):
        failed("B1 share_text contains URL", f"{share_text!r}")
        return
    passed("B1 share_text contains score, code, and URL")

    ig = data["ig_story_text"]
    if "Money Score:" not in ig or str(score) not in ig:
        failed("B1 ig_story_text", f"'{ig}'")
        return
    passed(f"B1 ig_story_text OK: '{ig}'")

    if data["whatsapp_text"] != share_text:
        failed("B1 whatsapp_text == share_text", "differs")
        return
    passed("B1 whatsapp_text == share_text")

    g = data["gradient"]
    if not isinstance(g, list) or len(g) != 2 or not all(isinstance(c, str) and c.startswith("#") and len(c) == 7 for c in g):
        failed("B1 gradient", f"got {g}")
        return
    passed(f"B1 gradient OK: {g}")

    # B2 — Title-score sanity
    s = score
    if s >= 85:
        expected = "Money Master"
    elif s >= 70:
        expected = "Money Pro"
    elif s >= 50:
        expected = "Getting Better"
    else:
        expected = "Just Starting"
    if data["title"] != expected:
        failed("B2 title<->score mapping", f"score={s} expected '{expected}' got '{data['title']}'")
        return
    passed(f"B2 title<->score mapping OK: score={s} -> '{expected}'")


# ---------- REGRESSION ----------
def test_regression(token):
    print("\n=== REGRESSION — existing referral endpoints ===")
    status_ok = False
    for ep in ("/referral/status", "/referral/my-code"):
        try:
            time.sleep(8)
            r = get_with_retry(f"{BASE}{ep}", token)
            if r.status_code == 200:
                passed(f"REG GET {ep} → 200")
                status_ok = True
                break
            else:
                log("INFO", f"REG GET {ep} → {r.status_code}")
        except Exception as e:
            log("INFO", f"REG GET {ep} error: {e}")
    if not status_ok:
        failed("REG /referral/status or /my-code", "neither returned 200")

    time.sleep(8)
    r = get_with_retry(f"{BASE}/referral/enhanced-status", token)
    if r.status_code == 200:
        passed("REG GET /referral/enhanced-status → 200")
    else:
        failed("REG enhanced-status", f"{r.status_code} {r.text[:200]}")

    time.sleep(8)
    r = get_with_retry(f"{BASE}/referral/leaderboard", token)
    if r.status_code == 200:
        passed("REG GET /referral/leaderboard → 200")
    else:
        failed("REG leaderboard", f"{r.status_code} {r.text[:200]}")


def check_backend_logs():
    print("\n=== Backend log sweep for NameError/ImportError ===")
    import subprocess
    try:
        res = subprocess.run(
            ["bash", "-c", "tail -n 500 /var/log/supervisor/backend.err.log 2>/dev/null | grep -E 'NameError|ImportError|AttributeError' | tail -n 30"],
            capture_output=True, text=True, timeout=10,
        )
        errs = res.stdout.strip()
        if errs:
            log("INFO", f"Errors in backend.err.log (may be pre-existing):\n{errs}")
        else:
            log("INFO", "No NameError/ImportError/AttributeError in recent backend.err.log")
    except Exception as e:
        log("INFO", f"log check failed: {e}")


if __name__ == "__main__":
    print(f"BASE URL: {BASE}")
    token = login()
    test_fomo_feed(token)
    test_money_score_card(token)
    test_regression(token)
    check_backend_logs()
    print("\n" + "=" * 60)
    print(f"TOTAL PASS: {results['pass']}   TOTAL FAIL: {results['fail']}")
    if results["issues"]:
        print("ISSUES:")
        for x in results["issues"]:
            print(f"  - {x}")
    sys.exit(0 if results["fail"] == 0 else 1)
