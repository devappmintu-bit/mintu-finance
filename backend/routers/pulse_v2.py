"""Money Pulse v2 — R111.

The "Inshorts for Personal Finance" rebuild. Replaces the AI-hallucinated
news cards from `news.py` with a real RSS ingestion pipeline plus
per-user personal-impact analysis.

Pipeline:
  1. INGEST — feedparser pulls from a vetted Indian-finance source list
                (Moneycontrol, LiveMint, ET, BS, RBI) every N minutes.
  2. DEDUPE — URL hash + title hash skip already-seen entries.
  3. CLASSIFY — keyword-driven router into 16 brutal categories.
  4. SUMMARIZE — single LLM call per fresh article: 1-line headline,
     2-line plain-English explanation, generic impact label.
  5. PERSONALIZE — at request time, blend the user's spend profile
     (loans / SIPs / fuel / FD / stocks / crypto) into a
     hyper-relevant "How this affects YOU" line.

Storage (`pulse_articles`):
  url_hash  – dedup primary key
  url       – canonical link
  source    – outlet name + credibility tier
  category  – one of CATEGORIES
  headline  – 1-liner (LLM cleaned)
  explainer – 2-liner (LLM)
  generic_impact – e.g. "EMI Impact", "Investment Impact"
  sentiment – pos / neg / neutral
  emoji     – single decorative glyph
  published_at – datetime
  ingested_at  – datetime
  raw_title – original feed title (debug)
  raw_summary – original feed summary (debug)

Endpoints:
  GET  /api/pulse/v2/feed?category=...&limit=20
  GET  /api/pulse/v2/categories
  GET  /api/pulse/v2/article/{id}
  POST /api/pulse/v2/react           body: {article_id, kind: like|save|dismiss}
  POST /api/pulse/v2/refresh-now     (admin / debug — kicks ingestion)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from emergentintegrations.llm.chat import LlmChat, UserMessage

from core import db, get_current_user
from core.llm_safe import safe_send
from core.time import utc_now

router = APIRouter(prefix="/pulse/v2", tags=["pulse-v2"])
logger = logging.getLogger("pulse_v2")

# ───────────────────────── source registry ─────────────────────────
# Each entry has a `tier` for credibility — A = primary verified,
# B = mainstream financial press. We never ingest tier-C/D content.

SOURCES: list[dict] = [
    {"name": "Moneycontrol",     "tier": "A",
     "rss":  "https://www.moneycontrol.com/rss/MCtopnews.xml"},
    {"name": "Moneycontrol Markets", "tier": "A",
     "rss":  "https://www.moneycontrol.com/rss/marketreports.xml"},
    {"name": "LiveMint",         "tier": "A",
     "rss":  "https://www.livemint.com/rss/money"},
    # R112 — broaden coverage: Mint Markets carries equity/debt
    # commentary that's often missing from /money.
    {"name": "LiveMint Markets", "tier": "A",
     "rss":  "https://www.livemint.com/rss/markets"},
    {"name": "Economic Times",   "tier": "A",
     "rss":  "https://economictimes.indiatimes.com/rssfeedstopstories.cms"},
    {"name": "ET Markets",       "tier": "A",
     "rss":  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"},
    {"name": "Business Standard", "tier": "B",
     "rss":  "https://www.business-standard.com/rss/finance-103.rss"},
    {"name": "RBI",              "tier": "A",
     "rss":  "https://www.rbi.org.in/Scripts/RssFeedFinal.aspx?feed=PressRelease"},
    # R112 — SEBI regulatory updates. Tier-A primary regulator.
    {"name": "SEBI",             "tier": "A",
     "rss":  "https://www.sebi.gov.in/sebirss.xml"},
    # R112 — NSE corporate announcements (low-volume but high-signal
    # for portfolio holders). Falls back gracefully if 403.
    {"name": "NSE",              "tier": "A",
     "rss":  "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"},
]

CATEGORIES: list[str] = [
    "markets", "mutual-funds", "loans", "credit-cards",
    "rbi", "tax", "inflation", "salary",
    "jobs", "ai-economy", "crypto", "startups",
    "consumer-spending", "gold", "real-estate", "general",
]

# Sentiment/impact keyword maps — fast pass before LLM gets it.
_RAISE_KW   = ("hike", "increase", "raise", "surge", "jump", "rally", "record high")
_FALL_KW    = ("cut", "decrease", "fall", "drop", "decline", "slump", "crash", "low")

# Per-category impact label so cards have an instant glanceable badge
# that doesn't depend on the LLM round-trip.
_IMPACT_BY_CAT: dict[str, str] = {
    "markets":          "Investment Impact",
    "mutual-funds":     "Investment Impact",
    "loans":            "EMI Impact",
    "credit-cards":     "Spending Impact",
    "rbi":              "EMI Impact",
    "tax":              "Tax Impact",
    "inflation":        "Inflation Impact",
    "salary":           "Salary Impact",
    "jobs":             "Salary Impact",
    "ai-economy":       "Career Impact",
    "crypto":           "Investment Impact",
    "startups":         "Career Impact",
    "consumer-spending": "Spending Impact",
    "gold":             "Investment Impact",
    "real-estate":      "Investment Impact",
    "general":          "General Impact",
}

# ───────────────────────── helpers ─────────────────────────


def _hash(s: str) -> str:
    return hashlib.sha256(s.strip().lower().encode("utf-8")).hexdigest()


def _classify(title: str, summary: str) -> str:
    """Lightweight keyword router. Falls back to "general" if nothing
    matches. Designed to be near-zero-cost so we don't need an LLM
    classification call at ingestion time."""
    t = (title + " " + summary).lower()
    rules = [
        ("rbi",            ("rbi", "reserve bank", "monetary policy", "repo rate")),
        ("loans",          ("loan", "emi", "home loan", "personal loan", "credit growth")),
        ("credit-cards",   ("credit card", "card spend", "card limit", "rewards")),
        ("mutual-funds",   ("sip", "mutual fund", "amfi", "elss", "nfo", "amc")),
        ("markets",        ("nifty", "sensex", "bse", "nse", "stocks", "shares", "ipo", "fpi", "dii")),
        ("crypto",         ("crypto", "bitcoin", "ethereum", "blockchain", "btc", "eth")),
        ("gold",           ("gold price", "gold etf", "sovereign gold")),
        ("real-estate",    ("real estate", "housing", "property prices", "rera")),
        ("tax",            ("income tax", "gst", "tds", "tax", "itr")),
        ("inflation",      ("inflation", "cpi", "wpi", "price rise")),
        ("salary",         ("salary", "wage", "bonus", "appraisal")),
        ("jobs",           ("hiring", "layoff", "jobs", "unemployment", "manpower")),
        ("ai-economy",     ("ai ", "artificial intelligence", "openai", "chatgpt", "generative ai")),
        ("startups",       ("startup", "funding round", "series ", "unicorn", "venture")),
        ("consumer-spending", ("retail", "consumer", "fmcg", "spend", "festive")),
    ]
    for cat, kws in rules:
        if any(k in t for k in kws):
            return cat
    return "general"


def _sentiment(title: str, summary: str) -> str:
    t = (title + " " + summary).lower()
    if any(k in t for k in _RAISE_KW):
        return "positive" if "loss" not in t else "neutral"
    if any(k in t for k in _FALL_KW):
        return "negative"
    return "neutral"


def _emoji_for(cat: str) -> str:
    return {
        "markets": "📈",
        "mutual-funds": "📊",
        "loans": "🏦",
        "credit-cards": "💳",
        "rbi": "🏛️",
        "tax": "🧾",
        "inflation": "🌡️",
        "salary": "💼",
        "jobs": "👔",
        "ai-economy": "🤖",
        "crypto": "🪙",
        "startups": "🚀",
        "consumer-spending": "🛒",
        "gold": "🥇",
        "real-estate": "🏠",
        "general": "📰",
    }.get(cat, "📰")


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ").strip()


# ───────────────────────── ingestion ─────────────────────────


async def _fetch_rss(url: str, timeout: float = 8.0) -> list[dict]:
    """Run feedparser in a thread so the event loop isn't blocked."""
    loop = asyncio.get_running_loop()

    def _parse() -> list[dict]:
        import feedparser
        # User-Agent helps avoid 403s from some Indian outlets.
        feed = feedparser.parse(
            url,
            agent="MintU-Pulse/1.0 (+https://mintu.app)",
            request_headers={"Accept": "application/rss+xml,application/xml;q=0.9,*/*;q=0.8"},
        )
        out: list[dict] = []
        for e in (feed.entries or [])[:30]:
            link = (getattr(e, "link", "") or "").strip()
            title = (getattr(e, "title", "") or "").strip()
            if not link or not title:
                continue
            summary = _strip_html(
                getattr(e, "summary", "") or getattr(e, "description", "")
            )
            ts = getattr(e, "published_parsed", None) or getattr(e, "updated_parsed", None)
            published_at = (
                datetime(*ts[:6], tzinfo=timezone.utc)
                if ts else datetime.now(timezone.utc)
            )
            out.append({
                "title": title,
                "summary": summary[:600],
                "link": link,
                "published_at": published_at,
            })
        return out

    try:
        return await asyncio.wait_for(loop.run_in_executor(None, _parse), timeout=timeout)
    except Exception as exc:
        logger.warning("RSS fetch failed for %s: %s", url, exc)
        return []


