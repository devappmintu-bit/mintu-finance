"""AI insights, Money School, waste detector, proactive nudges, expense report card.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
import logging
from datetime import datetime, timedelta, date
from typing import List, Dict, Optional
from bson import ObjectId
from fastapi import Depends, HTTPException, UploadFile, File
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




@api_router.get("/insights/daily")
async def get_daily_insights(user_id: str = Depends(get_current_user), lang: str = "en"):
    # Calculate money score
    money_score = await calculate_money_score(user_id)
    
    # Get spending summary by category
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
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
        "generated_at": datetime.utcnow()
    }



@api_router.get("/money-school/lessons")
async def get_money_school_lessons():
    """Get all financial literacy lessons"""
    return {"lessons": MONEY_SCHOOL_LESSONS, "total": len(MONEY_SCHOOL_LESSONS)}



@api_router.get("/money-school/daily")
async def get_daily_lesson(user_id: str = Depends(get_current_user), lang: str = "en"):
    """Get today's lesson + AI-personalized tip based on user's spending"""
    # Rotate daily lesson based on date
    day_index = date.today().toordinal() % len(MONEY_SCHOOL_LESSONS)
    lesson = MONEY_SCHOOL_LESSONS[day_index]
    
    # Get user's spending context for AI personalization
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
        total_spent = sum(t["amount"] for t in txns)
        top_cat = {}
        for t in txns:
            top_cat[t["category"]] = top_cat.get(t["category"], 0) + t["amount"]
        top_category = max(top_cat, key=top_cat.get) if top_cat else "Food"
        
        lang_instr = get_lang_instruction(lang)
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"school_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="You are MintU's financial literacy buddy. Give ONE short personalized tip (1-2 sentences) connecting the lesson topic to user's actual spending. Be warm and specific with numbers. Use ₹." + lang_instr
        ).with_model("openai", "gpt-5.2")
        
        msg = f"Lesson: {lesson['title']}. User spent ₹{total_spent:.0f} this month, top category: {top_category}."
        response = await chat.send_message(UserMessage(text=msg))
        personal_tip = response.strip()
    except Exception as e:
        logging.error(f"Money school AI error: {e}")
        personal_tip = lesson["tip"]
    
    return {
        "lesson": lesson,
        "personal_tip": personal_tip,
        "lesson_number": day_index + 1,
        "total_lessons": len(MONEY_SCHOOL_LESSONS)
    }



@api_router.get("/waste-detector")

@api_router.get("/insights/waste")
async def waste_detector(user_id: str = Depends(get_current_user)):
    """AI-powered Waste Detector — dynamic analysis with peer comparisons & trend insights (cached 5min/user)"""
    # Check cache first (per-user, 5 min TTL)
    cache_key = f"waste:{user_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    
    # Category spending this month
    pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    categories = {}
    async for doc in db.transactions.aggregate(pipeline):
        categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    # Last month spending for trend comparison
    prev_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": prev_month_start, "$lt": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    prev_categories = {}
    async for doc in db.transactions.aggregate(prev_pipeline):
        prev_categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    total_expense = sum(c["total"] for c in categories.values())
    prev_total = sum(c["total"] for c in prev_categories.values())
    
    # Peer average spending (aggregate from all users this month)
    peer_pipeline = [
        {"$match": {"type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "user_count": {"$addToSet": "$user_id"}}},
        {"$project": {"_id": 1, "total": 1, "user_count": {"$size": "$user_count"}}}
    ]
    peer_data = {}
    async for doc in db.transactions.aggregate(peer_pipeline):
        if doc["user_count"] > 0:
            peer_data[doc["_id"]] = {"avg": doc["total"] / doc["user_count"]}
    
    # Build enhanced waste insights for each category
    waste_insights = []
    for cat, data in sorted(categories.items(), key=lambda x: x[1]["total"], reverse=True):
        equivs = build_equivalences(data["total"])
        prev_amt = prev_categories.get(cat, {}).get("total", 0)
        peer_avg = peer_data.get(cat, {}).get("avg", 0)
        
        # Trend vs last month
        trend_pct = ((data["total"] - prev_amt) / max(prev_amt, 1)) * 100 if prev_amt > 0 else 0
        trend_text = f"{'📈' if trend_pct > 0 else '📉'} {abs(trend_pct):.0f}% {'more' if trend_pct > 0 else 'less'} than last month" if prev_amt > 0 else ""
        
        # Peer comparison
        peer_diff = ((data["total"] - peer_avg) / max(peer_avg, 1)) * 100 if peer_avg > 0 else 0
        peer_text = f"You spend {abs(peer_diff):.0f}% {'more' if peer_diff > 0 else 'less'} than average MintU users" if peer_avg > 0 else ""
        
        insight = {
            "category": cat,
            "amount": data["total"],
            "count": data["count"],
            "equivalences": equivs[:3] if equivs else [],
            "shock_text": f"₹{data['total']:,.0f} on {cat} — {data['count']} transactions 😳",
            "trend": {"pct": round(trend_pct, 1), "text": trend_text, "prev_amount": prev_amt},
            "peer_comparison": {"diff_pct": round(peer_diff, 1), "text": peer_text, "peer_avg": round(peer_avg)},
        }
        waste_insights.append(insight)
    
    # Overall equivalence
    overall_equivs = build_equivalences(total_expense)
    
    # Overall trend
    overall_trend_pct = ((total_expense - prev_total) / max(prev_total, 1)) * 100 if prev_total > 0 else 0
    
    # Percentile comparison
    user_count = await db.users.count_documents({})
    users_with_less = await db.users.count_documents({"money_score": {"$lt": 50}})
    percentile = min(95, max(5, int((1 - (users_with_less / max(user_count, 1))) * 100)))
    
    # Generate AI recommendation using GPT
    ai_recommendation = ""
    try:
        top_3_cats = "\n".join([f"- {w['category']}: ₹{w['amount']:,.0f} ({w['count']} txns){' — ' + w['trend']['text'] if w['trend']['text'] else ''}" for w in waste_insights[:3]])
        ai_prompt = f"""Based on this Indian user's spending, give ONE short punchy recommendation (2-3 sentences max):
