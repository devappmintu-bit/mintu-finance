"""
profile_engine.py — Living Financial Identity + Progress Engine endpoints.

New endpoints (add-only; do NOT break existing /api/profile/identity):
  • GET /api/profile/score-breakdown
        Returns 3 sub-scores (saving_habits, spending_control,
        consistency) plus a predictive insight line like
        "At this pace, you'll reach Wealth Builder in 9 days".

  • GET /api/profile/weekly-comparison
        Compares this week's saved amount / transactions /
        top-category spend against the previous 7 days and
        emits AI commentary ("You're 18% better than last week").

  • GET /api/profile/missions
        Returns 3 daily missions each with xp, coins, est_seconds,
        category, route, and a "streak_saver" flag. Refreshes daily
        via date_key; deterministic per-user per-day so the frontend
        can countdown to next refresh.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict

from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user
from core.cache import cache_get, cache_set
from core.time import utc_now

router = APIRouter(tags=["profile-engine"])


# ── Helpers ─────────────────────────────────────────────────────
def _month_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, now


def _week_bounds(now: datetime, weeks_ago: int = 0) -> tuple[datetime, datetime]:
    # Monday-start week; "weeks_ago=0" = current, "=1" = last week.
    start = (now - timedelta(days=now.weekday() + 7 * weeks_ago)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    end = start + timedelta(days=7)
    if weeks_ago == 0:
        end = min(end, now)
    return start, end


async def _sum_range(user_id: str, start: datetime, end: datetime) -> Dict[str, float]:
    try:
        txns = await db.transactions.find(
            {"user_id": user_id, "date": {"$gte": start, "$lt": end}},
            {"amount": 1, "type": 1, "category": 1},
        ).to_list(5000)
    except Exception:
        txns = []
    income = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "income")
    expense = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "expense")
    cat: Dict[str, float] = {}
    for t in txns:
        if t.get("type") == "expense":
            c = t.get("category") or "Other"
            cat[c] = cat.get(c, 0) + float(t.get("amount", 0))
    top_cat = max(cat.items(), key=lambda x: x[1]) if cat else None
    return {
        "income": income,
        "expense": expense,
        "saved": max(0.0, income - expense),
        "txn_count": len(txns),
        "top_category": top_cat[0] if top_cat else None,
        "top_amount": top_cat[1] if top_cat else 0.0,
    }


# ── Endpoints ──────────────────────────────────────────────────
@router.get("/profile/score-breakdown")
async def score_breakdown(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Break the Money Score into 3 pillars + predictive insight. Cached 120s."""
    cache_key = f"score_breakdown:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = await db.users.find_one(
            {"_id": ObjectId(user_id)},
            {"money_score": 1, "streak_days": 1, "badges_earned": 1},
        ) or {}
    except Exception:
        user = {}

    score = int(user.get("money_score", 0) or 0)
    streak = int(user.get("streak_days", 0) or 0)

    now = utc_now()
    month_start, _ = _month_bounds(now)
    this = await _sum_range(user_id, month_start, now)
    saving_rate = int(round((this["saved"] / this["income"]) * 100)) if this["income"] > 0 else 0

    # Sub-scores (clamped 0..100)
    saving_habits = min(100, max(0, saving_rate * 4))  # 25% savings = 100
    spending_control = 100
    if this["top_amount"] > 0 and this["expense"] > 0:
        # If top category > 45% of expense, penalise heavily
        dominance = this["top_amount"] / this["expense"]
        spending_control = max(0, int(round(100 - (dominance - 0.35) * 250)))
        spending_control = min(100, max(0, spending_control))
    consistency = min(100, streak * 7 + (20 if this["txn_count"] > 15 else 0))

    # Tier progression prediction
    if score < 40:
        next_tier, delta = "Growing Saver", max(1, 40 - score)
    elif score < 60:
        next_tier, delta = "Smart Spender", max(1, 60 - score)
    elif score < 80:
        next_tier, delta = "Elite Saver", max(1, 80 - score)
    elif score < 100:
        next_tier, delta = "Wealth Builder", max(1, 100 - score)
    else:
        next_tier, delta = "Wealth Master", 0

    # Predictive: assume +1 point per active day (heuristic)
    pace_per_day = max(0.5, streak / 7 + 0.5)  # active users gain faster
    days_to_next = int(round(delta / pace_per_day)) if delta > 0 else 0
    if delta == 0:
        predictive = "You've hit the top tier — maintain momentum"
    elif days_to_next <= 0:
        predictive = f"You're on the brink of reaching {next_tier}"
    else:
        predictive = f"At this pace, you'll reach {next_tier} in {days_to_next} days"

    # Round 51 — fix script omission: capture result, populate cache,
    # then return. Without cache_set the cache_get above never hits.
    result = {
        "current_score": score,
        "next_tier": next_tier,
        "points_to_next": delta,
        "predictive_insight": predictive,
        "status_ring": "green" if saving_rate >= 20 else "orange" if saving_rate >= 10 else "red",
        "pillars": [
            {
                "key": "saving_habits", "label": "Saving habits",
                "score": saving_habits, "emoji": "💰",
                "hint": f"{saving_rate}% of income saved",
            },
            {
                "key": "spending_control", "label": "Spending control",
                "score": spending_control, "emoji": "🎯",
                "hint": f"Top: {this['top_category'] or 'N/A'}" if this["top_category"] else "Log expenses to activate",
            },
            {
                "key": "consistency", "label": "Consistency",
                "score": consistency, "emoji": "🔥",
                "hint": f"{streak}-day streak · {this['txn_count']} txns",
            },
        ],
    }
    cache_set(cache_key, result, ttl_seconds=120)
    return result


