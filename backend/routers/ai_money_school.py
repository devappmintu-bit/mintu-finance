"""ai_money_school — Money-School lesson content API.

Extracted from ai_insights.py (Round 26 refactor) for easier content evolution.
Endpoints:
  GET  /money-school/lessons       — all lessons
  GET  /money-school/daily         — today's lesson + AI-personalized tip
  GET  /money-school/dynamic       — dynamic AI-generated lesson deck
  GET  /money-school/cards         — swipeable cards (short form)
  POST /money-school/complete      — mark a lesson as completed (XP bump)
  GET  /money-school/personalized  — personalized lesson sequence for the user
"""
"""AI insights, Money School, waste detector, proactive nudges, expense report card.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
# Round 62 — global LLM-call timeout wrapper.
from core.llm_safe import safe_send
import logging
import random
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


# ── lessons + daily (extracted from ai_insights.py) ────────────────────────


@api_router.get("/money-school/lessons")
async def get_money_school_lessons():
    """Get all financial literacy lessons"""
    return {"lessons": MONEY_SCHOOL_LESSONS, "total": len(MONEY_SCHOOL_LESSONS)}



@api_router.get("/money-school/daily")
async def get_daily_lesson(user_id: str = Depends(get_current_user), lang: str = "en"):
    """Get today's lesson + AI-personalized tip based on user's spending.

    Round 70 — Migrated to ``llm_cache.get_or_regen``. Request never blocks
    on the LLM. First caller of the day gets the static lesson tip; the
    next caller (after the background regen lands) gets the AI-personalized
    tip. TTL fresh = 6 h, stale = 7 d.
    """
    # Rotate daily lesson based on date
    day_index = date.today().toordinal() % len(MONEY_SCHOOL_LESSONS)
    lesson = MONEY_SCHOOL_LESSONS[day_index]

    # Aggregate spending context — cheap DB read, used both for fallback
    # text and the LLM prompt. Doing it inline (vs. inside compute_fn)
    # gives us a meaningful fallback even on a cold miss.
    try:
        thirty_days_ago = utc_now() - timedelta(days=30)
        txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
        total_spent = sum(t["amount"] for t in txns)
        top_cat: Dict[str, float] = {}
        for t in txns:
            top_cat[t["category"]] = top_cat.get(t["category"], 0) + t["amount"]
        top_category = max(top_cat, key=top_cat.get) if top_cat else "Food"
    except Exception:
        total_spent = 0
        top_category = "Food"

    cache_key = f"school_daily:{user_id}:{lang}:{day_index}"
    fallback_tip = lesson["tip"]

    async def _compute() -> Optional[str]:
        try:
            lang_instr = get_lang_instruction(lang)
            chat = LlmChat(
                api_key=os.environ['EMERGENT_LLM_KEY'],
                session_id=f"school_{user_id}_{utc_now().timestamp()}",
                system_message="You are MintU's financial literacy buddy. Give ONE short personalized tip (1-2 sentences) connecting the lesson topic to user's actual spending. Be warm and specific with numbers. Use ₹." + lang_instr,
            ).with_model("openai", "gpt-5.2")
            msg = f"Lesson: {lesson['title']}. User spent ₹{total_spent:.0f} this month, top category: {top_category}."
            resp = (await safe_send(chat, UserMessage(text=msg), timeout=15.0, label='ai_money_school') or "")
            personal_tip = resp.strip() if isinstance(resp, str) else str(resp).strip()
            return personal_tip or None
        except Exception as e:
            logging.warning(f"Money school daily regen failed: {e}")
            return None

    from core.llm_cache import get_or_regen
    personal_tip = await get_or_regen(
        key=cache_key,
        compute_fn=_compute,
        ttl_fresh=6 * 3600,
        ttl_stale=7 * 86400,
        fallback=fallback_tip,
    ) or fallback_tip

    return {
        "lesson": lesson,
        "personal_tip": personal_tip,
        "lesson_number": day_index + 1,
        "total_lessons": len(MONEY_SCHOOL_LESSONS),
    }

# ── dynamic / cards / complete / personalized ──────────────────────────────
@api_router.get("/money-school/dynamic")
async def dynamic_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-generated daily finance school — trends, news, personalized teachings.

    Round 70 — Migrated to ``llm_cache.get_or_regen``. Request never blocks
    on the LLM (was the worst offender — ~15s p99). First caller of the
    day gets static fallback cards; subsequent calls get the AI cards.
    Cache key includes today's date so cards rotate daily.
    """
    user = await get_user_by_id(user_id)
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_str = now.strftime("%Y-%m-%d")

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

    cache_key = f"school_dynamic:{user_id}:{lang}:{today_str}"

    async def _compute() -> Optional[List[Dict]]:
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

            response = (await safe_send(chat, UserMessage(text=context), timeout=15.0, label='ai_money_school') or "")
            response_text = response.strip() if isinstance(response, str) else str(response)

            import json as json_mod
            start = response_text.find('[')
            end = response_text.rfind(']') + 1
            if start >= 0 and end > start:
                ai_cards = json_mod.loads(response_text[start:end])
                return ai_cards if isinstance(ai_cards, list) and ai_cards else None
            return None
        except Exception as e:
            logging.warning(f"dynamic school regen failed: {e}")
            return None

    from core.llm_cache import get_or_regen
    ai_cards = await get_or_regen(
        key=cache_key,
        compute_fn=_compute,
        ttl_fresh=12 * 3600,    # 12h fresh — re-rotate twice a day
        ttl_stale=3 * 86400,    # 3d stale-but-serve
        fallback=[],            # cold callers see static fallback only
    ) or []

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
    
    await db.school_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {"user_id": user_id, "last_activity": utc_now()},
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
    """AI-personalized money school cards based on user's actual spending.

    Round 70 — Migrated to ``llm_cache.get_or_regen``. Cold callers see
    static-only cards (still useful) and the next call returns the AI
    personalized deck. Cache key includes today's date so cards rotate
    daily.
    """
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_str = now.strftime("%Y-%m-%d")

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

    cache_key = f"school_personalized:{user_id}:{lang}:{today_str}"

    async def _compute() -> Optional[List[Dict]]:
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

            response = (await safe_send(chat, UserMessage(text=context), timeout=15.0, label='ai_money_school') or "")
            response_text = response.strip() if isinstance(response, str) else str(response)

            import json as json_mod
            start = response_text.find('[')
            end = response_text.rfind(']') + 1
            if start >= 0 and end > start:
                ai_cards = json_mod.loads(response_text[start:end])
                return ai_cards if isinstance(ai_cards, list) and ai_cards else None
            return None
        except Exception as e:
            logging.warning(f"personalized school regen failed: {e}")
            return None

    from core.llm_cache import get_or_regen
    ai_cards = await get_or_regen(
        key=cache_key,
        compute_fn=_compute,
        ttl_fresh=12 * 3600,
        ttl_stale=3 * 86400,
        fallback=[],
    ) or []

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


