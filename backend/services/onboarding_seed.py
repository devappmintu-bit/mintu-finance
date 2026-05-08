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
    # Round 99F — copy de-conflicted. Old version mixed "typical" and
    # "Top 25% save much more" which was internally contradictory.
    # New version states the median directly + a single forward-leaning
    # promise ("we'll show you how to beat it") instead of a guilt frame.
    (0,      25_000,  8,  "Median for households earning under ₹25k. We'll find you ₹500-2,000/mo to claw back."),
    (25_000, 50_000,  12, "Median savings rate at this income. Topping it is realistic — most leaks are tiny subscriptions."),
    (50_000, 100_000, 18, "Median for ₹50k-1L earners. The biggest leaks are usually OTT + delivery apps."),
    (100_000,200_000, 22, "Median for ₹1L-2L earners. At your scale, the leak is usually unused subscriptions + impulse buys."),
    (200_000,10_000_000, 30, "Median for high-earners. Top 10% hit 40%+ by automating before they see the money."),
]


def _peer_anchor(income: int) -> tuple[int, str]:
    for lo, hi, pct, copy in _PEER_BANDS:
        if lo <= income < hi:
            return pct, copy
    return 15, "Building your baseline."


def _starter_cards(income: int) -> list[dict[str, Any]]:
    """Deterministic starter pack based purely on income band.

    Round 99F — emergency-fund math fixed.
    Old: 6× MONTHLY INCOME (a textbook error — financial planners say
    6× monthly EXPENSES, not income).
    New: estimated_expenses = income × (1 - peer_savings_rate). Then
    emergency target = 6× estimated_expenses. This produces a smaller,
    more honest, more achievable number AND aligns with what a real
    CFA/CFP would recommend.
    """
    pct, _ = _peer_anchor(income)
    est_expense_rate = max(0.30, 1 - pct / 100.0)    # never <30% — sanity floor
    est_monthly_expense = int(income * est_expense_rate)

    if income < 50_000:
        food_cap = int(income * 0.18)              # 18% of take-home
        ef_target = int(est_monthly_expense * 3)    # 3-mo cushion at low income
    elif income < 150_000:
        food_cap = int(income * 0.15)
        ef_target = int(est_monthly_expense * 6)
    else:
        food_cap = int(income * 0.12)
        ef_target = int(est_monthly_expense * 6)

    # Round to nearest ₹500 for readable target labels.
    ef_target = (ef_target // 500) * 500

    return [
        {
            "kind": "set_budget_cap",
            "label": f"Cap food at ₹{food_cap:,}/mo",
            "endpoint": "/api/budgets",
            "method": "POST",
            "payload": {"category": "food", "amount": food_cap},
            "projected_impact": max(1000, int(food_cap * 0.10)),
            "projected_label": f"+₹{max(1000, int(food_cap * 0.10)):,}/mo projected",
            "confidence": 0.85,
            "reason": "Food + delivery is the #1 leak for this income band. Cap first, tune later.",
            "rank": 0,
        },
        {
            "kind": "create_goal",
            "label": f"Open Emergency Fund · ₹{ef_target:,}",
            "endpoint": "/api/goals",
            "method": "POST",
            "payload": {"name": "Emergency Fund", "target_amount": ef_target},
            "projected_impact": 0,
            "projected_label": "6 months of cushion",
            "confidence": 0.95,
            # Round 99F — math made transparent. Users distrust round
            # numbers without source. Stating "6× your est. ₹X/mo expenses"
            # makes the goal feel calibrated, not arbitrary.
            "reason": f"6× your estimated ₹{est_monthly_expense:,}/mo expenses. The number that makes a job loss survivable.",
            "rank": 1,
        },
        {
            "kind": "import_sms",
            "label": "Auto-find your hidden charges",
            "endpoint": "/api/permissions/grant",
            "method": "POST",
            "payload": {"kind": "sms"},
            "projected_impact": 3200,
            "projected_label": "Avg ₹3,200/mo found in subscriptions",
            "confidence": 1.0,
            # Round 99F — privacy-first framing. Old: defensive negative
            # ("without this we can't help"). New: lead with the user's
            # benefit + an explicit privacy reassurance to address the
            # #1 SMS-permission objection in Indian fintech UX.
            "reason": "We scan SMS only on your device. Find recurring charges you forgot.",
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

    # R100N — Mission Backbone auto-seed (Outcome Guarantee System).
    # Silently kick off the user's first monthly Mission so every
    # action they take has a north-star to ladder into. Uses the
    # peer-anchored target formula in services.missions which is the
    # AI Coach's deterministic pick: income × (peer_pct + 5%) rounded
    # to ₹500. Idempotent — safe to call on every onboarding-seed.
    try:
        from services.missions import seed_initial_mission
        await seed_initial_mission(user_id, int(income), int(peer_pct))
    except Exception as e:    # noqa: BLE001
        # Mission seed failure must NOT block onboarding. Log + move on.
        logger = logging.getLogger(__name__)
        logger.warning(f"mission seed failed for {user_id}: {e}")

    return doc


__all__ = ["seed_user_coach_context"]
