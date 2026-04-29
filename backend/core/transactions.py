"""
core/transactions.py — Round 52f + Round 53d

Mongo multi-document transaction helper with:

  • **Graceful fallback to compensating-action mode** for non-replica-set
    deployments (Round 52f).
  • **Post-commit hook system** that defers external side-effects
    (websocket emits, cache invalidations, notifications, event-bus
    publishes) until AFTER the transaction is durably committed
    (Round 53d).

WHY POST-COMMIT HOOKS?
----------------------
The classic fintech bug is firing a side-effect from inside a
transaction:

    async with txn:
        insert_expense()
        await ws.broadcast(...)        # ❌ fires even on rollback
        cache.invalidate(...)          # ❌ fires even on rollback
        await notification.send(...)   # ❌ fires even on rollback
    # ↑ if the commit fails, listeners saw an event for a write that
    #   never happened. Phantom notifications, ghost UI updates,
    #   inconsistent observers — all classic, all silent, all bad.

THE RULE (enforced by ``with_atomic_ctx``):

    1. INSIDE the transaction → DB writes ONLY.
    2. Side-effects (WS, cache, notifications, event-bus) → REGISTER
       them via ``ctx.on_commit(...)``; the helper fires them only
       after the commit succeeds.
    3. If the transaction rolls back, NONE of the hooks fire.
    4. Hook failures are logged and swallowed — they NEVER fail the
       user's request (the DB write already succeeded).

USAGE
-----
    async def _do_writes(session, ctx):
        expense_id = await db.split_expenses.insert_one(doc, session=session)
        await db.split_messages.insert_one(msg, session=session)

        # External side-effects: register, don't run.
        ctx.on_commit(lambda: ws.broadcast(group_id, payload))
        ctx.on_commit(lambda: cache.invalidate(group_id))

        return expense_id

    expense_id = await with_atomic_ctx(db.client, _do_writes)
    # ↑ the broadcast/invalidate already fired by here, in registration order.

ON ATLAS:    full ACID transaction; commit precedes hooks.
ON STANDALONE: best-effort + compensate on failure; hooks still fire
               only after the callback completes without raising.
"""
from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Any, Awaitable, Callable, List, Optional, Tuple, Union

from pymongo.errors import OperationFailure

logger = logging.getLogger("core.tx")


# ──────────────────────────────────────────────────────────────────────
#  POST-COMMIT CONTEXT
# ──────────────────────────────────────────────────────────────────────
HookFn = Callable[[], Union[None, Awaitable[None]]]


class PostCommitContext:
    """Carrier object the transaction handler uses to defer side-effects.

    Pass it to your handler via ``with_atomic_ctx``. Inside the handler:

        ctx.on_commit(lambda: do_thing(...))
        ctx.on_commit(some_async_fn)

    Hooks fire AFTER the DB transaction commits, in registration order.
    Hook exceptions are logged and swallowed — the user's API response
    still goes through. (Hooks should be idempotent; see module docstring.)
    """

    __slots__ = ("_hooks", "_committed", "_label")

    def __init__(self, label: str = "") -> None:
        self._hooks: List[HookFn] = []
        self._committed: bool = False
        self._label = label

    def on_commit(self, fn: HookFn) -> None:
        """Register a side-effect callable. Sync or async both fine."""
        if not callable(fn):
            raise TypeError(f"on_commit expects a callable, got {type(fn).__name__}")
        if self._committed:
            # The transaction already committed — fire immediately so
            # callers that register after-the-fact still get correct
            # ordering. (Edge case; primarily defensive.)
            logger.warning("on_commit called AFTER commit (%s) — firing immediately", self._label)
            asyncio.ensure_future(_run_hook(fn))
            return
        self._hooks.append(fn)

    @property
    def committed(self) -> bool:
        return self._committed

    @property
    def hook_count(self) -> int:
        return len(self._hooks)

    async def _fire(self) -> List[Tuple[HookFn, Optional[BaseException]]]:
        """Run every registered hook. Never raises — hook failures are
        logged + collected but the API response is unaffected.
        Returns a (fn, exception_or_None) per hook for testability.
        """
        self._committed = True
        results: List[Tuple[HookFn, Optional[BaseException]]] = []
        for fn in self._hooks:
            try:
                await _run_hook(fn)
                results.append((fn, None))
            except Exception as exc:  # noqa: BLE001 — hooks are best-effort
                logger.exception(
                    "post-commit hook %r failed (%s)", getattr(fn, "__name__", fn), self._label,
                )
                # Round 53e — surface previously-swallowed failures to Sentry.
                # Lazy-import so the transactions module stays usable when
                # observability isn't wired (e.g. unit tests with FakeClient).
                try:
                    from core.observability import capture_silenced
                    capture_silenced(
                        exc,
                        tag=f"post_commit_hook:{self._label or 'unknown'}",
                        extras={"hook": getattr(fn, "__name__", repr(fn))},
                    )
                except Exception:  # pragma: no cover — observability is best-effort
                    pass
                results.append((fn, exc))
        return results


