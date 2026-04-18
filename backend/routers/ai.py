"""AI router — agent-chat, proactive-nudges, voice, money-school, waste-detector, insights/daily, ai-expense-card.

Lazy-imports legacy helpers from server.py (AGENT_PROFILES, route_to_agent, generate_insights_with_ai,
get_lang_instruction, MONEY_SCHOOL_LESSONS, etc.) to avoid circular imports while keeping routes modular.
"""
import os
import json
import logging
import hashlib
import random
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix
from core.content import APP_DOWNLOAD_LINK

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore

INDIA_POPULATION_2025 = 1_460_000_000

# Pydantic model for /ai/chat — kept local to avoid circular import.
class ChatMessage(BaseModel):
    message: str
    lang: Optional[str] = "en"


# Lazy server-helper accessor — these live in server.py for now (too entangled to extract yet).
def _srv():
    import server  # noqa: PLC0415
    return server


# Shim attributes that route to server.py at call-time (dict-style lookups need a real dict).
def _lazy_attr(name):
    """Returns a callable or dict that proxies to server.<name> lazily."""
    class _Proxy:
        def __call__(self, *a, **kw):
            return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k):
            return getattr(_srv(), name)[k]
        def __iter__(self):
            return iter(getattr(_srv(), name))
        def __len__(self):
            return len(getattr(_srv(), name))
        def items(self):
            return getattr(_srv(), name).items()
        def values(self):
            return getattr(_srv(), name).values()
        def keys(self):
            return getattr(_srv(), name).keys()
    return _Proxy()

# Bind names used by the extracted endpoints:
AGENT_PROFILES = _lazy_attr("AGENT_PROFILES")
MONEY_SCHOOL_LESSONS = _lazy_attr("MONEY_SCHOOL_LESSONS")
MONEY_SCHOOL_CARDS = _lazy_attr("MONEY_SCHOOL_CARDS")
XP_LEVELS = _lazy_attr("XP_LEVELS")
route_to_agent = _lazy_attr("route_to_agent")
get_system_prompt = _lazy_attr("get_system_prompt")
generate_insights_with_ai = _lazy_attr("generate_insights_with_ai")
get_lang_instruction = _lazy_attr("get_lang_instruction")
calculate_money_score = _lazy_attr("calculate_money_score")
build_equivalences = _lazy_attr("build_equivalences")

router = APIRouter(tags=["ai"])
api_router = router  # so extracted @api_router.xxx decorators keep working



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


@api_router.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Transcribe voice audio to text using OpenAI Whisper, then parse as cash entry"""
    import tempfile
    import io

    # Read audio data
    audio_data = await file.read()
    if len(audio_data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    # Save to temp file
    suffix = "." + (file.filename.split(".")[-1] if file.filename and "." in file.filename else "m4a")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name

    try:
        stt = OpenAISpeechToText(api_key=os.environ['EMERGENT_LLM_KEY'])
        with open(tmp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                prompt="Indian currency amounts, Hindi and English mixed. Examples: 50 rupaye auto, 200 sabzi, chai 30, doodh 50, maid 3000"
            )
        transcribed_text = response.text.strip()
    except Exception as e:
        logging.error(f"Whisper transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail="Voice transcription failed")
    finally:
        import os as _os
        try:
            _os.unlink(tmp_path)
        except Exception:
            pass

    if not transcribed_text:
        raise HTTPException(status_code=400, detail="Could not understand audio. Please try again.")

    return {"transcribed_text": transcribed_text}


@api_router.get("/money-school/lessons")
async def get_money_school_lessons():
    """Get all financial literacy lessons"""
    return {"lessons": _srv().MONEY_SCHOOL_LESSONS, "total": len(_srv().MONEY_SCHOOL_LESSONS)}


@api_router.get("/money-school/daily")
async def get_daily_lesson(user_id: str = Depends(get_current_user), lang: str = "en"):
    """Get today's lesson + AI-personalized tip based on user's spending"""
    from datetime import date
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


@api_router.post("/ai/chat")
async def ai_financial_coach(msg: ChatMessage, user_id: str = Depends(get_current_user)):
    """AI Financial Coach — personalized advice based on real spending data"""
    from bson import ObjectId
    
    # Gather user's financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate spending data
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {doc["_id"]: doc["total"] async for doc in db.transactions.aggregate(pipeline)}
    total_expense = sum(v for v in category_spend.values())
    
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    budget_info = {b["category"]: b["amount"] for b in budgets}
    
    # Build rich context for AI
    context = f"""User: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100
