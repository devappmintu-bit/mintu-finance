"""
Round 100Q — Verify TWO backend changes:
1) GET /api/missions/current includes last_contribution field
2) AI Coach honest cold-start system prompt
3) Regression sanity (missions derived fields, contribute idempotency, split manage pending_invites)
"""
import asyncio
import json
import time
import uuid

import httpx

BASE = "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9445564707"
OTP = "123456"


async def auth(client: httpx.AsyncClient) -> str:
    r = await client.post(f"{BASE}/auth/send-otp", json={"phone": PHONE})
    print(f"[auth] send-otp → {r.status_code}")
    r = await client.post(
        f"{BASE}/auth/verify-otp",
        json={
            "phone": PHONE,
            "otp": OTP,
            "device_id": "round100q",
            "device_name": "round100q",
            "os": "web",
        },
    )
    r.raise_for_status()
    j = r.json()
    token = j.get("access_token") or j.get("token")
    print(f"[auth] verify-otp → 200, token len={len(token)}")
    return token


async def test_mission_last_contribution(client, token):
    print("\n========== TEST 1: Mission last_contribution ==========")
    h = {"Authorization": f"Bearer {token}"}

    # 1) GET current mission
    r = await client.get(f"{BASE}/missions/current", headers=h)
    print(f"GET /missions/current → {r.status_code}")
    assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:300]}"
    j = r.json()
    assert "mission" in j, f"missing 'mission' key: {j}"
    m = j["mission"]
    if m is None:
        # Need to seed
        print("  No active mission — seeding one for Rajawat...")
        rs = await client.post(f"{BASE}/missions/seed", json={"income_monthly": 60000, "peer_pct": 12}, headers=h)
        print(f"  POST /missions/seed → {rs.status_code} body: {rs.text[:200]}")
        rs.raise_for_status()
        # re-fetch
        r = await client.get(f"{BASE}/missions/current", headers=h)
        j = r.json()
        m = j["mission"]
        assert m is not None, "still no mission after seed"

    print(f"  mission keys: {sorted(m.keys())}")

    # CRITICAL ASSERTIONS
    assert "last_contribution" in m, f"❌ FAIL: 'last_contribution' field missing from mission. Got keys: {sorted(m.keys())}"
    print(f"  ✅ last_contribution field present")

    contributions = m.get("contributions", [])
    print(f"  contributions count: {len(contributions)}")

    last_c = m["last_contribution"]
    if not contributions:
        assert last_c is None, f"❌ contributions empty but last_contribution is {last_c} (expected None)"
        print("  ✅ contributions empty → last_contribution = None")
    else:
        assert last_c is not None, f"❌ contributions non-empty ({len(contributions)}) but last_contribution is None"
        assert isinstance(last_c, dict), f"❌ last_contribution is not a dict: {type(last_c)}"
        print(f"  last_contribution: {last_c}")

        # has keys: amount (number), label (string), ts (string ISO)
        assert "amount" in last_c, f"❌ missing 'amount': {last_c}"
        assert isinstance(last_c["amount"], (int, float)), f"❌ amount not a number: {type(last_c['amount'])}"
        assert "label" in last_c, f"❌ missing 'label': {last_c}"
        assert isinstance(last_c["label"], str), f"❌ label not string: {type(last_c['label'])}"
        assert "ts" in last_c, f"❌ missing 'ts': {last_c}"
        assert isinstance(last_c["ts"], str), f"❌ ts not string: {type(last_c['ts'])}"
        print(f"  ✅ keys (amount,label,ts) all present with correct types")

        # matches latest (newest in contributions[])
        newest = contributions[-1]
        assert float(last_c["amount"]) == float(newest["amount"]), \
            f"❌ amount mismatch: last_contribution={last_c['amount']} vs contributions[-1]={newest['amount']}"
        assert last_c["label"] == newest["label"], \
            f"❌ label mismatch: '{last_c['label']}' vs '{newest['label']}'"
        # ts may or may not be ISO-fied identically; match string content
        newest_ts = newest.get("ts")
        if isinstance(newest_ts, str):
            assert last_c["ts"] == newest_ts, f"❌ ts mismatch: {last_c['ts']} vs {newest_ts}"
        print(f"  ✅ last_contribution matches contributions[-1] (newest)")

    # Also verify the regression sanity fields (progress_pct, gap_amount, days_left)
    for derived_key in ("progress_pct", "gap_amount", "days_left"):
        assert derived_key in m, f"❌ derived field {derived_key} missing"
        assert isinstance(m[derived_key], (int, float)), f"❌ {derived_key} not numeric: {type(m[derived_key])}"
    print(f"  ✅ derived fields present: progress_pct={m['progress_pct']} gap_amount={m['gap_amount']} days_left={m['days_left']}")

    return m


