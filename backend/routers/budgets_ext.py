"""budgets_ext router — AI-powered budget suggestions + live budget status."""
from datetime import datetime, timedelta, timezone
from typing import Dict
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["budgets_ext"])
api_router = router  # extracted code uses @api_router.*



@api_router.get("/budgets/smart-suggest")
async def smart_budget_suggestions(user_id: str = Depends(get_current_user)):
    """AI-powered budget suggestions based on spending habits"""
    now = datetime.now(timezone.utc)
    
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
    # NOTE: intentionally omit unused `total_monthly` — per-category sums used below.
    
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
                "created_at": datetime.now(timezone.utc)
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
    now = datetime.now(timezone.utc)
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




# ══════════════════════════════════════════════════════════════════════════
#  PHASE 2 — AI INSIGHTS per category
#  Pattern-mined from the user's last 60 days of transactions. Purely
#  deterministic (no LLM call needed) but shaped in the same vocabulary the
#  user requested: behaviour tags, specific tips, and auto-apply suggestions.
# ══════════════════════════════════════════════════════════════════════════
@api_router.get("/budgets/ai-insights/{category}")
async def budget_ai_insights(category: str, user_id: str = Depends(get_current_user)):
    """Return AI-style behaviour tags + specific tips + auto-apply suggestions
    for one budget category.

    Response:
      {
        category, tags: [{label, tone}],
        tips: [{text, save}],
        auto_apply: [{action, label, payload, delta}]
      }
    """
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=60)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    cursor = db.transactions.find({
        "user_id": user_id,
        "category": category,
        "type": {"$in": ["expense", "debit"]},
        "date": {"$gte": start},
    })
    txns = []
    async for t in cursor:
        txns.append(t)

    budget = await db.budgets.find_one({"user_id": user_id, "category": category})
    budget_amt = float((budget or {}).get("amount", 0) or 0)

    if not txns:
        return {
            "category": category,
            "tags": [{"label": "No data yet", "tone": "neutral"}],
            "tips": [{"text": f"Track {category} expenses for a week to unlock insights", "save": 0}],
            "auto_apply": [],
        }

    # ── Compute patterns ────────────────────────────────────────────────
    amounts = [float(t.get("amount", 0) or 0) for t in txns]
    total = sum(amounts)
    count = len(amounts)
    avg = total / count if count else 0
    monthly_avg = total / 2  # 60 days → monthly projection

    # Time-of-day buckets
    night_count = sum(1 for t in txns if 21 <= t["date"].hour or t["date"].hour < 3)
    weekend_count = sum(1 for t in txns if t["date"].weekday() >= 5)
    # Big-ticket: any single txn > 3× avg
    big_count = sum(1 for a in amounts if avg > 0 and a > 3 * avg)
    night_pct = round(100 * night_count / count) if count else 0
    weekend_pct = round(100 * weekend_count / count) if count else 0

    # This-month vs prior-month delta
    this_month_total = sum(a for t, a in zip(txns, amounts) if t["date"] >= month_start)
    prev_start = (month_start - timedelta(days=1)).replace(day=1)
    prev_total = sum(a for t, a in zip(txns, amounts) if prev_start <= t["date"] < month_start)
    delta_pct = 0
    if prev_total > 0:
        delta_pct = round(100 * (this_month_total - prev_total) / prev_total)

    # ── Behaviour tags ──────────────────────────────────────────────────
    tags = []
    if big_count >= 3:
        tags.append({"label": "Impulse heavy", "tone": "warning"})
    if night_pct >= 40:
        tags.append({"label": f"{night_pct}% spending after 9 PM", "tone": "info"})
    if weekend_pct >= 55:
        tags.append({"label": "Weekend-heavy", "tone": "info"})
    if delta_pct >= 25:
        tags.append({"label": f"Up {delta_pct}% vs last month", "tone": "danger"})
    elif delta_pct <= -20:
        tags.append({"label": f"Down {abs(delta_pct)}% vs last month", "tone": "success"})
    if budget_amt and this_month_total <= budget_amt * 0.6:
        tags.append({"label": "Stable", "tone": "success"})
    if budget_amt and this_month_total > budget_amt:
        tags.append({"label": "Risk zone", "tone": "danger"})
    if not tags:
        tags = [{"label": "Steady", "tone": "success"}]

    # ── Tips with savings estimates ────────────────────────────────────
    tips = []
    cat_lower = category.lower()
    if "food" in cat_lower:
        # Rough heuristic: avg ≈ per-order; suggest 2 fewer/week
        potential = round(avg * 8)
        if potential > 100:
            tips.append({"text": f"Skip 2 food-delivery orders/week → save ≈ ₹{potential:,}/mo", "save": potential})
    if "shopping" in cat_lower:
        if monthly_avg > budget_amt * 1.3 and budget_amt > 0:
            spike = round(monthly_avg - budget_amt)
            tips.append({"text": f"You overspent by ₹{spike:,} — set an alert at 80% budget", "save": spike})
        if night_pct >= 40:
            tips.append({"text": "80% of shopping is after 9 PM — try a 24-hour cooling-off rule", "save": round(monthly_avg * 0.15)})
    if "transport" in cat_lower:
        if avg > 150:
            tips.append({"text": "Switch 3 rides/week to metro → save ≈ ₹800/mo", "save": 800})
    if "entertainment" in cat_lower:
        tips.append({"text": "Audit recurring subs — cancel unused → avg ₹500/mo saved", "save": 500})
    if not tips:
        target = round(monthly_avg * 0.85 / 100) * 100
        save = max(0, round(monthly_avg - target))
        if save > 50:
            tips.append({"text": f"A 15% cap (₹{target:,}/mo) would save ≈ ₹{save:,}", "save": save})
    if not tips:
        tips.append({"text": "Great pace — stay the course this month!", "save": 0})

    # ── Auto-apply actions ─────────────────────────────────────────────
    auto_apply = []
    if budget_amt > 0 and monthly_avg > budget_amt * 1.1:
        new_amt = int(max(monthly_avg * 0.9, budget_amt * 1.05) / 100) * 100
        auto_apply.append({
            "action": "adjust_budget",
            "label": f"Raise budget to ₹{new_amt:,}",
            "payload": {"amount": new_amt},
            "delta": new_amt - int(budget_amt),
        })
    elif budget_amt > 0 and monthly_avg < budget_amt * 0.6:
        new_amt = int(monthly_avg * 1.1 / 100) * 100 or 500
        auto_apply.append({
            "action": "adjust_budget",
            "label": f"Tighten budget to ₹{new_amt:,}",
            "payload": {"amount": new_amt},
            "delta": new_amt - int(budget_amt),
        })
    auto_apply.append({
        "action": "enable_alert",
        "label": "Alert me at 80% of budget",
        "payload": {"threshold": 0.8},
        "delta": 0,
    })

    return {
        "category": category,
        "tags": tags[:4],
        "tips": tips[:3],
        "auto_apply": auto_apply,
        "stats": {
            "txn_count_60d": count,
            "monthly_avg": round(monthly_avg, 2),
            "this_month": round(this_month_total, 2),
            "delta_pct": delta_pct,
            "night_pct": night_pct,
            "weekend_pct": weekend_pct,
        },
    }