Monthly Income: ₹{total_income:,.0f} | Monthly Expenses: ₹{total_expense:,.0f} | Savings: ₹{max(0, total_income - total_expense):,.0f}
Category-wise spending this month: {', '.join(f'{k}: ₹{v:,.0f}' for k, v in category_spend.items()) or 'No data yet'}
Budgets set: {', '.join(f'{k}: ₹{v:,.0f}' for k, v in budget_info.items()) or 'None'}
Streak: {user.get('streak_days', 0)} days
India context: Average Indian household spends ~₹15,000-25,000/month. User is in India."""

    system_prompt = f"""You are MintU AI Coach — a warm, professional, personalized Indian money mentor. Think of yourself as a trusted friend with a finance degree.

TONE & PERSONALITY:
- Warm, friendly, encouraging — NEVER preachy or condescending
- Celebrate small wins ("Loved that you saved ₹400 on Zomato this week!")
- Honest when needed, but always kind — never shame spending
- Use the user's name when you have it
- Occasional emojis for warmth (💡 🎯 💪 🌟) — not every sentence

FORMATTING (CRITICAL — output in WhatsApp-style markdown):
- Lead with a **bold one-line headline** using ** (will render bold in chat)
- Use **bold** for key numbers (e.g. **₹2,400**, **15%**)
- Break advice into short digestible chunks using line breaks (never wall-of-text)
- Bullet points with "•" or emoji prefixes for lists
- End with ONE clear, specific action they can do TODAY
- Keep responses 4-8 short lines (including spacing)

PERSONALIZATION:
- ALWAYS reference their actual data from the context below
- Name specific merchants/categories from their transactions
- Quote real amounts (not generic "₹X")
- Compare current behavior to their past (e.g. "vs last week you're down 12%")

USER'S FINANCIAL CONTEXT:
{context}

