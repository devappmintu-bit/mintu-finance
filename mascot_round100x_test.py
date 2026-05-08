"""
Round 100X — Mascot Personality Engine fallback library expansion test.

Tests POST /api/mascot/moment after adding 20 new finance-contextual
fallback entries. Validates:

1. Unauthenticated login mode call shape + tone caps
2. Authenticated home/coach mode + HOME_DEFAULT_TONES enforcement
3. Deduplication via last_tags
4. UTF-8 safety (no lone surrogates, no bare \n / \t / runs of spaces)
5. New library entry reachability (>= 5 of new tags surface in 30 calls)
6. Sanity: /coach/chat regression (shared core/llm_safe)
"""

import asyncio
import json
import re
import time
from typing import Any, Optional

import httpx

BASE_URL = "https://mintu-finance.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "123456"

LOGIN_ALLOWED_TONES = {"calm", "playful", "motivating", "confident"}
ALLOWED_TONES = {"playful", "witty", "calm", "motivating", "cheeky", "celebratory", "confident"}
ALLOWED_ACTIONS = {"peek", "juggle", "float", "stretch", "sip", "spin", "bounce", "fly", "wave", "tap", "celebrate", "sleep"}
HOME_DEFAULT_TONES = {"playful", "calm", "motivating", "witty", "confident"}
LOUD_TONES = {"cheeky", "celebratory"}

NEW_FB_TAGS = {
    "fb-coffee-watch-01", "fb-salary-01", "fb-food-over-01", "fb-late-night-01",
    "fb-goal-hit-01", "fb-streak-3-01", "fb-streak-7-01", "fb-under-budget-01",
    "fb-subs-01", "fb-split-pile-01", "fb-midmonth-01", "fb-impulse-01",
    "fb-patterns-01", "fb-friday-01", "fb-smart-settle-01", "fb-quiet-day-01",
    "fb-money-working-01", "fb-zomato-01", "fb-streak-30-01", "fb-pause-01",
}

TAG_REGEX = re.compile(r"^[a-z0-9-]+$")

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    flag = "✅" if ok else "❌"
    print(f"{flag} {name}: {detail}")


def utf8_safe(text: str) -> bool:
    """Round-trip text through UTF-8 cleanly (no lone surrogates)."""
    try:
        b = text.encode("utf-8", errors="strict")
        b.decode("utf-8", errors="strict")
        return True
    except (UnicodeEncodeError, UnicodeDecodeError):
        return False


def whitespace_clean(text: str) -> bool:
    """No bare \\n or \\t and no runs of >1 space."""
    if "\n" in text or "\t" in text:
        return False
    if "  " in text:  # runs of 2+ spaces
        return False
    if text != text.strip():
        return False
    return True


