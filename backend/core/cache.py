"""Lightweight in-memory TTL cache shared by routers & server.

Thread-safety: single-worker uvicorn is our deploy model, so we don't bother
with locks. Upgrade to Redis if multi-worker is added later.
"""
import time
from typing import Any, Dict, Optional

_CACHE: Dict[str, tuple] = {}


def cache_get(key: str) -> Optional[Any]:
    v = _CACHE.get(key)
    if not v:
        return None
    value, expires = v
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    _CACHE[key] = (value, time.time() + ttl_seconds)


def cache_clear_prefix(prefix: str) -> None:
    for k in list(_CACHE.keys()):
        if k.startswith(prefix):
            _CACHE.pop(k, None)


def invalidate_user_transaction_caches(user_id: str) -> None:
    """
    Single source of truth for "the user just had a transaction created /
    updated / deleted — bust everything that's derived from the txn graph".

    Why this lives in core/cache.py (not in routers/transactions.py):
        FOUR different routers commit transactions today:
            • routers/transactions.py — manual entry / pending review
            • routers/cash.py         — Cash board adds + transfers
            • routers/sms.py          — SMS paste import
            • routers/gmail_oauth.py  — Gmail receipt import
            • routers/coach_v2.py     — coach-suggested commits
        If each one rolls its own prefix list, drift is inevitable
        (e.g. R118 cache keys had to be added to /transactions and
        /sms but were missed in the other 3 — leaving the home
        dashboard silently stale on Cash/Gmail/Coach commits).
        A single helper guarantees parity on every commit path.

    Cache prefixes that depend on the user's transaction graph and
    therefore MUST be busted on any write:
        • Phase-5 analytics / waste / score breakdown / home / ai-predict
        • alerts_smart, expense_report, coins_status, analytics_summary
        • R118 intelligence: mood / story / behavior / cashflow / subs
          (NOTE: short suffix names — see routers/intelligence.py for
          the corresponding cache_set keys)
    """
    # Phase 5 Wave 1
    cache_clear_prefix(f"waste:{user_id}")
    cache_clear_prefix(f"expense_report:{user_id}")
    cache_clear_prefix(f"score_breakdown:{user_id}")
    # Phase 5 Wave 2
    cache_clear_prefix(f"alerts_smart:{user_id}")
    cache_clear_prefix(f"analytics_summary:{user_id}")
    # Phase 5 Wave 3
    cache_clear_prefix(f"home_snapshot:{user_id}")
    cache_clear_prefix(f"ai_predict:{user_id}")
    cache_clear_prefix(f"coins_status:{user_id}")
    # Round 92 Diagnostic Score — derived from transactions; the route
    # comment at routers/diagnostic_score.py:78 explicitly says "cache
    # invalidated by the txn router", but the helper had been missing
    # this prefix until the R118 audit. 60s TTL would otherwise hide
    # the new transaction's effect on the score panel for up to a min.
    cache_clear_prefix(f"diagnostic_score:{user_id}")
    # R118 Real-Time SMS Intelligence Engine — short cache key names
    # MUST match what routers/intelligence.py writes via cache_set().
    cache_clear_prefix(f"intelligence:mood:{user_id}")
    cache_clear_prefix(f"intelligence:story:{user_id}")
    cache_clear_prefix(f"intelligence:behavior:{user_id}")
    cache_clear_prefix(f"intelligence:cashflow:{user_id}")
    cache_clear_prefix(f"intelligence:subs:{user_id}")