RULES:
- India-specific advice only (SIPs via Groww/Zerodha, ELSS, NPS, PPF, FD rates, UPI, credit cards, Swiggy/Zomato etc.)
- NEVER give advice without grounding it in their data
- NEVER use jargon without explaining it simply
- End every response with a concrete, actionable next step
- If you lack data, say so warmly ("I don't see enough yet — track 5-10 expenses and I'll give you a much sharper plan!")""" + get_lang_instruction(msg.lang or "en")

    try:
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"coach_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=msg.message))
        
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        return {
            "reply": response_text,
            "context_used": {
                "money_score": user.get("money_score", 50),
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "top_category": max(category_spend, key=category_spend.get) if category_spend else None,
            }
        }
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        # Fallback: rule-based advice
        savings_rate = ((total_income - total_expense) / max(total_income, 1)) * 100 if total_income > 0 else 0
        if savings_rate > 30:
            reply = f"You're saving {savings_rate:.0f}% — that's solid, yaar! 💪 Consider putting ₹{int((total_income-total_expense)*0.5):,} into a SIP for long-term wealth."
        elif savings_rate > 10:
            reply = f"Saving {savings_rate:.0f}% is decent, but let's push to 30%. Your top spend is {max(category_spend, key=category_spend.get) if category_spend else 'unknown'} — can we cut ₹500 there?"
        else:
            reply = f"Your savings rate is {savings_rate:.0f}% — let's fix this! Start with cutting ₹200/week from discretionary spending. Small steps = big results. 🚀"
        return {"reply": reply, "context_used": {"money_score": user.get("money_score", 50), "monthly_expense": total_expense}}


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


@api_router.post("/ai/agent-chat")
async def agentic_ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    """Multi-agent AI finance assistant with memory and proactive behavior"""
    from bson import ObjectId
    
    message = data.get("message", "")
    lang = data.get("lang", "en")
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message required")
    
    # Route to appropriate agent
    agent_id = _srv().route_to_agent(message)
    agent = _srv().AGENT_PROFILES[agent_id]
    
    # Gather comprehensive financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    
    # Spending data
    cat_pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {}
    async for doc in db.transactions.aggregate(cat_pipeline):
        category_spend[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    total_expense = sum(c["total"] for c in category_spend.values())
    
    # Income
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    
    # Budgets
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    budget_info = []
    for b in budgets:
        spent = category_spend.get(b["category"], {}).get("total", 0)
        pct = (spent / max(b["amount"], 1)) * 100
        budget_info.append(f"{b['category']}: ₹{spent:,.0f}/₹{b['amount']:,.0f} ({pct:.0f}%)")
    
    # Split balances
    balances = await db.split_expenses.find({"splits.user_id": user_id}).to_list(50)
    
    # Recent transactions (last 10)
    recent_txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(10)
    recent_str = "\n".join([f"  - {t.get('description','?')}: ₹{t['amount']:,.0f} ({t.get('category','?')}) on {t['date'].strftime('%b %d') if t.get('date') else '?'}" for t in recent_txns[:7]])
    
    # Load agent memory
    memory = await db.agent_memory.find_one({"user_id": user_id})
    memory_context = ""
    if memory:
        prefs = memory.get("preferences", {})
        habits = memory.get("habits", [])
        memory_context = f"\nUser Preferences: {prefs}\nKnown Habits: {', '.join(habits[:5])}"
    
    # Build agent-specific system prompt
    financial_context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100 | Streak: {user.get('streak_days', 0)} days
Monthly Income: ₹{total_income:,.0f} | Monthly Expenses: ₹{total_expense:,.0f} | Savings: ₹{max(0, total_income - total_expense):,.0f}
Savings Rate: {((total_income - total_expense) / max(total_income, 1) * 100):.0f}%

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS:
{chr(10).join(f'  {b}' for b in budget_info) or '  No budgets set'}

RECENT TRANSACTIONS:
{recent_str or '  None yet'}
{memory_context}"""

    agent_system_prompts = {
        "expense_tracker": f"""You are MintU's {agent['emoji']} Expense Tracker Agent — an expert at categorizing and analyzing expenses.

CAPABILITIES:
- Automatically categorize expenses into: Food, Transport, Entertainment, Shopping, Bills, Health, Education, Groceries, Other
- Detect spending anomalies (unusual amounts, new merchants, spikes)
- Identify recurring expenses
- Flag potential duplicate charges

PERSONALITY: Precise, detail-oriented, helpful. Use specific numbers.

{financial_context}

RULES:
- Reference ACTUAL transaction data — never make up numbers
- If you spot an anomaly, explain why it's unusual
- Suggest better categories if you see miscategorization
- Be concise (max 4 sentences per insight)""",

        "budget_manager": f"""You are MintU's {agent['emoji']} Budget Manager Agent — proactive budget optimizer for Indian users.

CAPABILITIES:
- Set and adjust dynamic budgets based on spending patterns
- Alert when approaching/exceeding thresholds
- Suggest realistic budget targets (based on Indian cost of living)
- Recommend budget reallocation between categories

PERSONALITY: Firm but encouraging. Like a friendly financial advisor.

{financial_context}

RULES:
- Use Indian benchmarks (25% food, 10% transport, 20% bills, 30% savings)
- Suggest specific ₹ amounts, not vague advice
- If budget exceeded, suggest specific cuts
- Reference SIP, FD, PPF for savings recommendations""",

        "split_manager": f"""You are MintU's {agent['emoji']} Split Manager Agent — fair split calculator and payment reminder.

CAPABILITIES:
- Calculate fair splits (equal, by income, by consumption)
- Track who owes whom
- Generate payment reminders (friendly, not pushy)
- Suggest settlement strategies (netting, UPI)

PERSONALITY: Diplomatic, fair, organized.

{financial_context}

RULES:
- Always suggest the simplest settlement path
- Recommend UPI for instant payments
- Be sensitive about money between friends
- Use casual Indian English""",

        "insights_agent": f"""You are MintU's {agent['emoji']} Insights & Trends Agent — data storyteller who makes numbers interesting.

CAPABILITIES:
- Generate weekly/monthly spending summaries
- Identify trends and patterns (rising/falling categories)
- Compare current vs previous periods
- Provide percentile comparisons with other users
- Create digestible financial snapshots

PERSONALITY: Insightful, encouraging, data-driven but relatable.

{financial_context}

RULES:
- Make insights ACTIONABLE — don't just report, suggest
- Use comparisons ("30% more than last week")
- Reference Indian context (festivals, seasons affecting spending)
- Keep it punchy — max 3-4 key insights""",

        "market_intel": f"""You are MintU's {agent['emoji']} Market Intelligence Agent — India's smartest money-saving advisor.

CAPABILITIES:
- Identify subscription savings (Netflix annual vs monthly, etc.)
- Suggest cheaper alternatives for services
- Inflation-aware spending advice
- Investment tips (SIP, FD, gold, NPS, PPF)
- Tax-saving recommendations (80C, 80D, HRA)
- Insurance optimization

PERSONALITY: Sharp, knowledgeable, like a fintech-savvy friend.

{financial_context}

RULES:
- Reference REAL Indian products/services (Zerodha, Groww, HDFC, SBI)
- Calculate actual savings ("Switching to annual Netflix = ₹600/year saved")
- Consider user's income level for investment advice
- Tax tips relevant to Indian tax slabs
- Be specific — name products, amounts, percentages""",

        "money_school": f"""You are MintU's {agent['emoji']} Money School — a friendly Indian finance TEACHER who explains concepts clearly.

CAPABILITIES:
- Teach finance basics: SIPs, mutual funds, stocks, FDs, PPF, NPS, ELSS, REITs, index funds
- Explain tax concepts: 80C, 80D, HRA, old vs new regime, ELSS, capital gains
- Credit & loans: CIBIL score, how to improve it, home/personal/education loans
- Budget frameworks: 50/30/20 rule, envelope method, zero-based budgeting
- Protection: emergency funds, term insurance, health insurance
- Advanced: compound interest, diversification, asset allocation, inflation

TEACHING PERSONALITY:
- Like a friendly IIM professor who explains complex things simply
- Use relatable Indian analogies (SIP = pocket-money jar, diversification = thali not biryani-only)
- Give concrete ₹ numbers and real Indian examples (Zerodha, Groww, HDFC, SBI, LIC)
- Structure answers: **What it is → Why it matters → How to start → Common mistakes**
- Always connect back to the user's actual situation if their data is relevant

{financial_context}

RULES:
- Keep tone encouraging — no finance-bro jargon
- Break concepts into 3-4 digestible points with emojis
- End with ONE specific actionable next step (e.g., "Start a ₹500 SIP in a Nifty50 index fund")
- If user is new to the concept, explain WHY before HOW
- Never give specific stock/fund picks (only education)
- Max 5-6 short paragraphs"""
    }

    # Global conversational instruction for ALL agents
    CONVERSATIONAL_TONE = """

MANDATORY STYLE RULES (for ALL responses):
- Talk like a FRIEND, not a robot. Be warm, natural, sometimes funny.
- Use casual Indian English (yaar, bro, etc. when appropriate).
- Start with a reaction or acknowledgment: "Oh nice!", "Hmm interesting...", "Okay so..."
- Use 1-2 emojis per paragraph (not more). Place them naturally.
- Format with short paragraphs, bullet points with emojis, and bold numbers.
- Always highlight ₹ amounts in context: "that's ₹2,500 — almost a week's groceries!"
- Ask a follow-up question at the end to keep conversation going.
- Keep responses 3-5 short paragraphs max. No walls of text.
- If giving advice, make it SPECIFIC to their data — never generic.
- Reference Indian context: festivals, cricket, chai, local brands, UPI.

BAD example: "Your food expenses are ₹8,000. Consider reducing."
GOOD example: "₹8,000 on food this month — that's like ordering Swiggy every single day 😅 Want me to suggest a weekly meal budget that could save you ₹3,000?"
"""

    system_prompt = agent_system_prompts.get(agent_id, agent_system_prompts["insights_agent"])
    system_prompt += CONVERSATIONAL_TONE
    system_prompt += get_lang_instruction(lang)
    
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"agent_{agent_id}_{user_id}_{now.timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=message))
        reply = response.strip() if isinstance(response, str) else str(response)
        
        # Store interaction in agent memory
        await db.agent_memory.update_one(
            {"user_id": user_id},
            {
                "$set": {"user_id": user_id, "last_interaction": now},
                "$push": {
                    "interactions": {
                        "$each": [{"agent": agent_id, "query": message[:200], "timestamp": now}],
                        "$slice": -50  # Keep last 50 interactions
                    }
                }
            },
            upsert=True
        )
        
        return {
            "reply": reply,
            "agent": {
                "id": agent_id,
                "name": agent["name"],
                "emoji": agent["emoji"],
            },
            "context": {
                "money_score": user.get("money_score", 50) if user else 50,
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0,
            }
        }
    except Exception as e:
        logging.error(f"Agent chat error: {e}")
        return {
            "reply": f"I'm having trouble right now. Here's a quick insight: Your monthly expenses are ₹{total_expense:,.0f} across {len(category_spend)} categories. {'Your top spend is ' + max(category_spend, key=lambda k: category_spend[k]['total']) + '.' if category_spend else 'Start tracking to get personalized insights!'}",
            "agent": {"id": agent_id, "name": agent["name"], "emoji": agent["emoji"]},
            "context": {"money_score": user.get("money_score", 50) if user else 50}
        }


