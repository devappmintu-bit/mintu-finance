"""core/lifecycle.py — Application startup & shutdown wiring.

Extracted from server.py (Round 30f) to keep the bootstrap file thin.
The public function ``register_lifecycle(app, db, client)`` attaches
FastAPI ``on_event("startup")`` and ``on_event("shutdown")`` handlers
that:

  1. Create all MongoDB indexes the app relies on (idempotent)
  2. Launch background workers (news refresher, Gmail sync, soft-delete purge)
  3. Register the Event Bus handlers
  4. Cleanly close the Motor client on shutdown
"""
from __future__ import annotations

import asyncio as _asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


async def _ensure_indexes(db) -> None:
    """Create all MongoDB indexes. Swallows failures so boot never blocks."""
    try:
        # User
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("money_score")
        await db.users.create_index("referral_code")

        # Transactions
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("category", 1), ("date", -1)])
        # Hot query: /budgets/live aggregates by (user, type, category, date). Covered compound.
        await db.transactions.create_index(
            [("user_id", 1), ("type", 1), ("category", 1), ("date", -1)]
        )

        # Budgets
        await db.budgets.create_index([("user_id", 1), ("category", 1)])
        # Hot query: load all budgets for a user on home/budgets-live
        await db.budgets.create_index("user_id")

        # Splits
        await db.split_groups.create_index("created_by")
        await db.split_groups.create_index("members.user_id")
        await db.split_expenses.create_index("group_id")
        await db.split_expenses.create_index([("group_id", 1), ("created_at", -1)])

        # Rate limits + OTPs (TTL auto-cleanup)
        await db.rate_limits.create_index("key")
        await db.rate_limits.create_index("window", expireAfterSeconds=120)
        # Settle-lock TTL — advisory lock auto-releases after 10s so a
        # crashed or stuck settle request can't permanently block the pair.
        await db.settle_locks.create_index("at", expireAfterSeconds=10)
        # Coin ledger dedupe — enforce idempotency of (user, action, dedupe_key)
        # at the DB layer so concurrent award calls can't race past the find.
        await db.coin_ledger.create_index(
            [("user_id", 1), ("action", 1), ("dedupe_key", 1)],
            unique=True,
            partialFilterExpression={"dedupe_key": {"$exists": True, "$type": "string"}},
        )
        # Razorpay settle idempotency — one settlement per order_id.
        await db.settlements.create_index(
            "razorpay_order_id",
            unique=True,
            partialFilterExpression={"razorpay_order_id": {"$exists": True, "$type": "string"}},
        )
        await db.otps.create_index("phone")
        await db.otps.create_index("expires_at", expireAfterSeconds=0)

        # Audit logs (90-day retention)
        await db.audit_logs.create_index("timestamp", expireAfterSeconds=90 * 24 * 60 * 60)

        # Cash entries
        await db.cash_entries.create_index([("user_id", 1), ("date", -1)])

        # Gmail OAuth / sync (TTL auto-cleanup of pending state tokens)
        await db.oauth_states.create_index("expires_at", expireAfterSeconds=0)
        await db.gmail_tokens.create_index("user_id", unique=True)
        await db.transactions.create_index(
            [("user_id", 1), ("source_msg_id", 1)], sparse=True
        )

        # Ledger (Round 30i streak/coins rebuild) — financial-grade idempotency.
        # Unique index on (user_id, idempotency_key) so replay attacks /
        # double-tap awards become a DuplicateKeyError → no-op.
        await db.ledger_transactions.create_index(
            [("user_id", 1), ("idempotency_key", 1)],
            unique=True,
            partialFilterExpression={"idempotency_key": {"$exists": True, "$type": "string"}},
        )
        await db.ledger_transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.ledger_transactions.create_index("source")

        logger.info("✅ MongoDB indexes created for 1.46B-scale performance")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


async def _start_background_workers(db) -> None:
    """Fire-and-forget launch of all recurring background workers."""
    # News refresher
    try:
        from routers.news import start_news_worker
        start_news_worker()
    except Exception as e:
        logger.warning(f"Could not start news worker: {e}")

    # Gmail sync (15-min interval)
    try:
        from routers.gmail_oauth import start_gmail_worker
        start_gmail_worker()
    except Exception as e:
        logger.warning(f"Could not start Gmail worker: {e}")

    # Register event bus handlers — importing the module is enough,
    # decorators attach to the shared bus registry.
    try:
        from core import event_handlers  # noqa: F401
        from core.events import Events as _E
        logger.info(
            f"📡 Event bus initialised · "
            f"{len([m for m in dir(_E) if not m.startswith('_')])} event kinds"
        )
    except Exception as e:
        logger.warning(f"Could not register event handlers: {e}")

    async def _soft_delete_purge_loop():
        while True:
            try:
                now = datetime.utcnow()
                expired = await db.users.find(
                    {"deleted_at": {"$exists": True},
                     "scheduled_purge_at": {"$lte": now}},
                    {"_id": 1},
                ).to_list(500)
                for u in expired:
                    try:
                        # Delegate to /user/delete-account hard path.
                        from routers.user import _hard_purge_user  # type: ignore
                        await _hard_purge_user(str(u["_id"]))
                    except Exception as ee:
                        logger.warning(f"Soft-delete purge failed for {u['_id']}: {ee}")
            except Exception as e:
                logger.warning(f"Soft-delete worker iteration failed: {e}")
            await _asyncio.sleep(3600)  # 1 hour

    try:
        _asyncio.create_task(_soft_delete_purge_loop())
        logger.info("🧹 Soft-delete purge worker started (hourly)")
    except Exception as e:
        logger.warning(f"Could not start soft-delete worker: {e}")


def register_lifecycle(app, db, client) -> None:
    """Attach startup & shutdown event handlers to the FastAPI ``app``."""

    @app.on_event("startup")
    async def _on_startup():  # noqa: D401
        await _ensure_indexes(db)
        await _start_background_workers(db)

    @app.on_event("shutdown")
    async def _on_shutdown():  # noqa: D401
        client.close()
