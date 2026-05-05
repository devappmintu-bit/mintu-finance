"""
services/notification_jobs.py — Round 91 Surface 3.

Eight notification job functions, one per type. Each takes a `user`
(Mongo doc) and either dispatches a notification or returns silently.

The master `_notifications_loop` in core/lifecycle.py iterates active
users every 5 minutes and calls every job. Each job is responsible
for its own activation guard (time-of-day, event detection, etc.)
and the engine handles dedupe/quiet-hours/prefs.
"""
from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.time import utc_now
from services.notifications_engine import (
    NotificationType, dispatch, get_user_tz, get_daily_brief_time,
)

logger = logging.getLogger("notification_jobs")


# ────────────────────────── helpers ────────────────────────────

def _is_local_time(user: dict, hh: int, mm: int, window_min: int = 5) -> bool:
    """True if the user's local time is within `window_min` of HH:MM."""
    tz = get_user_tz(user)
    now = datetime.now(tz)
    target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    return abs((now - target).total_seconds()) <= window_min * 60


def _is_local_daily_brief_window(user: dict) -> bool:
    t = get_daily_brief_time(user)
    h, m = [int(x) for x in t.split(":")]
    return _is_local_time(user, h, m, window_min=5)


# ────────────────────────── jobs ───────────────────────────────


