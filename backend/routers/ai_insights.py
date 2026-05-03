"""AI insights, Money School, waste detector, proactive nudges, expense report card.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
# Round 62 — global LLM-call timeout wrapper.
from core.llm_safe import safe_send
import logging
from datetime import datetime, timedelta, date, timezone
from typing import List, Dict, Optional
from bson import ObjectId
from fastapi import Depends, HTTPException, UploadFile, File
from core.users import get_user_by_id
from core.time import utc_now
from routers.ai_common import (
    router, api_router, ChatMessage, db, get_current_user,
    _lazy_server_attr, cache_get, cache_set, calculate_money_score,
    LlmChat, UserMessage,
)
from core.constants import (
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    INDIA_POPULATION_2025, get_lang_instruction, build_equivalences,
)

# `generate_insights_with_ai` lives in server.py (it wires the LLM client). We
# wrap it through the lazy-loader so routes below can call it freely.
generate_insights_with_ai = _lazy_server_attr("generate_insights_with_ai")


# ── /insights/daily ────────────────────────────────────────────────────────


@api_router.get("/insights/daily")
async def get_daily_insights(user_id: str = Depends(get_current_user), lang: str = "en"):
    # Calculate money score
    money_score = await calculate_money_score(user_id)
    
    # Get spending summary by category
    seven_days_ago = utc_now() - timedelta(days=7)
    transactions = await db.transactions.find({
        "user_id": user_id,
        "type": "debit",
        "date": {"$gte": seven_days_ago}
    }).to_list(1000)
    
    spending_summary = {}
    for trans in transactions:
        category = trans["category"]
        spending_summary[category] = spending_summary.get(category, 0) + trans["amount"]
    
    # Generate AI insights (enhanced v2) — pass lang for multilingual output
    ai_insights = await generate_insights_with_ai(user_id, money_score, spending_summary, lang=lang)
    
    return {
        "money_score": money_score,
        "insight_text": ai_insights["insight_text"],
        "weekly_summary": ai_insights.get("weekly_summary", ""),
        "spending_summary": spending_summary,
        "recommendations": ai_insights["recommendations"],
        "savings_tip": ai_insights.get("savings_tip", ""),
        "mood": ai_insights.get("mood", "good"),
        "alerts": ai_insights.get("alerts", []),
        "trends": ai_insights.get("trends", {}),
        "generated_at": utc_now()
    }


# ── /reports/ai-expense-card ──────────────────────────────────────────────
@api_router.get("/reports/ai-expense-card")
async def ai_expense_report(user_id: str = Depends(get_current_user)):
    """AI-generated personalized expense report with insights (cached 10min/user)"""
    cache_key = f"expense_report:{user_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    # Current month data
    pipeline = [{"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}}, {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    categories = {}
    async for doc in db.transactions.aggregate(pipeline):
        categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    # Previous month
    prev_pipeline = [{"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": prev_month_start, "$lt": month_start}}}, {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    prev_categories = {}
    async for doc in db.transactions.aggregate(prev_pipeline):
        prev_categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    total = sum(c["total"] for c in categories.values())
    prev_total = sum(c["total"] for c in prev_categories.values())
    txn_count = sum(c["count"] for c in categories.values())
    # Income
    income_pipeline = [{"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    income = 0
    async for doc in db.transactions.aggregate(income_pipeline):
        income = doc["total"]
    savings_rate = round(((income - total) / max(income, 1)) * 100) if income > 0 else 0
    cat_summary = "\n".join([f"- {cat}: ₹{d['total']:,.0f} ({d['count']} txns)" for cat, d in sorted(categories.items(), key=lambda x: x[1]["total"], reverse=True)[:6]])

    # Round 69 — Architectural pass: LLM-derived `report` is now read
    # from the `llm_cache` collection. This endpoint NEVER blocks
    # waiting for an LLM call. On a cold miss, callers receive a
    # deterministic fallback (same shape as the AI version) and the
    # next request gets the LLM-enriched copy after the background
    # regen lands. TTL fresh = 10 min so reports update steadily; TTL
    # stale = 7d so we always have *something* to show even if the
    # LLM provider is down for a week.
    cache_key = f"insights_report:{user_id}:{now.strftime('%Y-%m')}"

    fallback_report = {
        "headline": "Your Monthly Snapshot",
        "health_grade": "B",
        "health_color": "yellow",
        "savings_rate": savings_rate,
        "top_insight": f"You spent ₹{total:,.0f} across {len(categories)} categories this month.",
        "highlights": [
            f"Total: ₹{total:,.0f} across {txn_count} transactions",
            f"Savings rate: {savings_rate}%",
        ],
        "recommendations": [
            "Review your top spending category",
            "Set a weekly budget limit",
        ],
        "comparison_text": f"{'📈' if total > prev_total else '📉'} {abs(((total-prev_total)/max(prev_total,1)*100)):,.0f}% vs last month",
    }

    async def _compute_report():
        """Generate the AI-enriched report. Called by llm_cache when
        the cached value is missing/stale; runs in the background and
        the result is written to MongoDB for subsequent reads."""
        try:
            prompt = f"""Generate a personalized monthly expense report for an Indian user:
