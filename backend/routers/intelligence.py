"""
intelligence.py — R118 SLICE A:
                  Subscription Vault, Money Mood Score, Money Story.

Architectural rules (per product brief):
    1. Deterministic > LLM. Regex + heuristics + windowed aggregates.
    2. NO LLM calls in this router — keeps fintech compute trustworthy
       and free. (LLM-flavored tone reframing happens in frontend
       templates instead.)
    3. Every score / detection ships with a `confidence` field so
       downstream UI can show the user "Why am I seeing this?".
    4. Tone is encouraging and non-judgmental — no "you wasted X".

Endpoints:
    GET  /api/intelligence/subscriptions   → recurring spend vault
    GET  /api/intelligence/mood-score      → 0-100 composite + band
    GET  /api/intelligence/money-story     → monthly recap panels
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
import math
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, Depends, Query

from core import db, get_current_user
from core.time import utc_now
from core.cache import cache_get, cache_set


router = APIRouter(prefix="/intelligence", tags=["intelligence"])

# ────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────

_MERCHANT_KNOWN: Dict[str, Dict[str, Any]] = {
    # canonical-key → {label, category, emoji, subscription_score}
    "netflix":      {"label": "Netflix",       "category": "Entertainment", "emoji": "🎬", "sub": 1.0},
    "spotify":      {"label": "Spotify",       "category": "Entertainment", "emoji": "🎧", "sub": 1.0},
    "ytpremium":    {"label": "YouTube Premium","category": "Entertainment","emoji": "📺", "sub": 1.0},
    "youtube":      {"label": "YouTube",       "category": "Entertainment", "emoji": "📺", "sub": 0.7},
    "primevideo":   {"label": "Prime Video",   "category": "Entertainment", "emoji": "🎬", "sub": 1.0},
    "amazonprime":  {"label": "Amazon Prime",  "category": "Shopping",      "emoji": "📦", "sub": 1.0},
    "hotstar":      {"label": "Hotstar",       "category": "Entertainment", "emoji": "📺", "sub": 1.0},
    "jiocinema":    {"label": "JioCinema",     "category": "Entertainment", "emoji": "📺", "sub": 1.0},
    "sonyliv":      {"label": "SonyLIV",       "category": "Entertainment", "emoji": "📺", "sub": 1.0},
    "zee5":         {"label": "Zee5",          "category": "Entertainment", "emoji": "📺", "sub": 1.0},
    "icloud":       {"label": "iCloud",        "category": "Subscriptions", "emoji": "☁️", "sub": 1.0},
    "googleone":    {"label": "Google One",    "category": "Subscriptions", "emoji": "☁️", "sub": 1.0},
    "chatgpt":      {"label": "ChatGPT",       "category": "Subscriptions", "emoji": "🤖", "sub": 1.0},
    "openai":       {"label": "OpenAI",        "category": "Subscriptions", "emoji": "🤖", "sub": 1.0},
    "claude":       {"label": "Claude",        "category": "Subscriptions", "emoji": "🤖", "sub": 1.0},
    "github":       {"label": "GitHub",        "category": "Subscriptions", "emoji": "💻", "sub": 0.8},
    "swiggy":       {"label": "Swiggy",        "category": "Food",          "emoji": "🍱", "sub": 0.0},
    "zomato":       {"label": "Zomato",        "category": "Food",          "emoji": "🍔", "sub": 0.0},
    "uber":         {"label": "Uber",          "category": "Transport",     "emoji": "🚕", "sub": 0.0},
    "ola":          {"label": "Ola",           "category": "Transport",     "emoji": "🚕", "sub": 0.0},
    "rapido":       {"label": "Rapido",        "category": "Transport",     "emoji": "🛵", "sub": 0.0},
    "amazon":       {"label": "Amazon",        "category": "Shopping",      "emoji": "📦", "sub": 0.0},
    "flipkart":     {"label": "Flipkart",      "category": "Shopping",      "emoji": "🛒", "sub": 0.0},
    "myntra":       {"label": "Myntra",        "category": "Shopping",      "emoji": "👗", "sub": 0.0},
    "bigbasket":    {"label": "BigBasket",     "category": "Groceries",     "emoji": "🥬", "sub": 0.4},
    "blinkit":      {"label": "Blinkit",       "category": "Groceries",     "emoji": "🛒", "sub": 0.0},
    "zepto":        {"label": "Zepto",         "category": "Groceries",     "emoji": "🛒", "sub": 0.0},
    "jio":          {"label": "Jio",           "category": "Bills",         "emoji": "📱", "sub": 0.7},
    "airtel":       {"label": "Airtel",        "category": "Bills",         "emoji": "📡", "sub": 0.7},
    "vi":           {"label": "Vi",            "category": "Bills",         "emoji": "📞", "sub": 0.7},
    "fastag":       {"label": "FASTag",        "category": "Transport",     "emoji": "🛣️", "sub": 0.0},
    "hp":           {"label": "HP Petrol",     "category": "Transport",     "emoji": "⛽", "sub": 0.0},
    "iocl":         {"label": "Indian Oil",    "category": "Transport",     "emoji": "⛽", "sub": 0.0},
    "bpcl":         {"label": "BPCL",          "category": "Transport",     "emoji": "⛽", "sub": 0.0},
}


def _merchant_key(desc: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", (desc or "").lower())
    return s[:20]


def _resolve_merchant(desc: str) -> Dict[str, Any]:
    """Best-effort merchant resolution against the known table."""
    key = _merchant_key(desc)
    for canonical, meta in _MERCHANT_KNOWN.items():
        if canonical in key:
            return {
                "key": canonical,
                "label": meta["label"],
                "category": meta["category"],
                "emoji": meta["emoji"],
                "sub_score": meta["sub"],
                "confidence": 0.9,
            }
    return {
        "key": key or "unknown",
        "label": (desc or "Unknown").title()[:32],
        "category": None,
        "emoji": "💳",
        "sub_score": 0.0,
        "confidence": 0.4,
    }


# ────────────────────────────────────────────────────────────────────────
# 1) SUBSCRIPTION VAULT — deterministic recurring detection
# ────────────────────────────────────────────────────────────────────────
@router.get("/subscriptions")
async def get_subscriptions(user_id: str = Depends(get_current_user)):
    """
    Detect recurring subscriptions across the last 180 days.

    Algorithm (deterministic, NO LLM):
        1. Pull all debits in the last 180 days.
        2. Group by canonical merchant key.
        3. Compute monthly cadence = len(distinct months) / 6.
        4. Compute amount stability = 1 - stdev/mean of amounts.
        5. confidence = 0.55 * cadence + 0.30 * stability + 0.15 * known_score
        6. Keep merchants with confidence ≥ 0.45 AND ≥2 distinct months.
        7. Predict next billing = last_seen + median_gap_days.

    Returns a sorted list (highest monthly cost first), plus aggregate
    totals so the frontend can show "₹X/mo across N subscriptions".
    """
    cache_key = f"intelligence:subs:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    horizon = utc_now() - timedelta(days=180)
    txns = await db.transactions.find({
        "user_id": user_id,
        "type": "debit",
        "date": {"$gte": horizon},
    }).to_list(5000)

    # Bucket by merchant key
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for t in txns:
        key = _merchant_key(t.get("description", ""))
        if not key:
            continue
        buckets.setdefault(key, []).append(t)

    subs: List[Dict[str, Any]] = []
    for key, items in buckets.items():
        if len(items) < 2:
            continue

        # Distinct months over the 6-month window
        months = {(it["date"].year, it["date"].month) for it in items if it.get("date")}
        cadence = min(1.0, len(months) / 6.0)
        if cadence < 0.30 or len(months) < 2:
            continue

        amounts = [float(it["amount"]) for it in items]
        mean = sum(amounts) / len(amounts)
        if mean <= 0:
            continue
        var = sum((a - mean) ** 2 for a in amounts) / len(amounts)
        std = math.sqrt(var)
        stability = max(0.0, 1.0 - (std / mean))

        merchant = _resolve_merchant(items[0].get("description", ""))
        known = merchant["sub_score"]

        confidence = 0.55 * cadence + 0.30 * stability + 0.15 * known
        if confidence < 0.45:
            continue

        # Median gap → predicted next billing
        sorted_items = sorted(items, key=lambda x: x["date"])
        gaps_days = []
        for i in range(1, len(sorted_items)):
            gd = (sorted_items[i]["date"] - sorted_items[i - 1]["date"]).days
            if 5 <= gd <= 95:
                gaps_days.append(gd)
        median_gap = sorted(gaps_days)[len(gaps_days) // 2] if gaps_days else 30
        last_seen = sorted_items[-1]["date"]
        next_pred = last_seen + timedelta(days=median_gap)

        # Approximate monthly cost
        per_month = mean if median_gap <= 35 else (mean * 30.0 / max(median_gap, 1))
        lifetime = sum(amounts)

        subs.append({
            "id": key,
            "merchant_key": key,
            "merchant": merchant["label"],
            "category": merchant["category"],
            "emoji": merchant["emoji"],
            "monthly_cost": round(per_month, 2),
            "last_charge": float(amounts[-1]),
            "last_seen_iso": last_seen.isoformat(),
            "next_predicted_iso": next_pred.isoformat(),
            "occurrences": len(items),
            "lifetime_spent": round(lifetime, 2),
            "amount_stability": round(stability, 3),
            "cadence": round(cadence, 3),
            "confidence": round(confidence, 3),
            "is_known": known >= 0.5,
        })

    subs.sort(key=lambda s: s["monthly_cost"], reverse=True)

    monthly_total = sum(s["monthly_cost"] for s in subs)
    annual_total = monthly_total * 12

    result = {
        "subscriptions": subs,
        "summary": {
            "count": len(subs),
            "monthly_total": round(monthly_total, 2),
            "annual_projection": round(annual_total, 2),
            "horizon_days": 180,
        },
        "tone": "encouraging",
    }
    cache_set(cache_key, result, ttl_seconds=120)
    return result


# ────────────────────────────────────────────────────────────────────────
# 2) MONEY MOOD SCORE — composite 0-100, deterministic
# ────────────────────────────────────────────────────────────────────────
def _score_to_band(score: float) -> Dict[str, Any]:
    """Map 0-100 composite to an emotional band per product brief."""
    if score < 21:
        return {"band": "critical",  "label": "Critical",  "emoji": "🚨", "tone": "supportive"}
    if score < 41:
        return {"band": "stressed",  "label": "Stressed",  "emoji": "🌧️", "tone": "gentle"}
    if score < 61:
        return {"band": "stable",    "label": "Stable",    "emoji": "🌤️", "tone": "neutral"}
    if score < 81:
        return {"band": "healthy",   "label": "Healthy",   "emoji": "🌱", "tone": "celebratory"}
    return     {"band": "thriving",  "label": "Thriving",  "emoji": "✨", "tone": "celebratory"}


@router.get("/mood-score")
async def get_mood_score(user_id: str = Depends(get_current_user)):
    """
    Composite Money Mood Score — entirely deterministic.

    Weights (from product brief):
        30% savings_trend
        20% spending_stability
        15% recurring_burden
        15% impulse_behavior
        10% cash_runway
        10% bill_safety

    Each sub-score is normalized to [0, 1]. Composite = Σ(weight × sub).
    Returned as 0-100 integer + emotional band + sub-score breakdown
    (so the "Why am I seeing this?" CTA can render the contributors).
    """
    cache_key = f"intelligence:mood:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = utc_now()
    cutoff = now - timedelta(days=30)

    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": cutoff},
    }).to_list(5000)

    debits = [t for t in txns if t["type"] == "debit"]
    credits = [t for t in txns if t["type"] == "credit"]
    total_in = sum(float(t["amount"]) for t in credits) or 0.0
    total_out = sum(float(t["amount"]) for t in debits) or 0.0

    # —— savings_trend: ratio of net savings to inflow, clamped ——
    if total_in > 0:
        savings_trend = max(0.0, min(1.0, (total_in - total_out) / total_in))
    else:
        # No income recorded → flat baseline so empty users start at "stable"
        savings_trend = 0.5 if total_out == 0 else 0.25

    # —— spending_stability: 1 - cv of daily spend ——
    daily: Dict[str, float] = {}
    for t in debits:
        iso = t["date"].strftime("%Y-%m-%d")
        daily[iso] = daily.get(iso, 0.0) + float(t["amount"])
    if len(daily) >= 3:
        vals = list(daily.values())
        mean_d = sum(vals) / len(vals)
        var_d = sum((v - mean_d) ** 2 for v in vals) / len(vals)
        cv = (math.sqrt(var_d) / mean_d) if mean_d > 0 else 0
        spending_stability = max(0.0, min(1.0, 1.0 - min(cv, 1.0)))
    else:
        spending_stability = 0.6

    # —— recurring_burden: 1 - subs_total/income ——
    # Cheap reuse: use the bucketing logic from /subscriptions but only
    # within the 30d window for the burden lens.
    subs_total = 0.0
    keys: Dict[str, List[float]] = {}
    for t in debits:
        k = _merchant_key(t.get("description", ""))
        keys.setdefault(k, []).append(float(t["amount"]))
    for k, amts in keys.items():
        if len(amts) >= 2:
            mer = _resolve_merchant(k)
            if mer["sub_score"] >= 0.6:
                subs_total += sum(amts)
    if total_in > 0:
        recurring_burden = max(0.0, min(1.0, 1.0 - (subs_total / total_in)))
    else:
        recurring_burden = 1.0 - min(1.0, subs_total / max(1.0, total_out + 1.0))

    # —— impulse_behavior: 1 - (late_night + first_time) / total ——
    if debits:
        late_night = 0
        first_time = 0
        merch_count: Dict[str, int] = {}
        for t in debits:
            merch_count[_merchant_key(t.get("description", ""))] = (
                merch_count.get(_merchant_key(t.get("description", "")), 0) + 1
            )
        for t in debits:
            h = t["date"].hour
            if 0 <= h < 4:
                late_night += 1
            if merch_count.get(_merchant_key(t.get("description", "")), 0) == 1:
                first_time += 1
        ratio = (late_night + first_time) / max(1, len(debits))
        impulse_behavior = max(0.0, min(1.0, 1.0 - ratio))
    else:
        impulse_behavior = 0.7

    # —— cash_runway: days_until_zero / 30, capped ——
    daily_burn = (total_out / 30.0) if total_out > 0 else 0
    if daily_burn > 0:
        # We don't know live balance — proxy with (total_in - total_out)
        # treated as "headroom". This is intentionally conservative.
        headroom = max(0.0, total_in - total_out)
        runway_days = headroom / daily_burn if daily_burn else 30
        cash_runway = max(0.0, min(1.0, runway_days / 30.0))
    else:
        cash_runway = 0.6

    # —— bill_safety: (income - subs) / income ——
    if total_in > 0:
        bill_safety = max(0.0, min(1.0, (total_in - subs_total) / total_in))
    else:
        bill_safety = 0.5

    # Composite
    sub_scores = {
        "savings_trend":      round(savings_trend, 3),
        "spending_stability": round(spending_stability, 3),
        "recurring_burden":   round(recurring_burden, 3),
        "impulse_behavior":   round(impulse_behavior, 3),
        "cash_runway":        round(cash_runway, 3),
        "bill_safety":        round(bill_safety, 3),
    }
    composite01 = (
        0.30 * savings_trend
        + 0.20 * spending_stability
        + 0.15 * recurring_burden
        + 0.15 * impulse_behavior
        + 0.10 * cash_runway
        + 0.10 * bill_safety
    )
    score = int(round(composite01 * 100))
    band = _score_to_band(score)

    # Top 2 contributors that pulled the score DOWN, for the explainer.
    weights = {
        "savings_trend":      0.30,
        "spending_stability": 0.20,
        "recurring_burden":   0.15,
        "impulse_behavior":   0.15,
        "cash_runway":        0.10,
        "bill_safety":        0.10,
    }
    deltas = [(k, weights[k] * (1.0 - v)) for k, v in sub_scores.items()]
    deltas.sort(key=lambda x: -x[1])
    biggest_drags = [k for k, _ in deltas[:2]]

    headline = _mood_headline(band["band"], biggest_drags, sub_scores)

    result = {
        "score": score,
        "band": band["band"],
        "label": band["label"],
        "emoji": band["emoji"],
        "tone": band["tone"],
        "headline": headline,
        "sub_scores": sub_scores,
        "weights": weights,
        "drags": biggest_drags,
        "computed_at": now.isoformat(),
        "window_days": 30,
        "tx_count": len(txns),
    }
    cache_set(cache_key, result, ttl_seconds=180)
    return result


def _mood_headline(band: str, drags: List[str], subs: Dict[str, float]) -> str:
    """Encouraging, NEVER judgmental, single-line headline."""
    if band == "thriving":
        return "Your money is in beautiful shape ✨"
    if band == "healthy":
        return "Steady rhythm — small wins compounding 🌱"
    if band == "stable":
        if "savings_trend" in drags:
            return "Spending is balanced. A small saving goal would lift this."
        return "You're holding ground. One nudge can move you up."
    if band == "stressed":
        if "recurring_burden" in drags:
            return "Subscriptions are eating quietly. Worth a 60-second audit."
        if "impulse_behavior" in drags:
            return "A few unplanned spends crept in. We've got you."
        return "A bumpy month — totally fixable, one decision at a time."
    # critical
    return "Tight stretch. Let's find one thing to soften the load."


# ────────────────────────────────────────────────────────────────────────
# 3) MONEY STORY — monthly recap, deterministic content
# ────────────────────────────────────────────────────────────────────────
@router.get("/money-story")
async def get_money_story(
    month: str = Query(default="", description="YYYY-MM, defaults to last full month"),
    user_id: str = Depends(get_current_user),
):
    """
    Generate a 5-panel monthly recap. Each panel is a self-contained
    story card the frontend can swipe through (Instagram-style).

    Panels:
        1. HERO          — total spent, money in, net delta
        2. TOP CATEGORY  — single dominant category w/ encouraging copy
        3. BEST WEEK     — least-spent week, gentle reinforcement
        4. SUBSCRIPTIONS — count + monthly drag
        5. SAVINGS DELTA — vs the previous month
    """
    # Resolve target month
    # NOTE: We deliberately build tz-NAIVE datetimes here because Mongo
    # returns dates as tz-naive on this deployment. The Mongo $gte/$lt
    # query handles the boundary cleanly, AND the in-Python partition
    # below (`start <= t["date"] < end`) needs both sides to share
    # tz-awareness.
    now = utc_now()
    if month and re.match(r"^\d{4}-\d{2}$", month):
        y, m = map(int, month.split("-"))
        start = datetime(y, m, 1)
    else:
        # Default = previous full calendar month
        first_of_this = datetime(now.year, now.month, 1)
        start = (first_of_this - timedelta(days=1)).replace(day=1)

    # End of target month
    if start.month == 12:
        end = datetime(start.year + 1, 1, 1)
    else:
        end = datetime(start.year, start.month + 1, 1)

    prev_start = (start - timedelta(days=1)).replace(day=1)

    cache_key = f"intelligence:story:{user_id}:{start.year}-{start.month:02d}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # Pull both windows in one query, then partition.
    all_txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": prev_start, "$lt": end},
    }).to_list(10000)

    cur = [t for t in all_txns if start <= t["date"] < end]
    prev = [t for t in all_txns if prev_start <= t["date"] < start]

    cur_in = sum(float(t["amount"]) for t in cur if t["type"] == "credit")
    cur_out = sum(float(t["amount"]) for t in cur if t["type"] == "debit")
    prev_in = sum(float(t["amount"]) for t in prev if t["type"] == "credit")
    prev_out = sum(float(t["amount"]) for t in prev if t["type"] == "debit")

    cur_net = cur_in - cur_out
    prev_net = prev_in - prev_out
    delta = cur_net - prev_net

    # Top category
    cat_totals: Dict[str, float] = {}
    for t in cur:
        if t["type"] == "debit":
            cat_totals[t.get("category", "Other")] = (
                cat_totals.get(t.get("category", "Other"), 0) + float(t["amount"])
            )
    top_cat = max(cat_totals.items(), key=lambda kv: kv[1]) if cat_totals else (None, 0)

    # Best (lowest-spend) ISO week within the month
    week_totals: Dict[int, float] = {}
    for t in cur:
        if t["type"] == "debit":
            wk = t["date"].isocalendar().week
            week_totals[wk] = week_totals.get(wk, 0.0) + float(t["amount"])
    best_week_total: float = 0.0
    best_week_label = "—"
    if week_totals:
        # Lowest-spend week of the month, but only if user actually had
        # multiple weeks of activity (otherwise meaningless).
        if len(week_totals) >= 2:
            wk, total = min(week_totals.items(), key=lambda kv: kv[1])
            best_week_total = total
            best_week_label = f"Week of ISO {wk}"
        else:
            # Single-week month: report the week we DO have.
            wk, total = next(iter(week_totals.items()))
            best_week_total = total
            best_week_label = f"Week of ISO {wk}"

    # Subscriptions in window
    sub_total = 0.0
    sub_count = 0
    keys: Dict[str, List[float]] = {}
    for t in cur:
        if t["type"] == "debit":
            keys.setdefault(_merchant_key(t.get("description", "")), []).append(float(t["amount"]))
    for k, amts in keys.items():
        if len(amts) >= 1:
            mer = _resolve_merchant(k)
            if mer["sub_score"] >= 0.6:
                sub_total += sum(amts)
                sub_count += 1

    # Build encouraging copy
    panels: List[Dict[str, Any]] = []

    panels.append({
        "kind": "hero",
        "title": start.strftime("%B %Y").upper(),
        "primary_value": cur_out,
        "primary_label": "spent",
        "secondary_value": cur_in,
        "secondary_label": "earned",
        "vibe": "neutral",
        "copy": (
            f"You moved ₹{int(cur_in + cur_out):,} in {start.strftime('%B')}."
            if (cur_in + cur_out) > 0
            else f"A quiet {start.strftime('%B')} — every clean slate is a fresh start."
        ),
    })

    if top_cat[0]:
        panels.append({
            "kind": "top_category",
            "title": "FAVOURITE CATEGORY",
            "category": top_cat[0],
            "amount": round(top_cat[1], 2),
            "share_pct": round((top_cat[1] / cur_out) * 100, 1) if cur_out else 0,
            "copy": _category_copy(top_cat[0], top_cat[1], cur_out),
            "vibe": "warm",
        })

    if best_week_total >= 0:
        panels.append({
            "kind": "best_week",
            "title": "MOST MINDFUL WEEK",
            "week_label": best_week_label,
            "amount": round(best_week_total, 2),
            "copy": (
                f"₹{int(best_week_total):,} that week — calm and intentional."
                if best_week_total > 0
                else "A truly restful stretch. Beautiful."
            ),
            "vibe": "cool",
        })

    panels.append({
        "kind": "subscriptions",
        "title": "QUIET DRIPS",
        "count": sub_count,
        "amount": round(sub_total, 2),
        "copy": (
            f"{sub_count} subscriptions \u00b7 ₹{int(sub_total):,} hummed in the background."
            if sub_count
            else "No subscription drips this month — clean slate."
        ),
        "vibe": "neutral",
    })

    panels.append({
        "kind": "savings_delta",
        "title": "VS LAST MONTH",
        "current_net": round(cur_net, 2),
        "previous_net": round(prev_net, 2),
        "delta": round(delta, 2),
        "copy": _delta_copy(delta, prev_net),
        "vibe": "warm" if delta >= 0 else "cool",
    })

    result = {
        "month": start.strftime("%Y-%m"),
        "month_label": start.strftime("%B %Y"),
        "panels": panels,
        "totals": {
            "in": round(cur_in, 2),
            "out": round(cur_out, 2),
            "net": round(cur_net, 2),
        },
        "tx_count": len(cur),
    }
    cache_set(cache_key, result, ttl_seconds=600)
    return result


def _category_copy(cat: str, amount: float, total: float) -> str:
    """Encouraging line for the top category panel."""
    pct = (amount / total) * 100 if total else 0
    base = f"₹{int(amount):,}"
    soft_tones = {
        "Food":            f"{base} of comfort food this month 🍱",
        "Transport":       f"{base} keeping you moving 🚕",
        "Shopping":        f"{base} treats to yourself 🛍️",
        "Entertainment":   f"{base} of joy and unwind time 🎬",
        "Bills":           f"{base} on essentials — quietly responsible 🧾",
        "Groceries":       f"{base} feeding the home 🥬",
        "Health":          f"{base} investing in wellness 💪",
    }
    return soft_tones.get(cat, f"{base} on {cat or 'this category'}.")


def _delta_copy(delta: float, prev_net: float) -> str:
    """Encouraging line for the month-over-month savings panel."""
    if delta == 0:
        return "Steady as last month — discipline pays compound 🌱"
    if delta > 0:
        return f"₹{int(delta):,} more saved than last month 🎉"
    # delta < 0
    diff = abs(delta)
    if prev_net > 0:
        return f"A softer month — ₹{int(diff):,} below last. Recovery starts simple."
    return f"A softer month — ₹{int(diff):,} dip. We'll bounce 🌤️"



# ────────────────────────────────────────────────────────────────────────
# 4) BEHAVIORAL FINANCE ENGINE — SLICE B
# ────────────────────────────────────────────────────────────────────────
@router.get("/behavior")
async def get_behavior(user_id: str = Depends(get_current_user)):
    """
    Behavioral finance engine — surfaces 4 patterns from the last 60 days:

        • LATE NIGHT IMPULSE   — debits between 23:00 and 03:59 local,
                                 grouped by category. Encouraging tone.
        • WEEKEND OVERSPEND    — avg-spend-per-day Sat-Sun vs Mon-Fri.
                                 Returns ratio + delta.
        • PAYDAY INFLATION     — spend within 3 days after a credit
                                 (₹15k+) vs the rest of the month.
        • STRESS PATTERN       — z-score spike days (one-day spend
                                 > 1.5σ above 30-day mean).

    Each pattern carries:
        confidence  (0..1)
        signal_text (short headline)
        copy        (encouraging body — never judgmental)
        evidence    (raw counts so the UI can render "Why am I seeing this?")

    Patterns with confidence < 0.4 are returned but flagged
    `is_active=False`, so the frontend can decide whether to surface
    them (default: skip).

    Deterministic. No LLM.
    """
    cache_key = f"intelligence:behavior:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    horizon = utc_now() - timedelta(days=60)
    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": horizon},
    }).to_list(10000)

    debits = [t for t in txns if t.get("type") == "debit"]
    credits = [t for t in txns if t.get("type") == "credit"]

    insights: List[Dict[str, Any]] = []

    # ── LATE NIGHT IMPULSE ──────────────────────────────────────
    night_txns = [t for t in debits if 0 <= t["date"].hour < 4 or t["date"].hour >= 23]
    night_total = sum(float(t["amount"]) for t in night_txns)
    night_share = (len(night_txns) / max(1, len(debits)))
    night_cats: Dict[str, float] = {}
    for t in night_txns:
        cat = t.get("category") or "Other"
        night_cats[cat] = night_cats.get(cat, 0.0) + float(t["amount"])
    top_night_cat = max(night_cats.items(), key=lambda kv: kv[1]) if night_cats else (None, 0.0)
    night_conf = min(1.0, night_share * 4.0)  # 25% of txns being nighttime → conf 1.0
    insights.append({
        "kind": "late_night_impulse",
        "title": "Late-night spends",
        "emoji": "🌙",
        "is_active": night_conf >= 0.4 and len(night_txns) >= 3,
        "confidence": round(night_conf, 3),
        "signal_text": (
            f"₹{int(night_total):,} between 11pm and 4am"
            if night_total > 0 else "Quiet nights — nothing after 11pm"
        ),
        "copy": (
            (f"{top_night_cat[0]} was your night-time comfort zone. "
             f"Worth a soft cap before you sleep.")
            if top_night_cat[0] and night_total > 0
            else "Your nights look calm. That's its own kind of saving."
        ),
        "evidence": {
            "txn_count": len(night_txns),
            "total_amount": round(night_total, 2),
            "top_category": top_night_cat[0],
            "top_category_amount": round(top_night_cat[1], 2),
            "share_of_all_debits": round(night_share, 3),
        },
    })

    # ── WEEKEND OVERSPEND ───────────────────────────────────────
    week_buckets: Dict[int, float] = {}  # 0..6 (Mon..Sun)
    week_counts: Dict[int, int] = {}
    for t in debits:
        wd = t["date"].weekday()
        week_buckets[wd] = week_buckets.get(wd, 0.0) + float(t["amount"])
        week_counts[wd] = week_counts.get(wd, 0) + 1
    weekend_total = sum(week_buckets.get(d, 0) for d in (5, 6))
    weekday_total = sum(week_buckets.get(d, 0) for d in (0, 1, 2, 3, 4))
    weekend_days = sum(1 for d in (5, 6) if week_counts.get(d, 0) > 0)
    weekday_days = sum(1 for d in (0, 1, 2, 3, 4) if week_counts.get(d, 0) > 0)
    we_avg = (weekend_total / weekend_days) if weekend_days else 0.0
    wd_avg = (weekday_total / weekday_days) if weekday_days else 0.0
    if wd_avg > 0:
        ratio = we_avg / wd_avg
    else:
        ratio = 1.0
    weekend_conf = min(1.0, max(0.0, (ratio - 1.0) / 1.5))  # ratio=2.5 → conf=1.0
    insights.append({
        "kind": "weekend_overspend",
        "title": "Weekend lift",
        "emoji": "🎉",
        "is_active": weekend_conf >= 0.35 and weekend_days >= 2,
        "confidence": round(weekend_conf, 3),
        "signal_text": (
            f"Weekends spend {round((ratio - 1) * 100)}% more"
            if ratio > 1.05
            else "Weekends look balanced"
        ),
        "copy": (
            "Saturdays seem to be your treat-yourself days. "
            "A small Friday-night intention can shape Monday's mood."
            if ratio > 1.2
            else "Your weekends aren't running away from you. Solid rhythm."
        ),
        "evidence": {
            "weekend_avg_per_day":  round(we_avg, 2),
            "weekday_avg_per_day":  round(wd_avg, 2),
            "ratio":                round(ratio, 3),
            "weekend_total":        round(weekend_total, 2),
            "weekday_total":        round(weekday_total, 2),
        },
    })

    # ── PAYDAY INFLATION ────────────────────────────────────────
    big_credits = [
        c for c in credits
        if float(c.get("amount", 0)) >= 15000
    ]
    payday_total = 0.0
    payday_count = 0
    for c in big_credits:
        cd = c["date"]
        for t in debits:
            gap = (t["date"] - cd).days
            if 0 <= gap <= 3:
                payday_total += float(t["amount"])
                payday_count += 1
    other_total = max(0.0, sum(float(t["amount"]) for t in debits) - payday_total)
    other_count = max(0, len(debits) - payday_count)
    pday_avg = (payday_total / max(1, payday_count)) if payday_count else 0
    other_avg = (other_total / max(1, other_count)) if other_count else 0
    pday_ratio = (pday_avg / other_avg) if other_avg > 0 else 1.0
    pday_conf = min(1.0, max(0.0, (pday_ratio - 1.0) / 2.0))
    insights.append({
        "kind": "payday_inflation",
        "title": "Payday lift",
        "emoji": "💸",
        "is_active": pday_conf >= 0.35 and payday_count >= 3 and len(big_credits) >= 1,
        "confidence": round(pday_conf, 3),
        "signal_text": (
            f"₹{int(payday_total):,} spent in the 3 days after each big credit"
            if payday_total > 0 else "No payday spike yet"
        ),
        "copy": (
            "The first 72 hours after payday tend to set the month's tone. "
            "Even a 10% transfer to savings on day-one compounds quietly."
            if pday_ratio > 1.4
            else "Your post-payday spend looks paced. That's discipline."
        ),
        "evidence": {
            "credit_events":       len(big_credits),
            "payday_total":        round(payday_total, 2),
            "payday_avg_per_txn":  round(pday_avg, 2),
            "other_avg_per_txn":   round(other_avg, 2),
            "ratio":               round(pday_ratio, 3),
        },
    })

    # ── STRESS PATTERN (z-score spike days) ─────────────────────
    daily_spend: Dict[str, float] = {}
    for t in debits:
        iso = t["date"].strftime("%Y-%m-%d")
        daily_spend[iso] = daily_spend.get(iso, 0.0) + float(t["amount"])
    spike_days: List[Dict[str, Any]] = []
    if len(daily_spend) >= 7:
        vals = list(daily_spend.values())
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = math.sqrt(var) or 1.0
        for d, v in daily_spend.items():
            z = (v - mean) / std
            if z >= 1.5:
                spike_days.append({"date": d, "amount": round(v, 2), "z": round(z, 2)})
        spike_days.sort(key=lambda x: -x["amount"])
    stress_conf = min(1.0, len(spike_days) / 5.0)
    insights.append({
        "kind": "stress_pattern",
        "title": "Bumpy days",
        "emoji": "🌊",
        "is_active": stress_conf >= 0.4 and len(spike_days) >= 2,
        "confidence": round(stress_conf, 3),
        "signal_text": (
            f"{len(spike_days)} spend spike{'s' if len(spike_days)!=1 else ''} this window"
            if spike_days else "Even rhythm — no spikes"
        ),
        "copy": (
            "A few days carried more weight than others. "
            "If you can name the trigger for one of them, you've already won the next."
            if spike_days
            else "Your spend pattern is even and intentional. Beautiful."
        ),
        "evidence": {
            "spike_count": len(spike_days),
            "top_spikes":  spike_days[:3],
            "daily_mean":  round(sum(daily_spend.values()) / max(1, len(daily_spend)), 2),
        },
    })

    # Sort: active first, then by confidence
    insights.sort(key=lambda i: (not i["is_active"], -i["confidence"]))

    # Headline pattern (most active+confident insight)
    headline_pattern = next((i for i in insights if i["is_active"]), None)

    result = {
        "insights": insights,
        "active_count": sum(1 for i in insights if i["is_active"]),
        "headline":     (headline_pattern or {}).get("signal_text"),
        "headline_kind": (headline_pattern or {}).get("kind"),
        "window_days":  60,
        "tx_count":     len(txns),
        "tone":         "encouraging",
    }
    cache_set(cache_key, result, ttl_seconds=240)
    return result


# ────────────────────────────────────────────────────────────────────────
# 5) PREDICTIVE CASH FLOW — SLICE D
# ────────────────────────────────────────────────────────────────────────
@router.get("/cashflow")
async def get_cashflow(user_id: str = Depends(get_current_user)):
    """
    Forward-looking cash-flow projection. Deterministic, no LLM.

    Inputs (last 30 days from today):
        avg_daily_burn  = total_debits / 30
        recurring_bills = monthly cost of detected subscriptions due
                          before EOM (from /intelligence/subscriptions logic)

    Outputs:
        days_to_eom     — int, days remaining in current month
        projected_spend = avg_daily_burn × days_to_eom + upcoming_bills
        projected_in    = expected_credits guessed from last-month inflow rhythm
                          (deterministic projection — last month inflow ÷ 30 ×
                          days_to_eom; conservative)
        projected_net   = projected_in - projected_spend
        bill_alerts     — array of upcoming subscription charges within 7 days
        low_balance     — bool, projected_net < 0
        copy            — encouraging headline
    """
    cache_key = f"intelligence:cashflow:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    now = utc_now()
    today_naive = datetime(now.year, now.month, now.day)

    # Days remaining in current month
    if today_naive.month == 12:
        first_next = datetime(today_naive.year + 1, 1, 1)
    else:
        first_next = datetime(today_naive.year, today_naive.month + 1, 1)
    days_to_eom = max(1, (first_next - today_naive).days)

    # Pull last 60 days for stable averages.
    # IMPORTANT: cutoffs MUST be tz-NAIVE because Motor returns t["date"]
    # as tz-naive on this deployment (same fix we applied to /money-story).
    now_naive = datetime(now.year, now.month, now.day, now.hour, now.minute, now.second)
    horizon = now_naive - timedelta(days=60)
    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": horizon},
    }).to_list(10000)

    debits = [t for t in txns if t.get("type") == "debit"]
    credits = [t for t in txns if t.get("type") == "credit"]

    last30_cutoff = now_naive - timedelta(days=30)
    last30_debits = [t for t in debits if t["date"] >= last30_cutoff]
    last30_credits = [t for t in credits if t["date"] >= last30_cutoff]

    total_out_30 = sum(float(t["amount"]) for t in last30_debits)
    total_in_30 = sum(float(t["amount"]) for t in last30_credits)

    avg_daily_burn = total_out_30 / 30.0 if total_out_30 > 0 else 0.0
    avg_daily_in = total_in_30 / 30.0 if total_in_30 > 0 else 0.0

    # ── Detect upcoming subscription bills (reuse /subscriptions logic) ──
    long_horizon = now_naive - timedelta(days=180)
    long_txns = [t for t in debits if t["date"] >= long_horizon]
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for t in long_txns:
        k = _merchant_key(t.get("description", ""))
        if not k:
            continue
        buckets.setdefault(k, []).append(t)

    bill_alerts: List[Dict[str, Any]] = []
    upcoming_bills_total = 0.0
    for key, items in buckets.items():
        if len(items) < 2:
            continue
        months = {(it["date"].year, it["date"].month) for it in items if it.get("date")}
        if len(months) < 2:
            continue
        amounts = [float(it["amount"]) for it in items]
        mean = sum(amounts) / len(amounts) if amounts else 0
        merchant = _resolve_merchant(items[0].get("description", ""))
        if merchant["sub_score"] < 0.6:
            continue
        # Predict next charge
        sorted_items = sorted(items, key=lambda x: x["date"])
        gaps = [
            (sorted_items[i]["date"] - sorted_items[i - 1]["date"]).days
            for i in range(1, len(sorted_items))
            if 5 <= (sorted_items[i]["date"] - sorted_items[i - 1]["date"]).days <= 95
        ]
        median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 30
        last_seen = sorted_items[-1]["date"]
        next_pred = last_seen + timedelta(days=median_gap)

        days_until = (next_pred - today_naive).days
        if 0 <= days_until <= days_to_eom:
            upcoming_bills_total += mean
            if days_until <= 7:
                bill_alerts.append({
                    "merchant":      merchant["label"],
                    "emoji":         merchant["emoji"],
                    "amount":        round(mean, 2),
                    "due_iso":       next_pred.isoformat(),
                    "days_until":    days_until,
                    "category":      merchant["category"],
                })

    bill_alerts.sort(key=lambda b: b["days_until"])

    projected_spend = avg_daily_burn * days_to_eom + max(0.0, upcoming_bills_total - avg_daily_burn * days_to_eom * 0.0)
    # ↑ The added bills are baked into avg_daily_burn already (since they happened
    # in the last 30d). Don't double count — use just the daily burn projection.
    projected_spend = avg_daily_burn * days_to_eom
    projected_in = avg_daily_in * days_to_eom
    projected_net = projected_in - projected_spend

    # Headline copy — encouraging, never judgmental
    if projected_net >= 0:
        copy = (
            f"On the current rhythm, you'll close the month with about "
            f"₹{int(projected_net):,} headroom. Steady."
        )
        vibe = "warm"
    elif avg_daily_in == 0:
        copy = (
            f"At ₹{int(avg_daily_burn):,}/day, you'll run ~₹{int(abs(projected_net)):,} "
            f"short of last month's pace. A small recurring transfer in fixes this."
        )
        vibe = "cool"
    else:
        copy = (
            f"Spend is outpacing income by ~₹{int(abs(projected_net)):,} this month. "
            f"One ₹{int(avg_daily_burn / 4):,}/day pull-back would close the gap."
        )
        vibe = "cool"

    result = {
        "days_to_eom":          days_to_eom,
        "avg_daily_burn":       round(avg_daily_burn, 2),
        "avg_daily_in":         round(avg_daily_in, 2),
        "projected_spend":      round(projected_spend, 2),
        "projected_in":         round(projected_in, 2),
        "projected_net":        round(projected_net, 2),
        "upcoming_bills_total": round(upcoming_bills_total, 2),
        "bill_alerts":          bill_alerts,
        "low_balance":          projected_net < 0,
        "copy":                 copy,
        "vibe":                 vibe,
        "window_days":          30,
        "tx_count":             len(txns),
    }
    cache_set(cache_key, result, ttl_seconds=300)
    return result
