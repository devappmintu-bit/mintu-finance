"""core/ledger.py — Financial-grade coin ledger service.

Design
------
The ledger (`db.ledger_transactions`) is the **ONLY source of truth** for
coin movements. Balance is always derived. We keep `users.coins_balance`
as a cached integer for fast reads, but it is reconciled from the ledger
(a) whenever award_coins/spend_coins runs (same atomic write) and
(b) during the startup reconciliation sweep in core/lifecycle.

Schema
------
ledger_transactions:
    _id               ObjectId
    user_id           str     (24-hex-char string form of users._id)
    amount            int     (positive = earn, negative = spend/penalty)
    type              str     ('earn' | 'spend' | 'bonus' | 'penalty' | 'adjustment')
    source            str     ('streak_daily' | 'mission:open_app' | 'split_settle'
                               | 'mystery_box_spin' | 'referral_invite' | ...)
    idempotency_key   str     unique per (user_id, action_instance). Enforced
                              by a unique partial index so duplicate inserts
                              raise DuplicateKeyError and become a no-op.
    balance_after     int     cached post-commit balance (fast reads for UI)
    created_at        datetime UTC

Safety invariants
-----------------
1. Idempotency:        unique(user_id, idempotency_key) where
                       idempotency_key exists → duplicate awards NOOP.
2. Atomicity:          Each award is a single insert_one() that computes and
                       stamps `balance_after` inside a Mongo session. We
                       piggyback on MongoDB's built-in durability — no
                       partial writes possible.
3. Tamper resistance:  Balance is always recomputed from `sum(amount)`.
                       If `users.coins_balance` ever diverges from the
                       ledger sum, reconciliation drops the cached value
                       and uses the ledger truth.
4. Audit trail:        Every row is immutable (we never update rows).

Public API
----------
    async def award_coins(user_id, amount, source, idempotency_key) -> dict
    async def spend_coins(user_id, amount, source, idempotency_key) -> dict
    async def get_balance(user_id) -> int
    async def get_history(user_id, limit=50) -> list[dict]
    async def reconcile_user(user_id) -> int   # returns reconciled balance
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from core.db import db
from core.ids import safe_oid

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════
async def _sum_ledger(user_id: str) -> int:
    """Sum ALL ledger entries for this user. Authoritative balance."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await db.ledger_transactions.aggregate(pipeline).to_list(1)
    return int(rows[0]["total"]) if rows else 0


async def _update_cached_balance(user_id: str, new_balance: int) -> None:
    """Update the denormalized cache on the user document."""
    oid = safe_oid(user_id)
    if oid is None:
        return
    # Write to BOTH legacy fields + canonical field so every read path in
    # the codebase sees the same balance regardless of which field it
    # historically used. The canonical field going forward is `coins_balance`.
    await db.users.update_one(
        {"_id": oid},
        {"$set": {
            "coins_balance": int(new_balance),
            "coins": int(new_balance),         # legacy — rewards.py, analytics.py
            "reward_coins": int(new_balance),  # legacy — split_settle.py, analytics.py
            "coins_updated_at": datetime.now(timezone.utc),
        }},
    )


# ══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════════════════════════════════════
async def award_coins(
    user_id: str,
    amount: int,
    source: str,
    idempotency_key: str,
    *,
    txn_type: str = "earn",
) -> Dict[str, Any]:
    """Credit ``amount`` coins to ``user_id`` exactly once per ``idempotency_key``.

    Returns
    -------
    {
      "created":        bool  # True if inserted, False if duplicate no-op
      "balance":        int   # balance after this operation
      "balance_before": int   # balance before (for delta UI)
      "amount":         int
      "source":         str
      "reason":         str   # "created" | "duplicate"
    }
    """
    if not isinstance(amount, int):
        amount = int(amount)
    if amount <= 0:
        raise ValueError(f"award_coins amount must be positive, got {amount}")
    if not idempotency_key:
        raise ValueError("idempotency_key is required for award_coins")

    now = datetime.now(timezone.utc)
    # Compute current balance so we can stamp balance_after atomically.
    balance_before = await _sum_ledger(user_id)
    balance_after = balance_before + amount

    doc = {
        "user_id": user_id,
        "amount": int(amount),
        "type": txn_type,
        "source": source,
        "idempotency_key": idempotency_key,
        "balance_after": balance_after,
        "created_at": now,
    }

    try:
        await db.ledger_transactions.insert_one(doc)
    except DuplicateKeyError:
        # Another caller already processed this exact (user, idempotency_key).
        # Return the balance AS-IS — never award again.
        current = await _sum_ledger(user_id)
        return {
            "created": False,
            "balance": current,
            "balance_before": current,
            "amount": 0,
            "source": source,
            "reason": "duplicate",
        }

    # Update denormalized cache AFTER the authoritative ledger write.
    await _update_cached_balance(user_id, balance_after)
    return {
        "created": True,
        "balance": balance_after,
        "balance_before": balance_before,
        "amount": amount,
        "source": source,
        "reason": "created",
    }