@router.get("/profile/weekly-comparison")
async def weekly_comparison(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Compare THIS week vs LAST week. Emit AI commentary + reward preview."""
    now = utc_now()
    t_start, t_end = _week_bounds(now, 0)
    l_start, l_end = _week_bounds(now, 1)

    this_week = await _sum_range(user_id, t_start, t_end)
    last_week = await _sum_range(user_id, l_start, l_end)

    # Deltas
    saved_delta = this_week["saved"] - last_week["saved"]
    expense_delta = this_week["expense"] - last_week["expense"]
    pct = 0
    if last_week["expense"] > 0:
        pct = int(round(((last_week["expense"] - this_week["expense"]) / last_week["expense"]) * 100))

    # AI commentary
    if this_week["txn_count"] == 0:
        commentary = "Log an expense to compare with last week"
        tone = "info"
    elif pct >= 20:
        commentary = f"You're {pct}% better than last week 🎉"
        tone = "positive"
    elif pct >= 5:
        commentary = f"Trimmed {pct}% vs last week — keep going"
        tone = "positive"
    elif pct <= -20:
        commentary = f"Spending up {abs(pct)}% vs last week — review now"
        tone = "warn"
    elif pct <= -5:
        commentary = f"Spending up {abs(pct)}% vs last week"
        tone = "neutral"
    else:
        commentary = "On par with last week — push for a win"
        tone = "neutral"

    # Reward preview
    reward = {
        "coins": 50 if pct >= 10 else 20 if pct >= 0 else 0,
        "badge": "Weekly Winner" if pct >= 20 else None,
        "tier_boost": pct >= 10,
    }

    return {
        "this_week": this_week,
        "last_week": last_week,
        "saved_delta": saved_delta,
        "expense_delta": expense_delta,
        "pct_better": pct,
        "commentary": commentary,
        "tone": tone,
        "reward_preview": reward,
    }


@router.get("/profile/missions")
async def profile_missions(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Return 3 daily missions deterministic per user-day."""
    now = utc_now()
    midnight_utc = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1))
    seconds_to_refresh = int((midnight_utc - now).total_seconds())
    date_key = now.strftime("%Y-%m-%d")

    # Pull user context for tailoring
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"streak_days": 1}) or {}
    except Exception:
        user = {}
    streak = int(user.get("streak_days", 0) or 0)

    # Today snapshot
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        logged_today = await db.transactions.count_documents({"user_id": user_id, "date": {"$gte": today_start}})
    except Exception:
        logged_today = 0

    missions = []

    # 1) Log an expense (always - streak saver if 0 logged)
    missions.append({
        "id": "log-expense",
        "title": "Log today's expense",
        "hint": "30 seconds keeps your streak alive",
        "icon": "add-circle-outline",
        "xp": 10,
        "coins": 5,
        "est_seconds": 30,
        "category": "track",
        "route": "/(tabs)/transactions",
        "streak_saver": logged_today == 0 and streak > 0,
        "done": logged_today > 0,
    })

    # 2) Review a budget / category
    missions.append({
        "id": "review-category",
        "title": "Review top spend category",
        "hint": "Spot 1 thing to cut this week",
        "icon": "pie-chart-outline",
        "xp": 15,
        "coins": 10,
        "est_seconds": 60,
        "category": "budget",
        "route": "/(tabs)/budget",
        "streak_saver": False,
        "done": False,
    })

    # 3) Check AI insight
    missions.append({
        "id": "ai-insight",
        "title": "Ask MintU AI today",
        "hint": "1-tap action: \"Am I overspending?\"",
        "icon": "sparkles-outline",
        "xp": 20,
        "coins": 15,
        "est_seconds": 15,
        "category": "ai",
        "route": "/(tabs)/ai",
        "streak_saver": False,
        "done": False,
    })

    total_xp = sum(m["xp"] for m in missions if not m["done"])
    total_coins = sum(m["coins"] for m in missions if not m["done"])

    return {
        "date_key": date_key,
        "seconds_to_refresh": seconds_to_refresh,
        "missions": missions,
        "total_xp": total_xp,
        "total_coins": total_coins,
        "streak": streak,
    }
