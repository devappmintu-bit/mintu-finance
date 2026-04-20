"""MintU shared core — importable utilities for routers.

Keeps the public surface minimal so routers don't need to know about server.py's internals.
"""
from .db import db, client
from .auth import get_current_user, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_DAYS
from .cache import cache_get, cache_set, cache_clear_prefix
from .ids import safe_oid, try_oid

__all__ = [
    "db", "client",
    "get_current_user", "JWT_SECRET", "JWT_ALGORITHM", "JWT_EXPIRATION_DAYS",
    "cache_get", "cache_set", "cache_clear_prefix",
    "safe_oid", "try_oid",
]
