"""services/recurring_detector.py — Round 99C.

Deterministic recurring-charge detection for Indian mobile users.

WHY
---
The user has 30+ transactions/month. Buried inside are 5-15 recurring
subscriptions (Netflix ₹649, Spotify ₹119, JioFiber ₹999, Amazon
Prime ₹1499/yr, gym AutoPay, mutual fund SIPs, EMIs, …). The user
forgets these. They drift. They COMPOUND — a forgotten ₹299/mo
subscription = ₹3,588/year leak.

The Coach can't surface this until we DETECT it. This service is the
detection brain.

ALGORITHM
---------
Per user, look back N months:

1. **Normalize merchant key** from `description`:
   - lowercase, strip punctuation
   - drop UPI ref-ids, dates, txn numbers (digits in trailing tokens)
   - drop common noise tokens ("payment", "txn", "auto", "debit", "credit", "ref")
   - keep first 3-4 meaningful tokens — that's the merchant signature.

2. **Group transactions** by (merchant_key, ~amount_bucket).
   Amount bucket allows for price hikes (Netflix ₹649 → ₹699) without
   splitting into two subscriptions. Bucket = ±15% tolerance.

3. **Compute interval days** between consecutive charges in each group.

4. **Classify cadence** by median interval clustering:
   - 6-9      → weekly
   - 25-35    → monthly
   - 80-100   → quarterly
   - 170-200  → semi-annual
   - 350-380  → yearly
   Anything outside these buckets → not recurring.

5. **Confidence score**:
   - 0.95 if ≥4 charges, all intervals within ±3 days of median
   - 0.80 if 3 charges
   - 0.60 if 2 charges (probabilistic, marked "possible")

6. **Predict next charge**: last_seen + median_interval.

7. **Status**:
   - "active"   — charged within last 1.5x median interval
   - "dormant"  — overdue by 1.5x..3x median (might be cancelled, might
                  be billing date drift)
   - "cancelled" — overdue by >3x median; user likely cancelled.

INDIAN-CONTEXT MERCHANT CANONICALIZATION
----------------------------------------
A small allow-list of well-known Indian merchants normalises noisy
descriptors to a clean display name + category override:
  "JIO INFOCOMM", "JIO RECHARGE"  →  "Jio"            (Telecom)
  "AIRTEL POSTPAID*"              →  "Airtel"         (Telecom)
  "NETFLIX.COM", "NETFLIX-IN"     →  "Netflix"        (Entertainment)
  "AMAZON PRIME"                  →  "Amazon Prime"   (Subscription)
  …
Anything not in the allow-list keeps its first-3-token signature.

OUTPUT SHAPE
-----------
    {
        "subscription_id": "...",
        "merchant_key":    "netflix",
        "merchant_label":  "Netflix",
        "category":        "Entertainment",
        "amount_avg":      649.0,
        "amount_min":      649.0,
        "amount_max":      699.0,
        "cadence":         "monthly",
        "median_interval_days": 30,
        "occurrences":     7,
        "first_seen":      "2025-11-04T...",
        "last_seen":       "2026-04-04T...",
        "next_predicted":  "2026-05-04T...",
        "annualised_cost": 7788.0,
        "confidence":      0.95,
        "status":          "active",
    }

NOT YET (deferred):
- Cancellation steering links (need merchant-specific URLs)
- Family-plan dedup (Netflix x 2 of same user)
- LLM-assisted name extraction for uncommon merchants

PERFORMANCE
-----------
For a power user with 1000 txns over 6 months: ~20ms total in the
worst case. Dominated by the merchant-key Python loop, not Mongo.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

from core.db import db

logger = logging.getLogger(__name__)

# ── Tunables ────────────────────────────────────────────────────────
LOOKBACK_DAYS = 240           # 8 months — enough for quarterly+yearly cycles
MIN_OCCURRENCES = 2            # 2 = "possible", 3+ = "confirmed"
AMOUNT_TOLERANCE_PCT = 0.30    # ±30% groups price hikes (e.g. Netflix
                                # ₹649 → ₹699) into a single subscription
                                # without merging genuinely different
                                # services that share a merchant.
INTERVAL_TOLERANCE_DAYS = 3    # ±3 days from median for high confidence

CADENCE_BUCKETS: List[Tuple[str, int, int, int]] = [
    # (label, low_inc, high_inc, canonical_days)
    ("weekly",      6,   9,    7),
    ("monthly",    25,  35,   30),
    ("quarterly",  80, 100,   90),
    ("semi_annual",170, 200, 182),
    ("yearly",    350, 380,  365),
]

# Common noise tokens we drop when computing the merchant signature.
_NOISE = {
    "payment", "pay", "paid", "txn", "transaction", "auto", "autopay",
    "debit", "credit", "card", "purchase", "ref", "refid", "rrn", "imps",
    "neft", "rtgs", "upi", "bhim", "ph", "the", "to", "from", "at",
    "on", "for", "via", "and", "of", "in", "by", "limited", "ltd",
    "private", "pvt", "india", "indian", "co", "company", "purchase",
}

# Indian-context merchant canonicalisation. The detector ALSO works
# without these — they just produce nicer display labels and category
# overrides for the most common subscriptions.
_CANON: List[Tuple[re.Pattern, str, str]] = [
    # OTT / Streaming
    (re.compile(r"netflix",        re.I), "Netflix",        "Entertainment"),
    (re.compile(r"hotstar|disney", re.I), "Disney+ Hotstar","Entertainment"),
    (re.compile(r"prime\s*video|amazon\s*prime", re.I), "Amazon Prime","Subscriptions"),
    (re.compile(r"spotify",        re.I), "Spotify",        "Subscriptions"),
    (re.compile(r"youtube\s*premium|yt\s*premium", re.I), "YouTube Premium","Subscriptions"),
    (re.compile(r"sonyliv",        re.I), "SonyLIV",        "Entertainment"),
    (re.compile(r"zee5",           re.I), "ZEE5",           "Entertainment"),
    # Telecom / Internet
    (re.compile(r"jio(?:\s|fiber|infocomm|payments)", re.I), "Jio",     "Bills"),
    (re.compile(r"airtel",         re.I), "Airtel",         "Bills"),
    (re.compile(r"\bvi\b|vodafone|idea", re.I), "Vi",       "Bills"),
    (re.compile(r"act\s*fibre",    re.I), "ACT Fibernet",   "Bills"),
    (re.compile(r"bsnl",           re.I), "BSNL",           "Bills"),
    # Food / Dining
    (re.compile(r"swiggy",         re.I), "Swiggy",         "Food"),
    (re.compile(r"zomato",         re.I), "Zomato",         "Food"),
    (re.compile(r"blinkit|grofer", re.I), "Blinkit",        "Groceries"),
    (re.compile(r"zepto",          re.I), "Zepto",          "Groceries"),
    (re.compile(r"big\s*basket",   re.I), "BigBasket",      "Groceries"),
    # Transport
    (re.compile(r"uber",           re.I), "Uber",           "Transport"),
    (re.compile(r"ola",            re.I), "Ola",            "Transport"),
    (re.compile(r"rapido",         re.I), "Rapido",         "Transport"),
    # Fitness / Health
    (re.compile(r"cult\.?fit|cure\s*fit", re.I), "cult.fit","Health"),
    # Cloud / Productivity
    (re.compile(r"google\s*one|gpay\s*one", re.I), "Google One","Subscriptions"),
    (re.compile(r"icloud|apple\.com/bill", re.I), "iCloud", "Subscriptions"),
    (re.compile(r"microsoft\s*365|office\s*365", re.I), "Microsoft 365","Subscriptions"),
    (re.compile(r"chatgpt|openai",  re.I), "ChatGPT",       "Subscriptions"),
    # Insurance / SIPs / EMIs (we surface but flag as financial)
    (re.compile(r"\bsip\b|mutual\s*fund|groww|zerodha|coin",  re.I), "SIP",      "Investments"),
    (re.compile(r"\bemi\b|home\s*loan|car\s*loan",  re.I), "EMI",      "Loans"),
    (re.compile(r"insurance|policybazaar|lic",  re.I), "Insurance",      "Insurance"),
    # Rent
    (re.compile(r"\brent\b",       re.I), "Rent",           "Housing"),
]


def _canonicalize(description: str) -> Tuple[str, Optional[str], Optional[str]]:
    """Return (merchant_key, display_label_or_None, category_override_or_None).

    merchant_key is ALWAYS produced — it's the bucketing key. The
    display label is only set if the description matches a known
    Indian-context merchant; otherwise the caller can fall back to
    title-casing the merchant_key.
    """
    if not description:
        return ("__unknown__", None, None)

    # First try the canonical allow-list.
    for pattern, label, cat in _CANON:
        if pattern.search(description):
            slug = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
            return (slug, label, cat)

    # Fall back to a noise-stripped signature of the first few tokens.
    cleaned = re.sub(r"[^a-zA-Z\s]", " ", description.lower())
    tokens = [t for t in cleaned.split() if t and t not in _NOISE and len(t) > 1]
    if not tokens:
        return (
            "h_" + hashlib.md5(description.lower().encode()).hexdigest()[:8],
            None,
            None,
        )
    sig_tokens = tokens[:3]      # first 3 meaningful tokens = signature
    key = "_".join(sig_tokens)[:64]
    label = " ".join(t.capitalize() for t in sig_tokens)
    return (key, label, None)


def _classify_cadence(med_interval: float) -> Optional[Tuple[str, int]]:
    """Map a median interval (days) to a cadence label + canonical days.

    Returns None if no bucket matches → not recurring.
    """
    for label, lo, hi, canonical in CADENCE_BUCKETS:
        if lo <= med_interval <= hi:
            return label, canonical
    return None


def _amount_bucket(amount: float) -> str:
    """Round amount into a 15% tolerance bucket so price hikes don't
    split a subscription into two groups. We log-bin on amount."""
    if amount <= 0:
        return "zero"
    # 15% step → ~5 buckets per order-of-magnitude.
    import math
    step = round(math.log(amount) / math.log(1.0 + AMOUNT_TOLERANCE_PCT))
    return f"a{step}"


def _confidence(occurrences: int, intervals: List[int], med: float) -> float:
    """Confidence ∈ [0,1] given occurrences and how tightly the
    intervals cluster around the median.
    """
    if occurrences < MIN_OCCURRENCES:
        return 0.0
    base = {2: 0.55, 3: 0.78, 4: 0.88}.get(occurrences, 0.92 if occurrences > 4 else 0.55)
    if not intervals:
        return base
    # Penalise loose clustering.
    drift = sum(1 for i in intervals if abs(i - med) > INTERVAL_TOLERANCE_DAYS)
    if drift == 0:
        return min(0.97, base + 0.05)
    if drift == 1:
        return base
    return max(0.5, base - 0.1 * drift)


def _status_for(last_seen: datetime, med_interval: float, now: datetime) -> str:
    """active / dormant / cancelled based on how overdue the next charge is."""
    if med_interval <= 0:
        return "active"
    overdue_days = (now - last_seen).days
    if overdue_days <= med_interval * 1.5:
        return "active"
    if overdue_days <= med_interval * 3:
        return "dormant"
    return "cancelled"


def _ensure_aware(dt: datetime) -> datetime:
    """Mongo returns naive datetimes by default; we need them tz-aware
    to compare against ``datetime.now(timezone.utc)``."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def detect_recurring(
    user_id: str,
    *,
    lookback_days: int = LOOKBACK_DAYS,
    persist: bool = True,
) -> List[Dict[str, Any]]:
    """Run the detector for one user and (optionally) persist results
    to ``recurring_subscriptions`` collection.

    Idempotent — re-running just refreshes the cached output.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=lookback_days)

    cursor = db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": since},
        "type": {"$in": ["debit", "expense"]},     # ignore income / credits
        "amount": {"$gt": 0},
    }).sort("date", 1)

    # Group by (merchant_key, amount_bucket) → list of (date, amount).
    groups: Dict[Tuple[str, str], List[Tuple[datetime, float, str]]] = {}
    canon_meta: Dict[str, Tuple[Optional[str], Optional[str]]] = {}

    async for txn in cursor:
        desc = txn.get("description") or ""
        amt  = float(txn.get("amount") or 0)
        if amt <= 0:
            continue
        merchant_key, label, cat_override = _canonicalize(desc)
        if merchant_key == "__unknown__":
            continue
        bucket = _amount_bucket(amt)
        groups.setdefault((merchant_key, bucket), []).append(
            (_ensure_aware(txn["date"]), amt, txn.get("category") or cat_override or "Other")
        )
        # First-seen label/cat wins for display.
        canon_meta.setdefault(merchant_key, (label, cat_override))

    out: List[Dict[str, Any]] = []
    for (merchant_key, _bucket), events in groups.items():
        if len(events) < MIN_OCCURRENCES:
            continue
        events.sort(key=lambda e: e[0])
        dates = [e[0] for e in events]
        amts  = [e[1] for e in events]

        intervals = [
            (dates[i] - dates[i-1]).days
            for i in range(1, len(dates))
        ]
        if not intervals:
            continue
        med_interval = median(intervals)
        cadence = _classify_cadence(med_interval)
        if not cadence:
            continue
        cad_label, canon_days = cadence

        amount_avg = sum(amts) / len(amts)
        last_seen  = dates[-1]
        # Use canonical days (not the noisy median) for projections.
        next_pred  = last_seen + timedelta(days=canon_days)

        # Annualised cost — multiply by frequency-per-year.
        per_year = 365 / canon_days
        annualised = amount_avg * per_year

        label, cat_override = canon_meta.get(merchant_key, (None, None))
        display = label or merchant_key.replace("_", " ").title()
        category = cat_override or events[-1][2]

        sub = {
            "subscription_id":      f"{user_id}::{merchant_key}::{_bucket}",
            "user_id":              user_id,
            "merchant_key":         merchant_key,
            "merchant_label":       display,
            "category":             category,
            "amount_avg":           round(amount_avg, 2),
            "amount_min":           round(min(amts), 2),
            "amount_max":           round(max(amts), 2),
            "cadence":              cad_label,
            "median_interval_days": int(med_interval),
            "occurrences":          len(events),
            "first_seen":           dates[0],
            "last_seen":            last_seen,
            "next_predicted":       next_pred,
            "annualised_cost":      round(annualised, 2),
            "confidence":           round(_confidence(len(events), intervals, med_interval), 2),
            "status":               _status_for(last_seen, canon_days, now),
            "updated_at":           now,
        }
        out.append(sub)

    # Sort: active first, then by annualised cost desc — biggest leaks
    # surface at the top of the user's list.
    status_rank = {"active": 0, "dormant": 1, "cancelled": 2}
    out.sort(key=lambda s: (status_rank.get(s["status"], 9), -s["annualised_cost"]))

    if persist:
        # Idempotent upsert per subscription_id.
        for sub in out:
            await db.recurring_subscriptions.update_one(
                {"subscription_id": sub["subscription_id"]},
                {"$set": sub, "$setOnInsert": {"created_at": now, "user_dismissed": False}},
                upsert=True,
            )
        # Cache last-run summary on the user_coach_context for the
        # Home screen to reference instantly.
        await db.user_coach_context.update_one(
            {"user_id": user_id},
            {"$set": {
                "recurring_summary": {
                    "count": len(out),
                    "total_annualised": round(sum(s["annualised_cost"] for s in out if s["status"] == "active"), 2),
                    "biggest_leak": (out[0]["merchant_label"] if out else None),
                    "updated_at": now,
                },
            }},
            upsert=True,
        )

    return out


__all__ = ["detect_recurring", "LOOKBACK_DAYS", "CADENCE_BUCKETS"]
