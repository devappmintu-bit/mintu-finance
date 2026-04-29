"""Round 52e — Pure unit tests for core/ws_manager.WSManager.

We stub the FastAPI WebSocket interface with a tiny mock that records
every send_json call AND lets us simulate failures via a flag.
"""
from __future__ import annotations

import asyncio
from typing import Any, List

import pytest

from core.ws_manager import WSManager

pytestmark = pytest.mark.unit


class FakeWS:
    """Minimal stand-in for a Starlette WebSocket.

    Only the methods WSManager calls (`send_json`) are implemented.
    `should_fail` flips the next send into a raised exception so we
    can assert the dead-socket eviction path.
    """

    def __init__(self, name: str = "", should_fail: bool = False) -> None:
        self.name = name
        self.should_fail = should_fail
        self.sent: List[Any] = []

    async def send_json(self, payload: Any) -> None:
        if self.should_fail:
            raise RuntimeError(f"socket {self.name} dead")
        self.sent.append(payload)

    def __repr__(self) -> str:  # pragma: no cover
        return f"FakeWS({self.name})"


async def test_connect_and_disconnect_lifecycle():
    m = WSManager()
    ws = FakeWS("a")
    await m.connect("g1", ws)
    assert m.stats() == {"g1": 1}
    await m.disconnect("g1", ws)
    # Empty groups should be removed entirely (no stale keys).
    assert m.stats() == {}


async def test_broadcast_delivers_to_all_subscribers():
    m = WSManager()
    a, b, c = FakeWS("a"), FakeWS("b"), FakeWS("c")
    await m.connect("g1", a)
    await m.connect("g1", b)
    await m.connect("g2", c)

    delivered = await m.broadcast("g1", {"type": "message", "data": "hi"})
    assert delivered == 2
    assert a.sent == [{"type": "message", "data": "hi"}]
    assert b.sent == [{"type": "message", "data": "hi"}]
    # Different group, never received the broadcast.
    assert c.sent == []


async def test_broadcast_to_unknown_group_returns_zero():
    m = WSManager()
    delivered = await m.broadcast("ghost", {"x": 1})
    assert delivered == 0


async def test_dead_socket_is_evicted_after_send_failure():
    m = WSManager()
    good = FakeWS("good")
    bad = FakeWS("bad", should_fail=True)
    await m.connect("g1", good)
    await m.connect("g1", bad)
    delivered = await m.broadcast("g1", {"x": 1})
    # `bad` raised in send_json — only the healthy socket counts.
    assert delivered == 1
    # `bad` should be auto-removed from the registry.
    assert m.stats() == {"g1": 1}


async def test_concurrent_connects_are_safe():
    m = WSManager()
    sockets = [FakeWS(str(i)) for i in range(50)]
    # Hammer the lock with concurrent connects.
    await asyncio.gather(*(m.connect("g1", s) for s in sockets))
    assert m.stats() == {"g1": 50}
    # And disconnect them concurrently.
    await asyncio.gather(*(m.disconnect("g1", s) for s in sockets))
    assert m.stats() == {}


async def test_double_disconnect_is_a_noop():
    m = WSManager()
    ws = FakeWS()
    await m.connect("g", ws)
    await m.disconnect("g", ws)
    # Second disconnect on an already-empty group must not raise.
    await m.disconnect("g", ws)
    assert m.stats() == {}


async def test_broadcast_serialises_per_socket_failures_in_isolation():
    """If three of five sockets are dead, the surviving two still get
    the message AND only the dead ones are evicted."""
    m = WSManager()
    good1, good2 = FakeWS("g1"), FakeWS("g2")
    bad1, bad2, bad3 = FakeWS("b1", True), FakeWS("b2", True), FakeWS("b3", True)
    for ws in (good1, bad1, good2, bad2, bad3):
        await m.connect("g", ws)
    delivered = await m.broadcast("g", {"x": 1})
    assert delivered == 2
    assert m.stats() == {"g": 2}
