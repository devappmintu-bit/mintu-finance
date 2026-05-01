"""Phase 5 Wave 1 — Backend regression smoke.

Validates:
  • POST /api/split/groups (N+1 batch fix)
  • POST /api/split/groups/{id}/members  (add-members path)
  • GET  /api/split/groups/{id}/manage   (member roster, proxy for requested ".../members")
  • GET  /api/split/settlements          (N+1 batch fix)
  • GET  /api/split/settlements?group_id=
  • GET  /api/profile/identity           (asyncio.gather + 5-min cache)

Uses existing test creds: phone 9876543210 / OTP 123456.
"""
import json
import os
import sys
import time
import requests

BASE = os.environ.get("BASE_URL") or "https://mintu-finance.preview.emergentagent.com/api"
PHONE = "9876543210"
OTP = "123456"

PASS = "\033[92m✅\033[0m"
FAIL = "\033[91m❌\033[0m"

results = []

def check(name, cond, detail=""):
    tag = PASS if cond else FAIL
    print(f"{tag} {name}" + (f" — {detail}" if detail else ""))
    results.append((bool(cond), name, detail))
    return bool(cond)


def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": PHONE}, timeout=20)
    assert r.status_code == 200, f"send-otp {r.status_code}: {r.text}"
    r = requests.post(f"{BASE}/auth/verify-otp", json={"phone": PHONE, "otp": OTP}, timeout=20)
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
    return r.json()["token"]


