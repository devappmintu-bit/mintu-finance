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
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends
from core.time import utc_now
from emergentintegrations.llm.chat import LlmChat, UserMessage
# Round 62 — global LLM-call timeout. Caps the previously-unbounded
# news-regen call that was the smoking gun behind 27 s
# /api/news/india-finance traces in production access logs.
from core.llm_safe import safe_send

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


# Legacy: `_TRUSTED_OUTLETS` / `_TRUSTED_DOMAINS` were used to build outlet-native
# search URLs. We've rolled back to the simpler, more reliable Google News
# topic-search approach (see `_enrich_article` below) — it always lands users on
# real, timely articles about the exact topic rather than gambling on outlet
# slug formats that change frequently.


def _enrich_article(a: dict) -> dict:
    """Attach a `source_url` pointing to authentic articles about the topic.

    Priority:
      1. Keep LLM-provided https URL when plausibly valid (direct article link).
      2. If the `source` is a known Indian outlet (Moneycontrol / ET / Mint /
         BusinessLine etc.) search that outlet directly so the link lands on
         their own published article.
      3. Otherwise fall back to a Google News topic-search scoped to India —
         which itself resolves to legitimate outlet articles.
    """
    if not isinstance(a, dict):
        return a
    lm_url = (a.get("source_url") or "").strip()
    if lm_url.startswith("https://") and len(lm_url) < 400 and "example.com" not in lm_url:
        return a
    import urllib.parse as up
    title = (a.get("title") or "").strip()
    src = (a.get("source") or "").strip()
    src_low = src.lower()

    # Outlet-direct search URLs — land the user on the outlet's own article list
    # for this exact story. These search endpoints are stable and public.
    outlet_search = {
        "moneycontrol": "https://www.moneycontrol.com/news/tags/{q}.html",
        "economic times": "https://economictimes.indiatimes.com/topic/{q}",
        "et": "https://economictimes.indiatimes.com/topic/{q}",
        "mint": "https://www.livemint.com/Search/Link/Keyword/{q}",
        "livemint": "https://www.livemint.com/Search/Link/Keyword/{q}",
        "business standard": "https://www.business-standard.com/search?q={q}",
        "businessline": "https://www.thehindubusinessline.com/search/?q={q}",
        "ndtv profit": "https://www.ndtvprofit.com/search?searchText={q}",
        "zee business": "https://www.zeebiz.com/search?search_string={q}",
        "cnbc tv18": "https://www.cnbctv18.com/search/?q={q}",
        "bloomberg quint": "https://www.ndtvprofit.com/search?searchText={q}",
        "rbi": "https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx",
        "nse": "https://www.nseindia.com/",
        "pib": "https://pib.gov.in/SearchResult.aspx?KW={q}",
        "npci": "https://www.npci.org.in/what-we-do",
        "amfi": "https://www.amfiindia.com/",
        "sebi": "https://www.sebi.gov.in/",
    }
    q = up.quote_plus(title or src)
    for key, tpl in outlet_search.items():
        if key in src_low:
            return {**a, "source_url": tpl.replace("{q}", q)}

    # Fallback — Google News topic search scoped to India English.
    url = f"https://news.google.com/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"
    return {**a, "source_url": url}


async def _refresh_news_in_background(today: str) -> None:
    """Generate fresh news via LLM and cache it. Safe to fire-and-forget.

    Uses _regen_in_flight to dedupe concurrent regens for the same day.
    """
    if today in _regen_in_flight:
        return
    _regen_in_flight.add(today)
    try:
        prompt = (
            f"Generate 12 India-specific financial news items for {today}. Mix these types (2 of each):\n"
            "1. Government scheme / tax / RBI policy update\n"
            "2. Market trend (Sensex/Nifty, gold, rupee, crypto)\n"
            "3. Personal finance tip (young Indian professional / student / family)\n"
            "4. Banking / UPI / digital payments news\n"
            "5. Investment opportunity (SIP, mutual funds, FDs, stocks, gold)\n"
            "6. Consumer alert (scam warning, price change, deadline reminder, fraud)\n\n"
            "For EACH item return JSON: "
            '{"title": "...", "summary": "2 sentences max", "category": "scheme|market|tip|banking|investment|alert", "emoji": "relevant emoji", "source": "credible source name", "source_url": "https://real-published-article-url-on-the-source-domain-or-empty-string"}\n'
            "If you are not sure about the exact article URL, return \"source_url\": \"\" and we will build a scoped search URL. Never invent fake URLs.\n"
            "Make titles crisp, actionable and specific to Indian context. Prefer trending topics.\n"
            "Return ONLY a JSON array of 12 items. No markdown."
        )
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"news_{today}",
            system_message=f"You are an Indian financial news editor. Today is {today}. Generate realistic, timely news.",
        ).with_model("openai", "gpt-5.2")
        # Round 62 — bounded LLM call. News is always cached for 24h
        # so missing a regen is fine; the worst case is showing
        # yesterday's news for a few minutes until the next regen
        # opportunity.
        resp = await safe_send(chat, UserMessage(text=prompt), timeout=12.0, label="news_regen")
        if resp is None:
            return  # falls through `finally` cleanup
        resp_text = resp.strip() if isinstance(resp, str) else str(resp)
        articles = (
            json.loads(resp_text)
            if resp_text.startswith("[")
            else json.loads(resp_text[resp_text.index("[") : resp_text.rindex("]") + 1])
        )
        if articles:
            await db.news_cache.update_one(
                {"date": today},
                {"$set": {"date": today, "articles": articles, "updated_at": utc_now().isoformat()}},
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

    # Round 74 — Removed the inline `asyncio.create_task` regen path.
    # Even with `asyncio.shield + wait_for(timeout=3)`, the spawned
    # regen task gets adopted by the request's anyio TaskGroup
    # (Starlette BaseHTTPMiddleware), holding the response for the
    # full 25-30s LLM duration. Empirical evidence in production
    # access logs:
    #   /api/news/india-finance latency_ms=24979.11
    # while the corresponding "exceeded 3 s — returning cached data"
    # log line was ALSO emitted — proving wait_for fired but the
    # middleware kept the response open.
    #
    # Fix: trust the dedicated `_news_refresher_loop` periodic
    # worker (started at app boot, runs hourly). It's a long-lived
    # task at the loop level — fully decoupled from any request
    # scope. The `refresh=1` query is now a no-op hint; cache
    # freshness comes from the worker, not per-request regens.
    _ = refresh  # kept as a hint flag for forward compatibility

    raw_articles = (cached or {}).get("articles") or _FALLBACK
    articles = [_enrich_article(a) for a in raw_articles]
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
        # sleep 30 mins — user asked for "auto update the latest news/articles/trends"
        # so refresh frequently. Cache still keyed by date so the same-day LLM call
        # is cheap (existing cache hit), but if date flipped we regen.
        await asyncio.sleep(1800)


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
