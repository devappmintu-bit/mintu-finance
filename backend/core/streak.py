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
from typing import Any, Dict

from bson import ObjectId

from core.db import db
from core.ids import safe_oid
from core.ledger import award_coins

logger = logging.getLogger(__name__)


def _today_utc_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _yesterday_utc_date_str() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")


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
    now = datetime.now(timezone.utc)

    # Atomic read of the current streak state. We do the compare-and-set
    # in Python after this fetch, but then use a conditional update that
    # only matches if the last_active_date hasn't changed — preventing
    # concurrent check-ins on multiple devices from double-incrementing.
    user = await db.users.find_one({"_id": oid}, {
        "streak_current": 1,
        "streak_longest": 1,
        "streak_last_active_date": 1,
        "streak_total_check_ins": 1,
    })
    if user is None:
        raise ValueError(f"User {user_id} not found")

    current = int(user.get("streak_current") or 0)
    longest = int(user.get("streak_longest") or 0)
    last_active = user.get("streak_last_active_date")  # may be None
    total = int(user.get("streak_total_check_ins") or 0)

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
        }

    # ── Case 2: Continuation — yesterday's streak extends by 1.
    if last_active == yesterday:
        new_current = current + 1
        reset = False
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

    return {
        "streak_current": new_current,
        "streak_longest": new_longest,
        "already_checked_in": False,
        "incremented": True,
        "coins_awarded": award_result["amount"] if award_result["created"] else 0,
        "balance": award_result["balance"],
        "next_reward_preview": _streak_reward_for(new_current + 1),
        "reset": reset,
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

    return {
        "streak_current": current,
        "streak_longest": longest,
        "last_active_date": last_active,
        "needs_check_in": needs_check_in,
        "about_to_reset": about_to_reset,
        "next_reward_preview": _streak_reward_for(preview_day),
        "today": today,
    }


async def _get_balance(user_id: str) -> int:
    """Internal helper — avoids circular import with ledger if someone ever
    calls check_in before ledger is warmed up."""
    from core.ledger import get_balance
    return await get_balance(user_id)
