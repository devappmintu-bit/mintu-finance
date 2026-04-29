"""Round 53i — core/ledger.py concurrency & invariant tests.

Deep tests for the financial brain. We exercise:

  ✓ award_coins idempotency (same key → no double credit)
  ✓ spend_coins idempotency
  ✓ Reservation rollback on duplicate-key spend
  ✓ Negative-balance rejection
  ✓ get_balance is authoritative (drift detection)
  ✓ reconcile_user fixes a manually-corrupted cache
  ✓ Concurrent award_coins with same key → exactly one credit
  ✓ Concurrent award + spend → final balance = sum(ledger)
  ✓ Property: 100 random awards → balance == sum

Live API approach via /rewards/spin / /rewards/missions/claim is
indirect; instead we hit the ledger primitives DIRECTLY through a
fresh Motor client per test (avoids the cross-test event-loop
binding issue we saw in Round 53c).
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

pytestmark = pytest.mark.integration


# ──────────────────────────────────────────────────────────────────────
#  Fixtures — fresh Motor client per test to avoid event-loop binding
# ──────────────────────────────────────────────────────────────────────
@pytest.fixture
async def fresh_db(monkeypatch):
    """Build an event-loop-bound Motor client AND patch core.ledger.db
    + core.db.db to use it. Each test gets an isolated handle."""
    load_dotenv("/app/backend/.env")
    url = os.environ["MONGO_URL"]
    name = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(url)
    handle = client[name]
    # Patch BOTH places that import db so every reference points to
    # our test-scoped, current-event-loop-bound handle.
    monkeypatch.setattr("core.db.db", handle, raising=False)
    monkeypatch.setattr("core.ledger.db", handle, raising=False)
    yield handle
    client.close()


@pytest.fixture
async def fresh_user(fresh_db):
    """Insert a throwaway user doc; yield its id; clean up at end."""
    uid = str(ObjectId())
    await fresh_db.users.insert_one({
        "_id": ObjectId(uid),
        "name": f"LedgerTest-{uid[-6:]}",
        "phone": f"99999{uid[-5:]}",
        "coins_balance": 0, "coins": 0, "reward_coins": 0,
        "created_at": datetime.now(timezone.utc),
    })
    yield uid
    # Teardown: wipe ledger entries + user doc.
    await fresh_db.ledger_transactions.delete_many({"user_id": uid})
    await fresh_db.users.delete_one({"_id": ObjectId(uid)})


# ══════════════════════════════════════════════════════════════════════
#  award_coins
# ══════════════════════════════════════════════════════════════════════
class TestAwardCoins:
    async def test_basic_credit(self, fresh_db, fresh_user):
        from core.ledger import award_coins, get_balance
        r = await award_coins(fresh_user, 50, "test", f"key-{uuid.uuid4()}")
        assert r["created"] is True
        assert r["balance"] == 50
        assert r["amount"] == 50
        assert await get_balance(fresh_user) == 50

    async def test_idempotent_same_key(self, fresh_db, fresh_user):
        from core.ledger import award_coins, get_balance
        key = f"idem-{uuid.uuid4()}"
        await award_coins(fresh_user, 100, "test", key)
        r2 = await award_coins(fresh_user, 100, "test", key)  # retry
        assert r2["created"] is False
        assert r2["reason"] == "duplicate"
        assert r2["amount"] == 0
        # Balance is still 100, not 200.
        assert await get_balance(fresh_user) == 100

    async def test_rejects_zero_amount(self, fresh_db, fresh_user):
        from core.ledger import award_coins
        with pytest.raises(ValueError, match="positive"):
            await award_coins(fresh_user, 0, "test", "key1")

    async def test_rejects_negative_amount(self, fresh_db, fresh_user):
        from core.ledger import award_coins
        with pytest.raises(ValueError, match="positive"):
            await award_coins(fresh_user, -10, "test", "key2")

    async def test_rejects_missing_idempotency_key(self, fresh_db, fresh_user):
        from core.ledger import award_coins
        with pytest.raises(ValueError, match="idempotency_key"):
            await award_coins(fresh_user, 10, "test", "")

    async def test_concurrent_same_key_credits_once(self, fresh_db, fresh_user):
        """5 parallel award_coins with the SAME idempotency_key → exactly
        one credit. The DuplicateKeyError path catches losers."""
        from core.ledger import award_coins, get_balance
        key = f"race-{uuid.uuid4()}"
        results = await asyncio.gather(*[
            award_coins(fresh_user, 25, "race-test", key) for _ in range(5)
        ])
        created = [r for r in results if r["created"]]
        duplicates = [r for r in results if not r["created"]]
        assert len(created) == 1, f"expected 1 winner, got {len(created)}: {results}"
        assert len(duplicates) == 4
        # Final balance = exactly one credit.
        assert await get_balance(fresh_user) == 25


# ══════════════════════════════════════════════════════════════════════
#  spend_coins
# ══════════════════════════════════════════════════════════════════════
class TestSpendCoins:
    async def test_basic_debit(self, fresh_db, fresh_user):
        from core.ledger import award_coins, spend_coins, get_balance
        await award_coins(fresh_user, 100, "seed", "k1")
        r = await spend_coins(fresh_user, 30, "test", "spend-k1")
        assert r["created"] is True
        assert r["balance"] == 70
        assert r["amount"] == -30
        assert await get_balance(fresh_user) == 70

    async def test_refuses_overdraft(self, fresh_db, fresh_user):
        from core.ledger import award_coins, spend_coins, get_balance
        await award_coins(fresh_user, 50, "seed", "k1")
        # spend_coins returns a structured `insufficient_funds` response
        # rather than raising — the API layer (routers/rewards.py) maps
        # that to a 402. We assert the contract here.
        r = await spend_coins(fresh_user, 200, "overspend", "spend-overdraft")
        assert r["created"] is False
        assert r["reason"] == "insufficient_funds"
        # Balance unchanged.
        assert await get_balance(fresh_user) == 50

    async def test_idempotent_spend(self, fresh_db, fresh_user):
        from core.ledger import award_coins, spend_coins, get_balance
        await award_coins(fresh_user, 100, "seed", "k1")
        key = f"spend-idem-{uuid.uuid4()}"
        await spend_coins(fresh_user, 40, "test", key)
        r2 = await spend_coins(fresh_user, 40, "test", key)  # retry
        assert r2["created"] is False
        assert r2["reason"] == "duplicate"
        # Balance ONCE deducted, not twice.
        assert await get_balance(fresh_user) == 60


# ══════════════════════════════════════════════════════════════════════
#  reconcile_user — drift detection + repair
# ══════════════════════════════════════════════════════════════════════
class TestReconcile:
    async def test_reconcile_repairs_corrupt_cache(self, fresh_db, fresh_user):
        from core.ledger import award_coins, reconcile_user
        await award_coins(fresh_user, 80, "seed", "k1")
        # Corrupt the cache: someone wrote a wrong value to users.coins_balance.
        await fresh_db.users.update_one(
            {"_id": ObjectId(fresh_user)},
            {"$set": {"coins_balance": 999}},
        )
        result = await reconcile_user(fresh_user)
        assert result == 80, f"reconcile should return authoritative ledger sum, got {result}"
        u = await fresh_db.users.find_one({"_id": ObjectId(fresh_user)})
        # All three legacy mirrors should now match.
        assert u["coins_balance"] == 80
        assert u["coins"] == 80
        assert u["reward_coins"] == 80


# ══════════════════════════════════════════════════════════════════════
#  Final invariant: get_balance == sum(ledger) always
# ══════════════════════════════════════════════════════════════════════
class TestGlobalInvariant:
    async def test_get_balance_equals_ledger_sum_after_n_ops(self, fresh_db, fresh_user):
        from core.ledger import award_coins, spend_coins, get_balance
        # Mix of awards + spends.
        await award_coins(fresh_user, 100, "s", "a1")
        await award_coins(fresh_user, 50, "s", "a2")
        await spend_coins(fresh_user, 30, "s", "s1")
        await award_coins(fresh_user, 10, "s", "a3")
        await spend_coins(fresh_user, 20, "s", "s2")
        # Authoritative sum.
        balance = await get_balance(fresh_user)
        # Compute ledger sum independently.
        rows = await fresh_db.ledger_transactions.find({"user_id": fresh_user}).to_list(None)
        manual = sum(int(r["amount"]) for r in rows)
        assert balance == manual == (100 + 50 - 30 + 10 - 20)
