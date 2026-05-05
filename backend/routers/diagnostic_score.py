"""
routers/diagnostic_score.py — Round 92 (replaces abstract Money Score).

The old `Money Score: 73/100` carries zero meaning. A user staring at
"73" has no idea whether that's good, getting better, or which lever
will move it. We replace it with a 3-line **Diagnostic Score**:

  Line 1 — score + week-over-week delta  ("73 ▲3 vs last week")
  Line 2 — percentile vs USER'S OWN history, last 12 weeks
           ("better than 67% of your last 12 weeks")
  Line 3 — weakest category this month
           ("Food up 24% vs your typical")

This is **personal**, **directional** and **actionable** — three things
the abstract score wasn't.

Endpoint:
  GET  /api/home/diagnostic   — single source of truth for the Home Hero.

The home_bundle endpoint also calls this internally so the bundle has
the full diagnostic envelope without an extra round-trip.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends

from core import db, get_current_user
from core.cache import cache_get, cache_set
from core.time import utc_now
from core.users import get_user_by_id

router = APIRouter(tags=["diagnostic_score"])
log = logging.getLogger("diagnostic_score")


def _score_from_savings_rate(rate_pct: float) -> int:
    """Quick deterministic score derived from savings rate.

    Used as a stable fallback so the diagnostic still works for users
    who don't have `users.money_score` populated.
    """
    if rate_pct >= 30:
        return 90
    if rate_pct >= 20:
        return 78
    if rate_pct >= 10:
        return 65
    if rate_pct >= 0:
        return 52
    if rate_pct >= -10:
        return 40
    return 25


def _percentile_in_history(this_week_score: int, history: list[int]) -> int:
    """Percentile of `this_week_score` inside `history` (own past weeks).

    Returns 0..100, where 100 = better than every prior week and 0 =
    worse than every prior week. If history is empty, returns 50 so we
    don't display a misleading anchor on week-1 users.
    """
    if not history:
        return 50
    below = sum(1 for h in history if h < this_week_score)
    same = sum(1 for h in history if h == this_week_score)
    pct = ((below + same / 2.0) / len(history)) * 100
    return max(1, min(99, round(pct)))


@router.get("/home/diagnostic")
async def get_diagnostic(user_id: str = Depends(get_current_user)) -> dict:
    """Round 92 — Diagnostic Score (replaces abstract Money Score).

    Cache: 60 s per-user. Score recomputes when transactions land
    (cache invalidated by the txn router).
    """
    cache_key = f"diagnostic_score:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = utc_now()
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_start_3mo_ago = (month_start - timedelta(days=90)).replace(day=1)

    user = await get_user_by_id(user_id) or {}

    # ── Last 12 weeks of money score snapshots (own history percentile) ──
    # We snapshot weekly into `score_history` (collection seeded by the
    # weekly cron). If empty (new user), we fall back to live week-by-week
    # spend/income compute below.
    history_docs = await db.score_history.find(
        {"user_id": user_id},
    ).sort("week_start", -1).limit(12).to_list(12)
    history_scores = [int(d.get("score") or 0) for d in history_docs if d.get("score") is not None]

    # ── This week + last week numbers ──
    async def _week_totals(start: datetime, end: datetime) -> tuple[float, float]:
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user_id, "date": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]).to_list(10)
        income = 0.0
        expense = 0.0
        for d in agg:
            t = d.get("_id")
            if t in ("credit", "income"):
                income += float(d.get("total") or 0)
            else:
                expense += float(d.get("total") or 0)
        return income, expense

    this_inc, this_exp = await _week_totals(week_start, now)
    prev_inc, prev_exp = await _week_totals(prev_week_start, week_start)

    this_rate = ((this_inc - this_exp) / this_inc * 100) if this_inc > 0 else (-100 if this_exp > 0 else 0)
    prev_rate = ((prev_inc - prev_exp) / prev_inc * 100) if prev_inc > 0 else (-100 if prev_exp > 0 else 0)

    # Use stored money_score if present, else compute from savings rate.
    stored_score = int(user.get("money_score") or 0)
    score = stored_score if stored_score > 0 else _score_from_savings_rate(this_rate)

    # If no prior history & we computed live, simulate a prev-week score
    # so delta isn't always 0 on freshly-onboarded users.
    if history_scores:
        prev_score = history_scores[0]
    else:
        prev_score = _score_from_savings_rate(prev_rate)

    delta_week = int(score) - int(prev_score)

    # Percentile (own history). Need at least 3 weeks for meaningful pct.
    if len(history_scores) >= 3:
        percentile = _percentile_in_history(score, history_scores)
        percentile_basis = "own_history"
        history_count = len(history_scores)
    else:
        # New user — show direction not percentile to avoid misleading.
        percentile = 50
        percentile_basis = "insufficient_history"
        history_count = len(history_scores)

    # ── Weakest category — biggest pct overshoot vs the user's own
    #    rolling 90-day daily-average for that category. ──
    cur_month_pipe = await db.transactions.aggregate([
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": month_start},
            "type": {"$nin": ["credit", "income"]},
        }},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(50)

    prior_pipe = await db.transactions.aggregate([
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": month_start_3mo_ago, "$lt": month_start},
            "type": {"$nin": ["credit", "income"]},
        }},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
    ]).to_list(50)
    prior_map = {d["_id"]: float(d.get("total") or 0) / 90.0 for d in prior_pipe}  # daily avg

    days_this_month = max(1, now.day)
    weakest = None
    for c in cur_month_pipe:
        cat = c.get("_id") or "uncategorised"
        cur_total = float(c.get("total") or 0)
        cur_daily = cur_total / days_this_month
        prior_daily = prior_map.get(cat, 0.0)
        # Skip categories with no prior history (can't be "up vs typical").
        if prior_daily <= 0:
            continue
        overshoot_pct = round(((cur_daily - prior_daily) / prior_daily) * 100)
        # Only count categories OVER baseline.
        if overshoot_pct <= 5:
            continue
        # Material spend gate — ignore tiny categories.
        if cur_total < 200:
            continue
        if weakest is None or overshoot_pct > weakest["overshoot_pct"]:
            weakest = {
                "category": cat,
                "current_month_spend": int(cur_total),
                "typical_daily": int(prior_daily),
                "current_daily": int(cur_daily),
                "overshoot_pct": int(overshoot_pct),
            }

    # ── Build the 3-line headlines (server-side so any client renders identically) ──
    arrow = "▲" if delta_week > 0 else ("▼" if delta_week < 0 else "•")
    sign = "+" if delta_week > 0 else ""
    line_1 = f"{score} {arrow} {sign}{delta_week} vs last week" if delta_week != 0 else f"{score} • flat vs last week"

    if percentile_basis == "own_history":
        if percentile >= 75:
            line_2 = f"Better than {percentile}% of your last {history_count} weeks"
        elif percentile >= 25:
            line_2 = f"Middle of your last {history_count} weeks ({percentile}%)"
        else:
            line_2 = f"Worse than {100 - percentile}% of your last {history_count} weeks"
    else:
        line_2 = f"Building your baseline — {history_count}/3 weeks logged"

    if weakest:
        line_3 = f"{weakest['category'].title()} up {weakest['overshoot_pct']}% vs your typical"
    else:
        line_3 = "All categories on baseline this month"

    result = {
        "score": int(score),
        "delta_week": int(delta_week),
        "percentile": int(percentile),
        "percentile_basis": percentile_basis,
        "history_count": history_count,
        "weakest_category": weakest,
        "headline": {
            "score_line": line_1,
            "percentile_line": line_2,
            "weakest_line": line_3,
        },
        "computed_at": now.isoformat(),
    }
    cache_set(cache_key, result, ttl_seconds=60)
    return result


__all__ = ["router", "get_diagnostic"]
