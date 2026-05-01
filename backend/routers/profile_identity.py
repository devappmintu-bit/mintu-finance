"""
profile_identity.py — Aggregated "Financial Identity" data for Profile Hero.

Returns one-shot data the Profile Hero needs:
- money_score, monthly_score_delta (MoM)
- top_percent (percentile rank vs all users)
- coins_balance (from rewards wallet)
- streak
- badges_earned / total
- tier info
- is_premium

This avoids the client making 4-5 parallel calls on mount.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

from bson import ObjectId
from fastapi import APIRouter, Depends
from core.time import utc_now

from core import db, get_current_user

router = APIRouter(tags=["profile-identity"])


# ── Helpers ────────────────────────────────────────────────────────
async def _get_coins(user_id: str) -> int:
    """Pull latest coin balance from the rewards wallet / user doc."""
    try:
        # Try dedicated coins_wallet collection first
        w = await db.coins_wallet.find_one({"user_id": user_id})
        if w and "balance" in w:
            return int(w.get("balance", 0))
    except Exception:
        pass
    # Fallback: user doc
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)}, {"reward_coins": 1, "coins_balance": 1})
        if u:
            return int(u.get("coins_balance") or u.get("reward_coins") or 0)
    except Exception:
        pass
    return 0


async def _get_top_percent(user_id: str, score: int) -> int:
    """Percentile rank — % of users with a LOWER score than me.
    Returns 'top N%' i.e. (1 - pct_below) * 100 rounded down to a known bucket.

    Phase 5 optimisation: wrap in a 5-minute cache. The percentile only
    shifts meaningfully on new user registrations and score bumps, so
    fresh-every-5-minutes is visually indistinguishable from live.
    Previously two full-collection count_documents() calls per Profile
    open — O(users) × 2. Now O(1) on cache hit.
    """
    from core.cache import cache_get, cache_set
    _ck = f"profile_identity:top_pct:{score}"
    cached = cache_get(_ck)
    if cached is not None:
        return int(cached)

    try:
        total = await db.users.count_documents({})
        if total <= 1:
            return 10  # conservative default for solo / new accounts
        higher = await db.users.count_documents({"money_score": {"$gt": score}})
        # Rank = (higher + 1) / total; top percentile = rank * 100
        top_pct = int(round(((higher + 1) / total) * 100))
        # Clamp / bucket to readable values
        if top_pct <= 1:
            result = 1
        elif top_pct <= 5:
            result = 5
        elif top_pct <= 10:
            result = 10
        elif top_pct <= 25:
            result = 25
        elif top_pct <= 50:
            result = 50
        else:
            result = 75
        cache_set(_ck, result, ttl_seconds=300)   # 5 min TTL
        return result
    except Exception:
        # Heuristic fallback using the score itself
        if score >= 90:
            return 1
        if score >= 80:
            return 5
        if score >= 70:
            return 15
        if score >= 60:
            return 30
        if score >= 50:
            return 50
        return 75


async def _get_monthly_delta(user_id: str, current_score: int) -> int:
    """Compare current money_score to the most recent snapshot from
    ~30 days ago in the `score_history` collection. Falls back to 0
    if no history exists (new account)."""
    try:
        cutoff = utc_now() - timedelta(days=30)
        snap = await db.score_history.find_one(
            {"user_id": user_id, "snapshot_at": {"$lte": cutoff}},
            sort=[("snapshot_at", -1)],
        )
        if snap and "money_score" in snap:
            return int(current_score - int(snap["money_score"]))
    except Exception:
        pass
    return 0


async def _record_score_snapshot(user_id: str, score: int) -> None:
    """Record a score snapshot at most once per day for delta calc."""
    try:
        today_key = utc_now().strftime("%Y-%m-%d")
        existing = await db.score_history.find_one({"user_id": user_id, "date_key": today_key})
        if not existing:
            await db.score_history.insert_one({
                "user_id": user_id,
                "money_score": int(score),
                "date_key": today_key,
                "snapshot_at": utc_now(),
            })
    except Exception:
        # Non-critical
        pass


async def _get_badges(user_id: str) -> Dict[str, int]:
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"badges_earned": 1})
        earned = len((user or {}).get("badges_earned", []))
    except Exception:
        earned = 0
    # Total available badges is static; keep in sync with gamification.py
    return {"earned": earned, "total": 12}


# ── Endpoints ──────────────────────────────────────────────────────
@router.get("/profile/identity")
async def profile_identity(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """One-shot Hero data for the Profile tab."""
    try:
        user = await db.users.find_one(
            {"_id": ObjectId(user_id)},
            {
                "name": 1, "phone": 1, "money_score": 1, "streak_days": 1,
                "avatar": 1, "is_premium": 1, "is_pro": 1, "created_at": 1,
            },
        ) or {}
    except Exception:
        user = {}

    score = int(user.get("money_score", 0) or 0)

    # Phase 5 fix: parallelize 4 independent DB roundtrips via asyncio.gather.
    # Previously these ran sequentially (~200-400ms total on cold paths).
    # With gather they run concurrently → ~50-100ms total (the slowest wins).
    coins, top_pct, monthly_delta, badges = await asyncio.gather(
        _get_coins(user_id),
        _get_top_percent(user_id, score),
        _get_monthly_delta(user_id, score),
        _get_badges(user_id),
    )

    # Fire-and-forget snapshot (keep serial — ordering matters for same-day dedup)
    await _record_score_snapshot(user_id, score)

    # Tier derivation — mirror frontend
    if score >= 80:
        tier_label, tier_emoji = "Elite Saver", "🏆"
    elif score >= 60:
        tier_label, tier_emoji = "Smart Spender", "💪"
    elif score >= 40:
        tier_label, tier_emoji = "Growing Saver", "⚡"
    else:
        tier_label, tier_emoji = "Just Starting", "🌱"

    return {
        "user_id": user_id,
        "name": user.get("name", "User"),
        "phone": user.get("phone", ""),
        "avatar": user.get("avatar"),
        "money_score": score,
        "monthly_score_delta": monthly_delta,
        "top_percent": top_pct,
        "coins_balance": coins,
        "streak": int(user.get("streak_days", 0) or 0),
        "badges_earned": badges["earned"],
        "badges_total": badges["total"],
        "tier_label": tier_label,
        "tier_emoji": tier_emoji,
        "is_premium": bool(user.get("is_premium") or user.get("is_pro")),
    }


@router.get("/profile/score-boosts")
async def profile_score_boosts(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Return 3 actionable Score-Boost tips tailored to the user's weakest area.

    Heuristics based on current analytics:
      • If savings_rate < 20% → suggest tightening top category.
      • If streak < 7        → suggest a daily-tracking streak goal.
      • If no goals          → suggest creating a savings goal.
      • If no budget        → suggest setting a budget.
    Always returns 3 items (fallback stubs if nothing applies).
    """
    from datetime import datetime as dt

    boosts = []

    # Pull minimal analytics
    try:
        now = dt.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        txns = await db.transactions.find(
            {"user_id": user_id, "date": {"$gte": month_start}},
            {"amount": 1, "type": 1, "category": 1},
        ).to_list(2000)
    except Exception:
        txns = []

    income = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "income")
    expense = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "expense")
    savings_rate = int(round(((income - expense) / income) * 100)) if income > 0 else 0

    # Pull user context
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"streak_days": 1, "money_score": 1}) or {}
    except Exception:
        user = {}
    streak = int(user.get("streak_days", 0) or 0)
    score = int(user.get("money_score", 0) or 0)

    # Count goals + budgets
    try:
        goals_count = await db.goals.count_documents({"user_id": user_id, "status": {"$ne": "completed"}})
    except Exception:
        goals_count = 0
    try:
        budgets_count = await db.budgets.count_documents({"user_id": user_id})
    except Exception:
        budgets_count = 0

    # Build boosts in priority order
    if savings_rate < 20:
        # Find top category
        cat_map: Dict[str, float] = {}
        for t in txns:
            if t.get("type") == "expense":
                c = t.get("category") or "Other"
                cat_map[c] = cat_map.get(c, 0) + float(t.get("amount", 0))
        top_cat = max(cat_map.items(), key=lambda x: x[1])[0] if cat_map else "Food"
        boosts.append({
            "id": "save_more",
            "emoji": "💸",
            "title": f"Cut ₹500 from {top_cat}",
            "sub": f"Your savings rate is {savings_rate}%. Trimming your #1 spend boosts score by +8",
            "points": 8,
            "route": "/(tabs)/budget",
            "cta": "Set a budget",
        })

    if streak < 7:
        boosts.append({
            "id": "streak_7",
            "emoji": "🔥",
            "title": "Hit a 7-day tracking streak",
            "sub": f"You're at {streak} days. Log daily for 7 days to unlock +5 score",
            "points": 5,
            "route": "/(tabs)/transactions",
            "cta": "Log expense",
        })

    if goals_count == 0:
        boosts.append({
            "id": "first_goal",
            "emoji": "🎯",
            "title": "Set your first savings goal",
            "sub": "Goals boost commitment. Create one to earn +4 score instantly",
            "points": 4,
            "route": "/(tabs)/budget",
            "cta": "Create goal",
        })

    if budgets_count == 0 and len(boosts) < 3:
        boosts.append({
            "id": "first_budget",
            "emoji": "📊",
            "title": "Create your first budget",
            "sub": "Budgets drive smart spending. Set one to earn +6 score",
            "points": 6,
            "route": "/(tabs)/budget",
            "cta": "Create budget",
        })

    if score < 60 and len(boosts) < 3:
        boosts.append({
            "id": "premium",
            "emoji": "💎",
            "title": "Activate AI Coach weekly check-ins",
            "sub": "Premium unlocks 2× rewards and tailored boosts — +10 score over 4 weeks",
            "points": 10,
            "route": "/premium",
            "cta": "Try free",
        })

    # Fallback stubs
    generic = [
        {"id": "share", "emoji": "📢", "title": "Refer a friend for +₹50",
         "sub": "Each successful referral also boosts your leaderboard rank",
         "points": 3, "route": "/(tabs)/profile", "cta": "Share invite"},
        {"id": "spin", "emoji": "🎡", "title": "Spin the Daily Wheel",
         "sub": "Free daily spin — coins, boosts & more await",
         "points": 2, "route": "/(tabs)/rewards", "cta": "Spin now"},
        {"id": "leaderboard", "emoji": "🏅", "title": "Climb the leaderboard",
         "sub": "Compete with friends — top 3 rank earns a trophy badge",
         "points": 3, "route": "/(tabs)/rewards", "cta": "View ranks"},
    ]
    while len(boosts) < 3:
        boosts.append(generic.pop(0))

    return {"boosts": boosts[:3], "current_score": score, "max_potential": sum(b["points"] for b in boosts[:3])}
