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
