"""Round 52f \u2014 Unit tests for core.transactions.with_atomic.

We test BOTH paths:
  1. Replica-set / Atlas: real session.start_transaction() works.
  2. Standalone: OperationFailure with the magic strings -> compensate.

No live Mongo needed \u2014 we mock motor's surface area precisely enough
to exercise both paths.
"""
from __future__ import annotations

import pytest
from pymongo.errors import OperationFailure
from unittest.mock import AsyncMock, MagicMock

from core.transactions import with_atomic

pytestmark = pytest.mark.unit


# \u2500\u2500 helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
class _AsyncCM:
    """Tiny async context manager wrapper over a MagicMock-like target."""
    def __init__(self, target):
        self.target = target
    async def __aenter__(self):
        return self.target
    async def __aexit__(self, exc_type, exc, tb):
        return False


def _replica_set_client():
    """Mock a motor client whose start_session().start_transaction()
    works (Atlas-style)."""
    session = MagicMock()
    session.start_transaction = MagicMock(return_value=_AsyncCM(MagicMock()))

    client = MagicMock()
    client.start_session = AsyncMock(return_value=_AsyncCM(session))
    return client, session


def _standalone_client():
    """Mock a motor client whose start_session().start_transaction()
    raises the standalone-Mongo OperationFailure."""
    failing_tx_cm = MagicMock()
    failing_tx_cm.__aenter__ = AsyncMock(
        side_effect=OperationFailure("Transaction numbers are only allowed on a replica set member")
    )
    failing_tx_cm.__aexit__ = AsyncMock(return_value=False)

    session = MagicMock()
    session.start_transaction = MagicMock(return_value=failing_tx_cm)

    client = MagicMock()
    client.start_session = AsyncMock(return_value=_AsyncCM(session))
    return client, session


# \u2500\u2500 happy paths \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async def test_atlas_path_runs_callback_inside_transaction():
    client, session = _replica_set_client()
    received = []

    async def cb(s):
        received.append(s)
        return "ok"

    result = await with_atomic(client, cb)
    assert result == "ok"
    # Callback was invoked with the live session, not None.
    assert received == [session]
    # And the transaction context manager was entered.
    session.start_transaction.assert_called_once()


async def test_standalone_falls_back_to_compensating_action_mode():
    client, session = _standalone_client()
    received = []

    async def cb(s):
        received.append(s)
        return "fallback-ok"

    result = await with_atomic(client, cb)
    assert result == "fallback-ok"
    # Fallback path: callback invoked with None (no session).
    assert received == [None]


# \u2500\u2500 failure paths \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async def test_compensate_runs_when_callback_raises_in_fallback_mode():
    client, _ = _standalone_client()
    compensate_called = []

    async def cb(s):
        raise RuntimeError("boom")

    async def comp(exc):
        compensate_called.append(exc)

    with pytest.raises(RuntimeError, match="boom"):
        await with_atomic(client, cb, compensate=comp)
    # Compensate was invoked exactly once with the original exception.
    assert len(compensate_called) == 1
    assert isinstance(compensate_called[0], RuntimeError)


async def test_no_compensate_is_safe_when_callback_raises_in_fallback():
    client, _ = _standalone_client()

    async def cb(s):
        raise ValueError("x")

    # No compensate provided \u2014 must still re-raise without crashing.
    with pytest.raises(ValueError):
        await with_atomic(client, cb)


async def test_other_operation_failures_propagate_without_fallback():
    """An OperationFailure that ISN'T about replica sets must be
    treated as a real error \u2014 we don't want to silently swallow e.g.
    duplicate-key violations."""
    real_failure_session = MagicMock()
    failing_tx_cm = MagicMock()
    failing_tx_cm.__aenter__ = AsyncMock(side_effect=OperationFailure("E11000 duplicate key"))
    failing_tx_cm.__aexit__ = AsyncMock(return_value=False)
    real_failure_session.start_transaction = MagicMock(return_value=failing_tx_cm)

    client = MagicMock()
    client.start_session = AsyncMock(return_value=_AsyncCM(real_failure_session))

    async def cb(s):
        return "never-reached"

    with pytest.raises(OperationFailure, match="duplicate key"):
        await with_atomic(client, cb)
