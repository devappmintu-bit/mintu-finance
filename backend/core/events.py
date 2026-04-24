"""Lightweight in-process event bus for MintU.

Round 30e (R3) — Declarative post-mutation side-effects.

Why:
    • Currently, side-effects (budget alerts, reminder dismissal, coin
      awards, badge checks, notification emission) are scattered inline
      across router code. Makes it hard to see "what happens when a
      transaction is added" and easy to forget a dependency.
    • This bus lets each domain publish well-named events; unrelated
      subscribers wire themselves up at startup. Side-effect chains
      become declarative and grep-able.

Constraints (intentional):
    • In-process only — no Redis/RabbitMQ. Don't need cross-process.
    • Fire-and-forget async — emit returns immediately; handlers run
      concurrently on the event loop. Slow handlers don't block the
      emitter (unless they raise — exceptions are caught and logged).
    • Ordered-by-registration within a single event kind (registration
      order determines concurrent fan-out order on asyncio gather).
    • Event payloads are plain dicts — no Pydantic validation, no
      cross-module type-checking. If you need strict contracts, add
      TypedDicts at the call site.

NOT for:
    • User-facing responses that depend on the side-effect result —
      those MUST stay inline (e.g. /split/settle returning the coin
      award). Use this only for background work.
    • Ordered workflows — if handler B must run after handler A,
      compose them into a single handler, don't rely on registration
      order for correctness.

Usage:
    from core.events import emit, on

    @on("transaction.created")
    async def check_budget_breach(event: dict):
        ...

    # inside a router, after the DB write:
    emit("transaction.created", user_id=uid, amount=300, category="Food")
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List

logger = logging.getLogger("mintu.events")

# Handler signature: takes the event payload dict, returns an awaitable.
Handler = Callable[[Dict[str, Any]], Awaitable[Any]]

_handlers: Dict[str, List[Handler]] = {}


def on(event_name: str) -> Callable[[Handler], Handler]:
    """Decorator to register an async handler for an event name.

    Handlers accumulate — multiple modules can subscribe to the same
    event and each will run concurrently when the event fires.
    """
    def decorator(fn: Handler) -> Handler:
        _handlers.setdefault(event_name, []).append(fn)
        logger.debug(f"[events] registered handler '{fn.__name__}' for '{event_name}'")
        return fn
    return decorator


def emit(event_name: str, **payload: Any) -> None:
    """Fire an event. Non-blocking — schedules handlers on the running
    loop and returns immediately. Exceptions inside handlers are
    caught + logged so one bad subscriber can't poison the chain.

    Safe to call from any async context; falls back to a best-effort
    synchronous schedule if no loop is running (e.g. during tests).
    """
    handlers = _handlers.get(event_name) or []
    if not handlers:
        return

    event = {"event": event_name, **payload}

    async def _fan_out():
        # asyncio.gather with return_exceptions to isolate failures.
        results = await asyncio.gather(
            *(_safe_call(h, event) for h in handlers),
            return_exceptions=True,
        )
        for h, r in zip(handlers, results):
            if isinstance(r, Exception):
                logger.warning(f"[events] handler '{h.__name__}' for '{event_name}' raised: {r}")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_fan_out())
    except RuntimeError:
        # No running loop — caller is sync (e.g. pytest fixture or cli).
        # Best-effort: run to completion inline.
        try:
            asyncio.run(_fan_out())
        except Exception as e:
            logger.warning(f"[events] inline fan-out failed for '{event_name}': {e}")


async def _safe_call(handler: Handler, event: Dict[str, Any]) -> Any:
    try:
        return await handler(event)
    except Exception as e:
        # Return the exception so gather() can continue; _fan_out() logs.
        raise e


# ─── Introspection helpers (for tests / devtools) ─────────────────────

def handlers_for(event_name: str) -> List[str]:
    """Return the names of handlers registered for an event."""
    return [fn.__name__ for fn in _handlers.get(event_name, [])]


def clear_handlers_for_tests() -> None:
    """ONLY for tests — wipes all handler registrations."""
    _handlers.clear()


# ─── Canonical event names ────────────────────────────────────────────
# Declare these as constants so subscribers never typo an event name.

class Events:
    TRANSACTION_CREATED     = "transaction.created"
    TRANSACTION_UPDATED     = "transaction.updated"
    TRANSACTION_DELETED     = "transaction.deleted"
    SETTLEMENT_COMPLETED    = "split.settlement_completed"
    GROUP_CREATED           = "split.group_created"
    EXPENSE_CREATED         = "split.expense_created"
    COINS_AWARDED           = "coins.awarded"
    BUDGET_BREACHED         = "budget.breached"   # 100%
    BUDGET_WARNING          = "budget.warning"    # 80%
    MISSION_CLAIMED         = "missions.claimed"
    ACCOUNT_SOFT_DELETED    = "user.soft_deleted"
    ACCOUNT_HARD_DELETED    = "user.hard_deleted"
