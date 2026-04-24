"""One-shot migration (Round 30i) — seeds the ledger from legacy coin fields
so users who earned coins pre-ledger don't see their balance reset to 0 after
the rebuild.

Safe to run multiple times: `core.ledger.migrate_legacy_balance` keys on the
idempotency key ``legacy_seed::{user_id}`` so the seed is created at most once
per user.

Invoked automatically via a startup hook in core/lifecycle.py. Also callable
ad-hoc from the REPL:

    python -c "from scripts.migrate_ledger import run; import asyncio; asyncio.run(run())"
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

# Make `core` importable when run standalone from /app/backend.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import db
from core.ledger import migrate_legacy_balance

logger = logging.getLogger(__name__)


async def run() -> dict:
    """Seed the ledger for every user who has a legacy balance > 0 and no
    ledger entry yet. Returns a summary dict."""
    processed = 0
    seeded = 0
    skipped = 0
    errors = 0

    cur = db.users.find(
        {},
        {"_id": 1, "coins": 1, "reward_coins": 1, "coins_balance": 1},
    )
    async for u in cur:
        uid = str(u["_id"])
        processed += 1
        legacy = max(
            int(u.get("coins_balance") or 0),
            int(u.get("coins") or 0),
            int(u.get("reward_coins") or 0),
        )
        if legacy <= 0:
            skipped += 1
            continue
        try:
            final = await migrate_legacy_balance(uid)
            seeded += 1
            logger.info(f"  seeded user {uid}: legacy={legacy} final={final}")
        except Exception as e:
            errors += 1
            logger.warning(f"  seed FAIL user {uid}: {e}")

    summary = {
        "processed": processed,
        "seeded": seeded,
        "skipped_zero_balance": skipped,
        "errors": errors,
    }
    logger.info(f"Ledger migration complete: {summary}")
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(run())
    print(result)
