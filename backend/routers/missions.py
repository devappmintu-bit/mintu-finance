"""routers/missions.py — Round 99I.

User-facing endpoints over the Mission backbone.

ROUTES
------
GET   /api/missions/current
        Returns the user's active monthly mission, or null if none.
        This is the primary read for the Home Mission Strip.

POST  /api/missions/contribute
        Record an outcome contribution. Body: { amount, kind, label }.
        Idempotent via the (user_id, Idempotency-Key) tuple. The
        idempotency middleware does NOT cover this route by default
        (it's not a financial mutation in the strict sense), so the
        service-level idem layer in services/missions.py handles it.

POST  /api/missions/seed
        Force-create the current month's mission. Normally fired
        automatically by the onboarding seed flow; exposed so the user
        can manually re-seed if their income changed.

CONTRACT
--------
A user has at most ONE active mission per calendar month. Calls to
seed/get always operate on the current period. Past-period missions
are never returned by /current.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.db import db
from services.missions import (
    contribute,
    get_active_mission,
    seed_initial_mission,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/missions", tags=["missions"])


class ContributeBody(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)
    kind: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=200)


class SeedBody(BaseModel):
    """Optional override params; otherwise we read from the user's
    saved coach context."""
    income_monthly: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    peer_pct: Optional[int] = Field(default=None, ge=0, le=80)


@router.get("/current")
async def current_mission(user_id: str = Depends(get_current_user)):
    m = await get_active_mission(user_id)
    return {"mission": m}


@router.post("/seed")
async def seed_mission(
    body: SeedBody,
    user_id: str = Depends(get_current_user),
):
    # If the caller didn't pass income/peer explicitly, read from the
    # coach context which the onboarding seed populates.
    income = body.income_monthly
    peer = body.peer_pct
    if income is None or peer is None:
        ctx = await db.user_coach_context.find_one({"user_id": user_id}) or {}
        if income is None:
            income = int(ctx.get("income_monthly") or 0)
        if peer is None:
            peer = int(ctx.get("peer_anchor_pct") or 12)

    if not income or income <= 0:
        raise HTTPException(
            status_code=400,
            detail="Income unknown. Complete the income slider first or pass income_monthly.",
        )

    m = await seed_initial_mission(user_id, income, peer)
    return {"mission": m, "seeded": True}


@router.post("/contribute")
async def contribute_route(
    body: ContributeBody,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    m = await contribute(
        user_id=user_id,
        amount=body.amount,
        kind=body.kind,
        label=body.label,
        idem_key=idempotency_key,
    )
    if m is None:
        raise HTTPException(
            status_code=404,
            detail="No active mission found. Seed one via POST /missions/seed first.",
        )
    return {"mission": m}


__all__ = ["router"]