Total: ₹{total_expense:,.0f} | Last month: ₹{prev_total:,.0f} | Change: {overall_trend_pct:+.0f}%
Top categories:
{top_3_cats}
Be specific, actionable, use Indian context. Sound like a smart friend, not a bot."""
        
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"waste_{user_id}_{now.timestamp()}",
            system_message="You are a witty Indian personal finance advisor. Keep it short and punchy."
        ).with_model("openai", "gpt-5.2")
        
        ai_resp = await chat.send_message(UserMessage(text=ai_prompt))
        ai_recommendation = ai_resp.strip() if isinstance(ai_resp, str) else str(ai_resp)
    except Exception as e:
        logging.warning(f"Waste AI recommendation failed: {e}")
        ai_recommendation = ""
    
    result = {
        "total_monthly_expense": total_expense,
        "prev_month_total": prev_total,
        "overall_trend_pct": round(overall_trend_pct, 1),
        "category_waste": waste_insights[:5],
        "overall_equivalences": overall_equivs,
        "ai_recommendation": ai_recommendation,
        "comparison": {
            "percentile": percentile,
            "text": f"You spend {'less' if percentile > 50 else 'more'} than {percentile}% of MintU users 👀",
            "population_context": f"Out of 1.46 billion Indians, only ~{int(INDIA_POPULATION_2025 * percentile / 100 / 1_000_000)}M people save as well as you"
        },
        "shareable_text": f"I spent ₹{total_expense:,.0f} this month... that's {overall_equivs[0]['emoji']} {overall_equivs[0]['text']}! 😱 Check yours on MintU" if overall_equivs else f"I tracked ₹{total_expense:,.0f} this month with MintU 💸"
    }
    cache_set(cache_key, result, ttl_seconds=300)
    return result



@api_router.get("/reports/ai-expense-card")
async def ai_expense_report(user_id: str = Depends(get_current_user)):
    """AI-generated personalized expense report with insights (cached 10min/user)"""
    cache_key = f"expense_report:{user_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    now = datetime.utcnow()
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
        resp = await chat.send_message(UserMessage(text=prompt))
        resp_text = resp.strip() if isinstance(resp, str) else str(resp)
        import json as json_mod
        report = json_mod.loads(resp_text) if resp_text.startswith("{") else json_mod.loads(resp_text[resp_text.index("{"):resp_text.rindex("}")+1])
    except Exception as e:
        logging.warning(f"AI report failed: {e}")
        report = {"headline": "Your Monthly Snapshot", "health_grade": "B", "health_color": "yellow", "savings_rate": savings_rate, "top_insight": f"You spent ₹{total:,.0f} across {len(categories)} categories this month.", "highlights": [f"Total: ₹{total:,.0f} across {txn_count} transactions", f"Savings rate: {savings_rate}%"], "recommendations": ["Review your top spending category", "Set a weekly budget limit"], "comparison_text": f"{'📈' if total > prev_total else '📉'} {abs(((total-prev_total)/max(prev_total,1)*100)):,.0f}% vs last month"}
    result = {"total_expense": total, "total_income": income, "savings_rate": savings_rate, "txn_count": txn_count, "prev_total": prev_total, "categories": {k: v["total"] for k, v in categories.items()}, "report": report}
    cache_set(cache_key, result, ttl_seconds=600)
    return result



@api_router.get("/ai/proactive-nudges")
async def get_proactive_nudges(user_id: str = Depends(get_current_user)):
    """Generate proactive AI nudges based on user's financial behavior"""
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
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



