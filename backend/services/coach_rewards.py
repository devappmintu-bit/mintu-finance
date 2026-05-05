"""
services/coach_rewards.py — Round 92 Habit Loop close-out.

Closes the loop:  PUSH → INSIGHT → ACTION → **REWARD** → next-day brief.

When a user taps an action card and the mutation succeeds, we compute a
*projected* monetary impact and persist it as a reward event. Three uses:

  1. Action card "+₹X projected" pre-tap pill (consequence visible
     BEFORE commitment — the Duolingo move).
  2. Action confirm text after tap ("Saved ₹3,200 this month").
  3. Daily brief leads with the most-recent unread reward
     ("Yesterday you capped food at ₹8k. On track to save ₹3,200.").

Schema (collection: coach_rewards):
  {
    user_id, action_key, action_label,
    projected_impact: float,         # rupees saved/earned over remaining month
    projected_label:  str,           # "+₹3,200 projected"
    realised_impact:  float|null,    # filled at month-end if we want to score
    read_at:          datetime|null, # daily brief mark-read
    created_at:       datetime,
  }
"""
from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.time import utc_now

logger = logging.getLogger("coach_rewards")


def _days_left_in_month() -> int:
    now = utc_now()
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    return max(0, days_in_month - now.day)


async def estimate_projected_impact(
    user_id: str, action_key: str, payload: dict,
) -> tuple[float, str]:
    """Return (rupees, label) for the projected impact of this action.

    Conservative estimates — we'd rather under-promise than over-promise.
    `payload` is the action card's payload (already validated by the
    action dispatcher).
    """
    from server import db

    if action_key == "set_budget_cap":
        cat = (payload.get("category") or "").lower()
        cap = float(payload.get("amount") or 0)
        if not cat or cap <= 0:
            return 0.0, ""

        now = utc_now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        days_left = _days_left_in_month()

        # 1. how much have they already spent in this category this month?
        agg = await db.transactions.aggregate([
            {"$match": {
                "user_id": user_id, "category": cat,
                "date": {"$gte": month_start},
                "type": {"$nin": ["credit", "income"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        spent_month = float(agg[0]["total"]) if agg else 0.0

        # 2. their daily-average spend in this category over the trailing
        #    14 days (excluding this month-to-date overspike).
        ago_44 = month_start - timedelta(days=30)
        avg_agg = await db.transactions.aggregate([
            {"$match": {
                "user_id": user_id, "category": cat,
                "date": {"$gte": ago_44, "$lt": month_start},
                "type": {"$nin": ["credit", "income"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        prior_total = float(avg_agg[0]["total"]) if avg_agg else 0.0
        prior_daily_avg = prior_total / 30.0 if prior_total else 0.0

        # If they're already over the cap, the saving is whatever they
        # would have spent in the rest of the month at their old pace
        # MINUS the cap delta (which is 0 if cap < spent).
        # If they're under the cap, no saving (they were on track anyway).
        if spent_month >= cap:
            # They've already breached. Best-case: stop now.
            projected_at_old_pace = prior_daily_avg * days_left
            saved = projected_at_old_pace
        else:
            remaining_cap = cap - spent_month
            projected_at_old_pace = prior_daily_avg * days_left
            saved = max(0.0, projected_at_old_pace - remaining_cap)

        # Round to the nearest ₹100 for a clean display number.
        saved = round(saved / 100) * 100
        if saved <= 0:
            return 0.0, "On track."
        return saved, f"+₹{int(saved):,} projected"

    if action_key == "create_goal":
        target = float(payload.get("target_amount") or 0)
        # No saving — but a milestone trigger will fire when they cross 25%.
        return 0.0, f"Goal set: ₹{int(target):,}"

    if action_key == "add_expense":
        return 0.0, "Logged."

    if action_key == "revoke_device":
        return 0.0, "Device revoked."

    return 0.0, ""


async def record_reward(
    user_id: str, action_key: str, action_label: str,
    projected_impact: float, projected_label: str,
) -> None:
    """Persist a reward event — daily brief & home reward strip read this."""
    from server import db
    await db.coach_rewards.insert_one({
        "user_id": user_id,
        "action_key": action_key,
        "action_label": (action_label or "")[:160],
        "projected_impact": float(projected_impact),
        "projected_label": (projected_label or "")[:80],
        "realised_impact": None,
        "read_at": None,
        "created_at": utc_now(),
    })


async def get_recent_unread(user_id: str, hours: int = 36) -> Optional[dict]:
    """Return the most recent unread reward within `hours` window."""
    from server import db
    cutoff = utc_now() - timedelta(hours=hours)
    doc = await db.coach_rewards.find_one(
        {"user_id": user_id, "read_at": None, "created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
    )
    if doc:
        doc["id"] = str(doc.pop("_id"))
        if hasattr(doc.get("created_at"), "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
    return doc


async def mark_all_read(user_id: str) -> int:
    from server import db
    res = await db.coach_rewards.update_many(
        {"user_id": user_id, "read_at": None},
        {"$set": {"read_at": utc_now()}},
    )
    return res.modified_count


__all__ = [
    "estimate_projected_impact",
    "record_reward",
    "get_recent_unread",
    "mark_all_read",
]