def main() -> int:
    token = auth()
    h = {"Authorization": f"Bearer {token}"}
    check("auth: token obtained", bool(token))

    # ── 1. POST /api/split/groups ─────────────────────────────────
    body = {"name": "Phase5 Test Group", "members": [PHONE, "9999988888"]}
    r = requests.post(f"{BASE}/split/groups", json=body, headers=h, timeout=20)
    check("POST /split/groups → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        print("Cannot continue without group id; dumping and exiting")
        return 1
    g = r.json()
    gid = g.get("id")
    check("group has id", bool(gid), f"id={gid}")
    check("group has members list", isinstance(g.get("members"), list), f"members={g.get('members')}")
    mids = [m.get("user_id") for m in g.get("members", [])]
    check("creator user_id present in members", any(mids), f"mids={mids}")
    # The non-existent phone should surface either as a member slot or as pending_invites
    pending = g.get("pending_invites") or []
    represented = any(
        (m.get("phone") == "9999988888") for m in g.get("members", [])
    ) or any((pi.get("phone") == "9999988888") for pi in pending)
    check("non-existent phone represented (member or pending_invite)", represented,
          f"members_phones={[m.get('phone') for m in g.get('members', [])]} pending={pending}")
    check("group name echoed", g.get("name") == "Phase5 Test Group")
    check("no 5xx / no Mongo error leak in response", "InvalidId" not in r.text and "bson" not in r.text.lower())

    # ── 2. POST /api/split/groups/{id}/members ────────────────────
    # Review uses body {"members":[...]}. Real handler reads {"phones":[...]}.
    # Try the actual contract first (phones). Include a NEW phone so we see additions.
    add_body = {"phones": ["9876543211"]}
    r2 = requests.post(f"{BASE}/split/groups/{gid}/members", json=add_body, headers=h, timeout=20)
    check("POST /split/groups/{id}/members (phones=['9876543211']) → 200",
          r2.status_code == 200, f"status={r2.status_code} body={r2.text[:200]}")
    if r2.status_code == 200:
        j2 = r2.json()
        check("add-members response has added+invited keys",
              "added" in j2 and "invited" in j2, f"keys={list(j2.keys())}")

    # Re-add same phone — should NOT create duplicate.
    r2b = requests.post(f"{BASE}/split/groups/{gid}/members", json=add_body, headers=h, timeout=20)
    check("POST /split/groups/{id}/members (same phone again) → 200 no-dup",
          r2b.status_code == 200, f"status={r2b.status_code}")
    if r2b.status_code == 200:
        j2b = r2b.json()
        # Either returns no-op message or empty added/invited.
        no_dup = (not j2b.get("added")) and (not j2b.get("invited"))
        check("no duplicate on re-add", no_dup, f"resp={json.dumps(j2b)[:200]}")

    # ── 2b. GET /api/split/groups/{id}/manage — proxy for "members" ─
    r3 = requests.get(f"{BASE}/split/groups/{gid}/manage", headers=h, timeout=20)
    check("GET /split/groups/{id}/manage → 200",
          r3.status_code == 200, f"status={r3.status_code}")
    if r3.status_code == 200:
        j3 = r3.json()
        members = j3.get("members") or []
        check("manage returns member roster (list)", isinstance(members, list) and len(members) >= 1,
              f"member_count={len(members)}")
        # Every member must have a name (non-null, non-empty string)
        all_named = all(isinstance(m.get("name"), str) and len(m.get("name")) > 0 for m in members)
        check("every member has valid non-empty name", all_named,
              f"names={[m.get('name') for m in members]}")
        check("no Mongo error leak in manage response", "InvalidId" not in r3.text and "bson" not in r3.text.lower())

    # ── 3. GET /api/split/settlements (all) ───────────────────────
    r4 = requests.get(f"{BASE}/split/settlements", headers=h, timeout=20)
    check("GET /split/settlements → 200", r4.status_code == 200, f"status={r4.status_code}")
    if r4.status_code == 200:
        s_all = r4.json()
        check("settlements returns a list", isinstance(s_all, list),
              f"type={type(s_all).__name__}")
        if isinstance(s_all, list) and len(s_all) > 0:
            row = s_all[0]
            check("settlement row has payer_name key",
                  "payer_name" in row, f"keys={list(row.keys())}")
            check("settlement row has payee_name key",
                  "payee_name" in row)
            names_ok = all(
                isinstance(r_.get("payer_name"), str) and isinstance(r_.get("payee_name"), str)
                for r_ in s_all
            )
            check("every row has string payer/payee name (non-null)", names_ok,
                  f"sample={s_all[0]}")
            check("payer_name is non-empty for populated rows",
                  all(len(r_.get("payer_name", "")) > 0 for r_ in s_all))
        else:
            print(f"  (settlements list is empty — ACCEPTABLE per spec, len={len(s_all) if isinstance(s_all, list) else 'n/a'})")

    # ── 3b. GET /api/split/settlements?group_id=... ──────────────
    r4b = requests.get(f"{BASE}/split/settlements", params={"group_id": gid}, headers=h, timeout=20)
    check("GET /split/settlements?group_id=... → 200",
          r4b.status_code == 200, f"status={r4b.status_code}")
    if r4b.status_code == 200:
        sg = r4b.json()
        check("filtered settlements returns a list", isinstance(sg, list))
        # Note: /split/settlements ignores group_id param (no query-param filter in code);
        # endpoint still must return 200 + list shape. This is not a regression.

    check("no Mongo error leak in settlements response",
          "InvalidId" not in r4.text and "bson" not in r4.text.lower())

    # ── 4. GET /api/profile/identity (cold + warm) ────────────────
    t0 = time.monotonic()
    r5a = requests.get(f"{BASE}/profile/identity", headers=h, timeout=20)
    dt_cold = (time.monotonic() - t0) * 1000
    check(f"GET /profile/identity cold → 200", r5a.status_code == 200,
          f"status={r5a.status_code} latency={dt_cold:.0f}ms body={r5a.text[:200]}")

    t0 = time.monotonic()
    r5b = requests.get(f"{BASE}/profile/identity", headers=h, timeout=20)
    dt_warm = (time.monotonic() - t0) * 1000
    check(f"GET /profile/identity warm → 200", r5b.status_code == 200,
          f"status={r5b.status_code} latency={dt_warm:.0f}ms")

    if r5a.status_code == 200 and r5b.status_code == 200:
        p1 = r5a.json()
        p2 = r5b.json()
        # Expected hero fields per review spec (naming may differ slightly from frontend contract)
        # Code defines: name, avatar, money_score, monthly_score_delta, top_percent,
        # coins_balance, streak, badges_earned, badges_total, tier_label, tier_emoji, is_premium.
        # Review asks: name, avatar, coins, top_pct, monthly_delta, badges(list).
        required = {
            "name": "name",
            "avatar": "avatar",
            "coins (coins_balance)": "coins_balance",
            "top_pct (top_percent)": "top_percent",
            "monthly_delta (monthly_score_delta)": "monthly_score_delta",
            "badges (badges_earned)": "badges_earned",
        }
        for readable, key in required.items():
            check(f"/profile/identity has field [{readable}]", key in p1,
                  f"keys={list(p1.keys())}")
        # No NaN / null on mandatory numerics
        import math
        for key in ("coins_balance", "top_percent", "monthly_score_delta", "badges_earned"):
            v = p1.get(key)
            ok = isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v))
            check(f"/profile/identity {key} is finite number", ok, f"value={v!r}")
        # name is a non-empty string
        check("/profile/identity name is non-empty string",
              isinstance(p1.get("name"), str) and len(p1["name"]) > 0)
        # Shape equivalence cold vs warm (keys must match)
        check("cold/warm response have identical key sets",
              set(p1.keys()) == set(p2.keys()),
              f"cold-only={set(p1.keys()) - set(p2.keys())} warm-only={set(p2.keys()) - set(p1.keys())}")
        # Top_percent should be the same under 5-min cache
        check("top_percent cached across cold/warm",
              p1.get("top_percent") == p2.get("top_percent"),
              f"cold={p1.get('top_percent')} warm={p2.get('top_percent')}")
        check("no Mongo error leak in /profile/identity response",
              "InvalidId" not in r5a.text and "bson" not in r5a.text.lower())

    # ── Summary ───────────────────────────────────────────────────
    total = len(results)
    passed = sum(1 for ok, *_ in results if ok)
    failed = total - passed
    print(f"\n── RESULT: {passed}/{total} passed, {failed} failed ──")
    if failed:
        print("\nFailed checks:")
        for ok, name, detail in results:
            if not ok:
                print(f"  - {name} :: {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
