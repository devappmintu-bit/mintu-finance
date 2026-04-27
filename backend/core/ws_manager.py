"""
Round 51k — WebSocket connection manager (in-memory pub/sub).

Single-instance, in-process broker for /api/ws/split/{group_id} chat
broadcasts. Keeps a `{group_id: set[WebSocket]}` registry and
fan-outs JSON payloads to every active subscriber.

Why no Redis backplane?
    Mintu is currently a single-uvicorn-worker deployment. A Redis or
    NATS pub/sub adds operational surface area for zero benefit at
    this scale. If/when we go multi-instance the public API of this
    module (`connect`, `disconnect`, `broadcast`) is preserved so the
    swap is a one-file diff.

Robustness:
    • Snapshot the connection set before iterating (avoid mutation
      during fan-out).
    • Catch & evict dead sockets so a stale connection can't poison
      future broadcasts.
    • All public methods are coroutines guarded by an asyncio.Lock,
      so concurrent connect/disconnect/broadcast are safe.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger("split.ws")


class WSManager:
    def __init__(self) -> None:
        self._conns: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, group_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._conns[group_id].add(ws)

    async def disconnect(self, group_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if group_id in self._conns:
                self._conns[group_id].discard(ws)
                if not self._conns[group_id]:
                    del self._conns[group_id]

    async def broadcast(self, group_id: str, payload: Dict[str, Any]) -> int:
        """Fan-out payload to every active subscriber on `group_id`.

        Returns the number of successful deliveries. Sockets that error
        during send are evicted automatically.
        """
        # Snapshot under lock so we don't iterate while the set mutates.
        async with self._lock:
            conns = list(self._conns.get(group_id, ()))
        if not conns:
            return 0

        delivered = 0
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
                delivered += 1
            except Exception as e:
                # Treat ANY send failure as "this socket is gone".
                # Common causes: client closed, network blip, app
                # backgrounded long enough to TCP-RST.
                logger.debug("ws broadcast drop %s: %s", group_id, e)
                dead.append(ws)
        for ws in dead:
            await self.disconnect(group_id, ws)
        return delivered

    def stats(self) -> Dict[str, int]:
        """Light introspection for /api/admin telemetry if we ever want it."""
        return {gid: len(s) for gid, s in self._conns.items()}


# Module-level singleton — imported by routers/split_ws.py and the
# split_groups.py / split_expenses.py message-insert paths.
manager = WSManager()