Income: ₹{income:,.0f} | Expenses: ₹{total:,.0f} | Savings Rate: {savings_rate}%
Last Month Expenses: ₹{prev_total:,.0f} | Change: {((total-prev_total)/max(prev_total,1)*100):+.0f}%
Transaction Count: {txn_count}
Category Breakdown:
{cat_summary}

Generate a JSON report with these EXACT keys:
{{"headline": "catchy 5-word summary", "health_grade": "A/B/C/D/F", "health_color": "green/yellow/red", "savings_rate": {savings_rate}, "top_insight": "1 sentence key finding", "highlights": ["3-4 bullet point insights"], "recommendations": ["2-3 actionable tips"], "comparison_text": "vs last month comparison"}}
Return ONLY valid JSON."""
            chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY", ""), session_id=f"report_{user_id}_{now.timestamp()}", system_message="You are a certified financial planner analyzing an Indian user's expenses.").with_model("openai", "gpt-5.2")
            resp = (await safe_send(chat, UserMessage(text=prompt), timeout=15.0, label='ai_insights') or "")
            resp_text = resp.strip() if isinstance(resp, str) else str(resp)
            if not resp_text:
                return None
            import json as json_mod
            return json_mod.loads(resp_text) if resp_text.startswith("{") else json_mod.loads(resp_text[resp_text.index("{"):resp_text.rindex("}")+1])
        except Exception as e:
            logging.warning(f"insights LLM regen failed: {e}")
            return None

    from core.llm_cache import get_or_regen
    report = await get_or_regen(
        key=cache_key,
        compute_fn=_compute_report,
        ttl_fresh=600,        # 10 min
        ttl_stale=7 * 86400,  # 7 days
        fallback=fallback_report,
    )
    result = {"total_expense": total, "total_income": income, "savings_rate": savings_rate, "txn_count": txn_count, "prev_total": prev_total, "categories": {k: v["total"] for k, v in categories.items()}, "report": report}
    cache_set(cache_key, result, ttl_seconds=600)
    return result




# ── /ai/proactive-nudges ──────────────────────────────────────────────────
@api_router.get("/ai/proactive-nudges")
async def get_proactive_nudges(user_id: str = Depends(get_current_user)):
    """Generate proactive AI nudges based on user's financial behavior"""
    
    user = await get_user_by_id(user_id)
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    nudges = []
    
    # 1. Check for unpaid splits
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(20)
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(100)
        for exp in expenses:
            splits_data = exp.get("splits", {})
            # splits can be dict {user_id: amount} or list [{user_id, amount}]
            if isinstance(splits_data, dict):
                my_share = splits_data.get(user_id, 0)
                if my_share > 0 and exp.get("paid_by") != user_id:
                    settled = await db.settlements.find_one({
                        "payer_id": user_id, "payee_id": exp["paid_by"],
                        "group_id": str(g["_id"])
                    })
                    if not settled:
                        payer_name = "someone"
                        try:
                            payer = await db.users.find_one({"_id": ObjectId(exp["paid_by"])}, {"name": 1})
                            if payer: payer_name = payer.get("name", "someone")
                        except Exception:
                            payer_name = exp.get("paid_by", "someone")
                        nudges.append({
                            "type": "split_reminder",
                            "agent": "split_manager",
                            "emoji": "🤝",
                            "title": f"You owe {payer_name}",
                            "message": f"₹{my_share:,.0f} for '{exp.get('description', 'expense')}'. Settle via UPI?",
                            "action": "settle_split",
                            "priority": "high",
                            "data": {"payee_id": exp["paid_by"], "amount": my_share, "group_id": str(g["_id"])}
                        })
    
    # 2. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    for b in budgets:
        spent_pipe = [
            {"$match": {"user_id": user_id, "category": b["category"], "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        spent_docs = await db.transactions.aggregate(spent_pipe).to_list(1)
        spent = spent_docs[0]["total"] if spent_docs else 0
        pct = (spent / max(b["amount"], 1)) * 100
        
        if pct >= 90 and pct < 100:
            nudges.append({
                "type": "budget_warning",
                "agent": "budget_manager",
                "emoji": "⚠️",
                "title": f"{b['category']} budget at {pct:.0f}%",
                "message": f"Only ₹{b['amount'] - spent:,.0f} left. Slow down for the rest of the month!",
                "action": "view_budget",
                "priority": "medium"
            })
        elif pct >= 100:
            nudges.append({
                "type": "budget_exceeded",
                "agent": "budget_manager",
                "emoji": "🚨",
                "title": f"{b['category']} budget blown!",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} ({pct:.0f}%). Want me to adjust the budget?",
                "action": "adjust_budget",
                "priority": "high"
            })
    
    # 3. Spending anomaly
    today_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    today_docs = await db.transactions.aggregate(today_pipe).to_list(1)
    today_total = today_docs[0]["total"] if today_docs else 0
    
    month_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    month_docs = await db.transactions.aggregate(month_pipe).to_list(1)
    month_total = month_docs[0]["total"] if month_docs else 0
    days = max(1, (now - month_start).days)
    daily_avg = month_total / days
    
    if today_total > daily_avg * 2 and today_total > 500:
        nudges.append({
            "type": "spending_spike",
            "agent": "expense_tracker",
            "emoji": "📊",
            "title": f"High spending today: ₹{today_total:,.0f}",
            "message": f"That's {today_total / max(daily_avg, 1):.1f}x your daily average. Review transactions?",
            "action": "review_today",
            "priority": "medium"
        })
    
    # 4. Streak nudge
    streak = user.get("streak_days", 0) if user else 0
    if streak >= 3 and streak < 7:
        nudges.append({
            "type": "streak_builder",
            "agent": "insights_agent",
            "emoji": "🔥",
            "title": f"{streak}-day streak!",
            "message": f"Just {7 - streak} more days for a weekly badge! Log today's expenses.",
            "action": "add_expense",
            "priority": "low"
        })
    
    # 5. Savings suggestion
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = income_docs[0]["total"] if income_docs else 0
    
    if income > 0:
        savings_rate = ((income - month_total) / income) * 100
        if savings_rate < 20:
            nudges.append({
                "type": "savings_low",
                "agent": "market_intel",
                "emoji": "💡",
                "title": f"Savings rate: {savings_rate:.0f}%",
                "message": "Indian financial advisors recommend 30%+. Want tips to boost savings?",
                "action": "get_savings_tips",
                "priority": "medium"
            })
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    nudges.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 3))
    
    return {"nudges": nudges[:8], "count": len(nudges)}



