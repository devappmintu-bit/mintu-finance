"""
Backend test for Streak & Coins Bonus Features (Apr 24 2026).

Covers 5 test categories:
  1. Streak Freeze (Premium-gated) - adversarial
  2. Progressive Leaderboard
  3. Weekly/Monthly Bonuses
  4. Admin/Observability Health Endpoint
  5. Regression - existing pytest suites

Auth: phone 9876543210, OTP 123456.

Uses the EXTERNAL public URL from frontend/.env so ingress + middleware
chain are exercised. DB manipulation via sync pymongo using MONGO_URL.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx
import pymongo
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = "https://mintu-finance.preview.emergentagent.com"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "mintu_database")

mongo = pymongo.MongoClient(MONGO_URL)
mdb = mongo[DB_NAME]

results: list = []


def record(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}  {detail}")


RUN_TAG = f"{int(time.time()) % 100000:05d}"


def make_phone(slot: int) -> str:
    return f"9{RUN_TAG}{slot:04d}"


def fresh_user(phone: str, name: str) -> tuple:
    with httpx.Client(base_url=API, timeout=25, verify=True) as c:
        c.post("/auth/send-otp", json={"phone": phone})
        r = c.post(
            "/auth/verify-otp",
            json={"phone": phone, "otp": "123456", "name": name},
        )
        assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
        d = r.json()
        return d["token"], d["user"]["id"]


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def set_premium(user_id: str, months: int = 1):
    mdb.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "premium_tier": "premium",
            "premium_until": datetime.now(timezone.utc) + timedelta(days=30 * months),
            "is_premium": True,
        }},
    )


def set_free(user_id: str):
    mdb.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"premium_tier": "free", "premium_until": None, "is_premium": False}},
    )


def set_streak(user_id: str, *, current: int, last_active_days_ago: int,
               longest=None):
    last_date = (datetime.now(timezone.utc) - timedelta(days=last_active_days_ago)).strftime("%Y-%m-%d")
    update = {
        "streak_current": current,
        "streak_days": current,
        "streak_last_active_date": last_date,
        "streak_longest": longest if longest is not None else max(current, 0),
    }
    mdb.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})


def set_freezes(user_id: str, count: int, month=None):
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    mdb.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "streak_freezes_available": count,
            "streak_freeze_last_refill_month": m,
        }},
    )


def clear_today_ledger(user_id: str):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    keys = [
        f"streak_daily::{user_id}::{today}",
        f"streak_week_bonus::{user_id}::{today}",
        f"streak_month_bonus::{user_id}::{today}",
    ]
    mdb.ledger_transactions.delete_many({"user_id": user_id, "idempotency_key": {"$in": keys}})


# ======================================================================
#  CATEGORY 1 - STREAK FREEZE (PREMIUM)
# ======================================================================
def cat1_streak_freeze():
    print("\n--- CATEGORY 1: STREAK FREEZE (PREMIUM) ---")

    with httpx.Client(base_url=API, timeout=25) as c:
        # 1a. NON-PREMIUM 1-day gap -> reset
        tok, uid = fresh_user(make_phone(201), "FreezeTestFree")
        set_free(uid)
        set_streak(uid, current=5, last_active_days_ago=2, longest=5)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        ok = r.status_code == 200
        j = r.json() if ok else {}
        record(
            "1a. Non-premium 1-day gap resets streak",
            ok and j.get("streak_current") == 1 and j.get("reset") is True
            and j.get("freeze_used") is False,
            f"-> streak={j.get('streak_current')} reset={j.get('reset')} freeze_used={j.get('freeze_used')}",
        )

        # 1b. PREMIUM 1-day gap -> freeze consumed, streak advances
        tok, uid = fresh_user(make_phone(202), "FreezeTestPremium1d")
        set_premium(uid)
        set_freezes(uid, 3)
        set_streak(uid, current=5, last_active_days_ago=2, longest=5)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        ok = r.status_code == 200
        j = r.json() if ok else {}
        u = mdb.users.find_one({"_id": ObjectId(uid)}) or {}
        freezes_after = int(u.get("streak_freezes_available") or 0)
        passed = (
            ok and j.get("streak_current") == 6
            and j.get("reset") is False and j.get("freeze_used") is True
            and freezes_after == 2
        )
        record(
            "1b. Premium 1-day gap: freeze consumed, streak 5->6",
            passed,
            f"-> streak={j.get('streak_current')} freeze_used={j.get('freeze_used')} freezes_after={freezes_after}",
        )

        # 1c. PREMIUM 3-day gap -> still reset
        tok, uid = fresh_user(make_phone(203), "FreezeTestPremium3d")
        set_premium(uid)
        set_freezes(uid, 3)
        set_streak(uid, current=5, last_active_days_ago=4, longest=5)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        ok = r.status_code == 200
        j = r.json() if ok else {}
        u = mdb.users.find_one({"_id": ObjectId(uid)}) or {}
        freezes_after = int(u.get("streak_freezes_available") or 0)
        passed = (
            ok and j.get("streak_current") == 1
            and j.get("reset") is True and j.get("freeze_used") is False
            and freezes_after == 3
        )
        record(
            "1c. Premium 3-day gap: resets, freezes untouched",
            passed,
            f"-> streak={j.get('streak_current')} freeze_used={j.get('freeze_used')} freezes_after={freezes_after}",
        )

        # 1d. PREMIUM fresh month -> freezes refill to 3 on first check-in
        tok, uid = fresh_user(make_phone(204), "FreezeTestRefill")
        set_premium(uid)
        prev_month = (datetime.now(timezone.utc) - timedelta(days=45)).strftime("%Y-%m")
        set_freezes(uid, 0, month=prev_month)
        mdb.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"streak_current": 0, "streak_days": 0,
                      "streak_last_active_date": None, "streak_longest": 0}},
        )
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        ok = r.status_code == 200
        u = mdb.users.find_one({"_id": ObjectId(uid)}) or {}
        freezes_after = int(u.get("streak_freezes_available") or 0)
        last_refill_after = u.get("streak_freeze_last_refill_month")
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        passed = ok and freezes_after == 3 and last_refill_after == current_month
        record(
            "1d. Premium fresh month: freezes refilled to 3",
            passed,
            f"-> freezes={freezes_after} last_refill={last_refill_after}",
        )

        # 1e. Second check-in same month does NOT re-refill
        mdb.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"streak_freezes_available": 1}},
        )
        c.post("/streak/check-in", headers=headers(tok))
        u = mdb.users.find_one({"_id": ObjectId(uid)}) or {}
        freezes_after = int(u.get("streak_freezes_available") or 0)
        passed = freezes_after == 1
        record(
            "1e. Re-check same month does NOT re-refill freezes",
            passed,
            f"-> freezes={freezes_after} (expected 1)",
        )


# ======================================================================
#  CATEGORY 2 - LEADERBOARD
# ======================================================================
def cat2_leaderboard():
    print("\n--- CATEGORY 2: PROGRESSIVE LEADERBOARD ---")
    tok, uid = fresh_user("9876543210", "Test User")
    with httpx.Client(base_url=API, timeout=25) as c:
        # 2a. limit=5
        r = c.get("/streak/leaderboard?limit=5", headers=headers(tok))
        ok = r.status_code == 200
        j = r.json() if ok else {}
        entries = j.get("entries", [])
        has_you = j.get("you") is not None
        record(
            "2a. limit=5 returns <=5 entries + `you`",
            ok and len(entries) <= 5 and has_you,
            f"-> entries={len(entries)} you_present={has_you}",
        )

        # 2b. limit=1000 capped to 200
        r = c.get("/streak/leaderboard?limit=1000", headers=headers(tok))
        j = r.json()
        passed = j.get("limit") == 200 and len(j.get("entries", [])) <= 200
        record(
            "2b. limit=1000 capped to 200",
            passed,
            f"-> limit={j.get('limit')} entries={len(j.get('entries', []))}",
        )

        # 2c. limit=0 clamps to 1
        r = c.get("/streak/leaderboard?limit=0", headers=headers(tok))
        j = r.json()
        passed = j.get("limit") == 1 and len(j.get("entries", [])) == 1
        record(
            "2c. limit=0 clamped to 1",
            passed,
            f"-> limit={j.get('limit')} entries={len(j.get('entries', []))}",
        )

        # 2d. negative limit clamps to 1
        r = c.get("/streak/leaderboard?limit=-50", headers=headers(tok))
        j = r.json()
        record(
            "2d. limit=-50 clamped to 1",
            j.get("limit") == 1,
            f"-> limit={j.get('limit')}",
        )

        # 2e. No auth
        r = c.get("/streak/leaderboard?limit=5")
        passed = r.status_code in (401, 422, 403)
        record(
            "2e. No auth -> 401/422",
            passed,
            f"-> status={r.status_code}",
        )

        # 2f. Required fields + tier mapping
        r = c.get("/streak/leaderboard?limit=20", headers=headers(tok))
        j = r.json()
        entries = j.get("entries", [])
        required = {"rank", "id", "name", "phone_masked", "streak_current",
                    "streak_longest", "money_score", "tier", "tier_emoji",
                    "tier_rank", "is_me"}
        shape_ok = all(required.issubset(set(e.keys())) for e in entries) if entries else True
        mask_ok = all(
            (e["phone_masked"].startswith("***") or e["phone_masked"] == "****")
            for e in entries
        )

        def _expected_tier(d: int) -> str:
            if d >= 100: return "Legend"
            if d >= 50: return "Master"
            if d >= 30: return "Expert"
            if d >= 14: return "Pro"
            if d >= 7: return "Rising"
            if d >= 3: return "Starter"
            return "Rookie"

        tier_ok = all(_expected_tier(e["streak_current"]) == e["tier"] for e in entries)
        record(
            "2f. Each entry: required fields + phone_masked + tier mapping",
            shape_ok and mask_ok and tier_ok,
            f"-> shape={shape_ok} mask={mask_ok} tier={tier_ok} n={len(entries)}",
        )

        # 2g. Sort order
        sorted_ok = all(
            entries[i]["streak_current"] >= entries[i + 1]["streak_current"]
            for i in range(len(entries) - 1)
        )
        tiebreak_ok = True
        for i in range(len(entries) - 1):
            a, b = entries[i], entries[i + 1]
            if a["streak_current"] == b["streak_current"]:
                if a["streak_longest"] < b["streak_longest"]:
                    tiebreak_ok = False
                    break
        record(
            "2g. Sorted by streak DESC (with tiebreak)",
            sorted_ok and tiebreak_ok,
            f"-> sorted={sorted_ok} tiebreak={tiebreak_ok}",
        )

        # 2h. headline + total_users
        passed = "headline" in j and isinstance(j.get("total_users"), int)
        record(
            "2h. headline + total_users present",
            passed,
            f"-> total_users={j.get('total_users')}",
        )

        # 2i. you present when caller not in top 1
        mdb.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"streak_current": 0, "streak_days": 0, "streak_longest": 0}},
        )
        r = c.get("/streak/leaderboard?limit=1", headers=headers(tok))
        j = r.json()
        you = j.get("you")
        entries = j.get("entries", [])
        in_top = any(e.get("is_me") for e in entries)
        passed = you is not None and you.get("is_me") is True
        record(
            "2i. `you` present even when caller not in top N",
            passed,
            f"-> you.rank={you.get('rank') if you else None} in_top={in_top}",
        )


# ======================================================================
#  CATEGORY 3 - BONUSES
# ======================================================================
def cat3_bonuses():
    print("\n--- CATEGORY 3: WEEKLY/MONTHLY BONUSES ---")

    with httpx.Client(base_url=API, timeout=25) as c:
        # 3a. Day 6 -> 7 (weekly bonus = 50, daily = 10)
        tok, uid = fresh_user(make_phone(301), "BonusDay7")
        set_streak(uid, current=6, last_active_days_ago=1, longest=6)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        j = r.json() if r.status_code == 200 else {}
        passed = (
            j.get("streak_current") == 7
            and j.get("milestone_bonus") == 50
            and j.get("coins_awarded") == 60
        )
        record(
            "3a. Day 6->7: milestone=50, coins=60 (10 daily + 50 weekly)",
            passed,
            f"-> streak={j.get('streak_current')} bonus={j.get('milestone_bonus')} coins={j.get('coins_awarded')}",
        )

        # 3b. Day 13 -> 14 (weekly only)
        tok, uid = fresh_user(make_phone(302), "BonusDay14")
        set_streak(uid, current=13, last_active_days_ago=1, longest=13)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        j = r.json()
        passed = (
            j.get("streak_current") == 14
            and j.get("milestone_bonus") == 50
            and j.get("coins_awarded") == 65
        )
        record(
            "3b. Day 13->14: milestone=50 (weekly only)",
            passed,
            f"-> streak={j.get('streak_current')} bonus={j.get('milestone_bonus')} coins={j.get('coins_awarded')}",
        )

        # 3c. Day 29 -> 30 (monthly only)
        tok, uid = fresh_user(make_phone(303), "BonusDay30")
        set_streak(uid, current=29, last_active_days_ago=1, longest=29)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        j = r.json()
        passed = (
            j.get("streak_current") == 30
            and j.get("milestone_bonus") == 200
            and j.get("coins_awarded") == 225
        )
        record(
            "3c. Day 29->30: milestone=200 (monthly only)",
            passed,
            f"-> streak={j.get('streak_current')} bonus={j.get('milestone_bonus')} coins={j.get('coins_awarded')}",
        )

        # 3d. Day 27 -> 28 (weekly only)
        tok, uid = fresh_user(make_phone(304), "BonusDay28")
        set_streak(uid, current=27, last_active_days_ago=1, longest=27)
        clear_today_ledger(uid)
        r = c.post("/streak/check-in", headers=headers(tok))
        j = r.json()
        passed = j.get("streak_current") == 28 and j.get("milestone_bonus") == 50
        record(
            "3d. Day 27->28: milestone=50 (weekly only)",
            passed,
            f"-> streak={j.get('streak_current')} bonus={j.get('milestone_bonus')}",
        )

        # 3e. Same-day second call no-op
        tok, uid = fresh_user(make_phone(305), "BonusIdem")
        r1 = c.post("/streak/check-in", headers=headers(tok))
        j1 = r1.json()
        r2 = c.post("/streak/check-in", headers=headers(tok))
        j2 = r2.json()
        passed = (
            j2.get("already_checked_in") is True
            and j2.get("coins_awarded") == 0
            and j2.get("balance") == j1.get("balance")
        )
        record(
            "3e. Same-day 2nd check-in: already_checked_in=true, coins=0",
            passed,
            f"-> already={j2.get('already_checked_in')} coins={j2.get('coins_awarded')}",
        )

        # 3f. Milestone idempotency via forced replay (don't clear ledger)
        tok, uid = fresh_user(make_phone(306), "BonusIdemMilestone")
        set_streak(uid, current=13, last_active_days_ago=1, longest=13)
        clear_today_ledger(uid)
        r1 = c.post("/streak/check-in", headers=headers(tok))
        j1 = r1.json()
        # Now force back: pretend we didn't check in today (reset last_active)
        # but leave ledger intact so weekly bonus key still exists.
        set_streak(uid, current=13, last_active_days_ago=1, longest=14)
        # Also delete only the streak_daily ledger entry so daily can re-award
        # but weekly bonus key remains -> bonus should NOT double-award.
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mdb.ledger_transactions.delete_many({
            "user_id": uid,
            "idempotency_key": f"streak_daily::{uid}::{today}",
        })
        r2 = c.post("/streak/check-in", headers=headers(tok))
        j2 = r2.json()
        passed = j1.get("milestone_bonus") == 50 and j2.get("milestone_bonus") == 0
        record(
            "3f. Milestone ledger-idempotent (no double-award on replay)",
            passed,
            f"-> first={j1.get('milestone_bonus')} second={j2.get('milestone_bonus')}",
        )


# ======================================================================
#  CATEGORY 4 - HEALTH
# ======================================================================
def cat4_health():
    print("\n--- CATEGORY 4: /streak/health ADMIN ENDPOINT ---")

    with httpx.Client(base_url=API, timeout=25) as c:
        # 4a. Shape + tier is object
        tok, uid = fresh_user(make_phone(401), "HealthFree")
        set_free(uid)
        r = c.get("/streak/health", headers=headers(tok))
        ok = r.status_code == 200
        j = r.json() if ok else {}
        has_top_keys = all(k in j for k in ("streak", "freezes", "coins", "milestones"))
        tier_obj = j.get("streak", {}).get("tier") if has_top_keys else None
        tier_ok = isinstance(tier_obj, dict) and {"tier", "emoji", "rank_label"}.issubset(tier_obj)
        record(
            "4a. Shape: streak/freezes/coins/milestones + tier is dict",
            ok and has_top_keys and tier_ok,
            f"-> keys={list(j.keys())} tier_obj={tier_obj}",
        )

        # 4b. Non-premium freeze summary
        fz = j.get("freezes", {})
        passed = (
            fz.get("is_premium") is False
            and fz.get("available") == 0
            and fz.get("max_per_month") == 0
        )
        record(
            "4b. Non-premium: is_premium=false, avail=0, max=0",
            passed, f"-> {fz}",
        )

        # 4c. Premium: is_premium=true, max=3
        set_premium(uid)
        set_freezes(uid, 3)
        r = c.get("/streak/health", headers=headers(tok))
        fz = r.json().get("freezes", {})
        passed = (
            fz.get("is_premium") is True
            and fz.get("max_per_month") == 3
            and fz.get("available") == 3
        )
        record(
            "4c. Premium: is_premium=true, max=3, avail=3",
            passed, f"-> {fz}",
        )

        # 4d. Integrity check (reset to free, do a check-in, then inject drift)
        set_free(uid)
        mdb.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"streak_last_active_date": None, "streak_current": 0,
                      "streak_days": 0}},
        )
        clear_today_ledger(uid)
        c.post("/streak/check-in", headers=headers(tok))
        r = c.get("/streak/health", headers=headers(tok))
        j = r.json()
        coins_pre = j.get("coins", {})
        integrity_before = coins_pre.get("integrity_ok")
        # Inject drift
        mdb.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"coins_balance": 999999}},
        )
        r = c.get("/streak/health", headers=headers(tok))
        coins_post = r.json().get("coins", {})
        integrity_after = coins_post.get("integrity_ok")
        passed = integrity_before is True and integrity_after is False
        record(
            "4d. Integrity: TRUE when balanced, FALSE after drift",
            passed,
            f"-> before={integrity_before} after={integrity_after} cached={coins_post.get('cached_balance')} real={coins_post.get('balance')}",
        )

        # 4e. Rolling earnings
        passed = (
            coins_pre.get("earned_last_7d") >= 2
            and coins_pre.get("earned_last_30d") >= 2
            and isinstance(coins_pre.get("lifetime_txn_count"), int)
        )
        record(
            "4e. coins.earned_last_7d/30d > 0 after check-in",
            passed,
            f"-> 7d={coins_pre.get('earned_last_7d')} 30d={coins_pre.get('earned_last_30d')} txns={coins_pre.get('lifetime_txn_count')}",
        )

        # 4f. Milestone countdowns for streak=5
        tok2, uid2 = fresh_user(make_phone(402), "HealthMilestone")
        set_streak(uid2, current=5, last_active_days_ago=0, longest=5)
        r = c.get("/streak/health", headers=headers(tok2))
        m = r.json().get("milestones", {})
        passed = m.get("next_weekly_in_days") == 2 and m.get("next_monthly_in_days") == 25
        record(
            "4f. Milestone countdowns for current=5: weekly=2, monthly=25",
            passed, f"-> {m}",
        )


# ======================================================================
#  CATEGORY 5 - REGRESSION PYTEST
# ======================================================================
def cat5_regression():
    print("\n--- CATEGORY 5: REGRESSION PYTEST ---")
    import subprocess
    cmd = [
        "python", "-m", "pytest",
        "tests/test_streak_coins_audit.py",
        "tests/test_adversarial.py",
        "tests/test_principal_audit.py",
        "-q", "--tb=line", "--no-header",
    ]
    try:
        proc = subprocess.run(cmd, cwd="/app/backend", capture_output=True,
                              text=True, timeout=300)
        out = (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired:
        record("5. Regression pytest", False, "-> timeout after 300s")
        return

    import re
    m = re.search(r"(\d+)\s+passed", out)
    failed = re.search(r"(\d+)\s+failed", out)
    passed_n = int(m.group(1)) if m else 0
    failed_n = int(failed.group(1)) if failed else 0
    tail = out.strip().splitlines()[-5:]
    record(
        "5. Regression pytest: 54+13 = >=60 passed, 0 failed",
        failed_n == 0 and passed_n >= 60,
        f"-> passed={passed_n} failed={failed_n} | tail={tail[-2:]}",
    )
    if failed_n > 0:
        print("\n--- REGRESSION FAILURE OUTPUT ---")
        print(out[-4000:])


# ======================================================================
#  MAIN
# ======================================================================
def main():
    print(f"Streak & Coins Bonus Backend Test")
    print(f"BASE: {API}")
    print(f"RUN_TAG: {RUN_TAG}")
    print()

    try:
        cat1_streak_freeze()
        cat2_leaderboard()
        cat3_bonuses()
        cat4_health()
        cat5_regression()
    except Exception as e:
        import traceback
        traceback.print_exc()
        record("FATAL ERROR", False, str(e))

    print()
    print("=" * 60)
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_total = len(results)
    print(f"RESULT: {n_pass}/{n_total} passed")
    failed_list = [(n, d) for n, ok, d in results if not ok]
    if failed_list:
        print("\nFAILED TESTS:")
        for n, d in failed_list:
            print(f"  FAIL {n}  {d}")
    return 0 if n_pass == n_total else 1


if __name__ == "__main__":
    sys.exit(main())
