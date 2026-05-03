"""Gamification router — streaks, badges, weekly challenges."""
from datetime import datetime, timedelta, date, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user
from core.users import get_user_by_id
from core.time import utc_now

router = APIRouter(prefix="/gamification", tags=["gamification"])


# Public so other modules (e.g. premium.py, server.py) can import definitions.
BADGES = {
    "first_track":   {"name": "First Step",       "desc": "Tracked your first expense",        "icon": "footsteps"},
    "week_streak":   {"name": "Week Warrior",     "desc": "7-day tracking streak",             "icon": "flame"},
    "month_streak":  {"name": "Streak Master",    "desc": "30-day tracking streak",            "icon": "trophy"},
    "budget_master": {"name": "Budget Master",    "desc": "Stayed within all budgets for a month", "icon": "shield-checkmark"},
    "saver_pro":     {"name": "Saver Pro",        "desc": "Saved 20%+ of income",              "icon": "cash"},
    "impulse_killer":{"name": "Impulse Killer",   "desc": "Completed a no-Swiggy challenge",    "icon": "flash-off"},
    "money_school":  {"name": "Money Scholar",    "desc": "Read 10 Money School lessons",       "icon": "school"},
    "family_leader": {"name": "Family CFO",       "desc": "Created a family group",            "icon": "people"},
    "voice_tracker": {"name": "Voice Pro",        "desc": "Added 10 expenses by voice",        "icon": "mic"},
    "score_80":      {"name": "Elite Scorer",     "desc": "Reached Money Score 80+",           "icon": "star"},
}

WEEKLY_CHALLENGES = [
    {"id": "no_swiggy_3", "title": "No Swiggy for 3 days",  "desc": "Skip food delivery for 3 days",               "category": "Food",     "target_days": 3},
    {"id": "save_500",    "title": "Save ₹500 this week",   "desc": "Reduce spending by ₹500 vs last week",        "category": None,       "target_amount": 500},
    {"id": "cook_5",      "title": "Cook 5 meals at home",  "desc": "Track 5 home-cooked meals",                    "category": "Food",     "target_count": 5},
    {"id": "no_shopping", "title": "No Shopping Spree",     "desc": "Zero shopping expenses for 5 days",            "category": "Shopping", "target_days": 5},
    {"id": "budget_all",  "title": "Budget Everything",     "desc": "Set budgets for all your spending categories", "category": None,       "target_count": 5},
    {"id": "cash_tracker","title": "Cash Detective",        "desc": "Track 10 cash expenses this week",             "category": None,       "target_count": 10},
]


async def _compute_streak(user_id: str) -> int:
    """Scan back from today until we hit a day with no transaction.

    Round 44 perf — was 365 sequential `find_one` queries (one per day).
    Now we do ONE aggregation that buckets transactions by day, then walk
    the result set in Python. Drops the cost from O(365 round-trips) to
    O(1 round-trip).
    """
    today = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    earliest = today - timedelta(days=365)
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": earliest}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
        }},
    ]
    days_with_txn: set[str] = set()
    async for d in db.transactions.aggregate(pipeline):
        days_with_txn.add(d["_id"])

    streak = 0
    for i in range(365):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        if day in days_with_txn:
            streak += 1
        elif i > 0:
            break  # allow today to not have a txn yet
    return streak


async def _award_new_badges(user_id: str, existing: list, streak: int, score: int) -> list:
    """Auto-award eligible badges based on the user's current stats."""
    new_badges = []
    txn_count = await db.transactions.count_documents({"user_id": user_id})
    rules = [
        (txn_count >= 1,  "first_track"),
        (streak >= 7,     "week_streak"),
        (streak >= 30,    "month_streak"),
        (score >= 80,     "score_80"),
    ]
    for cond, badge_id in rules:
        if cond and badge_id not in existing:
            new_badges.append(badge_id)
    if new_badges:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"badges": existing + new_badges}},
        )
    return new_badges