@api_router.post("/budgets/ai-apply/{category}")
async def budget_ai_apply(category: str, data: dict, user_id: str = Depends(get_current_user)):
    """Execute an auto-apply action emitted by /budgets/ai-insights/{category}."""
    action = data.get("action")
    payload = data.get("payload") or {}
    existing = await db.budgets.find_one({"user_id": user_id, "category": category})
    if action == "adjust_budget":
        new_amt = float(payload.get("amount", 0) or 0)
        if new_amt <= 0:
            return {"ok": False, "error": "invalid_amount"}
        if existing:
            await db.budgets.update_one(
                {"_id": existing["_id"]},
                {"$set": {"amount": new_amt, "updated_at": datetime.now(timezone.utc)}},
            )
            return {"ok": True, "applied": action, "new_amount": new_amt}
        await db.budgets.insert_one({
            "user_id": user_id, "category": category, "amount": new_amt,
            "period": "monthly", "recurring": True, "spent": 0,
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "applied": action, "new_amount": new_amt, "created": True}
    if action == "enable_alert":
        threshold = float(payload.get("threshold", 0.8) or 0.8)
        await db.budget_alerts.update_one(
            {"user_id": user_id, "category": category},
            {"$set": {
                "user_id": user_id, "category": category, "threshold": threshold,
                "enabled": True, "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        return {"ok": True, "applied": action, "threshold": threshold}
    return {"ok": False, "error": "unknown_action"}



# ══════════════════════════════════════════════════════════════════════════
#  PHASE 3 — GAMIFICATION: streaks, badges, and "days-under-budget" progress
#  Endpoint: GET /api/budgets/achievements
#  Response shape:
#    {
#      streak:      { current_days, longest_days, target, pct },
#      stats:       { days_under_budget_mtd, days_in_month_so_far, under_rate_pct,
#                     categories_under, categories_over, total_categories,
#                     saved_amount, saved_pct },
#      badges:      [{ id, name, emoji, tagline, unlocked, progress_pct, progress_label }],
#      next_badge:  { ... }  # first locked badge — surfaced as the "chase this" card
#      headline:    "You're on a 5-day streak 🔥"
#    }
#  Pure derivation from existing /transactions + /budgets — no extra DB writes.
# ══════════════════════════════════════════════════════════════════════════
@api_router.get("/budgets/achievements")
async def budget_achievements(user_id: str = Depends(get_current_user)):
    """Gamification layer for the Budget screen — streaks + badges + progress."""
    now = datetime.now(timezone.utc)
    budgets = await db.budgets.find({"user_id": user_id}).to_list(30)

    # Build monthly-budget map (daily equivalents used for streak calc)
    monthly_by_cat: Dict[str, float] = {}
    for b in budgets:
        cat = b["category"]
        period = b.get("period", "monthly")
        amt = float(b.get("amount", 0) or 0)
        if period == "daily":
            monthly_by_cat[cat] = monthly_by_cat.get(cat, 0) + amt * 30
        elif period == "weekly":
            monthly_by_cat[cat] = monthly_by_cat.get(cat, 0) + amt * (30 / 7)
        else:
            monthly_by_cat[cat] = monthly_by_cat.get(cat, 0) + amt

    total_monthly_limit = sum(monthly_by_cat.values())
    daily_limit = total_monthly_limit / 30 if total_monthly_limit else 0

    # Pull 60 days of expenses
    sixty_days_ago = now - timedelta(days=60)
    cursor = db.transactions.find({
        "user_id": user_id,
        "type": {"$in": ["expense", "debit"]},
        "date": {"$gte": sixty_days_ago},
    })
    # Bucket per UTC day (YYYY-MM-DD -> total spent that day)
    by_day: Dict[str, float] = {}
    by_cat_month: Dict[str, float] = {}
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    async for t in cursor:
        d = t.get("date")
        amt = float(t.get("amount", 0) or 0)
        cat = t.get("category", "Other")
        if hasattr(d, "date"):
            day_key = d.strftime("%Y-%m-%d")
            by_day[day_key] = by_day.get(day_key, 0) + amt
            if d >= month_start:
                by_cat_month[cat] = by_cat_month.get(cat, 0) + amt

    # ── Streak: consecutive days (ending today) where daily spend ≤ daily_limit
    def _day_spent(dt):
        return by_day.get(dt.strftime("%Y-%m-%d"), 0.0)

    current_streak = 0
    if daily_limit > 0:
        cursor_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Today counts only if user has budgets configured; 0 spend day also counts as under.
        while _day_spent(cursor_day) <= daily_limit and (now - cursor_day).days < 60:
            current_streak += 1
            cursor_day -= timedelta(days=1)

    # Longest streak across the last 60 days
    longest_streak = 0
    if daily_limit > 0:
        run = 0
        for i in range(60):
            d = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            if _day_spent(d) <= daily_limit:
                run += 1
                longest_streak = max(longest_streak, run)
            else:
                run = 0

    # ── This-month stats
    days_in_month = (now - month_start).days + 1
    days_under = 0
    if daily_limit > 0:
        for i in range(days_in_month):
            d = (month_start + timedelta(days=i))
            if d > now: break
            if _day_spent(d) <= daily_limit:
                days_under += 1

    under_rate = round((days_under / max(days_in_month, 1)) * 100, 0)

    # Category adherence for current month
    cats_under = 0
    cats_over = 0
    for cat, limit in monthly_by_cat.items():
        spent = by_cat_month.get(cat, 0.0)
        if spent > limit and limit > 0:
            cats_over += 1
        else:
            cats_under += 1
    total_cats = len(monthly_by_cat)

    total_spent_mtd = sum(by_cat_month.values())
    # Pro-rated expectation based on days elapsed
    expected_spend = (total_monthly_limit * days_in_month / 30) if total_monthly_limit else 0
    saved_amount = max(0.0, round(expected_spend - total_spent_mtd, 2))
    saved_pct = round((saved_amount / expected_spend * 100) if expected_spend > 0 else 0, 0)

    # ── Badge definitions ─────────────────────────────────────────────────
    def _badge(id_, name, emoji, tagline, unlocked, progress, label):
        return {
            "id": id_, "name": name, "emoji": emoji, "tagline": tagline,
            "unlocked": unlocked,
            "progress_pct": int(max(0, min(100, round(progress * 100)))),
            "progress_label": label,
        }

    badges = [
        _badge(
            "budget_master", "Budget Master", "🏆",
            "7-day streak of staying under",
            current_streak >= 7,
            min(1.0, current_streak / 7),
            f"{min(current_streak, 7)}/7 days",
        ),
        _badge(
            "streak_legend", "Streak Legend", "🔥",
            "30 days in the green",
            current_streak >= 30 or longest_streak >= 30,
            min(1.0, max(current_streak, longest_streak) / 30),
            f"{min(max(current_streak, longest_streak), 30)}/30 days",
        ),
        _badge(
            "category_captain", "Category Captain", "🎯",
            "All categories under budget this month",
            total_cats > 0 and cats_over == 0,
            (cats_under / total_cats) if total_cats > 0 else 0,
            f"{cats_under}/{max(total_cats, 1)} cats",
        ),
        _badge(
            "savings_sprinter", "Savings Sprinter", "⚡",
            "Saved ≥20% vs your budgeted pace",
            saved_pct >= 20,
            min(1.0, saved_pct / 20),
            f"{int(saved_pct)}% saved",
        ),
        _badge(
            "comeback_king", "Comeback King", "👑",
            "3-day recovery after an over-budget day",
            current_streak >= 3 and longest_streak > current_streak,
            min(1.0, current_streak / 3) if longest_streak > current_streak else 0,
            f"{min(current_streak, 3)}/3 days"
            if longest_streak > current_streak else "Waiting for first recovery",
        ),
        _badge(
            "perfect_month", "Perfect Month", "🌟",
            "All 30 days under budget",
            days_under >= 30,
            min(1.0, days_under / 30),
            f"{days_under}/30 days",
        ),
    ]

    # Streak target — next milestone
    if current_streak < 3:   target = 3
    elif current_streak < 7: target = 7
    elif current_streak < 14: target = 14
    elif current_streak < 30: target = 30
    else: target = current_streak + 7
    streak_pct = int(min(100, round((current_streak / target) * 100))) if target else 0

    # Headline
    if current_streak >= 30:
        headline = f"🌟 {current_streak}-day legend streak!"
    elif current_streak >= 7:
        headline = f"🔥 You're on a {current_streak}-day streak — keep it burning!"
    elif current_streak >= 3:
        headline = f"🔥 {current_streak}-day streak building up!"
    elif current_streak >= 1:
        headline = f"✨ Day {current_streak} — streak started!"
    elif total_cats == 0:
        headline = "Set your first budget to unlock streaks & badges 🎯"
    else:
        headline = "Today's a fresh start — come in under budget 💪"

    next_badge = next((b for b in badges if not b["unlocked"]), None)

    return {
        "streak": {
            "current_days": current_streak,
            "longest_days": longest_streak,
            "target": target,
            "pct": streak_pct,
        },
        "stats": {
            "days_under_budget_mtd": days_under,
            "days_in_month_so_far": days_in_month,
            "under_rate_pct": int(under_rate),
            "categories_under": cats_under,
            "categories_over": cats_over,
            "total_categories": total_cats,
            "saved_amount": saved_amount,
            "saved_pct": int(saved_pct),
        },
        "badges": badges,
        "next_badge": next_badge,
        "headline": headline,
    }