@api_router.get("/money-school/dynamic")
async def dynamic_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-generated daily finance school — trends, news, personalized teachings"""
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # User spending context
    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(cat_pipe):
        spending[doc["_id"]] = doc["total"]
    
    total = sum(spending.values())
    top_cat = max(spending, key=spending.get) if spending else "Food"
    
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    inc_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = inc_docs[0]["total"] if inc_docs else 0
    
    context = f"User: {user.get('name','User') if user else 'User'}, Income: ₹{income:,.0f}, Expenses: ₹{total:,.0f}, Top category: {top_cat} (₹{spending.get(top_cat,0):,.0f}), Score: {user.get('money_score',50) if user else 50}/100. Date: {now.strftime('%B %d, %Y')}."
    
    lang_instr = get_lang_instruction(lang)
    
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"school_dynamic_{user_id}_{now.timestamp()}",
            system_message=f"""You are MintU Money School — India's AI finance teacher. Generate 6 dynamic learning cards for TODAY.

CARD TYPES (generate 1 of each):
1. "trend" — Today's Indian financial trend/news (stock market, RBI policy, crypto, gold prices)
2. "teaching" — Finance concept explained simply (compound interest, SIP, term insurance, etc.)
3. "saving_hack" — Practical Indian money-saving tip using their ACTUAL spending data
4. "investment" — Investment education with real Indian instruments (Nifty, Sensible, ELSS, PPF)
5. "quiz" — Financial literacy question with answer
6. "challenge" — Daily money challenge personalized to their spending

Return ONLY valid JSON array:
[{{"type":"trend|teaching|saving_hack|investment|quiz|challenge", "emoji":"emoji", "title":"catchy title", "body":"2-3 sentences, specific ₹ amounts, Indian context", "xp":10-25, "color":"#hexcolor"}}]

