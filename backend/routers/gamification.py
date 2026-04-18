"""Gamification router — streaks, badges, weekly challenges."""
from datetime import datetime, timedelta, date
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user

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
    """Scan back from today until we hit a day with no transaction."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    streak = 0
    for i in range(365):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        has_txn = await db.transactions.find_one(
            {"user_id": user_id, "date": {"$gte": day_start, "$lt": day_end}}
        )
        if has_txn:
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
    """Get user's streak, badges, and active weekly challenge."""
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    streak = await _compute_streak(user_id)
    user_badges = list(user.get("badges", []))
    new_badges = await _award_new_badges(
        user_id, user_badges, streak, user.get("money_score", 0)
    )
    user_badges.extend(new_badges)

    week_num = date.today().isocalendar()[1]
    active_challenge = WEEKLY_CHALLENGES[week_num % len(WEEKLY_CHALLENGES)]

    return {
        "streak": streak,
        "badges_earned": [{"id": b, **BADGES.get(b, {})} for b in user_badges],
        "badges_available": [{"id": k, **v} for k, v in BADGES.items() if k not in user_badges],
        "total_badges": len(user_badges),
        "weekly_challenge": active_challenge,
        "new_badges": [{"id": b, **BADGES.get(b, {})} for b in new_badges],
    }
