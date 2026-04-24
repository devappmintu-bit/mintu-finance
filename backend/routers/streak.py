"""routers/streak.py — Public API for the daily-streak + coins rebuild.

Endpoints
---------
  POST /api/streak/check-in   — idempotent daily check-in (awards coins)
  GET  /api/streak/status     — read-only snapshot for UI
  GET  /api/coins/balance     — canonical balance from ledger
  GET  /api/coins/history     — immutable ledger history (last 50)
"""
from fastapi import APIRouter, Depends, HTTPException

from core import get_current_user
from core import ledger as ledger_service
from core import streak as streak_service

router = APIRouter(tags=["streak-coins"])


# ══════════════════════════════════════════════════════════════════════
#  STREAK
# ══════════════════════════════════════════════════════════════════════
@router.post("/streak/check-in")
async def check_in(user_id: str = Depends(get_current_user)):
    """Record today's check-in. Idempotent per UTC day per user.

    Returns the new streak + coins snapshot. The frontend should call this
    on app cold-start exactly once; subsequent calls in the same UTC day
    return `already_checked_in: true` with no side-effects.
    """
    try:
        return await streak_service.check_in(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/streak/status")
async def status(user_id: str = Depends(get_current_user)):
    """Read-only streak snapshot. Does NOT advance the streak."""
    return await streak_service.get_status(user_id)


# ══════════════════════════════════════════════════════════════════════
#  COINS (via ledger — authoritative)
# ══════════════════════════════════════════════════════════════════════
@router.get("/coins/balance")
async def balance(user_id: str = Depends(get_current_user)):
    """Canonical coin balance. Computed from ``ledger_transactions`` sum —
    tamper-proof against any direct writes to legacy user fields."""
    b = await ledger_service.get_balance(user_id)
    # Self-heal the denormalized cache on every read — zero-cost since we
    # already summed the ledger.
    await ledger_service._update_cached_balance(user_id, b)
    return {"balance": b}


@router.get("/coins/history")
async def history(limit: int = 50, user_id: str = Depends(get_current_user)):
    """Immutable ledger history — last 50 rows newest-first."""
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200
    rows = await ledger_service.get_history(user_id, limit=limit)
    return {"history": rows, "count": len(rows)}
