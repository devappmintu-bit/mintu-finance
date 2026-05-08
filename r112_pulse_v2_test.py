"""R112 — Money Pulse v2 next-sprint additions verification.

Tests:
  1. AUTH guards (401 without token) on /trending and /daily-brief
  2. /refresh-now still works; new sources may surface in by_source
  3. /trending shape + sort + engagement keys
  4. /daily-brief shape + date + repeat-suppression
  5. Reaction-driven ranking on /feed (no category)
  6. LLM personal_impact sanity (no [ACTION: marker, <=200 chars)
  7. /feed unchanged 13-keys-per-article smoke
"""
from __future__ import annotations
import json
import sys
import time
from datetime import datetime, timezone

import httpx

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

PASS, FAIL, SKIP = 0, 0, 0
results: list[str] = []


def ok(msg: str):
    global PASS
    PASS += 1
    results.append(f"  ✅ {msg}")


def bad(msg: str):
    global FAIL
    FAIL += 1
    results.append(f"  ❌ {msg}")


def skip(msg: str):
    global SKIP
    SKIP += 1
    results.append(f"  ⚠️  SKIP: {msg}")


def section(title: str):
    results.append(f"\n=== {title} ===")
    print(f"\n=== {title} ===", flush=True)


def login() -> str:
    with httpx.Client(timeout=180.0) as c:
        r = c.post(f"{BASE}/auth/send-otp", json={"phone": PHONE})
        assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
        r = c.post(
            f"{BASE}/auth/verify-otp",
            json={
                "phone": PHONE,
                "otp": OTP,
                "device_id": "r112-test",
                "device_name": "r112-cli",
                "os": "linux",
            },
        )
        assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
        return r.json()["access_token"]


REQ_FEED_KEYS = {
    "id", "url", "source", "verified", "category", "headline",
    "explainer", "generic_impact", "sentiment", "emoji",
    "published_at", "personal_impact", "reaction",
}
REQ_TRENDING_EXTRA = {"trending_score", "engagement"}


def t1_auth_guards():
    section("T1 — AUTH guards (no bearer)")
    with httpx.Client(timeout=180.0) as c:
        r = c.get(f"{BASE}/pulse/v2/trending")
        if r.status_code == 401:
            ok(f"GET /pulse/v2/trending → 401")
        else:
            bad(f"GET /pulse/v2/trending expected 401, got {r.status_code}: {r.text[:200]}")
        r = c.get(f"{BASE}/pulse/v2/daily-brief")
        if r.status_code == 401:
            ok(f"GET /pulse/v2/daily-brief → 401")
        else:
            bad(f"GET /pulse/v2/daily-brief expected 401, got {r.status_code}: {r.text[:200]}")


def t2_refresh_now(token: str):
    section("T2 — POST /refresh-now extended sources")
    h = {"Authorization": f"Bearer {token}"}
    new_sources = {"LiveMint Markets", "ET Markets", "SEBI", "NSE"}
    seen_new: set[str] = set()
    bodies = []
    with httpx.Client(timeout=180.0) as c:
        for i in (1, 2):
            r = c.post(f"{BASE}/pulse/v2/refresh-now", headers=h)
            if r.status_code != 200:
                bad(f"call#{i} refresh-now status={r.status_code} body={r.text[:200]}")
                return
            body = r.json()
            bodies.append(body)
            keys = set(body.keys())
            need = {"inserted", "skipped_dup", "by_source", "elapsed_ms"}
            if need.issubset(keys):
                ok(f"call#{i} 200 + 4 required keys (inserted={body['inserted']}, dup={body['skipped_dup']})")
            else:
                bad(f"call#{i} missing keys: {need - keys}")
            for src in body.get("by_source", {}):
                if src in new_sources:
                    seen_new.add(src)
    if seen_new:
        ok(f"NEW sources surfaced across calls: {sorted(seen_new)}")
    else:
        # Tolerate: many 0-insert calls if pool fully deduped or RSS-blocked
        all_inserted_zero = all(b.get("inserted", 0) == 0 for b in bodies)
        if all_inserted_zero:
            skip(f"No new outlets seen (all calls inserted=0 — pool already deduped). by_source={[b.get('by_source') for b in bodies]}")
        else:
            skip(f"No new outlets surfaced (may be RSS-blocked). by_source samples={[b.get('by_source') for b in bodies]}")


