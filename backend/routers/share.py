"""share router — shareable score cards and stats cards for WhatsApp/Instagram."""
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
from core.content import APP_DOWNLOAD_LINK

router = APIRouter(tags=["share"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/share/score-card")
async def get_score_card_data(user_id: str = Depends(get_current_user)):
    """Get data for generating shareable score card"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_saved = sum(t["amount"] for t in txns if t["type"] == "credit") - sum(t["amount"] for t in txns if t["type"] == "debit")
    score = user.get("money_score", 50)
    
    # Calculate streak
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    streak = 0
    for i in range(365):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        has = await db.transactions.find_one({"user_id": user_id, "date": {"$gte": day_start, "$lt": day_end}})
        if has: streak += 1
        elif i > 0: break
    
    return {
        "name": user.get("name", "User"),
        "score": score,
        "streak": streak,
        "total_saved": max(total_saved, 0),
        "transaction_count": len(txns),
        "month": datetime.utcnow().strftime("%B %Y"),
    }


@api_router.get("/share/stats-card")
async def shareable_stats_card(user_id: str = Depends(get_current_user)):
    """Generate shareable stats for WhatsApp/Instagram"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Monthly stats
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {
            "_id": "$type",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    stats = {}
    async for doc in db.transactions.aggregate(pipeline):
        stats[doc["_id"]] = doc["total"]
    
    income = stats.get("income", 0)
    expense = stats.get("expense", 0)
    saved = max(0, income - expense)
    score = user.get("money_score", 50) if user else 50
    streak = user.get("streak_days", 0) if user else 0
    name = user.get("name", "MintU User") if user else "MintU User"
    
    # Build shareable texts
    whatsapp_text = f"💸 {name}'s Money Report — {now.strftime('%B %Y')}\n\n"
    whatsapp_text += f"💰 Saved: ₹{saved:,.0f}\n"
    whatsapp_text += f"📊 Money Score: {score}/100\n"
    whatsapp_text += f"🔥 Streak: {streak} days\n\n"
    whatsapp_text += f"Track your money smartly with MintU! 🚀\n📲 Download: {APP_DOWNLOAD_LINK}"
    
    instagram_caption = f"I saved ₹{saved:,.0f} this month using MintU 💸\n\nMoney Score: {score}/100 ⭐\n🔥 {streak}-day tracking streak\n\n📲 Download MintU: {APP_DOWNLOAD_LINK}\n\n#MintU #MoneyManagement #Savings #FinancialFreedom #India"
    
    return {
        "name": name,
        "month": now.strftime("%B %Y"),
        "income": income,
        "expense": expense,
        "saved": saved,
        "money_score": score,
        "streak": streak,
        "whatsapp_text": whatsapp_text,
        "instagram_caption": instagram_caption,
        "card_data": {
            "headline": f"I saved ₹{saved:,.0f} this month! 💸",
            "subtitle": f"Money Score: {score}/100",
            "stats": [
                {"label": "Income", "value": f"₹{income:,.0f}", "color": "green"},
                {"label": "Expenses", "value": f"₹{expense:,.0f}", "color": "red"},
                {"label": "Saved", "value": f"₹{saved:,.0f}", "color": "blue"},
            ],
            "badge": f"🔥 {streak}-day streak" if streak > 0 else "📊 Start tracking!",
        }
    }