async def _llm_summarize(title: str, summary: str) -> dict:
    """Single short LLM call — produces a clean 1-line headline + a
    2-line plain-English explainer. Model is shared with /coach.

    Tolerates LLM outage: returns a graceful fallback so ingestion
    never blocks on AI. We only persist the LLM result if it parses.
    """
    headline = title[:120]
    # Heuristic explainer if LLM is unreachable.
    explainer = (summary or title)[:260]
    try:
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not llm_key:
            return {"headline": headline, "explainer": explainer, "llm_ok": False}
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"pulse_summary_{_hash(title)[:16]}",
            system_message=(
                "You rewrite Indian finance news for a young salaried user. "
                "Produce STRICT JSON: {\"headline\":\"<1 line, ≤90 chars>\","
                "\"explainer\":\"<2 lines, plain English, ≤150 chars>\","
                "\"impact\":\"<one of: positive | negative | neutral>\"}. "
                "No markdown, no commentary. INR / SIP / EMI context only."
            ),
        ).with_model("openai", "gpt-5.2")
        raw = await safe_send(
            chat,
            UserMessage(text=f"TITLE: {title}\nBODY: {summary[:400]}"),
            timeout=12.0,
            label="pulse_summarize",
        )
        text = raw if isinstance(raw, str) else str(raw or "")
        # Tolerant JSON parse — strip to first { … last }.
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            import json as _json
            try:
                parsed = _json.loads(m.group(0))
                hl = (parsed.get("headline") or "").strip()
                ex = (parsed.get("explainer") or "").strip()
                if hl:
                    headline = hl[:120]
                if ex:
                    explainer = ex[:280]
                return {
                    "headline": headline,
                    "explainer": explainer,
                    "llm_ok": True,
                }
            except Exception:
                pass
    except Exception as exc:
        logger.debug("pulse summarize LLM exc: %s", exc)
    return {"headline": headline, "explainer": explainer, "llm_ok": False}


