"""insights_ext router — weekly AI-analyzed spending report with category trends."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends

from core import db, get_current_user
from core.scoring import calculate_money_score

router = APIRouter(tags=["insights_ext"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/insights/weekly")
async def get_weekly_insights(user_id: str = Depends(get_current_user)):
    """Full weekly spending report with AI analysis"""
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    fourteen_days_ago = now - timedelta(days=14)
    
    # This week
    this_week = await db.transactions.find({
        "user_id": user_id, "date": {"$gte": seven_days_ago}
    }).to_list(1000)
    
    # Last week
    last_week = await db.transactions.find({
        "user_id": user_id, "date": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}
    }).to_list(1000)
    
    # Calculate metrics
    tw_income = sum(t["amount"] for t in this_week if t["type"] == "credit")
    tw_expense = sum(t["amount"] for t in this_week if t["type"] == "debit")
    lw_income = sum(t["amount"] for t in last_week if t["type"] == "credit")
    lw_expense = sum(t["amount"] for t in last_week if t["type"] == "debit")
    
    # Day-by-day spending for chart
    daily_spending = {}
    for t in this_week:
        if t["type"] == "debit":
            day_key = t["date"].strftime("%a")
            daily_spending[day_key] = daily_spending.get(day_key, 0) + t["amount"]
    
    # Category comparison
    tw_cats = {}
    lw_cats = {}
    for t in this_week:
        if t["type"] == "debit":
            tw_cats[t["category"]] = tw_cats.get(t["category"], 0) + t["amount"]
    for t in last_week:
        if t["type"] == "debit":
            lw_cats[t["category"]] = lw_cats.get(t["category"], 0) + t["amount"]
    
    all_cats = set(list(tw_cats.keys()) + list(lw_cats.keys()))
    category_comparison = {}
    for cat in all_cats:
        tw_amt = tw_cats.get(cat, 0)
        lw_amt = lw_cats.get(cat, 0)
        change = ((tw_amt - lw_amt) / lw_amt * 100) if lw_amt > 0 else (100 if tw_amt > 0 else 0)
        category_comparison[cat] = {
            "this_week": tw_amt,
            "last_week": lw_amt,
            "change_pct": round(change, 1),
            "trend": "up" if change > 10 else ("down" if change < -10 else "stable")
        }
    
    money_score = await calculate_money_score(user_id)
    
    return {
        "money_score": money_score,
        "this_week": {
            "income": tw_income,
            "expense": tw_expense,
            "savings": tw_income - tw_expense,
            "transaction_count": len(this_week)
        },
        "last_week": {
            "income": lw_income,
            "expense": lw_expense,
            "savings": lw_income - lw_expense,
            "transaction_count": len(last_week)
        },
        "expense_change_pct": round(((tw_expense - lw_expense) / lw_expense * 100), 1) if lw_expense > 0 else 0,
        "daily_spending": daily_spending,
        "category_comparison": category_comparison,
        "generated_at": now
    }