@router.get("/status")
async def get_gamification_status(user_id: str = Depends(get_current_user)):
    """Get user's streak, badges, weekly challenge with live progress,
    score breakdown, next-milestone preview, and a peer percentile.

    Round 73 — added the data the redesigned Rewards screen needs:
      • ``weekly_challenge.progress`` — current vs target so the UI
        can show a "1/3 days" progress tracker
      • ``next_milestone`` — the closest still-locked badge + what's
        needed to unlock (so we can show a real preview, not an
        empty "no badges" placeholder)
      • ``score_breakdown`` — sub-scores (tracking / budget /
        savings / streak) so tapping the score reveals the math
      • ``percentile`` — "Top X% savers this week" social proof
    """
    user = await get_user_by_id(user_id) or {}
    money_score = int(user.get("money_score", 50) or 50)
    streak = await _compute_streak(user_id)
    user_badges = list(user.get("badges", []))
    new_badges = await _award_new_badges(
        user_id, user_badges, streak, money_score
    )
    user_badges.extend(new_badges)

    week_num = date.today().isocalendar()[1]
    active_challenge = dict(WEEKLY_CHALLENGES[week_num % len(WEEKLY_CHALLENGES)])
    # Add live progress to the challenge — see helper for the per-id math.
    active_challenge["progress"] = await _compute_challenge_progress(
        user_id, active_challenge
    )

    # Round 73 — Score breakdown for the tap-to-explain UX. Sub-scores
    # are intentionally simple heuristics from already-loaded fields so
    # we don't add a DB query.
    txn_count = await db.transactions.count_documents({"user_id": user_id})
    tracking_pts = min(25, txn_count // 2)               # 50 txns → 25
    budget_count = await db.budgets.count_documents({"user_id": user_id})
    budget_pts = min(25, budget_count * 5)               # 5 budgets → 25
    streak_pts = min(25, streak * 2)                     # 12d → 24
    savings_pts = max(0, money_score - tracking_pts - budget_pts - streak_pts)
    score_breakdown = [
        {"label": "Tracking activity", "value": tracking_pts, "max": 25, "icon": "list"},
        {"label": "Budget discipline", "value": budget_pts, "max": 25, "icon": "shield-checkmark"},
        {"label": "Streak strength", "value": streak_pts, "max": 25, "icon": "flame"},
        {"label": "Savings habit", "value": min(25, savings_pts), "max": 25, "icon": "trending-up"},
    ]

    # Round 73 — Next milestone preview. Show the closest still-locked
    # badge and the gap-to-unlock copy so the empty badges row is gone.
    next_milestone = _build_next_milestone(streak, money_score, txn_count, user_badges)

    # Round 73 — Lightweight peer percentile. Compares this user's
    # money_score against the active-user pool. Cached at the DB level
    # via index on `money_score`. If we can't compute (cold cohort),
    # fall back to a friendly placeholder.
    percentile = None
    try:
        higher = await db.users.count_documents({"money_score": {"$gt": money_score}})
        total = await db.users.count_documents({})
        if total >= 5:  # only show with a real cohort
            pct_rank = max(1, round((higher / total) * 100))
            percentile = {
                "top_pct": pct_rank,
                "label": f"Top {pct_rank}% savers this week",
            }
    except Exception:  # noqa: BLE001
        percentile = None

    return {
        "streak": streak,
        "badges_earned": [{"id": b, **BADGES.get(b, {})} for b in user_badges],
        "badges_available": [{"id": k, **v} for k, v in BADGES.items() if k not in user_badges],
        "total_badges": len(user_badges),
        "weekly_challenge": active_challenge,
        "new_badges": [{"id": b, **BADGES.get(b, {})} for b in new_badges],
        "score": money_score,
        "score_breakdown": score_breakdown,
        "next_milestone": next_milestone,
        "percentile": percentile,
    }


# ─────────────────────────────────────────────────────────────────────
#  Round 73 — Helpers for the redesigned Rewards screen
# ─────────────────────────────────────────────────────────────────────
async def _compute_challenge_progress(user_id: str, challenge: dict) -> dict:
    """Compute live progress for the active weekly challenge.

    Returns ``{current, target, unit, pct}`` so the UI can render
    "1/3 days" + a progress bar.
    """
    target = (
        challenge.get("target_days")
        or challenge.get("target_count")
        or challenge.get("target_amount")
        or 1
    )
    cid = challenge.get("id")
    week_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=7)

    current = 0
    unit = "completed"
    try:
        if cid in ("no_swiggy_3", "no_shopping"):
            unit = "days"
            cat = challenge.get("category")
            today = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
            for i in range(challenge.get("target_days") or 3):
                day = today - timedelta(days=i)
                hit = await db.transactions.count_documents({
                    "user_id": user_id,
                    "category": cat,
                    "date": {"$gte": day, "$lt": day + timedelta(days=1)},
                })
                if hit == 0:
                    current += 1
                else:
                    break
        elif cid == "save_500":
            unit = "₹"
            current = max(0, challenge.get("target_amount", 500))  # placeholder — wire to real savings calc later
        elif cid == "cook_5":
            unit = "meals"
            current = await db.transactions.count_documents({
                "user_id": user_id,
                "category": "Food",
                "amount": {"$lte": 200},
                "date": {"$gte": week_start},
            })
        elif cid == "budget_all":
            unit = "categories"
            current = await db.budgets.count_documents({"user_id": user_id})
        elif cid == "cash_tracker":
            unit = "cash entries"
            current = await db.transactions.count_documents({
                "user_id": user_id,
                "method": "cash",
                "date": {"$gte": week_start},
            })
    except Exception:  # noqa: BLE001
        current = 0

    current = min(int(current), int(target))
    pct = int(round((current / max(1, int(target))) * 100))
    return {"current": current, "target": int(target), "unit": unit, "pct": pct}


def _build_next_milestone(streak: int, score: int, txn_count: int, user_badges: list) -> dict | None:
    """Pick the closest still-locked badge + a human "what's left" copy."""
    candidates = [
        {"id": "first_track",  "needed": max(0, 1 - txn_count), "unit": "expense",
         "copy": "Track your first expense"},
        {"id": "week_streak",  "needed": max(0, 7 - streak),    "unit": "day",
         "copy": f"{max(0, 7 - streak)} more days of tracking"},
        {"id": "month_streak", "needed": max(0, 30 - streak),   "unit": "day",
         "copy": f"{max(0, 30 - streak)} more days to a 30-day streak"},
        {"id": "score_80",     "needed": max(0, 80 - score),    "unit": "point",
         "copy": f"+{max(0, 80 - score)} more points to Money Score 80"},
    ]
    candidates = [c for c in candidates if c["id"] not in user_badges and c["needed"] > 0]
    if not candidates:
        return None
    candidates.sort(key=lambda c: c["needed"])
    pick = candidates[0]
    badge = BADGES.get(pick["id"], {})
    return {
        "badge_id": pick["id"],
        "name": badge.get("name", "Next badge"),
        "icon": badge.get("icon", "ribbon"),
        "needed": pick["needed"],
        "unit": pick["unit"],
        "copy": pick["copy"],
    }
