"""alerts router — extracted from server.py.

Lazy-imports any helpers still living in server.py via _srv() shim.
"""
import os
import json
import logging
import hashlib
import hmac
import random
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix


def _srv():
    import server  # noqa: PLC0415
    return server


def _lazy_attr(name):
    class _Proxy:
        def __call__(self, *a, **kw): return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k): return getattr(_srv(), name)[k]
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
        def items(self): return getattr(_srv(), name).items()
        def keys(self): return getattr(_srv(), name).keys()
        def values(self): return getattr(_srv(), name).values()
    return _Proxy()


# Commonly needed helper proxies (harmless if unused)
calculate_money_score = _lazy_attr("calculate_money_score")
generate_insights_with_ai = _lazy_attr("generate_insights_with_ai")
get_lang_instruction = _lazy_attr("get_lang_instruction")
AGENT_PROFILES = _lazy_attr("AGENT_PROFILES")
XP_LEVELS = _lazy_attr("XP_LEVELS")
CATEGORIES = _lazy_attr("CATEGORIES")

router = APIRouter(tags=["alerts"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/alerts/smart")
async def smart_alerts(user_id: str = Depends(get_current_user)):
    """AI Smart Alerts — intelligent, non-annoying nudges"""
    from bson import ObjectId
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
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
    
    # Compare with daily average
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
            "action": "review_transactions"
        })
    
    # 2. Weekend spike detection (Fri-Sun)
    if now.weekday() >= 4:  # Friday onwards
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
                "action": "view_insights"
            })
    
    # 3. Streak alerts
    streak = user.get("streak_days", 0) if user else 0
    if streak >= 5:
        alerts.append({
            "type": "streak_strong",
            "severity": "success",
            "emoji": "🔥",
            "title": f"{streak}-day streak! Keep going!",
            "message": f"You're in the top 10% of consistent trackers. Don't break it!",
            "action": "log_expense"
        })
    elif streak >= 2:
        alerts.append({
            "type": "streak_building",
            "severity": "info",
            "emoji": "⚡",
            "title": f"{streak}-day streak building!",
            "message": f"Just {7 - streak} more days for a weekly badge! 🏅",
            "action": "log_expense"
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
                "action": "view_budget"
            })
        elif pct >= 80:
            alerts.append({
                "type": "budget_warning",
                "severity": "warning",
                "emoji": "⚠️",
                "title": f"{cat} budget almost done",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} used ({pct:.0f}%). Only ₹{b['amount']-spent:,.0f} left!",
                "action": "view_budget"
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
                "action": "view_insights"
            })
    
    # 6. Money score milestone
    score = user.get("money_score", 50) if user else 50
    if score >= 90:
        alerts.append({
            "type": "score_elite",
            "severity": "success", 
            "emoji": "👑",
            "title": "Elite Money Score: " + str(score),
            "message": "Top 5% of all users! You're a financial rockstar! 🎸",
            "action": "share_score"
        })
    
    return {"alerts": alerts[:6], "count": len(alerts)}  # Max 6 alerts

