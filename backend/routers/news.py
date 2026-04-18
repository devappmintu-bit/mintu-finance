"""News router — India-specific financial news (AI-generated, DB-cached daily)."""
import os
import json
import logging
from datetime import date
from fastapi import APIRouter, Depends
from emergentintegrations.llm.chat import LlmChat, UserMessage

from core import db, get_current_user

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/india-finance")
async def india_finance_news(user_id: str = Depends(get_current_user)):
    """AI-generated India-specific daily financial news, schemes, and trends (DB-cached 24h)."""
    today = date.today().isoformat()
    cached = await db.news_cache.find_one({"date": today})
    if cached and cached.get("articles"):
        return {"date": today, "articles": cached["articles"]}

    try:
        prompt = f"""Generate 6 India-specific financial news items for {today}. Mix these types:
1. Government scheme update (PM schemes, tax changes, RBI policy)
2. Market trend (Sensex/Nifty, gold, rupee)
3. Personal finance tip for young Indians
4. Banking/UPI/digital payment news
5. Investment opportunity (SIP, mutual funds, FD rates)
6. Consumer alert (scam warning, price change, deadline reminder)

For EACH item return JSON: {{"title": "...", "summary": "2 sentences max", "category": "scheme|market|tip|banking|investment|alert", "emoji": "relevant emoji", "source": "credible source name"}}
Return ONLY a JSON array of 6 items. No markdown."""
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"news_{today}",
            system_message=f"You are an Indian financial news editor. Today is {today}. Generate realistic, timely news.",
        ).with_model("openai", "gpt-5.2")
        resp = await chat.send_message(UserMessage(text=prompt))
        resp_text = resp.strip() if isinstance(resp, str) else str(resp)
        articles = (
            json.loads(resp_text)
            if resp_text.startswith("[")
            else json.loads(resp_text[resp_text.index("[") : resp_text.rindex("]") + 1])
        )
        await db.news_cache.update_one(
            {"date": today},
            {"$set": {"date": today, "articles": articles}},
            upsert=True,
        )
        return {"date": today, "articles": articles}
    except Exception as e:
        logging.warning(f"News generation failed: {e}")
        return {
            "date": today,
            "articles": [
                {"title": "RBI keeps repo rate unchanged at 6.5%", "summary": "The Reserve Bank maintained its policy rate, signaling stable lending rates for home and personal loans.", "category": "banking", "emoji": "🏦", "source": "RBI"},
                {"title": "Sensex hits new high above 85,000", "summary": "Indian markets rallied on strong FII inflows and positive global cues. IT and banking stocks led gains.", "category": "market", "emoji": "📈", "source": "NSE"},
                {"title": "New PM Vishwakarma Scheme deadline extended", "summary": "Artisans and craftsmen can now apply until March 2026 for subsidized loans up to ₹3 lakh.", "category": "scheme", "emoji": "🏛️", "source": "PIB"},
            ],
        }
