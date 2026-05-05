"""
services/onboarding_seed.py — Round 98.

Seeds `user_coach_context` immediately after income capture so the
user's FIRST Home render has:
  • A neutral diagnostic score (50/100) with build-baseline headline
  • A peer anchor ("people earning ₹XX save Y%")
  • 3 pre-computed starter action cards (no LLM — instant paint)

Panel directive: TTFV (time-to-first-value) must be < 45s. This
service is the backend half of that budget — it runs in <50ms and
every output is deterministic.
"""
from __future__ import annotations

from typing import Any

from core import db
from core.time import utc_now


# ── Peer anchors from RBI + NPCI consumption-basket surveys. ───────────
# Income band (monthly) → typical savings-rate percentile.
_PEER_BANDS: list[tuple[int, int, int, str]] = [
    # (lo, hi, typical_savings_pct, anchor_copy)
    (0,      25_000,  8,  "Households in this band save just 8% on average."),
    (25_000, 50_000,  12, "Households earning like you save 12% on average — you can do more."),
    (50_000, 100_000, 18, "Peers at this income save 18% on average. Top 25% save 30%+."),
    (100_000,200_000, 22, "Peers earning like you save 22% on average. Top 25% hit 35%+."),
    (200_000,10_000_000, 30, "High-earners peer average: 30% savings rate."),
]


def _peer_anchor(income: int) -> tuple[int, str]:
    for lo, hi, pct, copy in _PEER_BANDS:
        if lo <= income < hi:
            return pct, copy
    return 15, "Building your baseline."


def _starter_cards(income: int) -> list[dict[str, Any]]:
    """Deterministic starter pack based purely on income band.

    The first card is ALWAYS a budget cap on the category most users
    in this band over-spend (food for mid/low, discretionary for high).
    The second is a goal seed (emergency fund is universal).
    The third is the data-import hook that monetizes.
    """
    if income < 50_000:
        food_cap = int(income * 0.18)     # 18% of take-home
        ef_target = int(income * 3)        # 3-mo emergency fund
    elif income < 150_000:
        food_cap = int(income * 0.15)
        ef_target = int(income * 6)
    else:
        food_cap = int(income * 0.12)
        ef_target = int(income * 6)

    return [
        {
            "kind": "set_budget_cap",
            "label": f"Cap food at ₹{food_cap:,}/mo",
            "endpoint": "/api/budgets",
            "method": "POST",
            "payload": {"category": "food", "amount": food_cap},
            "projected_impact": max(1000, int(food_cap * 0.10)),
            "projected_label": f"+₹{max(1000, int(food_cap * 0.10)):,} projected this month",
            "confidence": 0.85,
            "reason": "Food is the #1 leak for your income band. Cap first, tune later.",
            "rank": 0,
        },
        {
            "kind": "create_goal",
            "label": f"Open Emergency Fund · ₹{ef_target:,}",
            "endpoint": "/api/goals",
            "method": "POST",
            "payload": {"name": "Emergency Fund", "target_amount": ef_target},
            "projected_impact": 0,
            "projected_label": "Peace of mind in 6 months",
            "confidence": 0.95,
            "reason": "6-month expenses liquid. Never borrow for emergencies again.",
            "rank": 1,
        },
        {
            "kind": "import_sms",
            "label": "Turn on SMS auto-import",
            "endpoint": "/api/permissions/grant",
            "method": "POST",
            "payload": {"kind": "sms"},
            "projected_impact": 0,
            "projected_label": "Unlocks your real diagnostic score",
            "confidence": 1.0,
            "reason": "Without this, we can't find your real leaks.",
            "rank": 2,
        },
    ]


async def seed_user_coach_context(user_id: str, income: int) -> dict[str, Any]:
    """Idempotent seed. Safe to call on every onboarding complete."""
    peer_pct, peer_copy = _peer_anchor(income)
    cards = _starter_cards(income)

    doc = {
        "user_id": user_id,
        "income_monthly": int(income),
        "peer_anchor_pct": peer_pct,
        "peer_anchor_copy": peer_copy,
        "starter_cards": cards,
        "diagnostic_seed": {
            "score": 50,
            "delta_week": 0,
            "percentile": 50,
            "percentile_basis": "insufficient_history",
            "history_count": 0,
            "weakest_category": None,
            "headline": {
                "score_line": "50 · building your baseline",
                "percentile_line": peer_copy,
                "weakest_line": "Import SMS to find your real leak",
            },
        },
        "seeded_at": utc_now(),
    }
    await db.user_coach_context.update_one(
        {"user_id": user_id},
        {"$set": doc},
        upsert=True,
    )
    # Stamp income on the user doc so downstream features read it cheap.
    from bson import ObjectId
    try:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"income_monthly": int(income)}},
        )
    except Exception:    # noqa: BLE001
        pass
    return doc


__all__ = ["seed_user_coach_context"]