async def ingest_once(
    *,
    max_articles_per_source: int = 12,
    summarize: bool = False,
) -> dict:
    """Top-level worker entrypoint. Pulls every source in parallel,
    dedups, classifies, persists. `summarize=True` triggers per-article
    LLM polish; default False keeps ingestion cheap and the LLM call
    runs on the read-path the first time the article is fetched (lazy).
    """
    start = utc_now()
    fetched_lists = await asyncio.gather(*[_fetch_rss(s["rss"]) for s in SOURCES])
    inserted = 0
    skipped_dup = 0
    by_source: dict[str, int] = {}
    cutoff = utc_now() - timedelta(days=4)

    for src, items in zip(SOURCES, fetched_lists):
        for it in items[:max_articles_per_source]:
            # Skip stale RSS items (most outlets push 7-day archives).
            try:
                if it["published_at"] < cutoff:
                    continue
            except Exception:
                pass

            url_hash = _hash(it["link"])
            existing = await db.pulse_articles.find_one({"url_hash": url_hash}, {"_id": 1})
            if existing:
                skipped_dup += 1
                continue

            cat = _classify(it["title"], it["summary"])
            sent = _sentiment(it["title"], it["summary"])
            doc = {
                "url_hash":      url_hash,
                "url":           it["link"],
                "source":        src["name"],
                "source_tier":   src["tier"],
                "category":      cat,
                "headline":      it["title"][:120],
                "explainer":     it["summary"][:280] or it["title"][:280],
                "generic_impact": _IMPACT_BY_CAT.get(cat, "General Impact"),
                "sentiment":     sent,
                "emoji":         _emoji_for(cat),
                "published_at":  it["published_at"],
                "ingested_at":   utc_now(),
                "raw_title":     it["title"],
                "raw_summary":   it["summary"],
                "llm_polished":  False,
                "verified":      src["tier"] == "A",
            }

            if summarize:
                pol = await _llm_summarize(it["title"], it["summary"])
                if pol.get("llm_ok"):
                    doc["headline"] = pol["headline"]
                    doc["explainer"] = pol["explainer"]
                    doc["llm_polished"] = True

            await db.pulse_articles.insert_one(doc)
            inserted += 1
            by_source[src["name"]] = by_source.get(src["name"], 0) + 1

    elapsed_ms = int((utc_now() - start).total_seconds() * 1000)
    logger.info(
        "pulse ingest_once · inserted=%d dup=%d sources=%s · %dms",
        inserted, skipped_dup, by_source, elapsed_ms,
    )
    return {
        "inserted": inserted,
        "skipped_dup": skipped_dup,
        "by_source": by_source,
        "elapsed_ms": elapsed_ms,
    }


async def _ensure_indexes():
    try:
        await db.pulse_articles.create_index("url_hash", unique=True)
        await db.pulse_articles.create_index([("category", 1), ("published_at", -1)])
        await db.pulse_articles.create_index([("published_at", -1)])
        await db.pulse_reactions.create_index([("user_id", 1), ("article_id", 1)], unique=True)
    except Exception as exc:
        logger.debug("pulse index ensure: %s", exc)


# ───────────────────────── personalization ─────────────────────────