async def job_daily_brief(user: dict) -> None:
    """7:30 AM (user-tz) — yesterday's spend + status vs budget."""
    if not _is_local_daily_brief_window(user):
        return
    from server import db
    user_id = str(user["_id"])
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    yesterday_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    yesterday_end = yesterday_start + timedelta(days=1)
    # Convert to UTC for query.
    qstart = yesterday_start.astimezone(timezone.utc)
    qend = yesterday_end.astimezone(timezone.utc)
    agg = await db.transactions.aggregate([
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": qstart, "$lt": qend},
            "type": {"$nin": ["credit", "income"]},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    spent = float(agg[0]["total"]) if agg else 0.0
    if spent <= 0:
        body = "Yesterday: no expenses logged. A clean slate today."
    else:
        # Compare to user's running average of last 14 days (excluding yesterday).
        ago_14 = qstart - timedelta(days=14)
        avg_agg = await db.transactions.aggregate([
            {"$match": {
                "user_id": user_id,
                "date": {"$gte": ago_14, "$lt": qstart},
                "type": {"$nin": ["credit", "income"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        prior_total = float(avg_agg[0]["total"]) if avg_agg else 0.0
        avg_per_day = prior_total / 14.0 if prior_total else 0.0
        if avg_per_day == 0:
            status = "first day tracked."
        elif spent > avg_per_day * 1.2:
            status = f"~{int(((spent / avg_per_day) - 1) * 100)}% above your 14-day average."
        elif spent < avg_per_day * 0.8:
            status = "under your usual day. Nice."
        else:
            status = "right around your average."
        body = f"Yesterday: ₹{int(spent):,} spent. {status}"
    await dispatch(
        user_id=user_id,
        ntype=NotificationType.DAILY_BRIEF,
        title="Daily brief",
        body=body,
        deep_link="/(tabs)",
    )


async def job_salary_detected(user: dict) -> None:
    """Eager — credit transaction ≥ ₹10,000 in last 24h."""
    from server import db
    user_id = str(user["_id"])
    since = utc_now() - timedelta(hours=24)
    txn = await db.transactions.find_one(
        {
            "user_id": user_id,
            "type": {"$in": ["credit", "income"]},
            "amount": {"$gte": 10_000},
            "date": {"$gte": since},
        },
        sort=[("date", -1)],
    )
    if not txn:
        return
    amt = float(txn.get("amount") or 0)
    await dispatch(
        user_id=user_id,
        ntype=NotificationType.SALARY_DETECTED,
        title="Salary credited.",
        body=f"₹{int(amt):,} just hit. Plan this month with MintU?",
        deep_link="/ai-coach?prompt=plan_salary_month",
        dedupe_key=f"txn_{txn.get('_id')}",
    )


async def job_overspend_alert(user: dict) -> None:
    """Eager — any category > 20% over budget AND ≥ 5 days remain in month."""
    from server import db
    user_id = str(user["_id"])
    now = utc_now()
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_left = max(0, days_in_month - now.day)
    if days_left < 5:
        return
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
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
        if spent > cap * 1.2:
            await dispatch(
                user_id=user_id,
                ntype=NotificationType.OVERSPEND_ALERT,
                title="Overspend alert",
                body=f"₹{int(spent):,} on {cat} — {int(((spent - cap) / cap) * 100)}% over with {days_left} days left.",
                deep_link="/ai-coach?prompt=overspend_recovery",
                dedupe_key=f"cat_{cat}",
            )
            return    # one overspend per check


async def job_goal_milestone(user: dict) -> None:
    """Eager — fire when a goal crosses 25/50/75/100 % progress."""
    from server import db
    user_id = str(user["_id"])
    goals = await db.goals.find({
        "user_id": user_id,
        "target_amount": {"$gt": 0},
    }).to_list(50)
    for g in goals:
        target = float(g.get("target_amount") or 0)
        cur = float(g.get("current_amount") or 0)
        if target <= 0:
            continue
        pct = int((cur / target) * 100)
        # Round DOWN to nearest milestone the user has reached.
        milestones = [25, 50, 75, 100]
        reached = max((m for m in milestones if pct >= m), default=None)
        if not reached:
            continue
        # Use dedupe_key=goal+milestone so each milestone fires exactly once.
        title = "🎯 Goal achieved!" if reached == 100 else "Milestone hit"
        body = (
            f"You've reached 100% of {g.get('title','your goal')}. Set the next one?"
            if reached == 100 else
            f"You're {reached}% to your {g.get('title','goal')} goal. Keep going."
        )
        await dispatch(
            user_id=user_id,
            ntype=NotificationType.GOAL_MILESTONE,
            title=title,
            body=body,
            deep_link="/goals",
            dedupe_key=f"goal_{g.get('_id')}_{reached}",
        )


async def job_weekly_wrap(user: dict) -> None:
    """Sunday 19:00 user-local — total + best-tracked category."""
    if not _is_local_time(user, 19, 0, window_min=10):
        return
    from server import db
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    if now_local.weekday() != 6:    # 0=Mon...6=Sun
        return
    user_id = str(user["_id"])
    week_ago = (now_local - timedelta(days=7)).astimezone(timezone.utc)
    agg = await db.transactions.aggregate([
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": week_ago},
            "type": {"$nin": ["credit", "income"]},
        }},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
    ]).to_list(20)
    total = sum(float(d.get("total") or 0) for d in agg)
    if total == 0:
        body = "Quiet week — no expenses logged."
    else:
        top = agg[0].get("_id", "uncategorised") if agg else "—"
        body = f"Your week: ₹{int(total):,} spent, top category {top}. Set the bar for next week?"
    await dispatch(
        user_id=user_id,
        ntype=NotificationType.WEEKLY_WRAP,
        title="Weekly wrap",
        body=body,
        deep_link="/ai-coach?prompt=weekly_review",
    )


async def job_month_end_report(user: dict) -> None:
    """1st of month, 9:00 user-local — last month's report."""
    if not _is_local_time(user, 9, 0, window_min=10):
        return
    from server import db
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    if now_local.day != 1:
        return
    user_id = str(user["_id"])
    # Last month window in user-local then convert.
    first_of_this = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = first_of_this
    last_month_start = (last_month_end - timedelta(days=1)).replace(day=1)
    qs = last_month_start.astimezone(timezone.utc)
    qe = last_month_end.astimezone(timezone.utc)
    month_label = last_month_start.strftime("%B")
    body = f"Your {month_label} report is ready. Did you beat last month?"
    # Quick total to make body feel personal.
    agg = await db.transactions.aggregate([
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": qs, "$lt": qe},
            "type": {"$nin": ["credit", "income"]},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total = float(agg[0]["total"]) if agg else 0.0
    if total > 0:
        body = f"Your {month_label} report: ₹{int(total):,} total spend. Did you beat the month before?"
    await dispatch(
        user_id=user_id,
        ntype=NotificationType.MONTH_END_REPORT,
        title="Monthly report",
        body=body,
        deep_link="/spending-insights",
        dedupe_key=last_month_start.strftime("%Y_%m"),
    )


async def job_dormancy_nudge(user: dict) -> None:
    """7+ days since last_seen_at — gentle pull-back."""
    last = user.get("last_seen_at")
    if not last:
        return
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if (utc_now() - last) < timedelta(days=7):
        return
    await dispatch(
        user_id=str(user["_id"]),
        ntype=NotificationType.DORMANCY_NUDGE,
        title="Missing you.",
        body="You haven't checked in. Your money has been busy — see what changed.",
        deep_link="/(tabs)",
    )


async def job_split_reminder(user: dict) -> None:
    """48h after an unsettled split — nudge to remind the debtor.

    Conservative: only fires for ONE oldest unsettled split per pass to
    avoid spamming a user with 5 group settlements at once.
    """
    from server import db
    user_id = str(user["_id"])
    cutoff = utc_now() - timedelta(hours=48)
    # Find one outstanding split where the user is owed money and the
    # split is older than 48h. Schema tolerant: try a few common shapes.
    split = await db.split_expenses.find_one({
        "owed_to": user_id,
        "settled": {"$ne": True},
        "created_at": {"$lt": cutoff},
    })
    if not split:
        return
    # Compute owed amount + debtor name (best-effort).
    amount = float(split.get("amount_owed") or split.get("share") or 0)
    debtor_name = split.get("debtor_name") or split.get("from_name") or "Someone"
    if amount <= 0:
        return
    await dispatch(
        user_id=user_id,
        ntype=NotificationType.SPLIT_REMINDER,
        title="Unsettled split",
        body=f"{debtor_name} owes you ₹{int(amount):,}. Send a reminder?",
        deep_link="/(tabs)/split",
        dedupe_key=str(split.get("_id")),
    )


# Master job registry — used by the lifecycle worker.
ALL_JOBS = [
    job_daily_brief,
    job_salary_detected,
    job_overspend_alert,
    job_goal_milestone,
    job_weekly_wrap,
    job_month_end_report,
    job_dormancy_nudge,
    job_split_reminder,
]


async def run_all_for_user(user: dict) -> None:
    """Run every job for one user. Each job swallows its own errors."""
    for j in ALL_JOBS:
        try:
            await j(user)
        except Exception as e:    # noqa: BLE001
            logger.warning("job %s failed for %s: %s", j.__name__, user.get("_id"), e)


__all__ = ["ALL_JOBS", "run_all_for_user"]
