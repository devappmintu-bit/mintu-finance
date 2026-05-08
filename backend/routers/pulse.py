"""Pulse API — `/api/pulse` and `/api/pulse/seen`.

Thin wrapper over `services.pulse`. Keeping it thin is intentional: the
impact-layer templates and category filter live in the service so they
can be unit-tested without spinning up FastAPI.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_user
from services.pulse import build_pulse_feed, mark_pulse_seen

router = APIRouter(prefix="/pulse", tags=["pulse"])


@router.get("")
async def get_pulse(user_id: str = Depends(get_current_user)):
    """Return personalised Pulse cards for the current user.

    Contract (shape is stable — frontend depends on it):
        {
            cards:        [PulseCard, … max 7],
            unread_count: int,
            has_important: bool,
            last_seen_at: iso-ts | null,
            is_fallback:  bool,   # true when served from curated stub
        }
    """
    try:
        return await build_pulse_feed(user_id)
    except Exception as e:  # pragma: no cover — surface safe shape to UI.
        # Never 500 — an empty Pulse is better than a crashed Home button.
        import logging
        logging.getLogger("pulse").exception(f"pulse feed failed: {e}")
        return {"cards": [], "unread_count": 0, "has_important": False,
                "last_seen_at": None, "is_fallback": True}


@router.post("/seen")
async def post_pulse_seen(user_id: str = Depends(get_current_user)):
    """Mark the Pulse feed as read for this user — clears the badge.

    Idempotent. Called when the user opens `/pulse` or swipes past the
    last card.
    """
    try:
        await mark_pulse_seen(user_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Could not mark seen: {e}")


__all__ = ["router"]