async def _user_finance_profile(user_id: str) -> dict:
    """Lightweight roll-up of the user's spend mix to drive the
    "how this affects you" line. All queries are tiny aggregations.
    Cached in-memory for 5 min per user via a TTL dict.
    """
    now = utc_now()
    cached = _PROFILE_CACHE.get(user_id)
    if cached and (now - cached["t"]).total_seconds() < 300:
        return cached["v"]

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    spend: dict[str, float] = {}
    async for d in db.transactions.aggregate(pipe):
        spend[(d.get("_id") or "Other")] = float(d.get("total") or 0)

    sip_total = sum(v for k, v in spend.items() if "invest" in k.lower() or "sip" in k.lower())
    loan_emi = sum(v for k, v in spend.items() if "loan" in k.lower() or "emi" in k.lower())
    fuel = sum(v for k, v in spend.items() if "fuel" in k.lower() or "petrol" in k.lower() or "transport" in k.lower())

    # Goal hints
    goal_count = await db.goals.count_documents({"user_id": user_id})

    profile = {
        "has_sip":      sip_total > 0,
        "has_loan_emi": loan_emi > 0,
        "fuel_spender": fuel > 1500,
        "has_goals":    goal_count > 0,
        "sip_total":    sip_total,
        "loan_emi":     loan_emi,
        "fuel":         fuel,
    }
    _PROFILE_CACHE[user_id] = {"t": now, "v": profile}
    return profile


_PROFILE_CACHE: dict[str, dict] = {}


def _personal_impact(article: dict, profile: dict) -> Optional[dict]:
    """Rule-based personal-impact line. Returns None for general feed
    items where we can't make an honest claim — never fake relevance.
    """
    cat = article.get("category", "general")
    sent = article.get("sentiment", "neutral")
    headline = (article.get("headline") or "").lower()

    # Loans / RBI flow
    if cat in ("rbi", "loans") and profile.get("has_loan_emi"):
        if "cut" in headline or sent == "negative":
            return {
                "tone": "positive",
                "label": "EMI Impact",
                "message": f"Your monthly ₹{int(profile['loan_emi']):,} EMI may ease.",
            }
        if "hike" in headline or sent == "positive":
            return {
                "tone": "warning",
                "label": "EMI Impact",
                "message": "Your home/personal loan EMI may rise. Watch the next reset.",
            }

    # Markets / MF flow
    if cat in ("markets", "mutual-funds") and profile.get("has_sip"):
        if sent == "negative":
            return {
                "tone": "info",
                "label": "Investment Impact",
                "message": f"Dips boost your ₹{int(profile['sip_total']):,}/mo SIP cost-averaging — stay invested.",
            }
        if sent == "positive":
            return {
                "tone": "positive",
                "label": "Investment Impact",
                "message": "Your SIPs likely benefited today.",
            }

    # Fuel/inflation
    if cat == "inflation" or "petrol" in headline or "diesel" in headline:
        if profile.get("fuel_spender"):
            return {
                "tone": "warning",
                "label": "Spending Impact",
                "message": f"Your monthly ₹{int(profile['fuel']):,} fuel spend may rise. Plan a cap.",
            }

    if cat == "tax":
        return {
            "tone": "info",
            "label": "Tax Impact",
            "message": "Could affect your next ITR / take-home. Worth a 2-min read.",
        }

    if cat == "gold" and profile.get("has_goals"):
        return {
            "tone": "info",
            "label": "Goal Impact",
            "message": "Gold-linked goals (wedding, gifting) may revalue. Re-check targets.",
        }

    return None


# ───────────────────────── endpoints ─────────────────────────


