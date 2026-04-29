"""
Round 51n — Batch user lookup by phone.

Endpoint:
    POST /api/users/lookup-batch
    body: {"phones": ["9876543210", "9999988888", ...]}
    →    {"matches": [{"phone": "9876543210", "user_id": "...", "name": "..."}]}

Why batch instead of N×GET /users/by-phone?
    The Add-Member contacts picker can have hundreds of device contacts.
    Round-tripping each one is N HTTP calls AND N Mongo queries. A single
    {"$in": [...]} query with a unique index on `phone` is O(log N) per
    phone and one network round-trip total.

Privacy:
    • Only returns matches — non-matching phones are silently dropped.
      The client never gets a yes/no for an arbitrary number.
    • Auth required (JWT) — no anonymous reverse-lookup.
    • Rate-limited by max_batch (200) so a malicious client can't dump
      the user table 1000-at-a-time.
"""
from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.rate_limit import enforce_combined
from server import db

router = APIRouter()


class LookupBatchRequest(BaseModel):
    phones: List[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"


def _norm(p: str) -> str:
    """Match the frontend's normalizePhone() — strip non-digits, keep last 10."""
    return re.sub(r"\D", "", p or "")[-10:]


@router.post("/users/lookup-batch")
async def lookup_batch(
    req: LookupBatchRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    # Round 53g — Combined gate: per-user (100/hr) AND per-device (400/hr).
    # The device limiter closes the multi-account-from-one-device hole
    # the per-user limiter alone left open. Effective ceiling for any
    # single actor = min(user_limit, device_limit).
    await enforce_combined(
        user_id=user_id,
        request=request,
        bucket="lookup",
        user_limit=100,
        device_limit=400,
        window_s=3600,
    )

    if not req.phones:
        return {"matches": []}
    # Round 52g — tightened cap 200 → 100. With per-user limit of 100
    # calls/hour, the new ceiling is 10 K phones/hour/user (down from 20 K).
    # Most legitimate address-book imports are <500 contacts, so this
    # never affects normal users; it does halve the worst-case enumeration.
    if len(req.phones) > 100:
        raise HTTPException(status_code=400, detail="Too many phones (max 100 per call)")

    # Normalise on the server too — defends against clients that forgot.
    normed = sorted({_norm(p) for p in req.phones if _norm(p)})
    if not normed:
        return {"matches": []}

    cursor = db.users.find(
        {"phone": {"$in": normed}},
        {"_id": 1, "phone": 1, "name": 1},
    )

    matches = []
    async for u in cursor:
        # Skip the calling user — pointless to mark them as "On MintU"
        # in their own contacts picker.
        uid = str(u["_id"])
        if uid == user_id:
            continue
        matches.append({
            "phone": u.get("phone", ""),
            "user_id": uid,
            "name": u.get("name", ""),
        })
    return {"matches": matches}
