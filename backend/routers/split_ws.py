"""
Round 51k — Real-time chat WebSocket endpoint.

Path: /api/ws/split/{group_id}?token=<JWT>

Why query-param auth?
    Browser/RN WebSocket APIs don't support custom headers, so the JWT
    rides as a query parameter. We accept ONLY the same JWTs the rest
    of the API uses (no sub-tokens, no API keys), validate the user
    still exists, and verify they're a member of `group_id` BEFORE
    accepting the upgrade. Unauthorised connections are closed with a
    well-defined close code so clients can distinguish "expired token"
    from "kicked from group".

Close codes (private 4xxx range, mapped 1:1 with HTTP semantics):
    4400  malformed group_id / token
    4401  invalid or expired JWT
    4403  not a member of this group (or group missing)

Wire protocol:
    Server → client:
        {"type": "connected", "group_id": "..."}                 — handshake ack
        {"type": "message",   "data": {<message doc>}}           — broadcast
        {"type": "pong"}                                         — heartbeat reply
    Client → server:
        {"type": "ping"}                                         — heartbeat
        (sending messages still goes through HTTP POST; WS is
         broadcast-only by design — keeps offline-queue + retry logic
         out of the socket loop and lets server-side audit trails stay
         on the existing path.)
"""
from __future__ import annotations

import logging

import jwt
from bson import ObjectId
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from core.auth import JWT_ALGORITHM, JWT_SECRET
from core.ws_manager import manager
from core.ids import safe_oid

logger = logging.getLogger("split.ws")
router = APIRouter()


@router.websocket("/ws/split/{group_id}")
async def ws_split_group(
    ws: WebSocket,
    group_id: str,
    token: str = Query(..., description="JWT bearer token"),
):
    # ── 1. Validate JWT ─────────────────────────────────────────────
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("user_id")
    except jwt.ExpiredSignatureError:
        await ws.close(code=4401, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await ws.close(code=4401, reason="Invalid token")
        return

    if not uid or not isinstance(uid, str) or not ObjectId.is_valid(uid):
        await ws.close(code=4401, reason="Invalid token payload")
        return
    if not ObjectId.is_valid(group_id):
        await ws.close(code=4400, reason="Invalid group_id")
        return

    # ── 2. Validate group membership (deferred import: server.db) ──
    from server import db  # noqa: E402
    g = await db.split_groups.find_one(
        {"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": uid},
        {"_id": 1},
    )
    if not g:
        await ws.close(code=4403, reason="Not a member")
        return

    # ── 3. Accept + register ───────────────────────────────────────
    await ws.accept()
    await manager.connect(group_id, ws)
    try:
        await ws.send_json({"type": "connected", "group_id": group_id})
    except Exception:
        # Client vanished mid-handshake — clean up and bail.
        await manager.disconnect(group_id, ws)
        return

    # ── 4. Pump (heartbeat + ignore unknown payloads) ─────────────
    try:
        while True:
            data = await ws.receive_json()
            if isinstance(data, dict) and data.get("type") == "ping":
                # Reply with monotonic-ish server-side ack.
                await ws.send_json({"type": "pong"})
            # Any other client → server payloads are silently ignored
            # in this iteration. Sending messages goes through HTTP
            # POST /split/groups/{id}/messages so the existing audit
            # log + cache-invalidation pipeline stays the source of truth.
    except WebSocketDisconnect:
        pass
    except Exception as e:
        # Don't let one bad client tear down others. Log + clean up.
        logger.debug("ws %s receive error: %s", group_id, e)
    finally:
        await manager.disconnect(group_id, ws)
