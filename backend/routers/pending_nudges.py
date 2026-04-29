"""routers/pending_nudges.py — Round 53m Pending Settlement Nudges.

This is **NOT** the existing split_reminders.py (peer→peer reminders).
This is the personality-driven *self-reminder* system: when a user has
outstanding debt in a group, MintU's mascot gently brings it up.

Behavior layer, not notification system.

Design:
    • One Mongo doc per (user_id, group_id) in `pending_settlement_nudges`.
    • Computed live from settle-plan.my_total_outgoing_paise — we
      never trust a stale stored amount.
    • ``ignore_count`` escalates the *strength* (soft → medium → strong)
      and triggers a 72-hour suppression once strong.
    • On smart-settle, the post-commit hook in split_settle marks
      matching nudges as ``resolved`` (we'll patch that here too).
    • Tone caps in the mascot prompt extension prevent guilt/pressure.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nudges", tags=["nudges"])

# ── Tunables (production guardrails per the spec) ─────────────────────
MIN_NUDGE_PAISE = 5000           # ₹50 — ignore tiny amounts
COOLDOWN_HOURS = 24              # max 1 nudge / 24h / group
SUPPRESS_HOURS_AFTER_IGNORE = 72  # quiet for 72h after 3 ignores
MAX_IGNORES_BEFORE_SUPPRESS = 3


# ── Domain helpers ────────────────────────────────────────────────────


def _strength_from_ignores(ignore_count: int) -> str:
    """soft → medium → strong (drives mascot tone, not enforcement)."""
    if ignore_count >= MAX_IGNORES_BEFORE_SUPPRESS:
        return "strong"
    if ignore_count >= 2:
        return "medium"
    return "soft"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Mongo strips tzinfo on round-trip — treat naive datetimes as UTC
    so comparisons against ``_now()`` (aware) don't crash with TypeError."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _resolve_paid_off(user_id: str, group_id: str) -> None:
    """Mark a (user, group) nudge as resolved. Called from settle hooks."""
    try:
        await db.pending_settlement_nudges.update_many(
            {"user_id": user_id, "group_id": group_id, "status": "active"},
            {"$set": {"status": "resolved", "resolved_at": _now(), "updated_at": _now()}},
        )
    except Exception as exc:
        logger.warning(f"_resolve_paid_off failed for {user_id}/{group_id}: {exc}")


async def _compute_user_outstanding(user_id: str, group_id: str) -> tuple[int, str]:
    """Return (amount_paise, group_name) for the user's outstanding debt
    in a group. ``amount_paise`` is the user's total outgoing in the
    optimized plan — equivalent to what ``settle-my-part`` would charge.
    """
    # Lazy import to avoid a circular dep with split_settle at module load.
    from routers.split_settle import (
        _net_balances_paise_for_group,  # type: ignore[attr-defined]
    )
    from core.settlement_planner import plan_settlements, my_transfers

    if not ObjectId.is_valid(group_id):
        return 0, ""
    group = await db.split_groups.find_one(
        {"_id": ObjectId(group_id), "members.user_id": user_id}
    )
    if not group:
        return 0, ""
    balances = await _net_balances_paise_for_group(group_id, group)
    try:
        plan = plan_settlements(balances, drift_tolerance_paise=100)
    except Exception:
        return 0, group.get("name", "")
    mine = my_transfers(plan, user_id)
    total = sum(t.paise for t in mine)
    return int(total), group.get("name", "")


async def _upsert_nudge(user_id: str, group_id: str, amount_paise: int) -> dict:
    """Create or refresh the nudge doc for this (user, group). Returns
    the doc as it now stands (even if amount changed since last call)."""
    now = _now()
    existing = await db.pending_settlement_nudges.find_one(
        {"user_id": user_id, "group_id": group_id}
    )
    if existing:
        # Only mutate the amount + last_seen_at; never reset ignore_count
        # on amount changes (escalation must be sticky).
        await db.pending_settlement_nudges.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "amount_paise": amount_paise,
                    "last_seen_at": now,
                    "updated_at": now,
                    "status": "active" if existing.get("status") == "resolved" else existing.get("status", "active"),
                }
            },
        )
        existing["amount_paise"] = amount_paise
        existing["last_seen_at"] = now
        return existing

    doc = {
        "user_id": user_id,
        "group_id": group_id,
        "amount_paise": amount_paise,
        "ignore_count": 0,
        "last_nudged_at": None,
        "last_seen_at": now,
        "suppress_until": None,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pending_settlement_nudges.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


def _serialise(doc: dict, group_name: str = "") -> dict:
    """Mongo doc → wire-safe response shape with computed strength."""
    ignore_count = int(doc.get("ignore_count") or 0)
    return {
        "id": str(doc["_id"]),
        "user_id": doc["user_id"],
        "group_id": doc["group_id"],
        "group_name": group_name or "",
        "amount_paise": int(doc.get("amount_paise") or 0),
        "amount": round(int(doc.get("amount_paise") or 0) / 100.0, 2),
        "ignore_count": ignore_count,
        "strength": _strength_from_ignores(ignore_count),
        "last_nudged_at": doc.get("last_nudged_at").isoformat() if doc.get("last_nudged_at") else None,
        "suppress_until": doc.get("suppress_until").isoformat() if doc.get("suppress_until") else None,
        "status": doc.get("status", "active"),
    }


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("/list")
async def list_nudges(user_id: str = Depends(get_current_user)):
    """List the caller's active settlement nudges, one per group with
    outstanding debt ≥ ₹50.

    Computes amounts LIVE from settle-plan (never trusts stale storage)
    and lazily upserts doc rows so the frontend can call dismiss/snooze
    by id. Resolved nudges (debt now zero) are auto-cleared.
    """
    # 1. Pull all groups the user belongs to.
    groups_cursor = db.split_groups.find({"members.user_id": user_id})
    groups = await groups_cursor.to_list(500)

    nudges_out: list[dict] = []
    now = _now()

    for g in groups:
        gid = str(g["_id"])
        amount_paise, _gname = await _compute_user_outstanding(user_id, gid)

        if amount_paise < MIN_NUDGE_PAISE:
            # Debt below threshold (or zero): clear any active nudge so
            # we don't keep showing a chip after the user partially paid.
            await db.pending_settlement_nudges.update_many(
                {"user_id": user_id, "group_id": gid, "status": "active"},
                {"$set": {"status": "resolved", "resolved_at": now, "updated_at": now}},
            )
            continue

        # Live debt → ensure a doc exists + reflects latest amount.
        doc = await _upsert_nudge(user_id, gid, amount_paise)

        # Honor suppression window after multiple ignores.
        suppress_until = _ensure_aware(doc.get("suppress_until"))
        if suppress_until and suppress_until > now:
            continue
        if doc.get("status") in ("dismissed", "resolved"):
            # Manual dismissal sticks until the user opens the group
            # (frontend can re-activate by calling /reset on group open).
            continue

        nudges_out.append(_serialise(doc, group_name=g.get("name", "")))

    # Sort by amount desc — biggest debts surface first.
    nudges_out.sort(key=lambda n: -n["amount_paise"])

    return {"nudges": nudges_out, "count": len(nudges_out)}


class DismissBody(BaseModel):
    # Optional: caller can ask for soft-snooze (24h) vs hard-suppress (72h).
    snooze_hours: Optional[int] = None


@router.post("/{nudge_id}/dismiss")
async def dismiss_nudge(
    nudge_id: str,
    body: Optional[DismissBody] = None,
    user_id: str = Depends(get_current_user),
):
    """Bump ignore_count + record last_nudged_at.

    Once ``ignore_count`` hits ``MAX_IGNORES_BEFORE_SUPPRESS``, the doc
    enters a 72-hour suppression window and won't appear in /list until
    the user re-engages with the group (resetting the count via the
    side-effect of opening it, handled by the front-end).
    """
    if not ObjectId.is_valid(nudge_id):
        raise HTTPException(status_code=400, detail="Invalid nudge_id")
    doc = await db.pending_settlement_nudges.find_one(
        {"_id": ObjectId(nudge_id), "user_id": user_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Nudge not found")

    new_count = int(doc.get("ignore_count") or 0) + 1
    now = _now()
    update: dict = {
        "ignore_count": new_count,
        "last_nudged_at": now,
        "updated_at": now,
    }
    # Hard-suppress after threshold OR honor explicit snooze hours.
    snooze_hours = (body.snooze_hours if body else None)
    if new_count >= MAX_IGNORES_BEFORE_SUPPRESS:
        update["suppress_until"] = now + timedelta(hours=SUPPRESS_HOURS_AFTER_IGNORE)
    elif snooze_hours and snooze_hours > 0:
        update["suppress_until"] = now + timedelta(hours=min(snooze_hours, 168))  # cap 7d

    await db.pending_settlement_nudges.update_one(
        {"_id": doc["_id"]}, {"$set": update}
    )
    doc.update(update)
    return {
        "ok": True,
        "nudge": _serialise(doc),
    }


@router.post("/{nudge_id}/reset")
async def reset_nudge(nudge_id: str, user_id: str = Depends(get_current_user)):
    """Reset ignore_count + suppression. Called when the user opens the
    group containing this nudge — re-engagement is the strongest signal
    that they want to re-engage with the debt.
    """
    if not ObjectId.is_valid(nudge_id):
        raise HTTPException(status_code=400, detail="Invalid nudge_id")
    res = await db.pending_settlement_nudges.update_one(
        {"_id": ObjectId(nudge_id), "user_id": user_id},
        {
            "$set": {
                "ignore_count": 0,
                "suppress_until": None,
                "status": "active",
                "updated_at": _now(),
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nudge not found")
    return {"ok": True}


@router.post("/group/{group_id}/reset")
async def reset_nudge_for_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Convenience: reset by (user, group) — the frontend uses this on
    group-open without needing the nudge_id."""
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    await db.pending_settlement_nudges.update_one(
        {"user_id": user_id, "group_id": group_id},
        {
            "$set": {
                "ignore_count": 0,
                "suppress_until": None,
                "status": "active",
                "updated_at": _now(),
            }
        },
    )
    return {"ok": True}


# ── Public helper for split_settle.py post-commit hook ────────────────


async def resolve_nudge_after_settle(user_id: str, group_id: str) -> None:
    """Called from split_settle's post-commit hook when smart-settle
    completes. Clears the nudge so the celebratory beat replaces the
    "you owe" beat next time the user opens the group.
    """
    await _resolve_paid_off(user_id, group_id)


__all__ = ["router", "resolve_nudge_after_settle"]
