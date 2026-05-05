"""
routers/onboarding.py — Round 98 onboarding endpoints.

Endpoints:
  POST /api/onboarding/seed {income}     → seeds starter cards + anchor
  GET  /api/onboarding/starter-cards     → reads back the seeded cards

Frontend calls seed immediately after the income-slider screen. Home
hero reads `user_coach_context.diagnostic_seed` for instant first-paint.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db
from core.auth import get_current_user
from services.onboarding_seed import seed_user_coach_context

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class SeedRequest(BaseModel):
    income: int = Field(..., ge=0, le=10_000_000, description="Monthly take-home in ₹")


@router.post("/seed")
async def seed(req: SeedRequest, user_id: str = Depends(get_current_user)):
    """Seed the user's coach context with starter cards + peer anchor.
    Safe to call multiple times (idempotent via upsert)."""
    return await seed_user_coach_context(user_id, req.income)


@router.get("/starter-cards")
async def starter_cards(user_id: str = Depends(get_current_user)):
    """Return the 3 pre-computed starter cards. Used by Home on first
    open, before any real transactions exist."""
    doc = await db.user_coach_context.find_one({"user_id": user_id})
    if not doc:
        return {"cards": [], "anchor": None, "seeded": False}
    return {
        "cards": doc.get("starter_cards", []),
        "anchor_pct": doc.get("peer_anchor_pct"),
        "anchor_copy": doc.get("peer_anchor_copy"),
        "diagnostic_seed": doc.get("diagnostic_seed"),
        "seeded": True,
    }


__all__ = ["router"]
