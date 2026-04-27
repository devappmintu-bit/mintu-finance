"""alerts router — intelligent financial alerts/nudges based on user activity.

Phase-2 Master UX Transformation:
  Every alert now emits an `actions[]` array the frontend renders as tap-
  through buttons. Each CTA has:
    - label  (short verb)
    - route  (expo-router path, may include query string)
    - style  (primary | secondary | danger)
    - icon   (ionicons glyph)
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["alerts"])
api_router = router


def _budget_actions(category: str, severity: str):
    cat_q = quote(category)
    actions = [
        {"label": "See top expenses", "route": f"/(tabs)/transactions?category={cat_q}", "style": "primary", "icon": "list"},
        {"label": "Reduce budget" if severity == "danger" else "Adjust budget", "route": f"/(tabs)/budget?focus={cat_q}", "style": "secondary", "icon": "options"},
    ]
    if severity == "danger":
        actions.append({"label": "Pause category", "route": f"/(tabs)/budget?pause={cat_q}", "style": "danger", "icon": "pause-circle"})
    return actions


@api_router.get("/alerts/smart")
async def smart_alerts(user_id: str = Depends(get_current_user)):
    """AI Smart Alerts — intelligent, non-annoying nudges with action CTAs."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    alerts = []

    # 1. Daily spending alert
    today_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    today_docs = await db.transactions.aggregate(today_pipeline).to_list(1)
    today_total = today_docs[0]["total"] if today_docs else 0

    month_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    month_docs = await db.transactions.aggregate(month_pipeline).to_list(1)
    month_total = month_docs[0]["total"] if month_docs else 0
    days_elapsed = max(1, (now - month_start).days)
    daily_avg = month_total / days_elapsed

    if today_total > daily_avg * 1.5 and today_total > 200:
        alerts.append({
            "type": "overspend_today",
            "severity": "warning",
            "emoji": "👀",
            "title": f"You spent ₹{today_total:,.0f} today",
            "message": f"That's {today_total/max(daily_avg,1):.1f}x your daily average of ₹{daily_avg:,.0f}. Worth it?",
            "action": "review_transactions",
            "actions": [
                {"label": "Review today", "route": "/(tabs)/transactions?filter=today", "style": "primary", "icon": "today"},
                {"label": "See top expenses", "route": "/(tabs)/transactions", "style": "secondary", "icon": "list"},
            ],
        })

    # 2. Weekend spike detection (Fri-Sun)
    if now.weekday() >= 4:
        weekend_pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start - timedelta(days=now.weekday()-4) if now.weekday() >= 4 else today_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        weekend_docs = await db.transactions.aggregate(weekend_pipeline).to_list(1)
        weekend_total = weekend_docs[0]["total"] if weekend_docs else 0
        if weekend_total > daily_avg * 2:
            alerts.append({
                "type": "weekend_spike",
                "severity": "info",
                "emoji": "🍻",
                "title": "Weekend spending spike detected",
                "message": f"₹{weekend_total:,.0f} since Friday. That's your weekend tax! 😅",
                "action": "view_insights",
                "actions": [
                    {"label": "See breakdown", "route": "/(tabs)/transactions", "style": "primary", "icon": "stats-chart"},
                    {"label": "Set a cap", "route": "/(tabs)/budget", "style": "secondary", "icon": "shield-checkmark"},
                ],
            })

    # 3. Streak alerts
    streak = user.get("streak_days", 0) if user else 0
    if streak >= 5:
        alerts.append({
            "type": "streak_strong",
            "severity": "success",
            "emoji": "🔥",
            "title": f"{streak}-day streak! Keep going!",
            "message": "You're in the top 10% of consistent trackers. Don't break it!",
            "action": "log_expense",
            "actions": [
                {"label": "Log expense", "route": "/(tabs)/transactions?openAdd=1", "style": "primary", "icon": "add-circle"},
                {"label": "Share streak", "route": "/(tabs)/rewards", "style": "secondary", "icon": "share-social"},
            ],
        })
    elif streak >= 2:
        alerts.append({
            "type": "streak_building",
            "severity": "info",
            "emoji": "⚡",
            "title": f"{streak}-day streak building!",
            "message": f"Just {7 - streak} more days for a weekly badge! 🏅",
            "action": "log_expense",
            "actions": [
                {"label": "Log today", "route": "/(tabs)/transactions?openAdd=1", "style": "primary", "icon": "add-circle"},
            ],
        })

    # 4. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    for b in budgets:
        cat = b["category"]
        spent_pipeline = [
            {"$match": {"user_id": user_id, "category": cat, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        spent_docs = await db.transactions.aggregate(spent_pipeline).to_list(1)
        spent = spent_docs[0]["total"] if spent_docs else 0
        pct = (spent / max(b["amount"], 1)) * 100

        if pct >= 100:
            alerts.append({
                "type": "budget_exceeded",
                "severity": "danger",
                "emoji": "🚨",
                "title": f"{cat} budget exceeded!",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} ({pct:.0f}%). Time to slow down!",
                "action": "view_budget",
                "category": cat,
                "actions": _budget_actions(cat, "danger"),
            })
        elif pct >= 80:
            alerts.append({
                "type": "budget_warning",
                "severity": "warning",
                "emoji": "⚠️",
                "title": f"{cat} budget almost done",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} used ({pct:.0f}%). Only ₹{b['amount']-spent:,.0f} left!",
                "action": "view_budget",
                "category": cat,
                "actions": _budget_actions(cat, "warning"),
            })

    # 5. Savings rate alert
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0

    if total_income > 0:
        savings_rate = ((total_income - month_total) / total_income) * 100
        if savings_rate > 30:
            alerts.append({
                "type": "savings_star",
                "severity": "success",
                "emoji": "🌟",
                "title": f"Savings rate: {savings_rate:.0f}%!",
                "message": f"You're saving ₹{total_income-month_total:,.0f} this month. That's better than most Indians! 🇮🇳",
                "action": "view_insights",
                "actions": [
                    {"label": "Share the win", "route": "/(tabs)/rewards", "style": "primary", "icon": "share-social"},
                    {"label": "See goals", "route": "/(tabs)/budget", "style": "secondary", "icon": "flag"},
                ],
            })

    # 6. Money score milestone
    score = user.get("money_score", 50) if user else 50
    if score >= 90:
        alerts.append({
            "type": "score_elite",
            "severity": "success",
            "emoji": "👑",
            "title": f"Elite Money Score: {score}",
            "message": "Top 5% of all users! You're a financial rockstar! 🎸",
            "action": "share_score",
            "actions": [
                {"label": "Share scorecard", "route": "/(tabs)/rewards", "style": "primary", "icon": "share-social"},
            ],
        })

    return {"alerts": alerts[:6], "count": len(alerts)}
