"""budgets_ext router — AI-powered budget suggestions + live budget status."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["budgets_ext"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/budgets/smart-suggest")
async def smart_budget_suggestions(user_id: str = Depends(get_current_user)):
    """AI-powered budget suggestions based on spending habits"""
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

        # Sanity cap: a single miscategorised ₹1L txn shouldn't recommend a
        # ₹1,25,000 "Other" budget. Clamp by the Indian benchmark % of a
        # plausible middle-class monthly income (₹50k) with a 3× safety margin.
        # If user legitimately spends more, they can manually increase.
        benchmark_pct = INDIAN_BENCHMARKS.get(cat, 0.10)
        upper_cap = int(50_000 * benchmark_pct * 3)  # e.g. Food → ₹37,500 cap
        monthly_avg_capped = min(monthly_avg, upper_cap)

        # Suggest 10-15% less than (capped) current spending (achievable)
        suggested = int(monthly_avg_capped * 0.88 / 100) * 100  # Round to nearest 100
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
    """Real-time budget status — correct per-budget period + burn-rate + projection.

    Returns each budget enriched with:
      spent (txns + split share)  ·  remaining  ·  percentage
      burn_rate (₹/day on avg)   ·  days_left   ·  projected_spend  ·  projected_over
      status_code (healthy|on_track|warning|exceeded|risk_overspend)

    This endpoint is the single source of truth for the Budget screen after
    the Phase-1 overhaul — total_budget and total_spent returned by the
    summary MUST match the sum of individual category `spent` values.
    """
    now = datetime.utcnow()
    budgets = await db.budgets.find({"user_id": user_id}).to_list(30)

    def period_bounds(period: str):
        if period == "daily":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            length = 1  # days in period
            end = start + timedelta(days=1)
        elif period == "weekly":
            # Monday-start ISO week
            start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            length = 7
            end = start + timedelta(days=7)
        else:  # monthly
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if start.month == 12:
                end = start.replace(year=start.year + 1, month=1)
            else:
                end = start.replace(month=start.month + 1)
            length = (end - start).days
        return start, end, length

    result = []
    total_txn_spent = 0.0
    total_split_spent = 0.0

    for b in budgets:
        cat = b["category"]
        period = b.get("period", "monthly")
        period_start, period_end, period_days = period_bounds(period)

        # Txns for this period + category
        txn_cursor = db.transactions.find({
            "user_id": user_id,
            "category": cat,
            "type": {"$in": ["expense", "debit"]},
            "date": {"$gte": period_start, "$lt": period_end},
        })
        txn_total = 0.0
        async for t in txn_cursor:
            txn_total += float(t.get("amount", 0) or 0)

        # Split share (user's portion of shared expenses)
        split_total = 0.0
        async for exp in db.split_expenses.find({
            "category": cat,
            "created_at": {"$gte": period_start, "$lt": period_end},
        }):
            splits = exp.get("splits") or {}
            if isinstance(splits, dict) and user_id in splits:
                split_total += float(splits[user_id] or 0)

        spent = round(txn_total + split_total, 2)
        total_txn_spent += txn_total
        total_split_spent += split_total

        limit = float(b.get("amount", 0) or 0)
        remaining = max(0.0, round(limit - spent, 2))
        over_by = max(0.0, round(spent - limit, 2))
        pct = round((spent / limit * 100.0) if limit > 0 else 0.0, 1)

        # Burn rate & projection
        elapsed_days = max(1.0, (now - period_start).total_seconds() / 86400.0)
        burn_rate = round(spent / elapsed_days, 2)
        days_left = max(0, int((period_end - now).total_seconds() // 86400))
        projected_spend = round(burn_rate * period_days, 2)
        projected_over = max(0.0, round(projected_spend - limit, 2))

        if pct >= 100:
            status = "exceeded"
        elif projected_over > 0:
            status = "risk_overspend"
        elif pct >= 80:
            status = "warning"
        elif pct >= 50:
            status = "on_track"
        else:
            status = "healthy"

        result.append({
            "id": str(b["_id"]),
            "category": cat,
            "amount": limit,   # alias — frontend uses `amount`
            "budget": limit,   # backward-compat
            "spent": spent,
            "from_transactions": round(txn_total, 2),
            "from_splits": round(split_total, 2),
            "remaining": remaining,
            "over_by": over_by,
            "percentage": pct,
            "status": status,
            "period": period,
            "recurring": b.get("recurring", True),
            "description": b.get("description"),
            # Phase-1 insights
            "burn_rate": burn_rate,
            "days_left": days_left,
            "elapsed_days": round(elapsed_days, 1),
            "projected_spend": projected_spend,
            "projected_over": projected_over,
        })

    result.sort(key=lambda x: x["percentage"], reverse=True)

    total_budgeted = sum(float(b.get("amount", 0) or 0) for b in budgets)
    total_spent = sum(r["spent"] for r in result)

    return {
        "budgets": result,
        "summary": {
            "total_budgeted": round(total_budgeted, 2),
            "total_spent": round(total_spent, 2),
            "total_remaining": round(max(0, total_budgeted - total_spent), 2),
            "overall_pct": round((total_spent / max(total_budgeted, 1)) * 100, 1),
            "sources": {
                "transactions": round(total_txn_spent, 2),
                "splits": round(total_split_spent, 2),
            },
        },
    }

