"""budgets_ext router — AI-powered budget suggestions + live budget status."""
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

router = APIRouter(tags=["budgets_ext"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/budgets/smart-suggest")
async def smart_budget_suggestions(user_id: str = Depends(get_current_user)):
    """AI-powered budget suggestions based on spending habits"""
    from bson import ObjectId
    now = datetime.utcnow()
    
    # Analyze last 60 days of spending
    sixty_days_ago = now - timedelta(days=60)
    pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": sixty_days_ago}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}, "avg": {"$avg": "$amount"}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(pipeline):
        spending[doc["_id"]] = {"total": doc["total"], "count": doc["count"], "avg": doc["avg"]}
    
    if not spending:
        return {"suggestions": [], "message": "Track expenses for a week and I'll suggest smart budgets for you! 📊"}
    
    # Calculate monthly projections (scale 60 days → 30 days)
    total_monthly = sum(s["total"] for s in spending.values()) / 2
    
    # Indian benchmark budgets (% of income)
    INDIAN_BENCHMARKS = {
        "Food": 0.25, "Transport": 0.10, "Entertainment": 0.08,
        "Shopping": 0.10, "Bills": 0.20, "Health": 0.05,
        "Education": 0.08, "Groceries": 0.15, "Other": 0.10,
    }
    
    # Existing budgets
    existing = await db.budgets.find({"user_id": user_id}).to_list(20)
    existing_cats = {b["category"] for b in existing}
    
    suggestions = []
    for cat, data in sorted(spending.items(), key=lambda x: x[1]["total"], reverse=True):
        monthly_avg = data["total"] / 2  # 60 days → monthly
        benchmark_pct = INDIAN_BENCHMARKS.get(cat, 0.10)
        
        # Suggest 10-15% less than current spending (achievable)
        suggested = int(monthly_avg * 0.88 / 100) * 100  # Round to nearest 100
        suggested = max(suggested, 500)  # Minimum ₹500
        
        is_new = cat not in existing_cats
        status = "over" if monthly_avg > suggested else "under"
        
        suggestions.append({
            "category": cat,
            "current_monthly_avg": round(monthly_avg),
            "suggested_budget": suggested,
            "is_new": is_new,
            "message": f"You spend ~₹{monthly_avg:,.0f}/mo on {cat}. I'd cap it at ₹{suggested:,.0f}",
            "savings_potential": max(0, int(monthly_avg - suggested)),
            "confidence": "high" if data["count"] >= 5 else "medium" if data["count"] >= 2 else "low",
        })
    
    total_potential_savings = sum(s["savings_potential"] for s in suggestions)
    
    return {
        "suggestions": suggestions[:8],
        "total_potential_savings": total_potential_savings,
        "message": f"Following these budgets could save you ₹{total_potential_savings:,.0f}/month! 🎯",
        "auto_apply_available": True
    }


@api_router.post("/budgets/auto-apply")
async def auto_apply_budgets(user_id: str = Depends(get_current_user)):
    """Auto-apply AI-suggested budgets"""
    suggestions = await smart_budget_suggestions(user_id)
    applied = 0
    for s in suggestions.get("suggestions", []):
        if s["is_new"] and s["confidence"] != "low":
            await db.budgets.insert_one({
                "user_id": user_id,
                "category": s["category"],
                "amount": s["suggested_budget"],
                "period": "monthly",
                "auto_created": True,
                "created_at": datetime.utcnow()
            })
            applied += 1
    return {"applied_count": applied, "message": f"Auto-created {applied} smart budgets! 🎯"}


@api_router.get("/budgets/live")
async def live_budget_status(user_id: str = Depends(get_current_user)):
    """Get real-time budget status with actual spending from ALL sources (transactions + splits)"""
    from bson import ObjectId
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    budgets = await db.budgets.find({"user_id": user_id}).to_list(30)
    
    # Get spending from transactions
    txn_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    txn_spending = {}
    async for doc in db.transactions.aggregate(txn_pipe):
        txn_spending[doc["_id"]] = doc["total"]
    
    # Get spending from split expenses (user's share)
    split_expenses = await db.split_expenses.find({"created_at": {"$gte": month_start}}).to_list(500)
    split_spending = {}
    for exp in split_expenses:
        splits = exp.get("splits", {})
        if isinstance(splits, dict) and user_id in splits:
            cat = exp.get("category", "Other")
            split_spending[cat] = split_spending.get(cat, 0) + splits[user_id]
    
    # Combine spending
    all_spending = {}
    for cat in set(list(txn_spending.keys()) + list(split_spending.keys())):
        all_spending[cat] = txn_spending.get(cat, 0) + split_spending.get(cat, 0)
    
    result = []
    for b in budgets:
        cat = b["category"]
        spent = all_spending.get(cat, 0)
        pct = (spent / max(b["amount"], 1)) * 100
        remaining = max(0, b["amount"] - spent)
        
        if pct >= 100: status = "exceeded"
        elif pct >= 80: status = "warning"
        elif pct >= 50: status = "on_track"
        else: status = "healthy"
        
        result.append({
            "id": str(b["_id"]),
            "category": cat,
            "budget": b["amount"],
            "spent": round(spent, 2),
            "from_transactions": round(txn_spending.get(cat, 0), 2),
            "from_splits": round(split_spending.get(cat, 0), 2),
            "remaining": round(remaining, 2),
            "percentage": round(pct, 1),
            "status": status,
            "period": b.get("period", "monthly"),
        })
    
    result.sort(key=lambda x: x["percentage"], reverse=True)
    
    total_budgeted = sum(b["amount"] for b in budgets)
    total_spent = sum(r["spent"] for r in result)
    
    return {
        "budgets": result,
        "summary": {
            "total_budgeted": total_budgeted,
            "total_spent": round(total_spent, 2),
            "total_remaining": round(max(0, total_budgeted - total_spent), 2),
            "overall_pct": round((total_spent / max(total_budgeted, 1)) * 100, 1),
            "sources": {"transactions": round(sum(txn_spending.values()), 2), "splits": round(sum(split_spending.values()), 2)},
        }
    }

