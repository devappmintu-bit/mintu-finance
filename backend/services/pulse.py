"""MintU Pulse — Money Signal Layer.

Turns raw India-finance news into *personalised* cards. The core move is
the **impact layer**: every card that survives the allow-list filter is
annotated with 1–3 lines tied to the user's own data (monthly income,
last-30-day category spend, recurring subs presence). Cards with zero
relevant impact are dropped — the spec explicitly forbids showing
"low-relevance" filler.

Allow-list (the ONLY categories that reach the user):
    markets      → Nifty / Sensex / stocks / IPOs / SIP / mutual funds
    rbi          → RBI / repo / inflation / interest rates
    banking      → bank rule changes / deposit rules / KYC
    tax          → GST / ITR / CBDT / TDS / slab changes
    upi_fintech  → UPI / NPCI / fintech product launches
    jobs_salary  → hiring / salary trends / layoffs / wage policy

Explicitly dropped:  politics, crime/alerts, welfare schemes, sports,
celebrity, generic "tips" that don't map to money.

Shape returned by `build_pulse_feed`:
    {
        "cards":   [ PulseCard, … max 7 ],
        "unread_count":  int,
        "has_important": bool,
        "last_seen_at":  iso-ts | None,
    }
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from core.db import db

log = logging.getLogger("pulse")

# ---------------------------------------------------------------------------
# Allow-list + keyword remapper
# ---------------------------------------------------------------------------

ALLOWED_CATEGORIES = (
    "markets",
    "rbi",
    "banking",
    "tax",
    "upi_fintech",
    "jobs_salary",
)

# Drop-hard patterns (noise we NEVER want in Pulse).
_BLOCK_PATTERNS = re.compile(
    r"\b(politic|parliament|election|modi|bjp|congress|minister|arrest|"
    r"murder|rape|crime|bollywood|cricket|actor|actress|sports|ipl)\b",
    re.IGNORECASE,
)

# Keyword → pulse category. First match wins. Ordered by specificity.
_CATEGORY_RULES: Tuple[Tuple[str, re.Pattern], ...] = (
    ("rbi",         re.compile(r"\b(rbi|repo rate|reverse repo|inflation|mpc|monetary policy|interest rate)\b", re.I)),
    ("tax",         re.compile(r"\b(gst|itr|cbdt|tds|income tax|tax slab|old regime|new regime|form 16|ais|tis)\b", re.I)),
    ("upi_fintech", re.compile(r"\b(upi|npci|rupay|aadhaar pay|fintech|digital payment|wallet|neobank)\b", re.I)),
    ("jobs_salary", re.compile(r"\b(hiring|layoff|salary|wage|payroll|recruitment|bonus|appraisal|jobs?\b)\b", re.I)),
    ("markets",     re.compile(r"\b(nifty|sensex|stock|equity|ipo|sip|mutual fund|bourse|fii|dii|bse|nse|amfi|nfo|etf)\b", re.I)),
    ("banking",     re.compile(r"\b(bank|deposit|fd|fixed deposit|savings account|cheque|kyc|demat)\b", re.I)),
)


def _classify(article: Dict[str, Any]) -> Optional[str]:
    """Return a pulse category or None if the article is noise.

    We IGNORE the article's own `category` field — the news source uses
    loose buckets like `scheme`/`alert`/`tip` that leak politics or welfare
    news. The smart filter is keyword-based on headline+summary.
    """
    blob = f"{article.get('title','')} {article.get('summary','')}".strip()
    if not blob:
        return None
    if _BLOCK_PATTERNS.search(blob):
        return None
    for cat, pat in _CATEGORY_RULES:
        if pat.search(blob):
            return cat
    return None  # Unclassifiable → drop.


# ---------------------------------------------------------------------------
# User-context builder
# ---------------------------------------------------------------------------

async def _build_user_context(user_id: str) -> Dict[str, Any]:
    """Collect the minimal facts the impact templates need.

    Keep this small and fast — this runs on every `/api/pulse` hit. No LLM
    calls, no heavy aggregations. Last-30-day tx grouping by lowercase
    category is sufficient for V1.
    """
    u = await db.users.find_one({"_id": _oid(user_id)}) or {}
    income = float(u.get("income_monthly") or 0)

    since = datetime.now(timezone.utc) - timedelta(days=30)
    cat_spend: Dict[str, float] = {}
    try:
        cursor = db.transactions.find(
            {"user_id": user_id, "created_at": {"$gte": since}},
            {"amount": 1, "category": 1, "type": 1},
        )
        async for tx in cursor:
            if (tx.get("type") or "expense") != "expense":
                continue
            cat = (tx.get("category") or "").strip().lower() or "other"
            cat_spend[cat] = cat_spend.get(cat, 0.0) + float(tx.get("amount") or 0)
    except Exception as e:  # pragma: no cover — DB flake shouldn't kill Pulse.
        log.warning(f"pulse: tx aggregate failed for {user_id}: {e}")

    subs_count = 0
    try:
        subs_count = await db.recurring_subscriptions.count_documents({"user_id": user_id})
    except Exception:
        pass

    # Bucket derived signals used by the templates.
    return {
        "user_id": user_id,
        "name": u.get("name") or "",
        "income_monthly": income,
        "cat_spend": cat_spend,
        "transport_spend": _bucket(cat_spend, ("transport", "travel", "fuel", "taxi", "auto")),
        "food_spend": _bucket(cat_spend, ("food", "dining", "restaurant", "zomato", "swiggy")),
        "investments": _bucket(cat_spend, ("investment", "sip", "mutual fund", "stocks", "equity")),
        "has_emi": _bucket(cat_spend, ("emi", "loan", "mortgage")) > 0,
        "emi_monthly": _bucket(cat_spend, ("emi", "loan", "mortgage")),
        "subs_count": subs_count,
        "last_seen_pulse_at": u.get("last_pulse_seen_at"),
    }


def _bucket(cat_spend: Dict[str, float], keys: Tuple[str, ...]) -> float:
    return sum(v for k, v in cat_spend.items() if any(kw in k for kw in keys))


def _oid(s: str):
    from bson import ObjectId
    try:
        return ObjectId(s)
    except Exception:
        return s  # fallback — user may have been created as string _id.


# ---------------------------------------------------------------------------
# Impact templates (the "differentiator" layer)
#
# Each template takes (article, user_ctx) and returns a list of dicts of
# shape {kind, icon, text}.  An EMPTY return means "skip this card" — we
# refuse to show a user news they have no stake in.
# ---------------------------------------------------------------------------


def _inr(n: float) -> str:
    v = int(round(abs(n)))
    if v >= 100_000:
        return f"₹{v/100_000:.1f}L"
    return f"₹{v:,}"


def _impact_rbi(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    # EMI sensitivity — rough: +25bps on repo ≈ ~1.8 % monthly EMI bump on a
    # floating home loan. We use the *spend* on EMI as the base so it works
    # even without loan amount/tenure.
    if ctx["emi_monthly"] > 500:
        bump = ctx["emi_monthly"] * 0.018
        rows.append({"kind": "expense", "icon": "💸",
                     "text": f"Your EMI may tick up ~{_inr(bump)}/month"})
    # FD / savings opportunity — surface if income signals liquidity room.
    if ctx["income_monthly"] >= 30_000:
        rows.append({"kind": "income", "icon": "📈",
                     "text": "FD rates likely to move with this — watch 1Y deposits"})
    rows.append({"kind": "suggestion", "icon": "🧠",
                 "text": "Delay big loans; relook at rate-locked FDs"})
    return rows


def _impact_markets(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    invested = ctx["investments"] > 0
    if invested:
        return [
            {"kind": "income", "icon": "📊",
             "text": "Your SIP / equity holdings may move with this"},
            {"kind": "suggestion", "icon": "🧠",
             "text": "Don't panic-rebalance on a single day's move"},
        ]
    # If you don't invest, we drop the card rather than nag with low-relevance.
    # BUT for income > ₹50 k we surface a seed nudge — once.
    if ctx["income_monthly"] >= 50_000:
        return [
            {"kind": "suggestion", "icon": "🧠",
             "text": "Not investing yet? Start a ₹1 k SIP — compounds into years of cushion."},
        ]
    return []  # drop


def _impact_banking(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    # Banking rules affect nearly everyone with income.
    if ctx["income_monthly"] > 0:
        rows.append({"kind": "expense", "icon": "🏦",
                     "text": "Bank rule change — check charges on your account"})
    rows.append({"kind": "suggestion", "icon": "🧠",
                 "text": "Skim the NEFT / KYC change before month-end"})
    return rows


def _impact_tax(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    if ctx["income_monthly"] < 25_000:
        return []
    annual = ctx["income_monthly"] * 12
    rows: List[Dict[str, str]] = [
        {"kind": "expense", "icon": "🧾",
         "text": f"Affects filing for {_inr(annual)} annual income"},
        {"kind": "suggestion", "icon": "🧠",
         "text": "Revisit old-vs-new regime before AIS is frozen"},
    ]
    return rows


def _impact_upi_fintech(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    # UPI news matters to nearly every Indian user — still gate on income so
    # a zero-data user doesn't get noise.
    if ctx["income_monthly"] == 0 and ctx["subs_count"] == 0:
        return []
    rows = [{"kind": "expense", "icon": "📱",
             "text": "Watch for new UPI limits / charges on your daily pays"}]
    if ctx["subs_count"] > 0:
        rows.append({"kind": "expense", "icon": "🔁",
                     "text": f"Your {ctx['subs_count']} recurring payment{'s' if ctx['subs_count'] != 1 else ''} route via this — check for re-auth prompts"})
    rows.append({"kind": "suggestion", "icon": "🧠",
                 "text": "Keep one backup UPI handle set up"})
    return rows


def _impact_jobs_salary(a: Dict, ctx: Dict) -> List[Dict[str, str]]:
    if ctx["income_monthly"] == 0:
        return []  # unemployed signal — don't poke.
    return [
        {"kind": "income", "icon": "💼",
         "text": f"Relevant to your bracket (~{_inr(ctx['income_monthly']*12)}/yr)"},
        {"kind": "suggestion", "icon": "🧠",
         "text": "Benchmark before your next appraisal"},
    ]


_IMPACT_DISPATCH = {
    "rbi":         _impact_rbi,
    "markets":     _impact_markets,
    "banking":     _impact_banking,
    "tax":         _impact_tax,
    "upi_fintech": _impact_upi_fintech,
    "jobs_salary": _impact_jobs_salary,
}


# ---------------------------------------------------------------------------
# Curated fallback — used when the news cache is empty or the live articles
# all get filtered out. We'd rather ship 5 solid cards than an empty screen.
# ---------------------------------------------------------------------------

_FALLBACK_PULSE: List[Dict[str, Any]] = [
    {
        "title": "RBI holds repo rate at 6.5 %",
        "summary": "Policy rate unchanged — home-loan EMIs stay flat, but 1-year FD rates remain in the sweet spot.",
        "emoji": "🏦",
        "source": "RBI",
        "hint": "rbi",
    },
    {
        "title": "Nifty crosses 25,000 on strong FII inflows",
        "summary": "Foreign buying lifted large-caps this week. IT and banking led the move; small-caps lagged.",
        "emoji": "📈",
        "source": "NSE",
        "hint": "markets",
    },
    {
        "title": "UPI crosses 18 billion monthly transactions",
        "summary": "NPCI confirms a new record. Expect incremental merchant charges debate to resurface.",
        "emoji": "💳",
        "source": "NPCI",
        "hint": "upi_fintech",
    },
    {
        "title": "CBDT extends ITR filing window",
        "summary": "Income-tax return deadline pushed — AIS and Form 26AS are the two screens to cross-check before you file.",
        "emoji": "🧾",
        "source": "CBDT",
        "hint": "tax",
    },
    {
        "title": "IT-sector hiring picks up, average salary ticks up 6 %",
        "summary": "Naukri Jobspeak and Monster India both point to entry- and mid-level offers rising after a flat year.",
        "emoji": "💼",
        "source": "Naukri",
        "hint": "jobs_salary",
    },
]


# ---------------------------------------------------------------------------
# Main assembler
# ---------------------------------------------------------------------------

MAX_CARDS = 7


async def _raw_articles() -> List[Dict[str, Any]]:
    """Pull today's cached articles or yesterday's if today is empty."""
    today = datetime.now(timezone.utc).date().isoformat()
    yday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    for d in (today, yday):
        row = await db.news_cache.find_one({"date": d})
        if row and row.get("articles"):
            return list(row["articles"])
    return []


async def build_pulse_feed(user_id: str) -> Dict[str, Any]:
    ctx = await _build_user_context(user_id)

    # Normal path — live articles. Fallback if empty.
    articles = await _raw_articles()
    using_fallback = False
    if not articles:
        articles = [dict(a) for a in _FALLBACK_PULSE]
        using_fallback = True

    cards: List[Dict[str, Any]] = []
    seen_categories: set = set()  # de-dupe so we don't show 3 market cards

    for idx, a in enumerate(articles):
        if len(cards) >= MAX_CARDS:
            break

        hint = a.get("hint") if using_fallback else None
        cat = hint or _classify(a)
        if cat not in ALLOWED_CATEGORIES:
            continue
        if cat in seen_categories and len(cards) >= 3:
            # Allow dupes only until we've filled the first 3 slots — then
            # prefer category diversity.
            continue

        impacts = _IMPACT_DISPATCH[cat](a, ctx)
        if not impacts:
            continue  # strict: no personal impact → no card.

        importance = _importance(cat, impacts, ctx)
        card = {
            "id": f"pulse-{cat}-{idx}-{a.get('title','')[:40]}",
            "category": cat,
            "headline": a.get("title") or "",
            "summary": (a.get("summary") or "")[:220],
            "emoji": a.get("emoji") or _default_emoji(cat),
            "source": a.get("source") or "",
            "source_url": a.get("source_url") or "",
            "impacts": impacts,
            "importance": importance,   # low | normal | high
            "ai_prompt_seed": _seed_for_ai(a, impacts, ctx),
            "published_at": a.get("published_at") or datetime.now(timezone.utc).isoformat(),
        }
        cards.append(card)
        seen_categories.add(cat)

    last_seen = ctx["last_seen_pulse_at"]
    unread = len(cards) if not last_seen else _count_unread(cards, last_seen)
    has_important = any(c["importance"] == "high" for c in cards)

    return {
        "cards": cards,
        "unread_count": unread,
        "has_important": has_important,
        "last_seen_at": last_seen.isoformat() if hasattr(last_seen, "isoformat") else last_seen,
        "is_fallback": using_fallback,
    }


def _importance(cat: str, impacts: List[Dict], ctx: Dict) -> str:
    # Any EMI expense line is automatic HIGH — users care about monthly cash.
    if any(i["kind"] == "expense" and "emi" in i["text"].lower() for i in impacts):
        return "high"
    # Tax/RBI defaults to normal; markets with investment exposure high.
    if cat == "markets" and ctx["investments"] > 10_000:
        return "high"
    return "normal"


def _count_unread(cards: List[Dict], last_seen) -> int:
    if not last_seen:
        return len(cards)
    try:
        if isinstance(last_seen, datetime):
            ls = last_seen
        else:
            ls = datetime.fromisoformat(str(last_seen).replace("Z", "+00:00"))
        # Normalise to UTC-aware: Mongo round-trips can drop tzinfo, and
        # `datetime.fromisoformat` of a naive string is naive too. Without
        # this both branches of the `>` compare can be naive vs aware →
        # TypeError. (R100E hotfix: this exact bug ate 100% of the Pulse
        # feed for any user who'd ever tapped /pulse/seen.)
        if ls.tzinfo is None:
            ls = ls.replace(tzinfo=timezone.utc)
    except Exception:
        return len(cards)
    n = 0
    for c in cards:
        try:
            pub = datetime.fromisoformat(c["published_at"].replace("Z", "+00:00"))
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if pub > ls:
            n += 1
    return n


def _default_emoji(cat: str) -> str:
    return {
        "rbi": "🏦", "markets": "📈", "banking": "🏦",
        "tax": "🧾", "upi_fintech": "💳", "jobs_salary": "💼",
    }.get(cat, "📰")


def _seed_for_ai(article: Dict, impacts: List[Dict], ctx: Dict) -> str:
    """Short prompt seed used when the user taps “Ask MintU about this”."""
    impact_str = " · ".join(i["text"] for i in impacts)
    return (
        f"News: {article.get('title','')}. "
        f"Summary: {article.get('summary','')}. "
        f"Likely impact on this user: {impact_str}. "
        f"User context: income ₹{int(ctx.get('income_monthly') or 0):,}/mo. "
        f"Answer their question in the context of THIS news."
    )


async def mark_pulse_seen(user_id: str) -> None:
    """Record that the user just viewed Pulse. Clears the unread badge."""
    await db.users.update_one(
        {"_id": _oid(user_id)},
        {"$set": {"last_pulse_seen_at": datetime.now(timezone.utc)}},
    )


__all__ = ["build_pulse_feed", "mark_pulse_seen", "ALLOWED_CATEGORIES"]