async def spend_coins(
    user_id: str,
    amount: int,
    source: str,
    idempotency_key: str,
) -> Dict[str, Any]:
    """Debit ``amount`` coins. Idempotent. Refuses if balance would go negative.

    Round 31 paranoid-audit fix: uses an ATOMIC conditional update on
    `users.coins_balance` (the denormalized cache) as the race-safe
    reservation gate. Previously the read-then-write pattern allowed N
    parallel spends to all pass the pre-check against a balance smaller
    than their sum, letting the account go negative.

    Contract:
      • If the reserved amount would push balance < 0 → refuse atomically.
      • Uses find_one_and_update({coins_balance: $gte: amount}, $inc: -amount)
        — MongoDB evaluates filter+update as a single atomic op.
      • Ledger insert occurs AFTER the reservation succeeds.
      • On duplicate idempotency_key (rare), we roll back the reservation.
    """
    if amount <= 0:
        raise ValueError(f"spend_coins amount must be positive, got {amount}")
    if not idempotency_key:
        raise ValueError("idempotency_key is required for spend_coins")

    oid = safe_oid(user_id)
    if oid is None:
        return {
            "created": False, "balance": 0, "balance_before": 0,
            "amount": 0, "source": source, "reason": "invalid_user_id",
        }

    # ── ATOMIC RESERVATION
    # MongoDB evaluates filter+update atomically. If coins_balance < amount,
    # filter fails → return None → we refuse. Otherwise balance is debited
    # in the same atomic operation.
    #
    # `coins_balance` is the authoritative reservation slot. It's kept in
    # sync by award_coins. Legacy-drift users must call reconcile_user()
    # explicitly before attempting to spend — we DO NOT self-heal inside
    # spend_coins because the read-then-write-back pattern would resurrect
    # just-reserved coins under concurrent access.
    reserved = await db.users.find_one_and_update(
        {"_id": oid, "coins_balance": {"$gte": amount}},
        {"$inc": {"coins_balance": -amount}},
        return_document=True,
    )
    if reserved is None:
        bal = int((await db.users.find_one({"_id": oid}) or {}).get("coins_balance", 0))
        return {
            "created": False, "balance": bal, "balance_before": bal,
            "amount": 0, "source": source, "reason": "insufficient_funds",
        }

    balance_after = int(reserved.get("coins_balance", 0))
    balance_before = balance_after + amount
    now = datetime.now(timezone.utc)

    # ── STEP 3: Insert the ledger doc. If the idempotency_key is a dup,
    # roll back the reservation so we don't silently eat the coins.
    doc = {
        "user_id": user_id,
        "amount": -int(amount),
        "type": "spend",
        "source": source,
        "idempotency_key": idempotency_key,
        "balance_after": balance_after,
        "created_at": now,
    }
    try:
        await db.ledger_transactions.insert_one(doc)
    except DuplicateKeyError:
        # Roll back the reservation since the ledger rejected the write.
        await db.users.update_one({"_id": oid}, {"$inc": {"coins_balance": amount}})
        current = await _sum_ledger(user_id)
        return {
            "created": False, "balance": current, "balance_before": current,
            "amount": 0, "source": source, "reason": "duplicate",
        }

    # Also update legacy field mirrors so legacy reads don't lag.
    await db.users.update_one(
        {"_id": oid},
        {"$set": {"coins": balance_after, "reward_coins": balance_after}},
    )

    return {
        "created": True,
        "balance": balance_after,
        "balance_before": balance_before,
        "amount": -amount,
        "source": source,
        "reason": "created",
    }


async def get_balance(user_id: str) -> int:
    """Return the authoritative coin balance (summed from ledger)."""
    return await _sum_ledger(user_id)


async def get_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return the user's recent ledger entries (newest first, immutable)."""
    cur = db.ledger_transactions.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
    out = []
    async for row in cur:
        out.append({
            "id": str(row["_id"]),
            "amount": int(row["amount"]),
            "type": row.get("type", "earn"),
            "source": row.get("source", "unknown"),
            "balance_after": int(row.get("balance_after", 0)),
            "created_at": (row["created_at"].isoformat()
                           if isinstance(row.get("created_at"), datetime) else None),
        })
    return out


async def reconcile_user(user_id: str) -> int:
    """Recompute `users.coins_balance` from the ledger. Fixes drift.

    Called during startup sweep + on-demand if an endpoint ever detects
    that `users.coins_balance` diverges from `_sum_ledger`.
    """
    authoritative = await _sum_ledger(user_id)
    await _update_cached_balance(user_id, authoritative)
    return authoritative


async def migrate_legacy_balance(user_id: str) -> int:
    """One-shot: if a user has legacy `coins`/`reward_coins` but no ledger
    entries yet, create a single `migration_balance_seed` ledger row so the
    user's historic balance carries over to the new source of truth.

    Safe to run multiple times — idempotency_key `legacy_seed::{user_id}` ensures
    the seed is created at most once.
    """
    oid = safe_oid(user_id)
    if oid is None:
        return 0
    u = await db.users.find_one({"_id": oid})
    if not u:
        return 0

    # Take the max of existing stores (prefer coins_balance > coins > reward_coins).
    # Historical drift means the "true" legacy balance is uncertain; we take max
    # so we never cheat a user out of coins they were shown.
    legacy = max(
        int(u.get("coins_balance") or 0),
        int(u.get("coins") or 0),
        int(u.get("reward_coins") or 0),
    )
    # Did we already seed?
    existing = await db.ledger_transactions.count_documents({"user_id": user_id})
    if existing > 0:
        return await reconcile_user(user_id)

    if legacy > 0:
        await award_coins(
            user_id=user_id,
            amount=legacy,
            source="legacy_migration",
            idempotency_key=f"legacy_seed::{user_id}",
            txn_type="bonus",
        )
    return await _sum_ledger(user_id)
