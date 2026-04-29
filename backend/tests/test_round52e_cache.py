"""Round 52e — Pure unit tests for core/cache.

Targets: cache_get, cache_set, cache_clear_prefix.
No I/O, no MongoDB, no FastAPI — fast & deterministic.
"""
import time

import pytest

from core import cache as cache_mod
from core.cache import cache_get, cache_set, cache_clear_prefix

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_cache():
    """Wipe the module-level dict before AND after every test.

    Without this, other tests' cache entries leak in and out which
    makes failure messages confusing and hides real bugs.
    """
    cache_mod._CACHE.clear()
    yield
    cache_mod._CACHE.clear()


class TestCacheBasic:
    def test_get_missing_key_returns_none(self):
        assert cache_get("nope") is None

    def test_set_then_get_returns_value(self):
        cache_set("k", {"v": 1}, ttl_seconds=10)
        assert cache_get("k") == {"v": 1}

    def test_overwriting_a_key_replaces_value(self):
        cache_set("k", "first", ttl_seconds=10)
        cache_set("k", "second", ttl_seconds=10)
        assert cache_get("k") == "second"

    def test_set_accepts_falsy_values(self):
        cache_set("empty", "", ttl_seconds=10)
        cache_set("zero", 0, ttl_seconds=10)
        cache_set("false", False, ttl_seconds=10)
        cache_set("none-list", [], ttl_seconds=10)
        # Important: cache_get returns the stored value even when falsy
        # (regression guard — early implementations returned None for
        # any falsy stored value).
        assert cache_get("empty") == ""
        assert cache_get("zero") == 0
        assert cache_get("false") is False
        assert cache_get("none-list") == []


class TestCacheTTL:
    def test_value_expires_after_ttl(self, monkeypatch):
        # Freeze time, set with 5s TTL, fast-forward 6s, expect None.
        t0 = 1_000_000.0
        monkeypatch.setattr("core.cache.time.time", lambda: t0)
        cache_set("k", "v", ttl_seconds=5)
        monkeypatch.setattr("core.cache.time.time", lambda: t0 + 6)
        assert cache_get("k") is None

    def test_expired_key_is_evicted(self, monkeypatch):
        t0 = 2_000_000.0
        monkeypatch.setattr("core.cache.time.time", lambda: t0)
        cache_set("k", "v", ttl_seconds=1)
        monkeypatch.setattr("core.cache.time.time", lambda: t0 + 2)
        cache_get("k")  # triggers eviction
        assert "k" not in cache_mod._CACHE

    def test_value_lives_within_ttl_window(self, monkeypatch):
        t0 = 3_000_000.0
        monkeypatch.setattr("core.cache.time.time", lambda: t0)
        cache_set("k", "hello", ttl_seconds=10)
        monkeypatch.setattr("core.cache.time.time", lambda: t0 + 9)
        assert cache_get("k") == "hello"


class TestCacheClearPrefix:
    def test_clears_only_matching_prefix(self):
        cache_set("users:1", "alice", ttl_seconds=60)
        cache_set("users:2", "bob", ttl_seconds=60)
        cache_set("groups:1", "trip", ttl_seconds=60)
        cache_clear_prefix("users:")
        assert cache_get("users:1") is None
        assert cache_get("users:2") is None
        assert cache_get("groups:1") == "trip"

    def test_no_op_when_nothing_matches(self):
        cache_set("a", 1, ttl_seconds=60)
        cache_clear_prefix("nonexistent:")
        assert cache_get("a") == 1

    def test_clears_when_called_with_empty_prefix(self):
        cache_set("a", 1, ttl_seconds=60)
        cache_set("b", 2, ttl_seconds=60)
        cache_clear_prefix("")
        # "" is a prefix of every string -> wipes the cache
        assert cache_get("a") is None
        assert cache_get("b") is None