async def _run_hook(fn: HookFn) -> None:
    """Execute a hook regardless of sync/async."""
    if inspect.iscoroutinefunction(fn):
        await fn()
        return
    res = fn()
    if inspect.isawaitable(res):
        await res


# ──────────────────────────────────────────────────────────────────────
#  CORE: with_atomic — DB-only callback (existing API, unchanged)
# ──────────────────────────────────────────────────────────────────────
async def with_atomic(
    client,
    callback: Callable[[Optional[object]], Awaitable[Any]],
    compensate: Optional[Callable[[Optional[Exception]], Awaitable[None]]] = None,
) -> Any:
    """Run `callback(session)` atomically.

    Args:
        client: motor.AsyncIOMotorClient (the *raw* client, not a db
                handle — we need it to start a session).
        callback: async fn that does the writes. Receives the session
                  (may be None on standalone Mongo).
        compensate: async fn called only when the callback raises AND
                    we're in fallback mode. Use it to undo whatever the
                    callback already wrote.

    Returns:
        Whatever the callback returns.
    """
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                result = await callback(session)
            return result
    except OperationFailure as e:
        # Standalone Mongo doesn't support transactions — fall back.
        msg = str(e).lower()
        if "replica set" in msg or "not supported" in msg or "transaction numbers" in msg:
            logger.warning(
                "with_atomic: Mongo cluster doesn't support transactions; "
                "falling back to compensating-action mode."
            )
            try:
                return await callback(None)
            except Exception as exc:
                if compensate is not None:
                    try:
                        await compensate(exc)
                    except Exception as comp_exc:  # pragma: no cover
                        logger.error("Compensate failed: %s (after %s)", comp_exc, exc)
                raise
        raise


# ──────────────────────────────────────────────────────────────────────
#  CORE: with_atomic_ctx — DB writes + post-commit hooks (new API)
# ──────────────────────────────────────────────────────────────────────
async def with_atomic_ctx(
    client,
    callback: Callable[[Optional[object], PostCommitContext], Awaitable[Any]],
    compensate: Optional[Callable[[Optional[Exception]], Awaitable[None]]] = None,
    *,
    label: str = "",
) -> Any:
    """Like ``with_atomic`` but the callback receives (session, ctx).

    Side-effects registered via ``ctx.on_commit(fn)`` fire ONLY after
    the transaction successfully commits — never on rollback paths.
    Hook failures are logged + swallowed (best-effort, never block
    the API response).

    On standalone Mongo (compensate-mode), hooks fire only when the
    callback completes without raising; if the callback raises and the
    compensate callable runs, hooks DO NOT fire. Same correctness
    guarantee as on Atlas.

    Args:
        client: motor.AsyncIOMotorClient
        callback: async fn ``(session, ctx) -> Any``
        compensate: optional async fn for standalone-mode rollback
        label: human-readable tag for logs (e.g. ``"split_expense"``)

    Returns:
        Whatever the callback returns.

    Raises:
        Anything the callback raises (same as with_atomic). Hook errors
        are NEVER re-raised.
    """
    ctx = PostCommitContext(label=label)

    async def _wrapped(session):
        return await callback(session, ctx)

    result = await with_atomic(client, _wrapped, compensate)

    # Commit succeeded → fire side-effects.
    await ctx._fire()
    return result


__all__ = [
    "with_atomic",
    "with_atomic_ctx",
    "PostCommitContext",
]
