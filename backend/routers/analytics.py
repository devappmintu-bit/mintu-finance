"""Analytics router — stats, weekly reports, savings leaderboard, friend comparison."""
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["analytics"])


# ============== STATS OVERVIEW ==============
@router.get("/stats/overview")
async def get_stats_overview(user_id: str = Depends(get_current_user)):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": thirty_days_ago},
    }).to_list(1000)

    total_income = sum(t["amount"] for t in txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in txns if t["type"] == "debit")

    category_breakdown: dict = {}
    for t in txns:
        if t["type"] == "debit":
            category_breakdown[t["category"]] = category_breakdown.get(t["category"], 0) + t["amount"]

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "transaction_count": len(txns),
        "category_breakdown": category_breakdown,
    }


# ============== WEEKLY REPORT ==============
@router.get("/reports/weekly")
async def weekly_report(user_id: str = Depends(get_current_user)):
    """Weekly Report — emotional + actionable summary."""
    now = datetime.utcnow()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = week_start - timedelta(days=7)

    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}

    async def _category_totals(gte, lt=None):
        match = {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": gte}}
        if lt is not None:
            match["date"]["$lt"] = lt
        out: dict = {}
        async for doc in db.transactions.aggregate([
            {"$match": match},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        ]):
            out[doc["_id"]] = doc["total"]
        return out

    this_week = await _category_totals(week_start)
    last_week = await _category_totals(prev_week_start, week_start)

    this_total = sum(this_week.values())
    last_total = sum(last_week.values())
    change_pct = ((this_total - last_total) / max(last_total, 1) * 100) if last_total > 0 else 0

    top_category = max(this_week, key=this_week.get) if this_week else "Nothing tracked"
    top_amount = this_week.get(top_category, 0)

    if change_pct < -10:
        mood, mood_text = "🎉", "Great week! You spent less than last week"
    elif change_pct < 5:
        mood, mood_text = "😊", "Steady week — spending is stable"
    elif change_pct < 20:
        mood, mood_text = "👀", "Watch out! Spending crept up a bit"
    else:
        mood, mood_text = "🔥", "Big spending week! Let's course-correct"

    potential_save = int(this_total * 0.15)
    money_score = user.get("money_score", 50)

    return {
        "period": f"{week_start.strftime('%b %d')} - {now.strftime('%b %d, %Y')}",
        "total_spent": this_total,
        "last_week_spent": last_total,
        "change_pct": round(change_pct, 1),
        "mood": mood,
        "mood_text": mood_text,
        "top_category": {"name": top_category, "amount": top_amount},
        "category_breakdown": dict(sorted(this_week.items(), key=lambda x: x[1], reverse=True)),
        "savings_suggestion": f"Cut ₹{potential_save:,} next week by reducing {top_category} spending",
        "streak": user.get("streak_days", 0),
        "money_score": money_score,
        "headline": f"You {'wasted' if change_pct > 10 else 'spent'} ₹{this_total:,.0f} this week {mood}",
        "shareable_text": f"My week: ₹{this_total:,.0f} spent | Top: {top_category} ₹{top_amount:,.0f} | Score: {money_score}/100 💸 #MintU",
    }


# ============== SAVINGS LEADERBOARD ==============
@router.get("/leaderboard/savings")
async def savings_leaderboard(user_id: str = Depends(get_current_user)):
    """Global savings leaderboard with user's rank + percentile."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    all_users = await db.users.find(
        {"money_score": {"$exists": True}},
        {"name": 1, "money_score": 1, "phone": 1, "streak_days": 1},
    ).sort("money_score", -1).to_list(100)

    user_rank = 0
    user_score = 0
    for i, u in enumerate(all_users):
        if str(u["_id"]) == user_id:
            user_rank = i + 1
            user_score = u.get("money_score", 0)
            break

    total_users = len(all_users)
    percentile = (
        max(1, min(99, int(((total_users - user_rank) / max(total_users, 1)) * 100)))
        if user_rank > 0 else 50
    )

    top_10 = []
    for i, u in enumerate(all_users[:10]):
        is_me = str(u["_id"]) == user_id
        phone = u.get("phone", "")
        masked_phone = f"***{phone[-4:]}" if len(phone) >= 4 else "****"
        top_10.append({
            "rank": i + 1,
            "name": u.get("name", "MintU User"),
            "score": u.get("money_score", 0),
            "streak": u.get("streak_days", 0),
            "is_me": is_me,
            "phone_masked": masked_phone,
        })

    # User's monthly saved amount
    user_stats: dict = {}
    async for doc in db.transactions.aggregate([
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]):
        user_stats[doc["_id"]] = doc["total"]

    saved = max(0, user_stats.get("credit", 0) - user_stats.get("debit", 0))

    if percentile >= 80:
        comparison_text = f"🏆 You're in the top {100 - percentile}% of savers! Financial rockstar!"
    elif percentile >= 60:
        comparison_text = f"💪 You save better than {percentile}% of users. Push for top 20%!"
    elif percentile >= 40:
        comparison_text = f"👀 You're in the middle — {percentile}% of users save less than you. Room to grow!"
    else:
        comparison_text = f"🚀 {percentile}% of users save less than you. Small changes = big results!"

    streak_banner = (
        f"🔥 {all_users[user_rank - 1].get('streak_days', 0)}-day streak!"
        if user_rank > 0 and user_rank <= len(all_users)
        else ""
    )

    return {
        "user_rank": user_rank,
        "total_users": total_users,
        "percentile": percentile,
        "user_score": user_score,
        "monthly_saved": saved,
        "comparison_text": comparison_text,
        "top_10": top_10,
        "motivations": [
            f"You saved more than {percentile}% of users this week 👀",
            f"Your Money Score: {user_score}/100 — {'Top tier!' if user_score >= 75 else 'Getting there!'}",
            streak_banner,
        ],
    }


# ============== FRIEND COMPARISON ==============
@router.get("/leaderboard/friends")
async def friend_comparison(user_id: str = Depends(get_current_user)):
    """Compare savings with friends from your split groups."""
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(20)
    friend_ids = {m["user_id"] for g in groups for m in g.get("members", []) if m["user_id"] != user_id}

    if not friend_ids:
        return {"friends": [], "message": "Add friends in Split groups to compare savings! 👥"}

    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    user_score = user.get("money_score", 50)
    user_name = user.get("name", "You")

    friends = []
    for fid in friend_ids:
        try:
            friend = await db.users.find_one({"_id": ObjectId(fid)})
        except Exception:
            continue
        if not friend:
            continue

        f_score = friend.get("money_score", 50)
        diff = user_score - f_score
        if diff > 10:
            taunt = f"You're crushing it vs {friend['name']}! 😎"
        elif diff > 0:
            taunt = f"Slightly ahead of {friend['name']} — keep it up!"
        elif diff > -10:
            taunt = f"{friend['name']} is just ahead — catch up! 💪"
        else:
            taunt = f"{friend['name']} is killing it! Time to step up 😏"

        friends.append({
            "name": friend.get("name", "Friend"),
            "score": f_score,
            "streak": friend.get("streak_days", 0),
            "diff": diff,
            "taunt": taunt,
            "ahead": diff > 0,
        })

    friends.sort(key=lambda x: x["diff"])  # ones beating you first (motivational)

    winning = sum(1 for f in friends if f["ahead"])
    total = len(friends)

    return {
        "you": {"name": user_name, "score": user_score},
        "friends": friends,
        "summary": f"You're beating {winning}/{total} friends 🏆" if total else "No friends to compare yet",
        "challenge_text": f"Hey! My MintU score is {user_score}. Can you beat me? 😏 Download MintU!",
    }
