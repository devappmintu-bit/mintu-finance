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
from datetime import datetime, timezone

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
        # (DEPRECATED Round 31b) Legacy coin_ledger index kept for read-back
        # of historic entries only. All new writes route through
        # `core.ledger` → `ledger_transactions`. The collection will be
        # renamed to `coin_ledger_archived_v1` by the startup migration
        # below once drained — see `_archive_legacy_coin_ledger`.
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
        # gmail_tokens.user_id is created here (unique). Round 43 — duplicate
        # creation in the perf-pass block below is removed.
        await db.gmail_tokens.create_index("user_id", unique=True)
        await db.transactions.create_index(
            [("user_id", 1), ("source_msg_id", 1)], sparse=True
        )
        # Round 31b — idempotency key for POST /transactions. Sparse so
        # existing txns without a key are unaffected. Unique per user
        # so spam-click duplicates collapse into a single insert.
        await db.transactions.create_index(
            [("user_id", 1), ("idempotency_key", 1)],
            unique=True,
            partialFilterExpression={"idempotency_key": {"$exists": True, "$type": "string"}},
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
        # Round 43 perf — coins/ledger sorts by _id desc for cursor pagination.
        # Without this index it was doing an in-memory sort. Compound index
        # also handles the type=earn/spend filter via amount sign.
        await db.ledger_transactions.create_index([("user_id", 1), ("_id", -1)])

        # Round 43 perf — goals + notifications_feed had ZERO user_id indexes.
        # Goals query (`/api/goals`, every render of /goals + Budget sheet)
        # was a collection scan. Notifications query (`/api/notifications`,
        # bell badge polling every 60s) was the same.
        await db.goals.create_index([("user_id", 1), ("created_at", -1)])
        await db.goals.create_index("user_id")
        await db.notifications_feed.create_index([("user_id", 1), ("created_at", -1)])
        await db.notifications_feed.create_index([("user_id", 1), ("read", 1)])

        # Round 43 perf — streak/freeze/score collections also unindexed.
        await db.streak_freeze_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.score_history.create_index([("user_id", 1), ("created_at", -1)])
        await db.mission_claims.create_index([("user_id", 1), ("created_at", -1)])
        await db.subscriptions.create_index("user_id")
        await db.rewards_wallet.create_index([("user_id", 1), ("created_at", -1)])
        await db.reward_spins.create_index([("user_id", 1), ("created_at", -1)])
        await db.split_messages.create_index([("group_id", 1), ("created_at", -1)])
        await db.recurring_expenses.create_index([("group_id", 1)])
        await db.recurring_splits.create_index([("group_id", 1)])
        await db.payment_orders.create_index([("user_id", 1), ("created_at", -1)])
        await db.user_badges.create_index("user_id")
        await db.referrals.create_index("referrer_id")
        await db.school_progress.create_index("user_id")
        await db.budget_alerts.create_index([("user_id", 1), ("created_at", -1)])
        await db.family_groups.create_index("members.user_id")
        await db.family_budgets.create_index("group_id")

        # ── Round 51 additions: previously unindexed collections ──────
        await db.sent_notifications.create_index(
            [("user_id", 1), ("date", -1)],
            name="sent_notifs_user_date",
        )
        await db.agent_memory.create_index("user_id", unique=True)
        await db.split_reminders.create_index(
            [("recipient_id", 1), ("status", 1), ("created_at", -1)],
            name="split_reminders_recipient",
        )
        await db.split_reminders.create_index(
            [("sender_id", 1), ("recipient_id", 1), ("group_id", 1), ("created_at", -1)],
            name="split_reminders_sender_pair",
        )
        await db.otp_audit.create_index("phone")
        await db.otp_audit.create_index(
            "created_at", expireAfterSeconds=3600,
            name="otp_audit_ttl",
        )
        await db.ab_events.create_index("group")
        await db.coins_wallet.create_index("user_id", unique=True)
        await db.split_settlements.create_index(
            [("group_id", 1), ("created_at", -1)],
            name="split_settlements_group",
        )

        # Round 51j — Drafts collection for Solo / Unattached expenses.
        await db.draft_expenses.create_index(
            [("user_id", 1), ("created_at", -1)],
            name="draft_expenses_user_recent",
        )

        # Round 53c — Idempotency keys for retry-safe write endpoints.
        # _id is set to "user_id::scope::key" so uniqueness is built-in;
        # we ALSO add a TTL index on created_at so the table self-prunes
        # after 24h. Keeps replays cheap without unbounded growth.
        await db.idempotency_keys.create_index(
            "created_at",
            expireAfterSeconds=24 * 60 * 60,
            name="idempotency_ttl_24h",
        )

        logger.info("✅ MongoDB indexes created for 1.46B-scale performance")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


async def _archive_legacy_coin_ledger(db) -> None:
    """Round 31b migration — rename `coin_ledger` to `coin_ledger_archived_v1`.

    All coin writes have migrated to `ledger_transactions` (via
    `core.ledger`). This migration runs once on startup:

    • If `coin_ledger_archived_v1` ALREADY exists → the archive was
      performed on a prior boot. Nothing to do.
    • If `coin_ledger` is non-empty → rename it atomically. Downstream
      reads that still reference `coin_ledger` (none exist at this
      commit) would silently read an empty collection, which is the
      desired behaviour (legacy data preserved, new reads clean).
    • If `coin_ledger` is empty → delete it outright.

    Safe re-entrant: check-existence before any rename to make reboots
    idempotent.
    """
    try:
        existing = await db.list_collection_names()
        if "coin_ledger_archived_v1" in existing:
            # Already migrated on a prior boot — nothing to do.
            return
        if "coin_ledger" not in existing:
            # Never existed — nothing to migrate.
            return

        count = await db.coin_ledger.estimated_document_count()
        if count == 0:
            await db.coin_ledger.drop()
            logger.info("🗃️  Legacy coin_ledger was empty — dropped")
            return

        # Rename in-place. MongoDB's renameCollection requires admin DB on
        # a single mongod; we use the admin command indirectly via the
        # motor client's `command()` on the parent db.
        client = db.client
        await client.admin.command({
            "renameCollection": f"{db.name}.coin_ledger",
            "to": f"{db.name}.coin_ledger_archived_v1",
            "dropTarget": False,
        })
        logger.info(
            f"🗃️  Archived legacy coin_ledger → coin_ledger_archived_v1 "
            f"({count} rows preserved; no further writes expected)"
        )
    except Exception as e:
        # Archival failure must NEVER block app startup.
        logger.warning(f"coin_ledger archival skipped: {e}")


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
                now = datetime.now(timezone.utc)
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

    # ── Ledger reconcile worker (Round 31b) ───────────────────────────────
    # Periodically recomputes `users.coins_balance` from the immutable
    # ledger_transactions sum so any drift introduced by stale legacy code
    # paths, crashed processes, or manual DB edits is self-healed.
    #
    # Runs every 6 hours. Scans users with recent ledger activity in the
    # previous window (keeps scan bounded even at 1M+ users).
    async def _ledger_reconcile_loop():
        from core.ledger import reconcile_user
        RECONCILE_INTERVAL = 6 * 3600  # 6 hours
        RECENT_WINDOW = 7 * 24 * 3600  # 7 days
        while True:
            try:
                since = datetime.now(timezone.utc) - __import__("datetime").timedelta(seconds=RECENT_WINDOW)
                # Pipeline: unique user_ids with ledger activity in the window.
                cursor = db.ledger_transactions.aggregate([
                    {"$match": {"created_at": {"$gte": since}}},
                    {"$group": {"_id": "$user_id"}},
                    {"$limit": 10000},  # bound per run
                ])
                reconciled = 0
                drift_count = 0
                async for row in cursor:
                    uid = row.get("_id")
                    if not uid:
                        continue
                    try:
                        # reconcile_user returns the authoritative balance.
                        # It's a no-op if the cache already matches.
                        before = await db.users.find_one(
                            {"_id": __import__("bson").ObjectId(uid)
                             if len(uid) == 24 else uid},
                            {"coins_balance": 1},
                        )
                        before_bal = int((before or {}).get("coins_balance", 0))
                        after_bal = await reconcile_user(uid)
                        if before_bal != after_bal:
                            drift_count += 1
                        reconciled += 1
                    except Exception:
                        continue  # per-user failures don't block the sweep
                if reconciled > 0:
                    logger.info(
                        f"🔄 Ledger reconcile: scanned {reconciled} users, "
                        f"{drift_count} drift-corrections applied"
                    )
            except Exception as e:
                logger.warning(f"Ledger reconcile iteration failed: {e}")
            await _asyncio.sleep(RECONCILE_INTERVAL)

    try:
        _asyncio.create_task(_ledger_reconcile_loop())
        logger.info("🔄 Ledger reconcile worker started (6-hour interval)")
    except Exception as e:
        logger.warning(f"Could not start ledger reconcile worker: {e}")


def register_lifecycle(app, db, client) -> None:
    """Attach startup & shutdown event handlers to the FastAPI ``app``."""

    @app.on_event("startup")
    async def _on_startup():  # noqa: D401
        await _ensure_indexes(db)
        await _archive_legacy_coin_ledger(db)
        await _start_background_workers(db)

    @app.on_event("shutdown")
    async def _on_shutdown():  # noqa: D401
        client.close()