def t3_trending(token: str):
    section("T3 — GET /trending")
    h = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=180.0) as c:
        r = c.get(f"{BASE}/pulse/v2/trending?limit=10", headers=h)
    if r.status_code != 200:
        bad(f"trending status={r.status_code} body={r.text[:200]}")
        return None
    body = r.json()
    if "articles" in body and "count" in body:
        ok("200 with {articles, count}")
    else:
        bad(f"missing keys: have {list(body.keys())}")
        return None
    if "profile" not in body:
        ok("no `profile` block (correct for trending)")
    else:
        bad(f"unexpected `profile` block in trending: {body.get('profile')}")
    arts = body["articles"]
    if body["count"] == len(arts):
        ok(f"count == len(articles) == {body['count']}")
    else:
        bad(f"count={body['count']} but len(articles)={len(arts)}")
    if not arts:
        skip("trending pool empty — cannot verify article keys / sort")
        return body
    # Note: trending may not include `reaction` field. Check standard keys minus reaction
    standard_no_reaction = REQ_FEED_KEYS - {"reaction"}
    sample = arts[0]
    miss = standard_no_reaction - set(sample.keys())
    if not miss:
        ok(f"first article carries all standard keys (minus reaction)")
    else:
        bad(f"first article missing keys: {miss}; have={list(sample.keys())}")
    extra_miss = REQ_TRENDING_EXTRA - set(sample.keys())
    if not extra_miss:
        ok("first article has trending_score + engagement")
    else:
        bad(f"first article missing trending extras: {extra_miss}")
    if isinstance(sample.get("trending_score"), (int, float)):
        ok(f"trending_score is number = {sample['trending_score']}")
    else:
        bad(f"trending_score wrong type: {type(sample.get('trending_score'))}")
    eng = sample.get("engagement")
    if isinstance(eng, dict) and isinstance(eng.get("likes"), int) and isinstance(eng.get("saves"), int):
        ok(f"engagement={{likes:int, saves:int}} = {eng}")
    else:
        bad(f"engagement shape wrong: {eng}")
    # Sort check
    scores = [a.get("trending_score") for a in arts]
    if all(isinstance(s, (int, float)) for s in scores):
        if scores == sorted(scores, reverse=True):
            ok(f"trending sorted DESC by score: {scores}")
        else:
            bad(f"trending NOT sorted DESC: {scores}")
    return body


def t4_daily_brief(token: str):
    section("T4 — GET /daily-brief")
    h = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=180.0) as c:
        r1 = c.get(f"{BASE}/pulse/v2/daily-brief", headers=h)
        if r1.status_code != 200:
            bad(f"call#1 status={r1.status_code} body={r1.text[:200]}")
            return
        body1 = r1.json()
        need = {"articles", "count", "date", "personalised"}
        if need.issubset(body1.keys()):
            ok(f"call#1 200 + 4 keys")
        else:
            bad(f"call#1 missing keys: {need - set(body1.keys())}")
        arts1 = body1.get("articles", [])
        if len(arts1) <= 5:
            ok(f"call#1 articles.length={len(arts1)} ≤ 5")
        else:
            bad(f"call#1 articles.length={len(arts1)} > 5")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if body1.get("date") == today:
            ok(f"call#1 date == today UTC ({today})")
        else:
            bad(f"call#1 date={body1.get('date')} != today UTC {today}")
        if isinstance(body1.get("personalised"), bool):
            ok(f"personalised is bool = {body1.get('personalised')}")
        else:
            bad(f"personalised not bool: {body1.get('personalised')}")
        # 2nd call — non-overlap check
        ids1 = {a["id"] for a in arts1}
        r2 = c.get(f"{BASE}/pulse/v2/daily-brief", headers=h)
        if r2.status_code != 200:
            bad(f"call#2 status={r2.status_code}")
            return
        body2 = r2.json()
        arts2 = body2.get("articles", [])
        ids2 = {a["id"] for a in arts2}
        overlap = ids1 & ids2
        if not arts1 and not arts2:
            skip("both daily-brief calls empty (cold pool) — non-overlap vacuously holds")
        elif len(overlap) == 0:
            ok(f"call#2 non-overlap with call#1 (call#1={len(ids1)}, call#2={len(ids2)})")
        else:
            # Per spec: tolerate as PASS if overlap <= max(0, 5 - new_articles_available).
            # We approximate "new articles available" by call#2's count.
            tolerance = max(0, 5 - len(ids2))
            if len(overlap) <= tolerance:
                ok(f"call#2 overlap={len(overlap)} ≤ tolerance={tolerance} (small pool)")
            else:
                bad(f"call#2 overlap={len(overlap)} > tolerance={tolerance}; ids1={ids1}, ids2={ids2}")


