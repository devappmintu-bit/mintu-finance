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
from core.scoring import calculate_money_score
from core.constants import (
    INDIA_POPULATION_2025,
    AGENT_PROFILES, route_to_agent,
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    get_lang_instruction,
    build_equivalences,
)

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore


# Pydantic model for /ai/chat — kept local to avoid circular import.
class ChatMessage(BaseModel):
    message: str
    lang: Optional[str] = "en"


# `generate_insights_with_ai` still lives in server.py (depends on db + LLM client
# that are bootstrapped there). Resolve it lazily to avoid circular import.
def _lazy_server_attr(name):
    class _Proxy:
        def __call__(self, *a, **kw):
            import server  # noqa: PLC0415
            return getattr(server, name)(*a, **kw)
    return _Proxy()


generate_insights_with_ai = _lazy_server_attr("generate_insights_with_ai")

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
    return {"lessons": MONEY_SCHOOL_LESSONS, "total": len(MONEY_SCHOOL_LESSONS)}


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
    """AI Financial Coach — structured, data-aware, actionable (mirrors /ai/agent-chat format)."""
    from bson import ObjectId
    
    # Gather user's financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate spending
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {}
    async for doc in db.transactions.aggregate(pipeline):
        category_spend[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    total_expense = sum(v["total"] for v in category_spend.values())
    total_txn_count = sum(v["count"] for v in category_spend.values())
    
    # Income
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    income_count = income_docs[0]["count"] if income_docs else 0
    
    # Budgets + duplicate detection
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    budget_cats = [b["category"] for b in budgets]
    duplicate_budgets = sorted({c for c in budget_cats if budget_cats.count(c) > 1})
    
    # Data mode
    if total_txn_count == 0:
        data_mode = "no_data"
    elif total_txn_count < 5 or income_count == 0:
        data_mode = "partial"
    else:
        data_mode = "full"
    
    # Detected issues
    detected_issues = []
    if duplicate_budgets:
        detected_issues.append(f"Duplicate budgets for: {', '.join(duplicate_budgets)}")
    if total_txn_count > 0 and income_count == 0:
        detected_issues.append("No income recorded this month — savings rate cannot be computed accurately")
    if total_txn_count == 0:
        detected_issues.append("No transactions tracked yet this month")
    if total_income > 0 and total_expense > total_income * 2:
        detected_issues.append(f"Expenses (₹{total_expense:,.0f}) exceed 2x income (₹{total_income:,.0f}) — possible untracked income")
    
    # Rule-based CTAs
    msg_lower = (msg.message or "").lower()
    suggested_ctas = []
    if total_txn_count == 0:
        suggested_ctas.append({"id": "scan_sms", "label": "Scan SMS for expenses", "icon": "scan", "action": "navigate:/transactions?openSmsScan=1"})
        suggested_ctas.append({"id": "add_expense", "label": "Add first expense", "icon": "add-circle", "action": "navigate:/transactions?openAdd=1"})
    elif income_count == 0:
        suggested_ctas.append({"id": "add_income", "label": "Add income", "icon": "cash", "action": "navigate:/transactions?openAdd=1&type=credit"})
    if duplicate_budgets:
        suggested_ctas.append({"id": "fix_budget", "label": "Fix duplicate budgets", "icon": "build", "action": "navigate:/budget"})
    if total_txn_count > 0 and len(budgets) == 0:
        suggested_ctas.append({"id": "set_budget", "label": "Set a budget", "icon": "pie-chart", "action": "navigate:/budget"})
    if any(k in msg_lower for k in ["split", "owe", "friend", "group"]):
        suggested_ctas.append({"id": "open_split", "label": "Open Splits", "icon": "people", "action": "navigate:/split"})
    if any(k in msg_lower for k in ["report", "weekly", "trend", "insight"]):
        suggested_ctas.append({"id": "weekly_report", "label": "View weekly report", "icon": "bar-chart", "action": "navigate:/"})
    seen = set()
    suggested_ctas = [c for c in suggested_ctas if not (c["id"] in seen or seen.add(c["id"]))][:3]
    
    savings_rate_val = round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0
    
    # Build structured context
    context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100
Monthly Income: ₹{total_income:,.0f} ({income_count} txns) | Monthly Expenses: ₹{total_expense:,.0f} ({total_txn_count} txns)
Savings: ₹{max(0, total_income - total_expense):,.0f} | Savings Rate: {savings_rate_val}%
DATA MODE: {data_mode.upper()}
DETECTED ISSUES: {'; '.join(detected_issues) if detected_issues else 'None'}

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS: {', '.join(f'{b["category"]}: ₹{b["amount"]:,.0f}' for b in budgets) or 'None'}"""

    mode_rules = {
        "no_data": "\nMODE: NO_DATA — DO NOT give financial advice. Guide them to add their first expense, scan SMS, or set income.",
        "partial": "\nMODE: PARTIAL_DATA — Provide LOW-CONFIDENCE insights. Explicitly mention confidence is limited. Suggest what data to add.",
        "full": "\nMODE: FULL_DATA — Deliver SPECIFIC, data-grounded recommendations using exact categories and ₹ amounts.",
    }

    system_prompt = f"""You are MintU AI Coach — a product-native financial assistant for Indian users.

{context}
{mode_rules[data_mode]}

MANDATORY RESPONSE STRUCTURE — use EXACTLY this 4-block format:

**[Direct Answer]**
One sentence directly answering the question.

**Your Snapshot:**
• Income: ₹<amount> this month
• Expenses: ₹<amount> this month
• <one more relevant data point>

**Key Insight:**
• <ONE specific observation from their actual data OR a detected issue from the list above>

**Next Step:**
• <ONE concrete action they can take right now>

RULES:
- Friendly but PROFESSIONAL. Zero slang (never "yaar", "bro", "dude", "yaan").
- Every line is a bullet or bold header. No paragraphs.
- Total response: 6-8 lines max.
- Use ₹ with thousands separators (₹12,500).
- Maximum ONE emoji per response.
- NEVER invent numbers — use only values from USER FINANCIAL PROFILE above.
- If detected issues exist, surface them in Key Insight.
- Avoid generic advice — every insight must reference a specific category, amount, or behavior.
- India-specific only (SIPs via Groww/Zerodha, ELSS, NPS, PPF, UPI, Swiggy/Zomato).
""" + get_lang_instruction(msg.lang or "en")

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
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context_used": {
                "money_score": user.get("money_score", 50),
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": savings_rate_val,
                "transaction_count": total_txn_count,
                "top_category": max(category_spend, key=lambda k: category_spend[k]["total"]) if category_spend else None,
            }
        }
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        # Structured rule-based fallback
        if data_mode == "no_data":
            reply = (
                "**Let's get started**\n\n"
                "**Your Snapshot:**\n"
                "• No transactions tracked this month yet\n\n"
                "**Key Insight:**\n"
                "• I cannot provide personalized advice without transaction data\n\n"
                "**Next Step:**\n"
                "• Scan your SMS inbox or add your first expense"
            )
        else:
            top_cat = max(category_spend, key=lambda k: category_spend[k]["total"]) if category_spend else "—"
            reply = (
                f"**Quick summary**\n\n"
                f"**Your Snapshot:**\n"
                f"• Income: ₹{total_income:,.0f} | Expenses: ₹{total_expense:,.0f}\n"
                f"• Top category: {top_cat}\n\n"
                f"**Key Insight:**\n"
                f"• {detected_issues[0] if detected_issues else f'Tracking {total_txn_count} transactions across {len(category_spend)} categories'}\n\n"
                f"**Next Step:**\n"
                f"• {suggested_ctas[0]['label'] if suggested_ctas else 'Keep tracking expenses for sharper insights'}"
            )
        return {
            "reply": reply,
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context_used": {
                "money_score": user.get("money_score", 50),
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": savings_rate_val,
                "transaction_count": total_txn_count,
            }
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


@api_router.post("/ai/agent-chat")
async def agentic_ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    """Product-native AI Financial Assistant — structured, data-aware, actionable."""
    from bson import ObjectId
    
    message = data.get("message", "")
    lang = data.get("lang", "en")
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message required")
    
    # Route to appropriate agent
    agent_id = route_to_agent(message)
    agent = AGENT_PROFILES[agent_id]
    
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
    total_txn_count = sum(c["count"] for c in category_spend.values())
    
    # Income
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    income_count = income_docs[0]["count"] if income_docs else 0
    
    # Budgets — collect all to detect duplicates
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    budget_categories = [b["category"] for b in budgets]
    duplicate_budgets = sorted({c for c in budget_categories if budget_categories.count(c) > 1})
    budget_info = []
    for b in budgets:
        spent = category_spend.get(b["category"], {}).get("total", 0)
        pct = (spent / max(b["amount"], 1)) * 100
        budget_info.append(f"{b['category']}: ₹{spent:,.0f}/₹{b['amount']:,.0f} ({pct:.0f}%)")
    
    # Recent transactions (last 7)
    recent_txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(10)
    recent_str = "\n".join([
        f"  - {t.get('description','?')}: ₹{t['amount']:,.0f} ({t.get('category','?')}) on {t['date'].strftime('%b %d') if t.get('date') else '?'}"
        for t in recent_txns[:7]
    ])
    
    # ─── DATA MODE DETECTION ───
    # no_data: 0 txns → guide onboarding only
    # partial: 1-4 txns OR no income → low confidence insights
    # full: 5+ txns AND income → strong insights
    if total_txn_count == 0:
        data_mode = "no_data"
    elif total_txn_count < 5 or income_count == 0:
        data_mode = "partial"
    else:
        data_mode = "full"
    
    # ─── APP ISSUE DETECTION ───
    detected_issues = []
    if duplicate_budgets:
        detected_issues.append(f"Duplicate budgets for: {', '.join(duplicate_budgets)}")
    if total_txn_count > 0 and income_count == 0:
        detected_issues.append("No income recorded this month — savings rate cannot be computed accurately")
    if total_txn_count == 0:
        detected_issues.append("No transactions tracked yet this month")
    if total_income > 0 and total_expense > total_income * 2:
        detected_issues.append(f"Expenses (₹{total_expense:,.0f}) exceed 2x income (₹{total_income:,.0f}) — possible untracked income")
    
    # ─── RELEVANT CTAs (rule-based, based on data state + message intent) ───
    suggested_ctas = []
    msg_lower = message.lower()
    if total_txn_count == 0:
        suggested_ctas.append({"id": "scan_sms", "label": "Scan SMS for expenses", "icon": "scan", "action": "navigate:/transactions?openSmsScan=1"})
        suggested_ctas.append({"id": "add_expense", "label": "Add first expense", "icon": "add-circle", "action": "navigate:/transactions?openAdd=1"})
    elif income_count == 0:
        suggested_ctas.append({"id": "add_income", "label": "Add income", "icon": "cash", "action": "navigate:/transactions?openAdd=1&type=credit"})
    if duplicate_budgets:
        suggested_ctas.append({"id": "fix_budget", "label": "Fix duplicate budgets", "icon": "build", "action": "navigate:/budget"})
    if total_txn_count > 0 and len(budgets) == 0:
        suggested_ctas.append({"id": "set_budget", "label": "Set a budget", "icon": "pie-chart", "action": "navigate:/budget"})
    if any(k in msg_lower for k in ["split", "owe", "friend", "group"]):
        suggested_ctas.append({"id": "open_split", "label": "Open Splits", "icon": "people", "action": "navigate:/split"})
    if any(k in msg_lower for k in ["report", "weekly", "trend", "insight"]):
        suggested_ctas.append({"id": "weekly_report", "label": "View weekly report", "icon": "bar-chart", "action": "navigate:/"})
    # Dedup CTAs, max 3
    seen_cta = set()
    suggested_ctas = [c for c in suggested_ctas if not (c["id"] in seen_cta or seen_cta.add(c["id"]))][:3]
    
    # Load agent memory
    memory = await db.agent_memory.find_one({"user_id": user_id})
    memory_context = ""
    if memory:
        prefs = memory.get("preferences", {})
        habits = memory.get("habits", [])
        memory_context = f"\nUser Preferences: {prefs}\nKnown Habits: {', '.join(habits[:5])}"
    
    # Build agent-specific system prompt
    savings_rate_val = round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0
    financial_context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100 | Streak: {user.get('streak_days', 0)} days
Monthly Income: ₹{total_income:,.0f} ({income_count} txns) | Monthly Expenses: ₹{total_expense:,.0f} ({total_txn_count} txns) | Savings: ₹{max(0, total_income - total_expense):,.0f}
Savings Rate: {savings_rate_val}%
DATA MODE: {data_mode.upper()}
DETECTED ISSUES: {'; '.join(detected_issues) if detected_issues else 'None'}

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS:
{chr(10).join(f'  {b}' for b in budget_info) or '  No budgets set'}

RECENT TRANSACTIONS:
{recent_str or '  None yet'}
{memory_context}"""

    agent_system_prompts = {
        "expense_tracker": f"""You are MintU's {agent['emoji']} Expense Tracker — a precise, data-first assistant for Indian users.

CAPABILITIES:
- Categorize expenses: Food, Transport, Entertainment, Shopping, Bills, Health, Education, Groceries, Other
- Detect spending anomalies and potential duplicate charges
- Identify recurring expenses and miscategorization

{financial_context}""",

        "budget_manager": f"""You are MintU's {agent['emoji']} Budget Manager — proactive budget optimizer for Indian users.

CAPABILITIES:
- Set and adjust realistic budgets based on Indian cost-of-living benchmarks (25% food, 10% transport, 20% bills, 30% savings)
- Alert when approaching/exceeding thresholds
- Suggest specific ₹ reallocation — never vague advice

{financial_context}""",

        "split_manager": f"""You are MintU's {agent['emoji']} Split Manager — fair split calculator and payment coordinator.

CAPABILITIES:
- Calculate fair splits (equal, income-weighted, consumption-based)
- Track balances across groups and suggest simplest settlement paths
- Recommend UPI for instant settlements

{financial_context}""",

        "insights_agent": f"""You are MintU's {agent['emoji']} Insights Agent — data storyteller who surfaces actionable patterns.

CAPABILITIES:
- Summarize weekly/monthly spending with specific ₹ comparisons
- Identify rising/falling categories vs prior period
- Surface one clear actionable pattern, not generic commentary

{financial_context}""",

        "market_intel": f"""You are MintU's {agent['emoji']} Market Intelligence — India-specific money-saving advisor.

CAPABILITIES:
- Subscription savings, cheaper alternatives, inflation-aware advice
- Tax-saving recommendations (80C, 80D, HRA, ELSS) grounded in user's income
- Reference real Indian products only: Zerodha, Groww, HDFC, SBI, LIC
- Never give specific stock picks (education only)

{financial_context}""",

        "money_school": f"""You are MintU's {agent['emoji']} Money School — concise finance educator for Indian users.

CAPABILITIES:
- Teach SIPs, mutual funds, FDs, PPF, NPS, ELSS, CIBIL, tax regimes, term/health insurance
- Use relatable Indian analogies (SIP = pocket-money jar)
- Reference real platforms: Zerodha, Groww, HDFC, SBI

{financial_context}"""
    }

    # ─── STRUCTURED RESPONSE RULES (replaces old conversational tone) ───
    mode_rules = {
        "no_data": """
MODE: NO_DATA — User has zero transactions this month.
- DO NOT give financial advice or recommendations.
- Guide them to onboard: add first expense, scan SMS, or set monthly income.
- Be welcoming but short. Acknowledge you cannot analyze without data.
""",
        "partial": """
MODE: PARTIAL_DATA — User has < 5 transactions or no income recorded.
- Provide LOW-CONFIDENCE insights — explicitly state the confidence is limited.
- Suggest what data to add for sharper insights (e.g., "Add income to get savings-rate analysis").
- Avoid strong recommendations like "cut ₹2000" when sample is tiny.
""",
        "full": """
MODE: FULL_DATA — User has enough data for high-confidence insights.
- Deliver SPECIFIC, data-grounded recommendations.
- Reference exact categories, ₹ amounts, and percentages from their actual data.
- Flag real issues from DETECTED ISSUES list above with actionable fixes.
""",
    }

    STRUCTURED_RESPONSE_RULES = f"""
{mode_rules[data_mode]}

MANDATORY RESPONSE STRUCTURE (for every response):
Use EXACTLY this 4-block format with line breaks between blocks. NO preamble. NO sign-off.

**[Direct Answer]**
One sentence answering the question directly.

**Your Snapshot:**
• Income: ₹<amount> this month
• Expenses: ₹<amount> this month
• <one more relevant data point — top category, savings rate, or txn count>

**Key Insight:**
• <ONE specific observation grounded in their actual data, OR a detected issue from the list above>

**Next Step:**
• <ONE concrete action they can take right now — e.g., "Add your salary as income", "Scan SMS to catch missed expenses", "Merge duplicate Food budgets">

TONE RULES:
- Friendly but PROFESSIONAL. Zero slang — never "yaar", "bro", "dude", "yaan".
- Every line is a bullet or a bold header. NO paragraphs longer than 2 lines.
- Total response length: 6-8 lines max (excluding headers).
- Use ₹ with thousands separators (₹12,500 not 12500).
- Use bold markdown (**word**) only for headers and critical numbers.
- Maximum ONE emoji per response, placed in the header of Key Insight or Next Step.

CONTENT RULES:
- NEVER invent numbers. Use only values from the USER FINANCIAL PROFILE above.
- If DETECTED ISSUES exist, surface them in Key Insight.
- Avoid generic advice (e.g., "save more", "track expenses") — every insight must reference a specific category, amount, or behavior from their data.
- If asked a conceptual question (e.g., "What is SIP?"), reply briefly in the same 4-block format with Snapshot showing their income and a Next Step tailored to their capacity.
"""

    system_prompt = agent_system_prompts.get(agent_id, agent_system_prompts["insights_agent"])
    system_prompt += STRUCTURED_RESPONSE_RULES
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
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context": {
                "money_score": user.get("money_score", 50) if user else 50,
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": savings_rate_val,
                "transaction_count": total_txn_count,
            }
        }
    except Exception as e:
        logging.error(f"Agent chat error: {e}")
        # Structured fallback (rule-based, mirrors the 4-block format)
        if data_mode == "no_data":
            fallback_reply = (
                "**Let's get started**\n\n"
                "**Your Snapshot:**\n"
                "• No transactions tracked this month yet\n\n"
                "**Key Insight:**\n"
                "• I cannot provide personalized advice without transaction data\n\n"
                "**Next Step:**\n"
                "• Scan your SMS inbox or add your first expense"
            )
        else:
            top_cat = max(category_spend, key=lambda k: category_spend[k]['total']) if category_spend else "—"
            fallback_reply = (
                f"**Quick summary**\n\n"
                f"**Your Snapshot:**\n"
                f"• Income: ₹{total_income:,.0f} | Expenses: ₹{total_expense:,.0f}\n"
                f"• Top category: {top_cat}\n\n"
                f"**Key Insight:**\n"
                f"• {detected_issues[0] if detected_issues else f'Tracking {total_txn_count} transactions across {len(category_spend)} categories'}\n\n"
                f"**Next Step:**\n"
                f"• {suggested_ctas[0]['label'] if suggested_ctas else 'Keep tracking expenses for sharper insights'}"
            )
        return {
            "reply": fallback_reply,
            "agent": {"id": agent_id, "name": agent["name"], "emoji": agent["emoji"]},
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
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
        for k, v in AGENT_PROFILES.items()
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

