"""share router — shareable score cards and stats cards for WhatsApp/Instagram."""
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core import db, get_current_user
from core.content import APP_DOWNLOAD_LINK
from core.users import get_user_by_id
from core.time import utc_now
from core.errors import (
    raise_user_not_found,
)

router = APIRouter(tags=["share"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/share/score-card")
async def get_score_card_data(user_id: str = Depends(get_current_user)):
    """Get data for generating shareable score card"""
    user = await get_user_by_id(user_id)
    if not user:
        raise_user_not_found()
    thirty_days_ago = utc_now() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_saved = sum(t["amount"] for t in txns if t["type"] == "credit") - sum(t["amount"] for t in txns if t["type"] == "debit")
    score = user.get("money_score", 50)
    
    # Calculate streak — Round 44 perf: was 365 sequential find_one calls.
    # Single aggregation bucketed by day, then walk in Python.
    today = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    earliest = today - timedelta(days=365)
    days_with_txn: set[str] = set()
    async for d in db.transactions.aggregate([
        {"$match": {"user_id": user_id, "date": {"$gte": earliest}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}}}},
    ]):
        days_with_txn.add(d["_id"])
    streak = 0
    for i in range(365):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        if day in days_with_txn:
            streak += 1
        elif i > 0:
            break
    
    return {
        "name": user.get("name", "User"),
        "score": score,
        "streak": streak,
        "total_saved": max(total_saved, 0),
        "transaction_count": len(txns),
        "month": utc_now().strftime("%B %Y"),
    }


@api_router.get("/share/stats-card")
async def shareable_stats_card(user_id: str = Depends(get_current_user)):
    """Generate shareable stats for WhatsApp/Instagram"""
    user = await get_user_by_id(user_id)
    now = utc_now()
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

