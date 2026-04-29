"""Round 53d — Post-commit hook tests.

Verifies the contract:

  ✓ hooks fire ONLY after successful commit
  ✗ hooks DO NOT fire when callback raises (rollback path)
  ✗ hooks DO NOT fire on standalone-mode compensate
  ✓ hook failures are logged + swallowed (response unaffected)
  ✓ hooks run in registration order
  ✓ both sync and async hooks supported

Uses a tiny fake Mongo client so the test stays a pure-Python unit
test (no event-loop binding issues across tests).
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import pytest
from pymongo.errors import OperationFailure

from core.transactions import (
    PostCommitContext,
    with_atomic,
    with_atomic_ctx,
)

pytestmark = pytest.mark.unit


# ──────────────────────────────────────────────────────────────────────
#  Fake Mongo client — minimal surface needed by with_atomic.
# ──────────────────────────────────────────────────────────────────────
class _FakeSession:
    @asynccontextmanager
    async def start_transaction(self):
        yield

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeClient:
    """Behaves like a Motor client for the with_atomic happy path."""
    def __init__(self, supports_transactions: bool = True):
        self._supports = supports_transactions

    async def start_session(self):
        if not self._supports:
            # Mimic standalone Mongo's failure on session creation when
            # transactions are needed — actually the failure is on
            # `start_transaction()` itself, not the session, so we model
            # that below.
            pass
        return _FakeSessionWithTx(self._supports)


class _FakeSessionWithTx:
    def __init__(self, supports: bool):
        self._supports = supports

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    @asynccontextmanager
    async def start_transaction(self):
        if not self._supports:
            raise OperationFailure(
                "Transaction numbers are only allowed on a replica set member"
            )
        yield


# ──────────────────────────────────────────────────────────────────────
#  PostCommitContext — registration semantics
# ──────────────────────────────────────────────────────────────────────
class TestPostCommitContext:
    async def test_register_and_fire_runs_in_order(self):
        ctx = PostCommitContext(label="t")
        log = []
        ctx.on_commit(lambda: log.append("a"))
        ctx.on_commit(lambda: log.append("b"))
        ctx.on_commit(lambda: log.append("c"))
        results = await ctx._fire()
        assert log == ["a", "b", "c"]
        assert all(exc is None for _, exc in results)
        assert ctx.committed is True
        assert ctx.hook_count == 3

    async def test_async_hooks_supported(self):
        ctx = PostCommitContext()
        log = []

        async def _hook():
            log.append("async")
        ctx.on_commit(_hook)
        await ctx._fire()
        assert log == ["async"]

    async def test_hook_failure_is_swallowed(self):
        ctx = PostCommitContext()
        log = []

        def _bad():
            raise RuntimeError("boom")

        ctx.on_commit(lambda: log.append("before"))
        ctx.on_commit(_bad)
        ctx.on_commit(lambda: log.append("after"))
        results = await ctx._fire()
        # Other hooks still ran.
        assert log == ["before", "after"]
        # The bad hook is reported with its exception.
        excs = [e for _, e in results if e is not None]
        assert len(excs) == 1
        assert isinstance(excs[0], RuntimeError)

    async def test_rejects_non_callable(self):
        ctx = PostCommitContext()
        with pytest.raises(TypeError, match="callable"):
            ctx.on_commit("not a function")  # type: ignore[arg-type]

    async def test_committed_flag_starts_false(self):
        ctx = PostCommitContext()
        assert ctx.committed is False


# ──────────────────────────────────────────────────────────────────────
#  with_atomic_ctx — the integration glue
# ──────────────────────────────────────────────────────────────────────
class TestWithAtomicCtx:
    async def test_hooks_fire_after_successful_commit(self):
        client = _FakeClient(supports_transactions=True)
        log = []

        async def _do(session, ctx):
            log.append("write")
            ctx.on_commit(lambda: log.append("hook1"))
            ctx.on_commit(lambda: log.append("hook2"))
            return "ok"

        result = await with_atomic_ctx(client, _do)
        assert result == "ok"
        # Writes happen first, then hooks in order.
        assert log == ["write", "hook1", "hook2"]

    async def test_hooks_DO_NOT_fire_if_callback_raises(self):
        client = _FakeClient(supports_transactions=True)
        log = []

        async def _do(session, ctx):
            log.append("write")
            ctx.on_commit(lambda: log.append("hook-MUST-NOT-RUN"))
            raise RuntimeError("simulated rollback")

        with pytest.raises(RuntimeError, match="simulated rollback"):
            await with_atomic_ctx(client, _do)

        # Hook MUST NOT have fired — this is the load-bearing assertion.
        assert "hook-MUST-NOT-RUN" not in log
        assert log == ["write"]

    async def test_hooks_DO_NOT_fire_when_compensate_runs(self):
        # Standalone Mongo path: callback raises, compensate runs.
        # Hooks must still NOT fire.
        client = _FakeClient(supports_transactions=False)
        log = []

        async def _do(session, ctx):
            log.append("write")
            ctx.on_commit(lambda: log.append("hook-MUST-NOT-RUN"))
            raise RuntimeError("rollback me")

        async def _compensate(_exc):
            log.append("compensated")

        with pytest.raises(RuntimeError):
            await with_atomic_ctx(client, _do, _compensate)

        assert "hook-MUST-NOT-RUN" not in log
        assert log == ["write", "compensated"]

    async def test_hooks_fire_on_standalone_when_callback_succeeds(self):
        # Standalone Mongo path: no transaction, but callback succeeded
        # → hooks SHOULD fire (correctness depends on the callback).
        client = _FakeClient(supports_transactions=False)
        log = []

        async def _do(session, ctx):
            assert session is None  # standalone fallback
            log.append("write")
            ctx.on_commit(lambda: log.append("hook"))
            return 42

        result = await with_atomic_ctx(client, _do)
        assert result == 42
        assert log == ["write", "hook"]

    async def test_hook_failure_does_not_break_response(self):
        client = _FakeClient(supports_transactions=True)

        async def _do(session, ctx):
            ctx.on_commit(lambda: (_ for _ in ()).throw(RuntimeError("ws down")))
            return {"id": "abc"}

        # Even though the hook raises, the response goes through.
        result = await with_atomic_ctx(client, _do)
        assert result == {"id": "abc"}

    async def test_returns_value_from_callback(self):
        client = _FakeClient(supports_transactions=True)

        async def _do(session, ctx):
            return {"answer": 42}

        assert await with_atomic_ctx(client, _do) == {"answer": 42}
