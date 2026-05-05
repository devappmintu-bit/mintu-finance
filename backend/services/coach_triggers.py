"""
services/coach_triggers.py — Round 90 Surface 1B production close-out.

Single source of truth for the 3 proactive coach triggers. Both
`POST /api/coach/triggers/check` (manual/UI) and the background cron
worker import `evaluate_for_user(...)` from here, so logic drift is
impossible.

Idempotency:
  We store a `coach_trigger_history` record per (user_id, trigger_id)
  with the last-fired timestamp. The cron worker skips any trigger
  that fired within the COOLDOWN window:
    • salary_credited     → 24h
    • overspend_<cat>     → 12h
    • weekly_review       → 6 days
"""
from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from core.time import utc_now

logger = logging.getLogger("coach_triggers")

# Cooldown windows per trigger family.
COOLDOWN: dict[str, timedelta] = {
    "salary_credited": timedelta(hours=24),
    "overspend":       timedelta(hours=12),
    "weekly_review":   timedelta(days=6),
}


def _trigger_family(trigger_id: str) -> str:
    """Map a specific id (e.g. 'overspend_food') to its cooldown family."""
    if trigger_id.startswith("overspend_"):
        return "overspend"
    return trigger_id


async def evaluate_for_user(user_id: str) -> list[dict]:
    """Return the list of coach triggers that fire RIGHT NOW for the user.

    No cooldown applied here — the caller decides whether to honour
    history. Suitable for both:
      • UI/manual call (no cooldown — user pulled to refresh)
      • Cron worker (passes through dispatch_with_cooldown below)
    """
    from server import db

    now = utc_now()
    fired: list[dict] = []

    # ── TRIGGER 1 — Salary credited (last 24h, type=credit/income, ≥ ₹10k)
    since = now - timedelta(hours=24)
    recent_salary = await db.transactions.find_one(
        {
            "user_id": user_id,
            "type": {"$in": ["credit", "income"]},
            "amount": {"$gte": 10_000},
            "date": {"$gte": since},
        },
        sort=[("date", -1)],
    )
    if recent_salary:
        amt = float(recent_salary.get("amount") or 0)
        fired.append({
            "id": "salary_credited",
            "title": "Salary just hit.",
            "body": f"₹{int(amt):,} credited. Want me to plan this month before Swiggy does?",
            "deep_link": "/ai-coach?prompt=plan_salary_month",
            "severity": "info",
        })

    # ── TRIGGER 2 — Overspend (>20% over cap, ≥5 days left)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_left = max(0, days_in_month - now.day)
    if days_left >= 5:
        budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
        for b in budgets:
            cap = float(b.get("amount") or 0)
            cat = b.get("category")
            if cap <= 0 or not cat:
                continue
            agg = await db.transactions.aggregate([
                {"$match": {
                    "user_id": user_id,
                    "category": cat,
                    "date": {"$gte": month_start},
                    "type": {"$nin": ["credit", "income"]},
                }},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
            ]).to_list(1)
            spent = float(agg[0]["total"]) if agg else 0.0
            if cap > 0 and spent > cap * 1.2:
                pct = int(((spent - cap) / cap) * 100)
                fired.append({
                    "id": f"overspend_{cat}",
                    "title": "Overspend alert.",
                    "body": f"You've spent ₹{int(spent):,} on {cat} — {pct}% over budget with {days_left} days left.",
                    "deep_link": "/ai-coach?prompt=overspend_recovery",
                    "severity": "warn",
                })
                break    # one overspend per check

    # ── TRIGGER 3 — Sunday weekly review (Sun ≥14 UTC ≈ 20:00 IST)
    if now.weekday() == 6 and now.hour >= 14:
        week_ago = now - timedelta(days=7)
        agg = await db.transactions.aggregate([
            {"$match": {
                "user_id": user_id,
                "date": {"$gte": week_ago},
                "type": {"$nin": ["credit", "income"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        weekly_total = float(agg[0]["total"]) if agg else 0.0
        fired.append({
            "id": "weekly_review",
            "title": "Week's done.",
            "body": f"You spent ₹{int(weekly_total):,}. One thing to fix next week?",
            "deep_link": "/ai-coach?prompt=weekly_review",
            "severity": "info",
        })

    return fired


async def dispatch_for_user_with_cooldown(user_id: str, push_token: str | None) -> list[str]:
    """Used by the cron worker.

    Evaluates triggers, filters by cooldown history, dispatches via Expo
    push if a push_token is registered, and records each fire in
    `coach_trigger_history`. Returns the list of trigger ids that were
    actually pushed (post-cooldown).
    """
    from server import db, send_expo_push

    fires = await evaluate_for_user(user_id)
    if not fires:
        return []

    now = utc_now()
    history = {
        h["trigger_id"]: h
        async for h in db.coach_trigger_history.find({"user_id": user_id})
    }

    fired_ids: list[str] = []
    for fire in fires:
        family = _trigger_family(fire["id"])
        cooldown = COOLDOWN.get(family, timedelta(hours=12))

        last = history.get(fire["id"]) or {}
        last_at: datetime | None = last.get("fired_at")
        if last_at:
            # Mongo serialises with tzinfo; defend against naive.
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            if (now - last_at) < cooldown:
                continue    # still in cooldown — skip

        # Dispatch (best-effort — never raise).
        sent = False
        if push_token:
            try:
                sent = await send_expo_push(
                    push_token,
                    fire["title"],
                    fire["body"],
                    {
                        "type": "coach_trigger",
                        "trigger_id": fire["id"],
                        "deeplink": fire["deep_link"],
                    },
                )
            except Exception as e:    # noqa: BLE001
                logger.warning("Expo push failed for %s/%s: %s", user_id, fire["id"], e)
                sent = False

        # Record fire (even if push failed — we don't want to retry every minute).
        await db.coach_trigger_history.update_one(
            {"user_id": user_id, "trigger_id": fire["id"]},
            {"$set": {
                "user_id": user_id,
                "trigger_id": fire["id"],
                "fired_at": now,
                "delivered": bool(sent),
                "deep_link": fire["deep_link"],
            }},
            upsert=True,
        )
        # Record the fire regardless of push delivery — cooldown applies
        # to triggers that fired logically, not just successfully pushed.
        fired_ids.append(fire["id"])

    return fired_ids


__all__ = [
    "evaluate_for_user",
    "dispatch_for_user_with_cooldown",
    "COOLDOWN",
]
