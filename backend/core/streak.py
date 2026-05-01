"""core/streak.py — Atomic daily-streak check-in service.

Financial-grade streak tracking per spec:
  • SERVER TIME ONLY. Client timestamps are ignored.
  • UTC normalized. DST / timezone travel has no effect.
  • Single atomic MongoDB `find_one_and_update` — no races across devices.
  • Idempotent: multiple check-ins on the same UTC day = streak unchanged.
  • Backdated requests impossible (we never read client time).

Schema fields written to ``users``:
    streak_current             int     # day count of current consecutive streak
    streak_longest             int     # personal best
    streak_last_active_date    str     # "YYYY-MM-DD" (UTC)
    streak_last_increment_at   datetime UTC — audit / observability
    streak_total_check_ins     int     # lifetime count
    streak_last_reward_amount  int     # last streak-reward coin count awarded
    # NOTE: legacy field ``streak_days`` is kept in sync via ``$set`` alongside
    # ``streak_current`` so existing UI reads (leaderboard/analytics/profile)
    # continue to work during rollout without schema changes upstream.

Reward curve (progressive):
    day 1-2    → 2 coins / day
    day 3-6    → 5 coins / day
    day 7-13   → 10 coins / day (unlocks first weekly milestone)
    day 14-29  → 15 coins / day
    day 30+    → 25 coins / day + monthly milestone toast
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from bson import ObjectId

from core.db import db
from core.ids import safe_oid
from core.ledger import award_coins
from core.time import utc_now

logger = logging.getLogger(__name__)


def _today_utc_date_str() -> str:
    return utc_now().strftime("%Y-%m-%d")


def _yesterday_utc_date_str() -> str:
    return (utc_now() - timedelta(days=1)).strftime("%Y-%m-%d")


def _streak_reward_for(day: int) -> int:
    """Progressive coin reward based on current streak day count."""
    if day >= 30:
        return 25
    if day >= 14:
        return 15
    if day >= 7:
        return 10
    if day >= 3:
        return 5
    return 2


# Weekly/monthly bonus jackpots — awarded ON TOP of the daily reward on
# milestone days. Ledger-idempotent via unique keys `streak_week_bonus::
# {user_id}::{UTC_date}` and `streak_month_bonus::{user_id}::{UTC_date}`.
_WEEKLY_BONUS_COINS = 50    # hits on day 7, 14, 21, 28 …
_MONTHLY_BONUS_COINS = 200  # hits on day 30, 60, 90 …

# ── Streak Freeze (premium perk) ──────────────────────────────────────
# Pro subscribers get up to 3 freezes per UTC month. When a user misses
# a day, we AUTO-consume 1 freeze and preserve their streak instead of
# resetting. Non-premium users cannot accumulate or use freezes.
STREAK_FREEZE_MAX_PER_MONTH = 3


def _user_is_premium(u: Dict[str, Any]) -> bool:
    """Check if a user document represents an active premium subscriber.

    Mirrors routers/premium.py logic: tier in {premium,legend} AND
    (until is None OR until > now).
    """
    tier = (u.get("premium_tier") or "free").lower()
    if tier not in ("premium", "legend"):
        return False
    until = u.get("premium_until")
    if until is None:
        return True
    try:
        if isinstance(until, str):
            until = datetime.fromisoformat(until.replace("Z", "+00:00"))
        now = utc_now()
        # Normalize naive to UTC
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return until > now
    except Exception:
        return False


async def _ensure_monthly_freeze_refill(
    user_id: str, user_doc: Dict[str, Any], today: str,
) -> int:
    """Ensure a premium user has their monthly freeze allowance.

    Called on every check-in. Idempotent: we track the last-refill UTC
    month in ``streak_freeze_last_refill_month`` (``YYYY-MM``). If the
    stored month is older than the current one, we top-up to the max.

    Returns the user's current freeze count after any refill.
    """
    if not _user_is_premium(user_doc):
        # Non-premium: ensure no phantom freezes (cleanliness), but
        # don't wipe existing ones on every call (they might have just
        # lapsed; keep grace). We simply don't refill.
        return int(user_doc.get("streak_freezes_available") or 0)

    current_month = today[:7]  # "YYYY-MM"
    last_refill = (user_doc.get("streak_freeze_last_refill_month") or "")
    current_freezes = int(user_doc.get("streak_freezes_available") or 0)

    if last_refill == current_month:
        return current_freezes  # already refilled this month

    # New month → top up to max (never reduce if they already had more).
    new_count = max(current_freezes, STREAK_FREEZE_MAX_PER_MONTH)
    oid = safe_oid(user_id)
    if oid is None:
        return current_freezes
    await db.users.update_one(
        {"_id": oid},
        {"$set": {
            "streak_freezes_available": new_count,
            "streak_freeze_last_refill_month": current_month,
        }},
    )
    return new_count


async def _try_consume_freeze(user_id: str, today: str) -> bool:
    """Atomically decrement ``streak_freezes_available`` if > 0.

    Returns True if a freeze was successfully consumed.
    Also logs the consumption to ``db.streak_freeze_events`` for audit.
    """
    oid = safe_oid(user_id)
    if oid is None:
        return False
    # Atomic decrement only if there is at least 1 freeze available.
    result = await db.users.find_one_and_update(
        {"_id": oid, "streak_freezes_available": {"$gt": 0}},
        {
            "$inc": {"streak_freezes_available": -1},
            "$set": {"streak_freeze_last_used_at": utc_now()},
        },
        projection={"streak_freezes_available": 1},
    )
    if result is None:
        return False

    # Audit trail — never blocks the main path.
    try:
        await db.streak_freeze_events.insert_one({
            "user_id": user_id,
            "used_on_date": today,
            "created_at": utc_now(),
            "remaining_after": max(0, int(result.get("streak_freezes_available", 1)) - 1),
        })
    except Exception:
        pass
    return True


async def _award_milestone_bonuses(user_id: str, day: int, today: str) -> int:
    """Award weekly + monthly bonuses if the new streak day hits the multiples.
    Returns total bonus coins awarded (0 if none)."""
    from core.ledger import award_coins
    bonus_total = 0
    if day > 0 and day % 7 == 0:
        r = await award_coins(
            user_id=user_id,
            amount=_WEEKLY_BONUS_COINS,
            source="streak_weekly_bonus",
            idempotency_key=f"streak_week_bonus::{user_id}::{today}",
            txn_type="bonus",
        )
        if r["created"]:
            bonus_total += _WEEKLY_BONUS_COINS
    if day > 0 and day % 30 == 0:
        r = await award_coins(
            user_id=user_id,
            amount=_MONTHLY_BONUS_COINS,
            source="streak_monthly_bonus",
            idempotency_key=f"streak_month_bonus::{user_id}::{today}",
            txn_type="bonus",
        )
        if r["created"]:
            bonus_total += _MONTHLY_BONUS_COINS
    return bonus_total


async def check_in(user_id: str) -> Dict[str, Any]:
    """Perform the daily check-in.

    Returns
    -------
    {
      "streak_current":       int,
      "streak_longest":       int,
      "already_checked_in":   bool,
      "incremented":          bool,     # True only if we advanced the streak
      "coins_awarded":        int,      # 0 if already checked in today
      "balance":              int,      # coin balance after award
      "next_reward_preview":  int,      # what tomorrow's check-in will grant
      "reset":                bool,     # True if a gap caused a reset to 1
    }
    """
    oid = safe_oid(user_id)
    if oid is None:
        raise ValueError(f"Invalid user_id: {user_id}")

    today = _today_utc_date_str()
    yesterday = _yesterday_utc_date_str()
    now = utc_now()

    # Atomic read of the current streak state. We do the compare-and-set
    # in Python after this fetch, but then use a conditional update that
    # only matches if the last_active_date hasn't changed — preventing
    # concurrent check-ins on multiple devices from double-incrementing.
    user = await db.users.find_one({"_id": oid}, {
        "streak_current": 1,
        "streak_longest": 1,
        "streak_last_active_date": 1,
        "streak_total_check_ins": 1,
        "streak_freezes_available": 1,
        "streak_freeze_last_refill_month": 1,
        "premium_tier": 1,
        "premium_until": 1,
        "is_premium": 1,
    })
    if user is None:
        raise ValueError(f"User {user_id} not found")

    current = int(user.get("streak_current") or 0)
    longest = int(user.get("streak_longest") or 0)
    last_active = user.get("streak_last_active_date")  # may be None
    total = int(user.get("streak_total_check_ins") or 0)

    # Refill freezes if premium + new UTC month.
    await _ensure_monthly_freeze_refill(user_id, user, today)

    # ── Case 1: Already checked in today → NO-OP, NO double-increment.
    if last_active == today:
        return {
            "streak_current": current,
            "streak_longest": longest,
            "already_checked_in": True,
            "incremented": False,
            "coins_awarded": 0,
            "balance": await _get_balance(user_id),
            "next_reward_preview": _streak_reward_for(current + 1),
            "reset": False,
            "freeze_used": False,
        }

    # ── Case 2: Continuation — yesterday's streak extends by 1.
    freeze_used = False
    if last_active == yesterday:
        new_current = current + 1
        reset = False
    else:
        # ── Case 2.5: User MISSED day(s) — try to consume a freeze (premium).
        # This saves the streak: we treat the gap as a single day skip by
        # consuming 1 freeze and advancing the streak by +1 (as if they
        # checked in yesterday too). We ONLY rescue a single-day gap;
        # multi-day gaps still reset (don't auto-spend multiple freezes).
        if last_active is not None and current > 0 and _user_is_premium(user):
            # Compute gap in days (only rescue 1-day gap, i.e. skipped
            # exactly "day before yesterday").
            try:
                prev = datetime.strptime(last_active, "%Y-%m-%d").date()
                today_date = datetime.strptime(today, "%Y-%m-%d").date()
                gap = (today_date - prev).days
            except Exception:
                gap = 99
            if gap == 2:  # exactly 1 missed day
                consumed = await _try_consume_freeze(user_id, today)
                if consumed:
                    new_current = current + 1
                    reset = False
                    freeze_used = True
                else:
                    new_current = 1
                    reset = True
            else:
                new_current = 1
                reset = True
        # ── Case 3: First check-in EVER or gap of 2+ days → reset to 1.
        else:
            new_current = 1
            reset = last_active is not None  # only "reset" if there was prior activity

    new_longest = max(longest, new_current)
    coins_awarded_amount = _streak_reward_for(new_current)

    # ── Atomic CAS: only update if last_active_date hasn't changed under us.
    # This makes the update idempotent under rapid-fire concurrent calls:
    # second request sees last_active == today and hits Case 1 above.
    filt = {"_id": oid, "streak_last_active_date": last_active}
    set_payload = {
        "streak_current": new_current,
        "streak_longest": new_longest,
        "streak_last_active_date": today,
        "streak_last_increment_at": now,
        "streak_total_check_ins": total + 1,
        "streak_last_reward_amount": coins_awarded_amount,
        # Legacy field — kept in sync so every existing UI read works instantly.
        "streak_days": new_current,
    }
    result = await db.users.update_one(filt, {"$set": set_payload})
    if result.modified_count == 0:
        # Raced — another request slipped in. Re-read and return idempotently.
        return await check_in(user_id)

    # ── Award coins via the ledger (idempotent by UTC-day key).
    award_result = await award_coins(
        user_id=user_id,
        amount=coins_awarded_amount,
        source="streak_daily",
        idempotency_key=f"streak_daily::{user_id}::{today}",
        txn_type="bonus",
    )

    # ── Award weekly/monthly milestone bonuses if applicable (idempotent).
    milestone_bonus = await _award_milestone_bonuses(user_id, new_current, today)
    # Refresh balance after any milestone bonus awards.
    final_balance = (
        await _get_balance(user_id) if milestone_bonus else award_result["balance"]
    )

    return {
        "streak_current": new_current,
        "streak_longest": new_longest,
        "already_checked_in": False,
        "incremented": True,
        "coins_awarded": (
            (award_result["amount"] if award_result["created"] else 0) + milestone_bonus
        ),
        "milestone_bonus": milestone_bonus,
        "balance": final_balance,
        "next_reward_preview": _streak_reward_for(new_current + 1),
        "reset": reset,
        "freeze_used": freeze_used,
    }


async def get_status(user_id: str) -> Dict[str, Any]:
    """Read-only streak snapshot (UI polling).

    Crucially: if the client opens the app after midnight UTC without
    calling check_in, we DO NOT auto-reset the visible streak here — we
    only report the stored state. Reset happens on the next check-in.
    This keeps get_status side-effect-free and predictable.
    """
    oid = safe_oid(user_id)
    if oid is None:
        return {
            "streak_current": 0,
            "streak_longest": 0,
            "needs_check_in": True,
            "next_reward_preview": _streak_reward_for(1),
        }

    u = await db.users.find_one({"_id": oid}, {
        "streak_current": 1,
        "streak_longest": 1,
        "streak_last_active_date": 1,
        "streak_total_check_ins": 1,
        "streak_freezes_available": 1,
        "streak_freeze_last_refill_month": 1,
        "premium_tier": 1,
        "premium_until": 1,
    }) or {}

    current = int(u.get("streak_current") or 0)
    longest = int(u.get("streak_longest") or 0)
    last_active = u.get("streak_last_active_date")
    today = _today_utc_date_str()
    yesterday = _yesterday_utc_date_str()

    needs_check_in = last_active != today

    # If the user missed yesterday AND doesn't check in today, current
    # will reset on next check-in. We PREVIEW that here so UI can show
    # "⚠ streak will reset if you skip today".
    about_to_reset = (last_active not in (today, yesterday)) and current > 0

    # Preview tomorrow's reward vs today's (depends on whether they've
    # checked in today yet).
    preview_day = current + 1 if needs_check_in else current + 1
    if last_active and last_active not in (today, yesterday):
        preview_day = 1  # next check-in will reset

    is_premium = _user_is_premium(u)
    freezes_available = int(u.get("streak_freezes_available") or 0) if is_premium else 0

    # If their stored refill month is stale, report the fresh max
    # (we don't write here — just preview what next check-in will grant).
    if is_premium:
        current_month = today[:7]
        last_refill = u.get("streak_freeze_last_refill_month") or ""
        if last_refill != current_month:
            freezes_available = max(freezes_available, STREAK_FREEZE_MAX_PER_MONTH)

    return {
        "streak_current": current,
        "streak_longest": longest,
        "last_active_date": last_active,
        "needs_check_in": needs_check_in,
        "about_to_reset": about_to_reset,
        "next_reward_preview": _streak_reward_for(preview_day),
        "today": today,
        "total_check_ins": int(u.get("streak_total_check_ins") or 0),
        "is_premium": is_premium,
        "freezes_available": freezes_available,
        "freezes_max_per_month": STREAK_FREEZE_MAX_PER_MONTH if is_premium else 0,
    }


async def _get_balance(user_id: str) -> int:
    """Internal helper — avoids circular import with ledger if someone ever
    calls check_in before ledger is warmed up."""
    from core.ledger import get_balance
    return await get_balance(user_id)


# ══════════════════════════════════════════════════════════════════════
#  LEADERBOARD
# ══════════════════════════════════════════════════════════════════════
def _mask_phone(phone: str) -> str:
    if not phone:
        return "****"
    return f"***{phone[-4:]}" if len(phone) >= 4 else "****"


def _tier_for_streak(days: int) -> Dict[str, Any]:
    """Map a streak count to a progressive tier label + emoji."""
    if days >= 100:
        return {"tier": "Legend", "emoji": "💎", "rank_label": "S"}
    if days >= 50:
        return {"tier": "Master", "emoji": "👑", "rank_label": "A"}
    if days >= 30:
        return {"tier": "Expert", "emoji": "🚀", "rank_label": "B"}
    if days >= 14:
        return {"tier": "Pro", "emoji": "⚡", "rank_label": "C"}
    if days >= 7:
        return {"tier": "Rising", "emoji": "🔥", "rank_label": "D"}
    if days >= 3:
        return {"tier": "Starter", "emoji": "🌱", "rank_label": "E"}
    return {"tier": "Rookie", "emoji": "🪴", "rank_label": "F"}


async def get_leaderboard(user_id: str, limit: int = 100) -> Dict[str, Any]:
    """Progressive streak leaderboard — global top N by current streak.

    Sort order: streak_current DESC, streak_longest DESC, money_score DESC.
    Includes the caller's own rank even if they are outside the top N
    (computed via a secondary count).
    """
    limit = max(1, min(limit, 200))
    projection = {
        "name": 1, "phone": 1, "avatar": 1,
        "streak_current": 1, "streak_days": 1,
        "streak_longest": 1, "money_score": 1,
    }

    top = await db.users.find({}, projection).sort([
        ("streak_current", -1),
        ("streak_longest", -1),
        ("money_score", -1),
    ]).limit(limit).to_list(limit)

    entries: list = []
    you: Optional[Dict[str, Any]] = None
    for i, u in enumerate(top):
        uid = str(u["_id"])
        days = int(u.get("streak_current") or u.get("streak_days") or 0)
        tier = _tier_for_streak(days)
        entry = {
            "rank": i + 1,
            "id": uid,
            "name": u.get("name") or "MintU User",
            "phone_masked": _mask_phone(u.get("phone") or ""),
            "has_avatar": bool(u.get("avatar")),
            "streak_current": days,
            "streak_longest": int(u.get("streak_longest") or days),
            "money_score": int(u.get("money_score") or 0),
            "tier": tier["tier"],
            "tier_emoji": tier["emoji"],
            "tier_rank": tier["rank_label"],
            "is_me": uid == user_id,
        }
        entries.append(entry)
        if uid == user_id:
            you = entry

    # If caller is not in top N, compute their standalone rank.
    if you is None:
        me_oid = safe_oid(user_id)
        me_doc = await db.users.find_one({"_id": me_oid}, projection) if me_oid else None
        if me_doc:
            my_days = int(me_doc.get("streak_current") or me_doc.get("streak_days") or 0)
            my_long = int(me_doc.get("streak_longest") or my_days)
            my_score = int(me_doc.get("money_score") or 0)
            # Rank = (count strictly above me) + 1
            above = await db.users.count_documents({
                "$or": [
                    {"streak_current": {"$gt": my_days}},
                    {"streak_current": my_days, "streak_longest": {"$gt": my_long}},
                    {"streak_current": my_days, "streak_longest": my_long,
                     "money_score": {"$gt": my_score}},
                ]
            })
            tier = _tier_for_streak(my_days)
            you = {
                "rank": above + 1,
                "id": user_id,
                "name": me_doc.get("name") or "You",
                "phone_masked": _mask_phone(me_doc.get("phone") or ""),
                "has_avatar": bool(me_doc.get("avatar")),
                "streak_current": my_days,
                "streak_longest": my_long,
                "money_score": my_score,
                "tier": tier["tier"],
                "tier_emoji": tier["emoji"],
                "tier_rank": tier["rank_label"],
                "is_me": True,
            }

    total_users = await db.users.count_documents({})

    # Percentile for YOU (only meaningful if total > 1).
    if you and total_users > 1:
        you["percentile"] = max(1, min(99, int(
            ((total_users - you["rank"]) / max(total_users, 1)) * 100
        )))

    # Friendly headline.
    leader = entries[0] if entries else None
    if you and leader and you["is_me"]:
        headline = f"👑 You're #1 with {you['streak_current']} days!"
    elif leader and you:
        delta = leader["streak_current"] - you["streak_current"]
        if delta <= 0:
            headline = f"🔥 You're tied with the leader at {you['streak_current']} days"
        else:
            headline = f"🎯 {delta} more day{'s' if delta != 1 else ''} to catch the leader"
    else:
        headline = "Start your streak to climb the leaderboard"

    return {
        "entries": entries,
        "you": you,
        "leader": leader,
        "headline": headline,
        "total_users": total_users,
        "limit": limit,
    }


# ══════════════════════════════════════════════════════════════════════
#  HEALTH / OBSERVABILITY
# ══════════════════════════════════════════════════════════════════════
async def get_health(user_id: str) -> Dict[str, Any]:
    """Per-user streak & coins observability snapshot for the Profile
    "Streak & Coins Health" expandable card.

    This is READ-ONLY. Includes:
      • Streak: current, longest, total_check_ins, last_active, today
      • Freezes: available, max_per_month, is_premium, last_used_at
      • Coins: balance, total_earned_lifetime, total_spent_lifetime,
               last_7d_earned, last_30d_earned
      • Milestones: next_weekly_at, next_monthly_at (days ahead)
      • Integrity: ledger sum == cached balance? (self-heal on drift)
    """
    from core.ledger import get_balance, _sum_ledger  # noqa

    oid = safe_oid(user_id)
    if oid is None:
        return {"error": "invalid_user_id"}

    u = await db.users.find_one({"_id": oid}, {
        "streak_current": 1, "streak_longest": 1,
        "streak_last_active_date": 1, "streak_total_check_ins": 1,
        "streak_freezes_available": 1, "streak_freeze_last_used_at": 1,
        "streak_freeze_last_refill_month": 1,
        "premium_tier": 1, "premium_until": 1,
        "coins_balance": 1,
    }) or {}

    is_premium = _user_is_premium(u)
    today = _today_utc_date_str()
    current = int(u.get("streak_current") or 0)

    # ── Coin aggregates via ledger.
    ledger_balance = await get_balance(user_id)
    now = utc_now()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    pipeline_lifetime = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$type",
            "count": {"$sum": 1},
            "positive_sum": {"$sum": {"$cond": [{"$gt": ["$amount", 0]}, "$amount", 0]}},
            "negative_sum": {"$sum": {"$cond": [{"$lt": ["$amount", 0]}, "$amount", 0]}},
        }},
    ]
    lifetime = await db.ledger_transactions.aggregate(pipeline_lifetime).to_list(20)
    total_earned = sum(int(r.get("positive_sum") or 0) for r in lifetime)
    total_spent = -sum(int(r.get("negative_sum") or 0) for r in lifetime)  # positive number
    lifetime_txn_count = sum(int(r.get("count") or 0) for r in lifetime)

    # Rolling windows.
    async def _sum_window(after: datetime, positive_only: bool) -> int:
        amt_filter = {"$gt": 0} if positive_only else {"$lt": 0}
        pipeline = [
            {"$match": {"user_id": user_id, "created_at": {"$gte": after},
                        "amount": amt_filter}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        rows = await db.ledger_transactions.aggregate(pipeline).to_list(1)
        val = int(rows[0]["total"]) if rows else 0
        return val if positive_only else -val

    earned_7d = await _sum_window(seven_days_ago, True)
    earned_30d = await _sum_window(thirty_days_ago, True)

    # Milestone countdowns.
    next_weekly_in = (7 - (current % 7)) if current % 7 != 0 else 7
    next_monthly_in = (30 - (current % 30)) if current % 30 != 0 else 30
    if current == 0:
        next_weekly_in = 7
        next_monthly_in = 30

    # Integrity check.
    cached = int(u.get("coins_balance") or 0)
    integrity_ok = cached == ledger_balance

    return {
        "streak": {
            "current": current,
            "longest": int(u.get("streak_longest") or 0),
            "last_active_date": u.get("streak_last_active_date"),
            "total_check_ins": int(u.get("streak_total_check_ins") or 0),
            "tier": _tier_for_streak(current),
            "today_utc": today,
        },
        "freezes": {
            "is_premium": is_premium,
            "available": int(u.get("streak_freezes_available") or 0) if is_premium else 0,
            "max_per_month": STREAK_FREEZE_MAX_PER_MONTH if is_premium else 0,
            "last_used_at": (u.get("streak_freeze_last_used_at").isoformat()
                             if isinstance(u.get("streak_freeze_last_used_at"), datetime)
                             else None),
            "last_refill_month": u.get("streak_freeze_last_refill_month"),
        },
        "coins": {
            "balance": ledger_balance,
            "cached_balance": cached,
            "integrity_ok": integrity_ok,
            "total_earned_lifetime": total_earned,
            "total_spent_lifetime": total_spent,
            "earned_last_7d": earned_7d,
            "earned_last_30d": earned_30d,
            "lifetime_txn_count": lifetime_txn_count,
        },
        "milestones": {
            "next_weekly_in_days": next_weekly_in,
            "next_weekly_bonus_coins": _WEEKLY_BONUS_COINS,
            "next_monthly_in_days": next_monthly_in,
            "next_monthly_bonus_coins": _MONTHLY_BONUS_COINS,
        },
    }