def t5_reaction_driven_ranking(token: str):
    section("T5 — Reaction-driven ranking on /feed")
    h = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=180.0) as c:
        # First, fetch feed to find an article whose category != 'general'
        r = c.get(f"{BASE}/pulse/v2/feed?limit=30", headers=h)
        if r.status_code != 200:
            bad(f"feed status={r.status_code}")
            return
        arts = r.json().get("articles", [])
        target = next((a for a in arts if a.get("category") and a["category"] != "general"), None)
        if not target:
            skip("No non-general article available in feed pool — cannot test reaction ranking")
            return
        target_cat = target["category"]
        target_id = target["id"]
        # Like it
        r = c.post(
            f"{BASE}/pulse/v2/react",
            headers=h,
            json={"article_id": target_id, "kind": "like"},
        )
        if r.status_code != 200:
            bad(f"react like failed status={r.status_code} body={r.text[:200]}")
            return
        ok(f"liked article {target_id} cat={target_cat}")
        # Re-fetch feed (no category)
        r = c.get(f"{BASE}/pulse/v2/feed?limit=20", headers=h)
        if r.status_code != 200:
            bad(f"feed call#2 status={r.status_code}")
            return
        new_arts = r.json().get("articles", [])
        if len(new_arts) < 5:
            skip(f"feed pool too small ({len(new_arts)}) for reaction-ranking proof")
            return
        first5 = new_arts[:5]
        cats5 = [a.get("category") for a in first5]
        if target_cat in cats5:
            ok(f"reaction-driven boost: '{target_cat}' present in top5={cats5}")
        else:
            # Tolerate within 12h cohort — articles outside cohort can't surface
            bad(f"top5 cats={cats5} did not include liked cat='{target_cat}'")


def t6_llm_personal_impact(token: str):
    section("T6 — LLM personal_impact sanity")
    h = {"Authorization": f"Bearer {token}"}
    inspected = 0
    with httpx.Client(timeout=180.0) as c:
        # Pull from feed and trending
        for ep in ("/pulse/v2/feed?limit=20", "/pulse/v2/trending?limit=10"):
            r = c.get(f"{BASE}{ep}", headers=h)
            if r.status_code != 200:
                continue
            for a in r.json().get("articles", []):
                pi = a.get("personal_impact")
                if not pi:
                    continue
                msg = (pi.get("message") or "").strip()
                if not msg:
                    continue
                inspected += 1
                if "[ACTION:" in msg:
                    bad(f"personal_impact has [ACTION: marker — '{msg[:120]}'")
                    return
                if len(msg) > 200:
                    bad(f"personal_impact message > 200 chars (len={len(msg)}): '{msg[:120]}'")
                    return
    if inspected == 0:
        skip("No non-empty personal_impact messages observed")
    else:
        ok(f"inspected {inspected} personal_impact messages — all clean (no [ACTION:, ≤200 chars)")


def t7_feed_shape(token: str):
    section("T7 — /feed unchanged shape (13 keys per article)")
    h = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=180.0) as c:
        r = c.get(f"{BASE}/pulse/v2/feed?limit=10", headers=h)
    if r.status_code != 200:
        bad(f"feed status={r.status_code}")
        return
    body = r.json()
    if {"articles", "count", "profile"}.issubset(body.keys()):
        ok("feed root keys {articles, count, profile}")
    else:
        bad(f"feed root keys missing: have {list(body.keys())}")
    arts = body.get("articles", [])
    if not arts:
        skip("feed empty; cannot verify per-article keys")
        return
    a0 = arts[0]
    keys = set(a0.keys())
    if keys == REQ_FEED_KEYS and len(keys) == 13:
        ok(f"first article has exactly 13 standard keys")
    else:
        extra = keys - REQ_FEED_KEYS
        miss = REQ_FEED_KEYS - keys
        if not miss and not extra:
            ok(f"first article matches REQ_FEED_KEYS")
        else:
            bad(f"first article keys diff — missing={miss} extra={extra}")


def main():
    print("=" * 70)
    print(f"R112 Money Pulse v2 — {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    # T1 — auth guard FIRST (no token)
    t1_auth_guards()

    # Login for the rest
    try:
        token = login()
        print(f"[login] token len={len(token)}", flush=True)
    except Exception as e:
        bad(f"login failed: {e}")
        token = None
    if not token:
        print("\n".join(results))
        sys.exit(1)

    t2_refresh_now(token)
    t3_trending(token)
    t4_daily_brief(token)
    t5_reaction_driven_ranking(token)
    t6_llm_personal_impact(token)
    t7_feed_shape(token)

    print("\n".join(results))
    print("\n" + "=" * 70)
    print(f"R112 RESULT: PASS={PASS}  FAIL={FAIL}  SKIP={SKIP}")
    print("=" * 70)
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
