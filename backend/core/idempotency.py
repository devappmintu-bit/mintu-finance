"""core/idempotency.py — Round 53c

Exactly-once write guard for retry-prone HTTP endpoints.

The pattern: caller sends a unique ``Idempotency-Key`` header (UUIDv4
or any opaque string ≤ 128 chars). The first request through wins;
any concurrent or subsequent request with the same (user_id, scope,
key) tuple gets the cached response **without re-running the handler**.

This is the standard fintech idempotency contract (Stripe, AWS,
Razorpay all implement it the same way).

DESIGN DECISIONS
----------------
1. Keyed on (user_id, scope, key). The scope discriminates by
   endpoint family ("split_expense", "settle", …) so the same UUID
   used for two different operations doesn't collide.
2. Storage: ``db.idempotency_keys`` collection, TTL-indexed at
   24 hours. Keeps the table self-pruning while giving clients a
   reasonable retry window.
3. Concurrency: a unique index on (user_id, scope, key) makes the
   reservation atomic. Race winners insert; losers see DuplicateKey
   and read back the cached response.
4. Failure mode: if the key is reserved but the handler hasn't yet
   committed a response (raced losers arrive within milliseconds),
   we return ``None`` for ``cached`` and the loser is **rejected
   with HTTP 409**. This is intentional — better than serving an
   uncommitted partial.

PUBLIC API
----------
    await reserve_idempotency(user_id, scope, key)
    await commit_idempotency(user_id, scope, key, response_json)
    await replay_idempotency(user_id, scope, key) -> Optional[dict]
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from pymongo.errors import DuplicateKeyError

from core.db import db
from core.time import utc_now

logger = logging.getLogger(__name__)

# 24h retention — long enough for retries, short enough to keep table tiny.
IDEMPOTENCY_TTL_SEC = 24 * 60 * 60
MAX_KEY_LEN = 128


def _validate_key(key: str) -> None:
    if not isinstance(key, str) or not key:
        raise ValueError("idempotency key must be a non-empty string")
    if len(key) > MAX_KEY_LEN:
        raise ValueError(f"idempotency key length must be ≤ {MAX_KEY_LEN}, got {len(key)}")


async def reserve_idempotency(user_id: str, scope: str, key: str) -> bool:
    """Atomically claim (user_id, scope, key). Returns True on first
    claim (caller proceeds), False on duplicate (caller should replay).

    Uses MongoDB's ``_id`` uniqueness for atomicity — no need for a
    separate session/transaction.
    """
    _validate_key(key)
    composite_id = f"{user_id}::{scope}::{key}"
    try:
        await db.idempotency_keys.insert_one({
            "_id": composite_id,
            "user_id": user_id,
            "scope": scope,
            "key": key,
            "status": "reserved",
            "response": None,
            "created_at": utc_now(),
        })
        return True
    except DuplicateKeyError:
        return False


async def commit_idempotency(
    user_id: str,
    scope: str,
    key: str,
    response: Dict[str, Any],
) -> None:
    """Store the handler's response so future retries can replay it.

    Safe to call on the winner only — losers should NOT call this.
    """
    _validate_key(key)
    composite_id = f"{user_id}::{scope}::{key}"
    await db.idempotency_keys.update_one(
        {"_id": composite_id},
        {"$set": {
            "status": "committed",
            "response": response,
            "committed_at": utc_now(),
        }},
    )


async def replay_idempotency(user_id: str, scope: str, key: str) -> Optional[Dict[str, Any]]:
    """Look up a previously committed response. Returns:

      • dict — the cached response (caller returns it as-is)
      • None — the key is unknown OR reserved-but-not-yet-committed.
               Callers seeing reserved-but-not-committed should reject
               with HTTP 409 Conflict (not retry — the previous attempt
               is still in flight).
    """
    _validate_key(key)
    composite_id = f"{user_id}::{scope}::{key}"
    doc = await db.idempotency_keys.find_one({"_id": composite_id})
    if not doc:
        return None
    if doc.get("status") != "committed":
        # In-flight; caller should 409.
        return None
    return doc.get("response")


__all__ = [
    "IDEMPOTENCY_TTL_SEC",
    "MAX_KEY_LEN",
    "reserve_idempotency",
    "commit_idempotency",
    "replay_idempotency",
]
