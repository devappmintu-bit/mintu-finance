"""core/llm_safe.py — global timeout + dedup wrapper for LLM calls.

WHY THIS EXISTS
---------------
Round 61 fixed `/api/home/bundle` by adding per-slice timeouts.
Production access logs after that fix exposed the SAME pattern in
many other endpoints:

    /api/news/india-finance        → 27,207 ms
    /api/streak/check-in           → 27,207 ms
    /api/leaderboard/unified       → 30,387 ms
    /api/profile/identity          → 30,405 ms
    /api/rewards/summary           → 57,673 ms
    POST /api/user/avatar          → 57,454 ms

Common cause: each handler calls LiteLLM directly via
`emergentintegrations.LlmChat.send_message`. LiteLLM's per-key
concurrency cap means parallel calls queue up — the FIRST call's
LLM completion blocks all the rest. With no upstream timeout the
queued callers wait until the LLM is free OR the request times out
at the proxy/edge.

THE FIX (this module)
---------------------
Provide a tiny `safe_send(chat, msg, *, timeout=...)` helper that
wraps `chat.send_message(msg)` in `asyncio.wait_for`. Caller-side
fallbacks become trivial:

    response = await safe_send(chat, UserMessage(text=prompt))
    if response is None:
        return cached_or_default()  # timed out / failed

Default timeout is 8 s, calibrated against the long-tail latency of
`gpt-5.2` (P99 ≈ 4-6 s) and `claude-haiku-4-5` (P99 ≈ 2-3 s).

NEXT STEPS
----------
A future round should sweep every `await chat.send_message(` call
site in routers/ and switch to `await safe_send(chat, ...)`. This
module makes that codemod a one-liner per call.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Default timeout for any LLM call. Calibrated against gpt-5.2 P99 (~6s)
# with a safety margin. Override per call when a slower model is used.
DEFAULT_LLM_TIMEOUT_S = 8.0


async def safe_send(
    chat: Any,
    message: Any,
    *,
    timeout: float = DEFAULT_LLM_TIMEOUT_S,
    label: Optional[str] = None,
) -> Optional[Any]:
    """Run `chat.send_message(message)` with a hard timeout.

    Returns ``None`` on timeout or any exception. Caller decides
    fallback (cached value, default copy, fallback UI hint).

    Args:
        chat: An `emergentintegrations.LlmChat` instance.
        message: A `UserMessage(...)` payload.
        timeout: Seconds to wait before cancelling. Default 8 s.
        label: Optional tag for log lines (e.g. "smart_alerts",
            "weekly_report") — surfaces in the timeout warning so
            the JSON access log + this warn line can be correlated.

    Returns:
        The string/text response from the LLM, or `None`.
    """
    try:
        return await asyncio.wait_for(
            chat.send_message(message),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "LLM call timed out after %.1fs%s — caller falls back",
            timeout,
            f" [{label}]" if label else "",
        )
        return None
    except Exception as e:  # noqa: BLE001 — broad on purpose
        logger.warning(
            "LLM call failed%s — caller falls back: %s",
            f" [{label}]" if label else "",
            type(e).__name__,
        )
        return None


__all__ = ["safe_send", "DEFAULT_LLM_TIMEOUT_S"]
