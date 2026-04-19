"""News router — India-specific financial news (AI-generated, DB-cached daily).

Performance: always returns fast (cache or fallback). LLM regen happens in a
true fire-and-forget asyncio task so first-user-of-day never waits.

IMPORTANT: Using `asyncio.create_task(...)` instead of FastAPI `BackgroundTasks`
because the app registers BaseHTTPMiddleware-based middleware (Security/RateLimit/
AuditLog) which awaits the response AND its attached BackgroundTasks — a well-
known Starlette limitation (encode/starlette#919). asyncio.create_task is NOT
tied to the response, so the event loop truly runs it in the background.
"""
import os
import asyncio
import json
import logging
from datetime import date, datetime
from fastapi import APIRouter, Depends
from emergentintegrations.llm.chat import LlmChat, UserMessage

from core import db, get_current_user

router = APIRouter(prefix="/news", tags=["news"])

# In-flight tracker: avoid firing multiple concurrent regens for the same day.
_regen_in_flight: set = set()

# Hardcoded fallback — seeded immediately if cache is missing so UI never
# shows an empty state while LLM regen runs in the background.
_FALLBACK = [
    {"title": "RBI keeps repo rate unchanged at 6.5%", "summary": "The Reserve Bank maintained its policy rate, signaling stable lending rates for home and personal loans.", "category": "banking", "emoji": "🏦", "source": "RBI"},
    {"title": "Sensex hits new high above 85,000", "summary": "Indian markets rallied on strong FII inflows and positive global cues. IT and banking stocks led gains.", "category": "market", "emoji": "📈", "source": "NSE"},
    {"title": "New PM Vishwakarma Scheme deadline extended", "summary": "Artisans and craftsmen can now apply until March 2026 for subsidized loans up to ₹3 lakh.", "category": "scheme", "emoji": "🏛️", "source": "PIB"},
    {"title": "UPI crosses 18 billion transactions in a month", "summary": "Digital payments continue to grow, with NPCI confirming a record-breaking volume in the latest month.", "category": "banking", "emoji": "💳", "source": "NPCI"},
    {"title": "SIP inflows hit ₹26,000 crore, fresh record", "summary": "Retail investors keep pouring into equity mutual funds. SIPs remain the preferred long-term wealth tool.", "category": "investment", "emoji": "📊", "source": "AMFI"},
    {"title": "Beware fake 'work from home' job scams", "summary": "Cyber cell warns of WhatsApp & Telegram scams asking for upfront deposits. Never pay to get a job.", "category": "alert", "emoji": "⚠️", "source": "Cyber Cell"},
]


async def _refresh_news_in_background(today: str) -> None:
    """Generate fresh news via LLM and cache it. Safe to fire-and-forget.

    Uses _regen_in_flight to dedupe concurrent regens for the same day.
    """
    if today in _regen_in_flight:
        return
    _regen_in_flight.add(today)
    try:
        prompt = (
            f"Generate 6 India-specific financial news items for {today}. Mix these types:\n"
            "1. Government scheme update (PM schemes, tax changes, RBI policy)\n"
            "2. Market trend (Sensex/Nifty, gold, rupee)\n"
            "3. Personal finance tip for young Indians\n"
            "4. Banking/UPI/digital payment news\n"
            "5. Investment opportunity (SIP, mutual funds, FD rates)\n"
            "6. Consumer alert (scam warning, price change, deadline reminder)\n\n"
            "For EACH item return JSON: "
            '{"title": "...", "summary": "2 sentences max", "category": "scheme|market|tip|banking|investment|alert", "emoji": "relevant emoji", "source": "credible source name"}\n'
            "Return ONLY a JSON array of 6 items. No markdown."
        )
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
        if articles:
            await db.news_cache.update_one(
                {"date": today},
                {"$set": {"date": today, "articles": articles, "updated_at": datetime.utcnow().isoformat()}},
                upsert=True,
            )
            logging.info(f"News cache refreshed for {today} with {len(articles)} items")
    except Exception as e:
        logging.warning(f"Background news generation failed: {e}")
    finally:
        _regen_in_flight.discard(today)


@router.get("/india-finance")
async def india_finance_news(
    refresh: bool = False,
    user_id: str = Depends(get_current_user),
):
    """India-specific daily financial news.

    Always returns fast (cache or fallback). Regen is handled by a dedicated
    periodic background worker (see _news_refresher_loop below), NOT triggered
    per-request — this avoids the BaseHTTPMiddleware + response drain interaction
    that was causing multi-second blocking even with asyncio.create_task.

    `refresh=1` is kept as a no-op hint for forward compatibility; the worker
    runs often enough that an explicit request-time regen isn't needed.
    """
    today = date.today().isoformat()
    cached = await db.news_cache.find_one({"date": today})
    articles = (cached or {}).get("articles") or _FALLBACK
    return {
        "date": today,
        "articles": articles,
        "updated_at": (cached or {}).get("updated_at"),
        "is_fallback": not (cached and cached.get("articles")),
    }


# ─── Periodic worker (started once at app boot) ───
_worker_started = False


async def _news_refresher_loop() -> None:
    """Refresh today's news at boot and every hour, all on its own task loop.

    Runs completely independently from any HTTP request. Safe to start multiple
    times (guarded by _worker_started).
    """
    while True:
        try:
            today = date.today().isoformat()
            cached = await db.news_cache.find_one({"date": today})
            if not (cached and cached.get("articles")):
                await _refresh_news_in_background(today)
        except Exception as e:
            logging.warning(f"News refresher loop iteration failed: {e}")
        # sleep 1 hour; short enough that users see fresh news quickly, cheap enough
        # that we don't spam the LLM (one call per day max since cache key = date)
        await asyncio.sleep(3600)


def start_news_worker() -> None:
    """Call once from the FastAPI startup event."""
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    try:
        asyncio.create_task(_news_refresher_loop())
        logging.info("News refresher worker started")
    except RuntimeError:
        # No event loop yet — caller should try again once one is running
        _worker_started = False