@api_router.get("/ai/proactive-nudges")
async def get_proactive_nudges(user_id: str = Depends(get_current_user)):
    """Generate proactive AI nudges based on user's financial behavior"""
    from bson import ObjectId
    
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
                "message": f"Indian financial advisors recommend 30%+. Want tips to boost savings?",
                "action": "get_savings_tips",
                "priority": "medium"
            })
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    nudges.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 3))
    
    return {"nudges": nudges[:8], "count": len(nudges)}


@api_router.post("/ai/memory")
async def save_agent_memory(data: dict, user_id: str = Depends(get_current_user)):
    """Store user preferences for AI agent memory"""
    prefs = data.get("preferences", {})
    habits = data.get("habits", [])
    
    await db.agent_memory.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "preferences": prefs,
                "habits": habits,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    return {"message": "Memory updated"}


@api_router.get("/ai/agents")
async def list_agents(user_id: str = Depends(get_current_user)):
    """List all available AI agents"""
    return {"agents": [
        {"id": k, "name": v["name"], "emoji": v["emoji"], "description": v["description"]}
        for k, v in _srv().AGENT_PROFILES.items()
    ]}


@api_router.get("/money-school/dynamic")
async def dynamic_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-generated daily finance school — trends, news, personalized teachings"""
    from bson import ObjectId
    import random
    
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
    from bson import ObjectId
    import random
    
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
    from bson import ObjectId
    import random

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