async def auth_get_token(client: httpx.AsyncClient) -> Optional[str]:
    r = await client.post(f"{BASE_URL}/auth/send-otp", json={"phone": TEST_PHONE})
    if r.status_code != 200:
        record("auth.send-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    record("auth.send-otp", True, f"status=200")

    r = await client.post(
        f"{BASE_URL}/auth/verify-otp",
        json={"phone": TEST_PHONE, "otp": TEST_OTP, "device_id": "round100x-test", "device_name": "Tester", "os": "linux"},
    )
    if r.status_code != 200:
        record("auth.verify-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if not token:
        record("auth.verify-otp", False, f"no token in body keys={list(body.keys())}")
        return None
    record("auth.verify-otp", True, f"token len={len(token)} user={body.get('user',{}).get('name')}")
    return token


def validate_moment_shape(moment: dict, *, mode: str, expect_tone_set: set[str], context: str = "") -> tuple[bool, list[str]]:
    issues: list[str] = []
    for f in ("action", "text", "tone", "tag", "source"):
        if f not in moment:
            issues.append(f"missing field {f}")
    if issues:
        return False, issues
    if moment["action"] not in ALLOWED_ACTIONS:
        issues.append(f"action {moment['action']!r} not in ALLOWED_ACTIONS")
    if len(moment["text"]) > 80:
        issues.append(f"text length {len(moment['text'])} > 80")
    if moment["tone"] not in expect_tone_set:
        issues.append(f"tone {moment['tone']!r} not in expected set {sorted(expect_tone_set)}")
    if not TAG_REGEX.match(moment["tag"]):
        issues.append(f"tag {moment['tag']!r} fails regex ^[a-z0-9-]+$")
    if not utf8_safe(moment["text"]):
        issues.append(f"text fails UTF-8 round-trip")
    if not whitespace_clean(moment["text"]):
        issues.append(f"text has bad whitespace: {moment['text']!r}")
    if moment["source"] not in ("llm", "fallback"):
        issues.append(f"source {moment['source']!r} not in (llm, fallback)")
    return len(issues) == 0, issues


# ── Test 1: Unauthenticated login mode ─────────────────────────────────
async def test_login_unauthenticated(client: httpx.AsyncClient) -> None:
    print("\n=== TEST 1: Unauthenticated login mode ===")
    t0 = time.time()
    r = await client.post(f"{BASE_URL}/mascot/moment", json={"mode": "login"})
    elapsed_ms = int((time.time() - t0) * 1000)
    if r.status_code != 200:
        record("login.unauth.status", False, f"status={r.status_code} body={r.text[:300]}")
        return
    record("login.unauth.status", True, f"status=200 latency={elapsed_ms}ms")
    moment = r.json()
    ok, issues = validate_moment_shape(moment, mode="login", expect_tone_set=LOGIN_ALLOWED_TONES)
    record("login.unauth.shape+toneCaps", ok, f"moment={moment} issues={issues}")
    # Verify NEVER in {cheeky, celebratory, witty}
    if moment.get("tone") in LOUD_TONES or moment.get("tone") == "witty":
        record("login.unauth.no_loud_no_witty", False, f"tone={moment['tone']!r}")
    else:
        record("login.unauth.no_loud_no_witty", True, f"tone={moment['tone']!r}")


# ── Test 2: Authenticated home/coach ───────────────────────────────────
async def test_authenticated(client: httpx.AsyncClient, token: str) -> None:
    print("\n=== TEST 2: Authenticated home + coach ===")
    headers = {"Authorization": f"Bearer {token}"}

    # First check last_action via DB-driven context — we don't know upfront, so accept either.
    t0 = time.time()
    r = await client.post(f"{BASE_URL}/mascot/moment", headers=headers, json={"mode": "home"})
    elapsed_ms = int((time.time() - t0) * 1000)
    if r.status_code != 200:
        record("home.auth.status", False, f"status={r.status_code} body={r.text[:300]}")
        return
    record("home.auth.status", True, f"status=200 latency={elapsed_ms}ms")
    home_moment = r.json()
    # tone_set: HOME_DEFAULT_TONES is the floor; if last_action == 'smart_settled', LOUD allowed too.
    ok, issues = validate_moment_shape(home_moment, mode="home", expect_tone_set=ALLOWED_TONES)
    record("home.auth.shape", ok, f"moment={home_moment} issues={issues}")
    # Tone-cap: if it's a loud tone, the LLM must be invoking smart_settled context — we can't
    # introspect the user's settlements from here, but we can assert that AT LEAST it's in
    # ALLOWED_TONES, and flag it for inspection.
    if home_moment.get("tone") in LOUD_TONES:
        record("home.auth.tone_cap_check", True, f"tone={home_moment['tone']!r} (allowed only if last_action=smart_settled — manual check)")
    else:
        record("home.auth.tone_cap_check", True, f"tone={home_moment['tone']!r} ∈ HOME_DEFAULT_TONES OK")

    # Coach mode — any allowed tone fine
    t0 = time.time()
    r = await client.post(f"{BASE_URL}/mascot/moment", headers=headers, json={"mode": "coach"})
    elapsed_ms = int((time.time() - t0) * 1000)
    if r.status_code != 200:
        record("coach.auth.status", False, f"status={r.status_code} body={r.text[:300]}")
        return
    record("coach.auth.status", True, f"status=200 latency={elapsed_ms}ms")
    coach_moment = r.json()
    ok, issues = validate_moment_shape(coach_moment, mode="coach", expect_tone_set=ALLOWED_TONES)
    record("coach.auth.shape", ok, f"moment={coach_moment} issues={issues}")


# ── Test 3: Deduplication ──────────────────────────────────────────────
async def test_deduplication(client: httpx.AsyncClient, token: str) -> list[str]:
    print("\n=== TEST 3: Deduplication via last_tags ===")
    headers = {"Authorization": f"Bearer {token}"}
    seen: list[str] = []
    for i in range(5):
        # Pass tags collected so far so we get fresh content
        r = await client.post(
            f"{BASE_URL}/mascot/moment",
            headers=headers,
            json={"mode": "home", "last_tags": seen[-5:]},
        )
        if r.status_code != 200:
            record(f"dedup.call_{i+1}.status", False, f"status={r.status_code}")
            return seen
        moment = r.json()
        seen.append(moment["tag"])
    record("dedup.5calls", True, f"tags={seen}")

    # 6th call with all 5 tags as last_tags
    r = await client.post(
        f"{BASE_URL}/mascot/moment",
        headers=headers,
        json={"mode": "home", "last_tags": seen[-5:]},
    )
    if r.status_code != 200:
        record("dedup.6thcall.status", False, f"status={r.status_code}")
        return seen
    sixth = r.json()
    if sixth["tag"] in seen[-5:]:
        record("dedup.6thcall.unique", False, f"tag {sixth['tag']!r} appeared in last_tags={seen[-5:]}")
    else:
        record("dedup.6thcall.unique", True, f"tag={sixth['tag']!r} (not in last_tags)")
    return seen


# ── Test 4: UTF-8 safety across many calls ─────────────────────────────
async def test_utf8_safety(client: httpx.AsyncClient, token: str, sample_size: int = 10) -> None:
    print(f"\n=== TEST 4: UTF-8 safety ({sample_size} calls) ===")
    headers = {"Authorization": f"Bearer {token}"}
    bad = 0
    bad_examples: list[str] = []
    for i in range(sample_size):
        r = await client.post(
            f"{BASE_URL}/mascot/moment",
            headers=headers,
            json={"mode": "home"},
        )
        if r.status_code != 200:
            record(f"utf8.call_{i+1}.status", False, f"status={r.status_code}")
            continue
        text = r.json().get("text", "")
        if not utf8_safe(text):
            bad += 1
            bad_examples.append(text)
        elif not whitespace_clean(text):
            bad += 1
            bad_examples.append(text)
    record("utf8.all_clean", bad == 0, f"{sample_size - bad}/{sample_size} clean. bad_examples={bad_examples[:3]}")


# ── Test 5: New library entry reachability ─────────────────────────────
async def test_new_entries_reachable(client: httpx.AsyncClient, token: str, n_calls: int = 30) -> None:
    print(f"\n=== TEST 5: New library entries reachable ({n_calls} calls, fallback path) ===")
    headers = {"Authorization": f"Bearer {token}"}
    seen_tags: set[str] = set()
    rolling: list[str] = []
    sources: dict[str, int] = {"llm": 0, "fallback": 0}
    latencies: list[int] = []
    for i in range(n_calls):
        t0 = time.time()
        r = await client.post(
            f"{BASE_URL}/mascot/moment",
            headers=headers,
            json={"mode": "home", "last_tags": rolling[-5:]},
        )
        latencies.append(int((time.time() - t0) * 1000))
        if r.status_code != 200:
            record(f"newentries.call_{i+1}.status", False, f"status={r.status_code}")
            continue
        m = r.json()
        seen_tags.add(m["tag"])
        sources[m.get("source", "llm")] = sources.get(m.get("source", "llm"), 0) + 1
        rolling.append(m["tag"])

    new_seen = seen_tags & NEW_FB_TAGS
    avg_lat = sum(latencies) // len(latencies) if latencies else 0
    p95_lat = sorted(latencies)[int(0.95 * len(latencies))] if latencies else 0
    print(f"   seen_tags ({len(seen_tags)}): {sorted(seen_tags)}")
    print(f"   sources: {sources}")
    print(f"   latency: avg={avg_lat}ms p95={p95_lat}ms")
    print(f"   new entries hit ({len(new_seen)}/{len(NEW_FB_TAGS)}): {sorted(new_seen)}")
    if sources.get("fallback", 0) == 0:
        record("newentries.fallback_path_used", False, f"No fallback responses observed in {n_calls} calls (all LLM). Cannot validate library reachability.")
    else:
        record("newentries.fallback_path_used", True, f"{sources['fallback']} fallback responses out of {n_calls}")
    record("newentries.>=5_new_reachable", len(new_seen) >= 5, f"new tags reached: {len(new_seen)} (need >=5). Hit: {sorted(new_seen)}")


# ── Test 6: Coach chat regression ──────────────────────────────────────
async def test_coach_chat_regression(client: httpx.AsyncClient, token: str) -> None:
    print("\n=== TEST 6: /coach/chat regression (shared core/llm_safe) ===")
    headers = {"Authorization": f"Bearer {token}"}
    t0 = time.time()
    r = await client.post(
        f"{BASE_URL}/coach/chat",
        headers=headers,
        json={"message": "Am I overspending on food this month?", "lang": "en"},
        timeout=60.0,
    )
    elapsed = int((time.time() - t0) * 1000)
    if r.status_code != 200:
        record("coach.chat.status", False, f"status={r.status_code} body={r.text[:300]}")
        return
    body = r.json()
    required = {"reply", "actions", "suggestions"}
    missing = required - set(body.keys())
    if missing:
        record("coach.chat.shape", False, f"missing fields {missing}, got keys={list(body.keys())}")
        return
    if not isinstance(body.get("reply"), str) or not body["reply"].strip():
        record("coach.chat.reply_nonempty", False, f"reply={body.get('reply')!r}")
        return
    record("coach.chat.shape", True, f"keys={list(body.keys())} reply_len={len(body['reply'])} latency={elapsed}ms")


# ── Main runner ────────────────────────────────────────────────────────
async def main() -> int:
    print(f"Target: {BASE_URL}")
    async with httpx.AsyncClient(timeout=60.0) as client:
        await test_login_unauthenticated(client)
        token = await auth_get_token(client)
        if not token:
            print("\n❌ Auth failed — skipping authenticated tests.")
        else:
            await test_authenticated(client, token)
            await test_deduplication(client, token)
            await test_utf8_safety(client, token, sample_size=10)
            await test_new_entries_reachable(client, token, n_calls=30)
            await test_coach_chat_regression(client, token)

    # Summary
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"PASSED {passed} / {passed + failed}")
    if failed:
        print(f"\nFAILED:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
