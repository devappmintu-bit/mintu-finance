"""Default event handlers for MintU domain events.

Round 30e (R3) — demonstrates the event-bus pattern by replacing what
would otherwise be inline-in-router logic. Each handler is a single,
grep-able unit of "what happens when X". Register new handlers here
rather than inline in the endpoint that emits.

To extend: `from core.events import on, Events` and decorate.
"""
from __future__ import annotations
import logging
from datetime import datetime

from core.events import on, Events

logger = logging.getLogger("mintu.event_handlers")


# ─── transaction.created → budget breach check ───────────────────────
@on(Events.TRANSACTION_CREATED)
async def _check_budget_breach(event: dict) -> None:
    """When a user adds a debit transaction in a category with a budget,
    check whether it pushes usage above 80% (warning) or 100% (breach).
    Writes a `budget_alerts` row so the Home/Budget tabs pick it up on
    next refetch. Idempotent — won't double-alert for the same threshold.
    """
    # Lazy import: avoid circular deps at module-load time.
    from server import db

    user_id = event.get("user_id")
    category = event.get("category")
    txn_type = event.get("type")
    amount = float(event.get("amount", 0))
    if not user_id or not category or txn_type != "debit" or amount <= 0:
        return

    # Find an active budget for this category. Only monthly-period budgets
    # trigger alerts today — extend here if adding weekly/yearly.
    budget = await db.budgets.find_one({
        "user_id": user_id,
        "category": category,
        "period": "monthly",
    })
    if not budget:
        return

    # Sum this month's debits in this category.
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"user_id": user_id, "category": category, "type": "debit",
                    "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(1)
    used = float(rows[0]["total"]) if rows else 0.0
    cap = float(budget.get("amount", 0) or 0)
    if cap <= 0:
        return

    pct = used / cap
    threshold = None
    event_to_emit = None
    if pct >= 1.0:
        threshold = 100
        event_to_emit = Events.BUDGET_BREACHED
    elif pct >= 0.8:
        threshold = 80
        event_to_emit = Events.BUDGET_WARNING
    if not threshold:
        return

    # Idempotent insert — same (user, budget, threshold, month) only once.
    existing = await db.budget_alerts.find_one({
        "user_id": user_id,
        "budget_id": str(budget["_id"]),
        "threshold_pct": threshold,
        "month": month_start.strftime("%Y-%m"),
    })
    if existing:
        return

    await db.budget_alerts.insert_one({
        "user_id": user_id,
        "budget_id": str(budget["_id"]),
        "category": category,
        "threshold_pct": threshold,
        "month": month_start.strftime("%Y-%m"),
        "used": round(used, 2),
        "cap": round(cap, 2),
        "created_at": datetime.utcnow(),
        "dismissed": False,
    })

    # Fire the next event in the chain for future subscribers
    # (push notifications, in-app toast, AI commentary, etc.)
    from core.events import emit
    emit(event_to_emit,
         user_id=user_id,
         category=category,
         used=used,
         cap=cap,
         pct=pct,
         budget_id=str(budget["_id"]))
    logger.info(f"[events] budget {threshold}% alert fired for user {user_id[-6:]} category={category}")


# ─── split.settlement_completed → observability hook ─────────────────
# The actual coin-award + reminder-dismiss already happen inline in
# split_settle.py because callers need the coin-reward payload in the
# response. This handler is an observability / audit hook only.

@on(Events.SETTLEMENT_COMPLETED)
async def _log_settlement(event: dict) -> None:
    logger.info(
        f"[events] settlement_completed: payer={event.get('payer_id','?')[-6:]} "
        f"payee={event.get('payee_id','?')[-6:]} amount=₹{event.get('amount', 0):.0f}"
    )


# Additional handlers (push notification, AI insight recompute,
# leaderboard recalc) are scaffolded for future wiring — keep light
# for now so the event bus itself carries no regression risk.
