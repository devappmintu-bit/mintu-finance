"""routers/streak.py — Public API for the daily-streak + coins rebuild.

Endpoints
---------
  POST /api/streak/check-in        — idempotent daily check-in (awards coins)
  GET  /api/streak/status          — read-only snapshot for UI
  GET  /api/streak/leaderboard     — progressive global top-N (by streak)
  GET  /api/streak/health          — observability snapshot (profile card)
  GET  /api/coins/balance          — canonical balance from ledger
  GET  /api/coins/history          — immutable ledger history (last 50)
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import asyncio

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


@router.get("/streak/leaderboard")
async def leaderboard(limit: int = 100, user_id: str = Depends(get_current_user)):
    """Progressive global top-N leaderboard (ranked by streak_current desc).

    Includes caller's own rank + percentile even if outside the top N.
    """
    return await streak_service.get_leaderboard(user_id, limit=limit)


@router.get("/streak/health")
async def health(user_id: str = Depends(get_current_user)):
    """Read-only streak & coins health snapshot for the Profile card.

    Bundles streak stats, freeze inventory, coin totals across 7d/30d/
    lifetime, milestone countdowns, and a ledger-integrity flag.
    """
    return await streak_service.get_health(user_id)


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


# ══════════════════════════════════════════════════════════════════════
#  Round 39 — Cursor-paginated coin ledger feed for the in-app history view
# ══════════════════════════════════════════════════════════════════════
# Why a new endpoint vs reusing /coins/history?
#   • /coins/history is offset-style (`limit`) only — fine for a strip but
#     unsafe at scale (skip on a moving collection drops/dupes rows).
#   • The UI needs filter (all|earn|spend), running balance per row, and
#     lifetime totals — none of which /coins/history exposes.
@router.get("/coins/ledger")
async def coins_ledger(
    type: str = "all",
    limit: int = 50,
    cursor: str | None = None,
    user_id: str = Depends(get_current_user),
):
    """Cursor-paginated coin ledger.

    Args:
        type:    "all" | "earn" | "spend"  (filters the txn_type column)
        limit:   1..100  (default 50)
        cursor:  ObjectId of the last row from the previous page; rows older
                 than it are returned. ``None`` → first page.

    Returns ``{ entries[], next_cursor, total_earned, total_spent }``.
    Cursor design uses ``_id`` (a monotonic ObjectId on this collection)
    rather than ``created_at`` — _id is unique so we can't accidentally
    skip a tied timestamp.
    """
    from bson import ObjectId
    from core import db

    # ── Sanitize inputs ──────────────────────────────────────────────
    if limit < 1: limit = 1
    if limit > 100: limit = 100
    type_norm = (type or "all").lower()
    if type_norm not in ("all", "earn", "spend"):
        type_norm = "all"

    # ── Filter clause ────────────────────────────────────────────────
    flt: dict = {"user_id": user_id}
    if type_norm == "earn":
        # Earn-side rows have a positive amount in the ledger, regardless
        # of how the original txn_type was stored. Use amount > 0.
        flt["amount"] = {"$gt": 0}
    elif type_norm == "spend":
        flt["amount"] = {"$lt": 0}

    if cursor:
        try:
            flt["_id"] = {"$lt": ObjectId(cursor)}
        except Exception:
            # Invalid cursor → ignore and start from top. Keeps the API
            # forgiving without leaking a 4xx for a rolled-up corner case.
            pass

    # ── Page query + lifetime totals (Round 43 perf — parallel) ─────
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "earned": {"$sum": {"$cond": [{"$gt": ["$amount", 0]}, "$amount", 0]}},
            "spent":  {"$sum": {"$cond": [{"$lt": ["$amount", 0]}, "$amount", 0]}},
        }},
    ]

    async def _page():
        out, last = [], None
        cur = db.ledger_transactions.find(flt).sort("_id", -1).limit(limit)
        async for r in cur:
            amt = float(r.get("amount", 0) or 0)
            kind = "earn" if amt >= 0 else "spend"
            out.append({
                "id": str(r["_id"]),
                "type": kind,
                "amount": abs(amt),
                "description": r.get("description") or r.get("source") or "Coin activity",
                "source": r.get("source") or "",
                "balance_after": int(r.get("balance_after", 0) or 0),
                "created_at": (r.get("created_at") or datetime.now(timezone.utc)).isoformat(),
            })
            last = str(r["_id"])
        return out, last

    async def _totals():
        te, ts = 0, 0
        async for d in db.ledger_transactions.aggregate(pipeline):
            te = int(d.get("earned") or 0)
            ts = int(abs(d.get("spent") or 0))
        return te, ts

    (entries, last_id), (total_earned, total_spent) = await asyncio.gather(_page(), _totals())

    next_cursor = last_id if len(entries) >= limit else None

    return {
        "entries": entries,
        "next_cursor": next_cursor,
        "total_earned": total_earned,
        "total_spent": total_spent,
    }