@router.get("/feed")
async def get_feed(
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """Personalized Inshorts-style feed. Sorted newest-first.

    Empty `category` returns ALL categories. Cards include a
    `personal_impact` block when our profile rules match — we never
    invent one to look smart.
    """
    q: dict = {}
    if category and category in CATEGORIES:
        q["category"] = category
    cursor = db.pulse_articles.find(q).sort("published_at", -1).limit(limit)
    articles: list[dict] = []
    async for a in cursor:
        articles.append(a)

    # Bootstrap: if the table is empty, do a synchronous quick ingest
    # so the very first user this hour doesn't see an empty feed.
    if not articles:
        await ingest_once(max_articles_per_source=8, summarize=False)
        cursor = db.pulse_articles.find(q).sort("published_at", -1).limit(limit)
        articles = []
        async for a in cursor:
            articles.append(a)

    profile = await _user_finance_profile(user_id)

    # R112 — reaction-driven re-ranking. Categories the user has
    # liked/saved before float to the top WITHIN the same recency
    # cohort. We don't shuffle dates — just within ~12h windows so
    # newer high-affinity items beat older low-affinity ones.
    if not category:
        affinity = await _user_category_affinity(user_id)
        if affinity:
            def _rank_key(a: dict) -> tuple:
                pa = a.get("published_at") or utc_now()
                if getattr(pa, "tzinfo", None) is None:
                    pa = pa.replace(tzinfo=timezone.utc)
                age_h = (utc_now() - pa).total_seconds() / 3600.0
                cohort = int(age_h // 12)  # group by 12h buckets
                aff = affinity.get(a.get("category", "general"), 0.0)
                return (cohort, -aff, -pa.timestamp())
            articles.sort(key=_rank_key)

    # User reactions for this batch (saved/dismissed/liked).
    ids = [str(a["_id"]) for a in articles]
    reactions: dict[str, dict] = {}
    if ids:
        async for r in db.pulse_reactions.find(
            {"user_id": user_id, "article_id": {"$in": ids}}
        ):
            reactions[str(r["article_id"])] = {
                "kind": r.get("kind"),
                "at": r.get("at").isoformat() if r.get("at") else None,
            }

    out: list[dict] = []
    for a in articles:
        aid = str(a["_id"])
        impact = _personal_impact(a, profile)
        # R112 — LLM-driven personal impact when rule engine returns
        # None AND the user has at least one signal that could land.
        # Cached forever per (article × profile-shape) so cost is
        # bounded and the UI never hangs on additional LLM calls.
        if impact is None:
            impact = await _llm_personal_impact(a, profile)
        out.append({
            "id":        aid,
            "url":       a.get("url"),
            "source":    a.get("source"),
            "verified":  bool(a.get("verified")),
            "category":  a.get("category"),
            "headline":  a.get("headline"),
            "explainer": a.get("explainer"),
            "generic_impact": a.get("generic_impact"),
            "sentiment": a.get("sentiment"),
            "emoji":     a.get("emoji"),
            "published_at": a["published_at"].isoformat() if a.get("published_at") else None,
            "personal_impact": impact,
            "reaction":  reactions.get(aid),
        })
    return {"articles": out, "count": len(out), "profile": {
        "has_sip": profile["has_sip"],
        "has_loan_emi": profile["has_loan_emi"],
    }}


@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    """Categories with counts — drives the chip strip on the frontend."""
    pipe = [
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    counts: dict[str, int] = {}
    async for r in db.pulse_articles.aggregate(pipe):
        counts[r.get("_id") or "general"] = int(r.get("count") or 0)
    return {
        "categories": [
            {
                "key": c,
                "label": _label_for(c),
                "emoji": _emoji_for(c),
                "count": counts.get(c, 0),
            }
            for c in CATEGORIES
        ],
        "total": sum(counts.values()),
    }


def _label_for(c: str) -> str:
    return {
        "markets": "Markets",
        "mutual-funds": "Mutual Funds",
        "loans": "Loans",
        "credit-cards": "Credit Cards",
        "rbi": "RBI",
        "tax": "Tax",
        "inflation": "Inflation",
        "salary": "Salary",
        "jobs": "Jobs",
        "ai-economy": "AI Economy",
        "crypto": "Crypto",
        "startups": "Startups",
        "consumer-spending": "Consumer",
        "gold": "Gold",
        "real-estate": "Real Estate",
        "general": "Top Stories",
    }.get(c, c.title())


@router.get("/article/{article_id}")
async def get_article(
    article_id: str,
    user_id: str = Depends(get_current_user),
):
    from bson import ObjectId
    try:
        oid = ObjectId(article_id)
    except Exception:
        raise HTTPException(400, "Invalid article id")
    a = await db.pulse_articles.find_one({"_id": oid})
    if not a:
        raise HTTPException(404, "Article not found")

    # Lazy LLM polish on first detail-view if we haven't already.
    if not a.get("llm_polished"):
        pol = await _llm_summarize(a.get("raw_title") or a.get("headline", ""),
                                    a.get("raw_summary") or a.get("explainer", ""))
        if pol.get("llm_ok"):
            await db.pulse_articles.update_one({"_id": oid}, {"$set": {
                "headline": pol["headline"],
                "explainer": pol["explainer"],
                "llm_polished": True,
            }})
            a["headline"] = pol["headline"]
            a["explainer"] = pol["explainer"]
            a["llm_polished"] = True

    profile = await _user_finance_profile(user_id)
    impact = _personal_impact(a, profile)
    return {
        "id":         article_id,
        "url":        a.get("url"),
        "source":     a.get("source"),
        "verified":   bool(a.get("verified")),
        "category":   a.get("category"),
        "headline":   a.get("headline"),
        "explainer":  a.get("explainer"),
        "generic_impact": a.get("generic_impact"),
        "sentiment":  a.get("sentiment"),
        "emoji":      a.get("emoji"),
        "published_at": a["published_at"].isoformat() if a.get("published_at") else None,
        "personal_impact": impact,
    }


@router.post("/react")
async def post_reaction(body: dict, user_id: str = Depends(get_current_user)):
    article_id = (body or {}).get("article_id")
    kind = (body or {}).get("kind")
    if kind not in ("like", "save", "dismiss", "unlike", "unsave"):
        raise HTTPException(400, "Invalid kind")
    if not article_id:
        raise HTTPException(400, "article_id required")
    if kind in ("unlike", "unsave"):
        target = "like" if kind == "unlike" else "save"
        await db.pulse_reactions.delete_one({
            "user_id": user_id, "article_id": article_id, "kind": target,
        })
        return {"ok": True, "removed": target}
    await db.pulse_reactions.update_one(
        {"user_id": user_id, "article_id": article_id, "kind": kind},
        {"$set": {"user_id": user_id, "article_id": article_id, "kind": kind, "at": utc_now()}},
        upsert=True,
    )
    return {"ok": True, "kind": kind}


@router.post("/refresh-now")
async def refresh_now(_: str = Depends(get_current_user)):
    """Manual ingest trigger (debug + first-load bootstrap)."""
    await _ensure_indexes()
    res = await ingest_once(max_articles_per_source=10, summarize=False)
    return res


# ═════════════════════════ R112 — TRENDING + DAILY BRIEF + LLM IMPACT
#
# This block extends Money Pulse v2 with four next-sprint pieces:
#   (a) Trending detection — engagement-weighted recency score
#   (b) Daily morning briefing — top 5 personalised picks
#   (c) Reaction-driven ranking — boosts categories the user has
#       liked/saved before
#   (d) LLM-driven personal_impact when the rule engine returns None


_LLM_IMPACT_CACHE: dict[str, dict] = {}   # key = f"{article_id}:{profile_hash}"


def _profile_hash(profile: dict) -> str:
    """Stable hash of the user's profile booleans so we cache LLM
    impact per (article × user-shape) without storing raw amounts."""
    flags = (
        bool(profile.get("has_sip")),
        bool(profile.get("has_loan_emi")),
        bool(profile.get("fuel_spender")),
        bool(profile.get("has_goals")),
    )
    return _hash("|".join(str(int(f)) for f in flags))[:12]


async def _llm_personal_impact(article: dict, profile: dict) -> Optional[dict]:
    """Last-mile LLM personalization. Only fires when the rule engine
    returns None AND the user has at least one signal (sip/loan/fuel/
    goal) that could plausibly land. Cached forever per (article,
    profile-shape) so we never re-pay the LLM for the same combination.
    """
    has_signal = any(profile.get(k) for k in ("has_sip", "has_loan_emi", "fuel_spender", "has_goals"))
    if not has_signal:
        return None
    aid = str(article.get("_id") or article.get("id") or "")
    if not aid:
        return None
    cache_key = f"{aid}:{_profile_hash(profile)}"
    if cache_key in _LLM_IMPACT_CACHE:
        return _LLM_IMPACT_CACHE[cache_key]

    try:
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not llm_key:
            return None
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"pulse_pi_{cache_key}",
            system_message=(
                "You are an Indian-finance impact analyst. "
                "Given a news article + a user-profile-flags object, "
                "decide if the article materially affects this user. "
                "STRICT JSON only: "
                '{"applies":true|false,'
                '"tone":"positive|negative|warning|info",'
                '"label":"<EMI|Investment|Spending|Tax|Inflation|Salary|Goal|Career|General> Impact",'
                '"message":"<≤90 chars, plain English, INR ₹ context>"}. '
                "When `applies` is false, return only {\"applies\":false}. "
                "Never fabricate amounts; never invent relevance."
            ),
        ).with_model("openai", "gpt-5.2")
        prompt = (
            f"HEADLINE: {article.get('headline','')}\n"
            f"EXPLAINER: {article.get('explainer','')}\n"
            f"CATEGORY: {article.get('category','')}\n"
            f"USER_PROFILE_FLAGS: has_sip={profile.get('has_sip')} "
            f"has_loan_emi={profile.get('has_loan_emi')} "
            f"fuel_spender={profile.get('fuel_spender')} "
            f"has_goals={profile.get('has_goals')}"
        )
        raw = await safe_send(
            chat, UserMessage(text=prompt), timeout=10.0, label="pulse_pi"
        )
        text = raw if isinstance(raw, str) else str(raw or "")
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            _LLM_IMPACT_CACHE[cache_key] = None  # cache miss too
            return None
        import json as _json
        try:
            parsed = _json.loads(m.group(0))
        except Exception:
            _LLM_IMPACT_CACHE[cache_key] = None
            return None
        if not parsed.get("applies"):
            _LLM_IMPACT_CACHE[cache_key] = None
            return None
        out = {
            "tone":    parsed.get("tone") or "info",
            "label":   parsed.get("label") or "General Impact",
            "message": (parsed.get("message") or "").strip()[:160],
            "_llm":    True,
        }
        if not out["message"]:
            _LLM_IMPACT_CACHE[cache_key] = None
            return None
        _LLM_IMPACT_CACHE[cache_key] = out
        return out
    except Exception as exc:
        logger.debug("llm impact exc: %s", exc)
        return None


async def _user_category_affinity(user_id: str) -> dict[str, float]:
    """Roll up the user's reaction history into a per-category boost.
    A 'like' is worth 1.0, 'save' is 1.5 (stronger intent). Returns a
    dict {category: weight} — empty for never-engaged users.
    """
    out: dict[str, float] = {}
    try:
        async for r in db.pulse_reactions.find({
            "user_id": user_id, "kind": {"$in": ["like", "save"]},
        }):
            try:
                from bson import ObjectId
                a = await db.pulse_articles.find_one(
                    {"_id": ObjectId(r["article_id"])}, {"category": 1},
                )
                if a:
                    cat = a.get("category", "general")
                    out[cat] = out.get(cat, 0.0) + (1.5 if r.get("kind") == "save" else 1.0)
            except Exception:
                continue
    except Exception:
        pass
    return out


def _trending_score(a: dict, like_count: int, save_count: int) -> float:
    """Reactions × time-decay. A like is worth 1, a save 2. Articles
    older than 36h decay sharply so trending always feels fresh.
    """
    pa = a.get("published_at") or utc_now()
    # MongoDB may hand us a tz-naive datetime; coerce so subtraction
    # against utc_now() (tz-aware) doesn't raise.
    if getattr(pa, "tzinfo", None) is None:
        pa = pa.replace(tzinfo=timezone.utc)
    age_h = max(0.5, (utc_now() - pa).total_seconds() / 3600.0)
    eng = like_count * 1.0 + save_count * 2.0
    # Wilson-ish recency: faster decay after 18h, near-zero by 48h.
    decay = max(0.0, 1.0 - (age_h / 48.0))
    # Always-on ambient floor so brand-new articles still rank vs zero engagement.
    return eng * (0.4 + 0.6 * decay) + (1.0 if age_h < 6 else 0.0)


@router.get("/trending")
async def get_trending(
    limit: int = Query(10, ge=1, le=30),
    user_id: str = Depends(get_current_user),
):
    """Engagement-weighted recency feed. Uses ALL users' reactions
    (cross-user signal) so "what everyone is talking about" is
    actually communal trending, not just the caller's history.
    Personal-impact still personalised to the caller.
    """
    cutoff = utc_now() - timedelta(hours=48)
    cursor = db.pulse_articles.find({"published_at": {"$gte": cutoff}}).sort("published_at", -1).limit(120)
    candidates: list[dict] = [a async for a in cursor]
    if not candidates:
        return {"articles": [], "count": 0}

    # Aggregate reactions per article in one pass.
    ids = [str(a["_id"]) for a in candidates]
    counts: dict[str, dict] = {i: {"like": 0, "save": 0} for i in ids}
    async for r in db.pulse_reactions.find({"article_id": {"$in": ids}}):
        c = counts.get(str(r.get("article_id")))
        if c:
            k = r.get("kind")
            if k in ("like", "save"):
                c[k] += 1

    profile = await _user_finance_profile(user_id)
    scored: list[tuple[float, dict]] = []
    for a in candidates:
        c = counts[str(a["_id"])]
        s = _trending_score(a, c["like"], c["save"])
        scored.append((s, a))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]

    out: list[dict] = []
    for s, a in top:
        impact = _personal_impact(a, profile)
        if impact is None:
            impact = await _llm_personal_impact(a, profile)
        out.append({
            "id":             str(a["_id"]),
            "url":            a.get("url"),
            "source":         a.get("source"),
            "verified":       bool(a.get("verified")),
            "category":       a.get("category"),
            "headline":       a.get("headline"),
            "explainer":      a.get("explainer"),
            "generic_impact": a.get("generic_impact"),
            "sentiment":      a.get("sentiment"),
            "emoji":          a.get("emoji"),
            "published_at":   a["published_at"].isoformat() if a.get("published_at") else None,
            "personal_impact": impact,
            "trending_score": round(float(s), 2),
            "engagement": {
                "likes": counts[str(a["_id"])]["like"],
                "saves": counts[str(a["_id"])]["save"],
            },
        })
    return {"articles": out, "count": len(out)}


@router.get("/daily-brief")
async def get_daily_brief(user_id: str = Depends(get_current_user)):
    """Morning briefing — 5 personalised cards.

    Composition:
      - 2 most-relevant by user category-affinity
      - 1 trending (highest engagement in last 24h)
      - 1 from the user's signal categories (loans/sip/fuel) if any
      - 1 freshest from RBI/regulatory if any
    All deduped. Never repeats — articles already shown today are
    suppressed via the `pulse_brief_seen` collection.
    """
    today_key = utc_now().strftime("%Y-%m-%d")
    seen_doc = await db.pulse_brief_seen.find_one({
        "user_id": user_id, "date": today_key,
    })
    seen_ids: set[str] = set(seen_doc.get("ids", [])) if seen_doc else set()

    cutoff = utc_now() - timedelta(hours=36)
    profile = await _user_finance_profile(user_id)
    affinity = await _user_category_affinity(user_id)

    # Fetch a healthy candidate pool.
    pool_cursor = db.pulse_articles.find(
        {"published_at": {"$gte": cutoff}}
    ).sort("published_at", -1).limit(80)
    pool = [a async for a in pool_cursor]

    def _id(a): return str(a["_id"])

    # Bucket A — affinity hits
    bucket_a = sorted(
        [a for a in pool if affinity.get(a.get("category", ""), 0) > 0 and _id(a) not in seen_ids],
        key=lambda a: (-affinity.get(a.get("category", ""), 0), -a["published_at"].timestamp()),
    )[:2]

    # Bucket B — trending
    ids_pool = [_id(a) for a in pool]
    counts: dict[str, dict] = {i: {"like": 0, "save": 0} for i in ids_pool}
    async for r in db.pulse_reactions.find({"article_id": {"$in": ids_pool}}):
        c = counts.get(str(r.get("article_id")))
        if c:
            k = r.get("kind")
            if k in ("like", "save"):
                c[k] += 1
    bucket_b = sorted(
        [a for a in pool if _id(a) not in seen_ids],
        key=lambda a: -_trending_score(a, counts[_id(a)]["like"], counts[_id(a)]["save"]),
    )[:1]

    # Bucket C — user's signal categories
    signal_cats: list[str] = []
    if profile.get("has_loan_emi"):
        signal_cats += ["loans", "rbi"]
    if profile.get("has_sip"):
        signal_cats += ["markets", "mutual-funds"]
    if profile.get("fuel_spender"):
        signal_cats += ["inflation"]
    bucket_c = [
        a for a in pool
        if a.get("category") in signal_cats and _id(a) not in seen_ids
    ][:1]

    # Bucket D — freshest RBI / regulator
    bucket_d = [
        a for a in pool
        if a.get("category") in ("rbi", "tax") and _id(a) not in seen_ids
    ][:1]

    # Merge with stable dedup, cap at 5.
    merged: list[dict] = []
    seen_local: set[str] = set()
    for src in (bucket_a, bucket_b, bucket_c, bucket_d):
        for a in src:
            if _id(a) in seen_local:
                continue
            merged.append(a)
            seen_local.add(_id(a))
    if len(merged) < 5:
        for a in pool:
            if _id(a) not in seen_local and _id(a) not in seen_ids:
                merged.append(a)
                seen_local.add(_id(a))
                if len(merged) >= 5:
                    break
    merged = merged[:5]

    out: list[dict] = []
    for a in merged:
        impact = _personal_impact(a, profile)
        if impact is None:
            impact = await _llm_personal_impact(a, profile)
        out.append({
            "id":             _id(a),
            "url":            a.get("url"),
            "source":         a.get("source"),
            "verified":       bool(a.get("verified")),
            "category":       a.get("category"),
            "headline":       a.get("headline"),
            "explainer":      a.get("explainer"),
            "generic_impact": a.get("generic_impact"),
            "sentiment":      a.get("sentiment"),
            "emoji":          a.get("emoji"),
            "published_at":   a["published_at"].isoformat() if a.get("published_at") else None,
            "personal_impact": impact,
        })

    # Mark these as seen so tomorrow's brief doesn't repeat them.
    if merged:
        await db.pulse_brief_seen.update_one(
            {"user_id": user_id, "date": today_key},
            {"$set": {
                "user_id": user_id, "date": today_key,
                "ids": list(seen_ids | {_id(a) for a in merged}),
                "at": utc_now(),
            }},
            upsert=True,
        )

    return {
        "articles": out,
        "count": len(out),
        "date": today_key,
        "personalised": bool(affinity) or any(profile.get(k) for k in ("has_sip", "has_loan_emi", "fuel_spender")),
    }


# ───────────────────────── background worker ─────────────────────────


async def pulse_refresher_worker():
    """Background loop — refreshes every 12 minutes. Runs lazy LLM
    polish on the freshest 6 articles per cycle so summaries upgrade
    quietly without blocking ingestion."""
    await _ensure_indexes()
    while True:
        try:
            res = await ingest_once(max_articles_per_source=10, summarize=False)
            # Polish a small batch of the most recent un-polished articles.
            cursor = db.pulse_articles.find({"llm_polished": False}).sort("published_at", -1).limit(6)
            async for a in cursor:
                pol = await _llm_summarize(
                    a.get("raw_title") or a.get("headline", ""),
                    a.get("raw_summary") or a.get("explainer", ""),
                )
                if pol.get("llm_ok"):
                    await db.pulse_articles.update_one({"_id": a["_id"]}, {"$set": {
                        "headline": pol["headline"],
                        "explainer": pol["explainer"],
                        "llm_polished": True,
                    }})
            logger.info("pulse refresh cycle done · inserted=%d", res.get("inserted", 0))
        except Exception as exc:
            logger.warning("pulse refresher loop exc: %s", exc)
        await asyncio.sleep(12 * 60)