RULES:
- Use REAL Indian context (RBI, Sensex, Nifty, HDFC, SBI, Groww, Zerodha)
- Reference user's ACTUAL numbers from context
- Make it feel like a daily newspaper finance column
- Each card should teach something NEW and actionable
- For quiz: include question AND answer in body
- For challenge: make it achievable today
{lang_instr}"""
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=context))
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        import json as json_mod
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        if start >= 0 and end > start:
            ai_cards = json_mod.loads(response_text[start:end])
        else:
            ai_cards = []
    except Exception as e:
        logging.error(f"Dynamic school error: {e}")
        ai_cards = []
    
    # Merge with static fallback
    all_cards = []
    for i, card in enumerate(ai_cards[:6]):
        all_cards.append({**card, "id": f"dynamic_{i}", "source": "ai"})
    
    # Add static fallbacks if AI didn't generate enough
    if len(all_cards) < 6:
        for i, card in enumerate(MONEY_SCHOOL_CARDS[:6-len(all_cards)]):
            all_cards.append({**card, "id": f"static_{i}", "source": "static"})
    
    # Progress
    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": []}
    xp = progress.get("xp", 0)
    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None
    
    return {
        "cards": all_cards,
        "date": now.strftime("%B %d, %Y"),
        "progress": {
            "xp": xp, "level": current_level, "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - xp) if next_level else 0,
        }
    }



@api_router.get("/money-school/cards")
async def get_money_school_cards(user_id: str = Depends(get_current_user)):
    """Get personalized money school cards with gamification"""
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": [], "streak": 0}
    
    current_xp = progress.get("xp", 0)
    completed_ids = set(progress.get("completed", []))
    
    # Determine user level
    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if current_xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None
    
    # Shuffle and personalize cards
    cards = []
    for i, card in enumerate(MONEY_SCHOOL_CARDS):
        card_id = f"card_{i}"
        cards.append({
            **card,
            "id": card_id,
            "completed": card_id in completed_ids,
        })
    
    random.shuffle(cards)
    
    return {
        "cards": cards,
        "progress": {
            "xp": current_xp,
            "level": current_level,
            "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - current_xp) if next_level else 0,
            "completed_count": len(completed_ids),
            "total_cards": len(MONEY_SCHOOL_CARDS),
            "streak": progress.get("streak", 0),
        }
    }



@api_router.post("/money-school/complete")
async def complete_card(data: dict, user_id: str = Depends(get_current_user)):
    """Mark a money school card as completed and earn XP"""
    card_id = data.get("card_id", "")
    xp_earned = data.get("xp", 10)
    
    result = await db.school_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {"user_id": user_id, "last_activity": datetime.utcnow()},
            "$inc": {"xp": xp_earned},
            "$addToSet": {"completed": card_id}
        },
        upsert=True
    )
    
    progress = await db.school_progress.find_one({"user_id": user_id})
    new_xp = progress.get("xp", 0)
    
    # Check for level up
    current_level = XP_LEVELS[0]
    for lvl in XP_LEVELS:
        if new_xp >= lvl["min_xp"]:
            current_level = lvl
    
    return {
        "xp_earned": xp_earned,
        "total_xp": new_xp,
        "level": current_level,
        "message": f"+{xp_earned} XP! {current_level['emoji']} Level: {current_level['name']}"
    }



@api_router.get("/money-school/personalized")
async def personalized_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-personalized money school cards based on user's actual spending"""

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Get spending data
    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(cat_pipe):
        spending[doc["_id"]] = doc["total"]

    total_expense = sum(spending.values())
    top_cat = max(spending, key=spending.get) if spending else "Food"
    top_amount = spending.get(top_cat, 0)

    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = income_docs[0]["total"] if income_docs else 0
    savings_rate = ((income - total_expense) / max(income, 1) * 100) if income > 0 else 0

    # Generate personalized cards using AI
    context = f"User spends ₹{total_expense:,.0f}/month. Top: {top_cat} ₹{top_amount:,.0f}. Income: ₹{income:,.0f}. Savings rate: {savings_rate:.0f}%."

    try:
        lang_instr = get_lang_instruction(lang)
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"school_{user_id}_{now.timestamp()}",
            system_message=f"""Generate 5 personalized financial learning cards for an Indian user. Return ONLY valid JSON array.
Each card: {{"type": "saving_hack"|"investment"|"daily_tip"|"market_trend"|"risk_alert", "emoji": "emoji", "title": "short title", "body": "2-3 sentence actionable advice with specific ₹ amounts", "xp": 10-25, "color": "hex_color"}}
Use REAL numbers from their data. Reference Indian products (Zerodha, SBI, HDFC, Swiggy, Zomato, D-Mart).
Make it FUN, specific, and actionable. Not generic boring advice.{lang_instr}"""
        ).with_model("openai", "gpt-5.2")

        response = await chat.send_message(UserMessage(text=context))
        response_text = response.strip() if isinstance(response, str) else str(response)

        import json as json_mod
        # Extract JSON from response
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        if start >= 0 and end > start:
            ai_cards = json_mod.loads(response_text[start:end])
        else:
            ai_cards = []
    except Exception as e:
        logging.error(f"Money school AI error: {e}")
        ai_cards = []

    # Merge AI cards with static cards
    all_cards = []
    for i, card in enumerate(ai_cards[:5]):
        all_cards.append({**card, "id": f"ai_{i}", "completed": False, "source": "ai"})

    for i, card in enumerate(MONEY_SCHOOL_CARDS):
        all_cards.append({**card, "id": f"card_{i}", "completed": False, "source": "static"})

    random.shuffle(all_cards)

    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": [], "streak": 0}
    current_xp = progress.get("xp", 0)
    completed_ids = set(progress.get("completed", []))
    for card in all_cards:
        card["completed"] = card["id"] in completed_ids

    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if current_xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None

    return {
        "cards": all_cards[:12],
        "progress": {
            "xp": current_xp,
            "level": current_level,
            "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - current_xp) if next_level else 0,
            "completed_count": len(completed_ids),
            "total_cards": len(all_cards),
        }
    }