async def test_contribute_idempotency(client, token, mission):
    print("\n========== TEST 3a: POST /missions/contribute idempotency ==========")
    h = {"Authorization": f"Bearer {token}"}
    idem = str(uuid.uuid4())
    body = {"amount": 100, "kind": "manual", "label": "round100q test contribution"}

    r1 = await client.post(f"{BASE}/missions/contribute", json=body,
                           headers={**h, "Idempotency-Key": idem})
    print(f"  1st POST /missions/contribute (idem={idem[:8]}...) → {r1.status_code}")
    assert r1.status_code == 200, f"❌ contribute failed: {r1.status_code} {r1.text[:300]}"
    saved_after_1 = float(r1.json()["mission"]["saved_amount"])

    r2 = await client.post(f"{BASE}/missions/contribute", json=body,
                           headers={**h, "Idempotency-Key": idem})
    print(f"  2nd POST same idem → {r2.status_code}")
    assert r2.status_code == 200, f"❌ replay failed: {r2.status_code}"
    saved_after_2 = float(r2.json()["mission"]["saved_amount"])

    assert saved_after_1 == saved_after_2, \
        f"❌ idempotency violated: saved_amount changed {saved_after_1} → {saved_after_2}"
    print(f"  ✅ idempotent: saved_amount stayed at ₹{saved_after_2:.2f} after replay")

    # Verify last_contribution now matches our test contribution
    m_after = r2.json()["mission"]
    last_c = m_after.get("last_contribution")
    assert last_c is not None, "❌ last_contribution null after contribute"
    assert last_c["label"] == body["label"], f"❌ last_contribution.label != ours: {last_c}"
    assert float(last_c["amount"]) == 100.0
    print(f"  ✅ last_contribution updated to our latest: {last_c}")
    return m_after


async def test_coach_chat(client, token):
    print("\n========== TEST 2: AI Coach honest-system-prompt ==========")
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"message": "What should I do this week?", "lang": "en"}

    t0 = time.time()
    r = await client.post(f"{BASE}/coach/chat", json=body, headers=h, timeout=35.0)
    elapsed = time.time() - t0
    print(f"  POST /coach/chat → {r.status_code} in {elapsed:.1f}s")

    assert r.status_code == 200, f"❌ coach/chat failed: {r.status_code} {r.text[:400]}"
    assert elapsed < 30, f"❌ latency {elapsed:.1f}s exceeds 30s budget"

    j = r.json()
    reply = j.get("reply", "")
    assert isinstance(reply, str) and len(reply) > 0, f"❌ empty reply: {j}"
    print(f"  ✅ reply is non-empty string ({len(reply)} chars)")
    print(f"  --- REPLY START ---\n{reply}\n  --- REPLY END ---")

    # Soft check for peer-claim hallucinations
    peer_hallucination_phrases = [
        "more than 70% of peers",
        "spent more than 70%",
        "70% of peers",
        "compared to peers",
        "you spent more than",
    ]
    rl = reply.lower()
    flagged = [p for p in peer_hallucination_phrases if p in rl]
    if flagged:
        print(f"  ⚠️  POSSIBLE PEER HALLUCINATION: phrases matched = {flagged}")
    else:
        print(f"  ✅ No obvious peer-claim hallucinations detected")

    # Look for hedging language indicating honest cold-start behavior
    hedges = ["new to", "limited", "not enough", "first", "track", "log",
              "based on", "haven't", "don't have", "more data", "just a few"]
    found_hedges = [h for h in hedges if h in rl]
    print(f"  ℹ️  hedge words found: {found_hedges if found_hedges else '(none)'}")

    return reply


async def test_split_manage(client, token):
    print("\n========== TEST 3b: GET /split/groups/{hostel_id}/manage pending_invites with names ==========")
    h = {"Authorization": f"Bearer {token}"}

    # Find Rajawat's groups
    r = await client.get(f"{BASE}/split/groups", headers=h)
    assert r.status_code == 200, f"❌ groups list failed: {r.status_code}"
    groups = r.json()
    print(f"  found {len(groups)} groups")
    if not groups:
        print("  ⚠️  no groups for Rajawat — skipping pending_invites assertion")
        return

    # Pick the known hostel/test group from prior round, or first group
    target = None
    for g in groups:
        gid = g.get("id") or g.get("_id")
        if gid == "69fa3f953562b77b568c507d":
            target = g
            break
    if target is None:
        target = groups[0]

    gid = target.get("id") or target.get("_id")
    print(f"  using group_id={gid} name='{target.get('name')}'")

    r = await client.get(f"{BASE}/split/groups/{gid}/manage", headers=h)
    print(f"  GET /split/groups/{gid}/manage → {r.status_code}")
    assert r.status_code == 200, f"❌ manage failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    assert "pending_invites" in j, f"❌ pending_invites missing: {sorted(j.keys())}"
    pending = j["pending_invites"]
    print(f"  pending_invites count: {len(pending)}")
    for pi in pending[:5]:
        print(f"    - phone={pi.get('phone')} name='{pi.get('name', '')}' invited_at={pi.get('invited_at', '')}")

    # Each item has phone + name (name may be empty string)
    for pi in pending:
        assert "phone" in pi, f"❌ pending invite missing 'phone': {pi}"
        assert "name" in pi, f"❌ pending invite missing 'name': {pi}"
        assert isinstance(pi["name"], str), f"❌ name not string: {pi}"
    print(f"  ✅ All {len(pending)} pending invites have phone+name fields")


async def main():
    async with httpx.AsyncClient(timeout=40.0) as client:
        token = await auth(client)
        m = await test_mission_last_contribution(client, token)
        m_after = await test_contribute_idempotency(client, token, m)
        await test_coach_chat(client, token)
        await test_split_manage(client, token)
        print("\n========== ALL TESTS COMPLETED ==========")


if __name__ == "__main__":
    asyncio.run(main())
