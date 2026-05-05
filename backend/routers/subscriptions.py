"""routers/subscriptions.py — Round 99C.

User-facing endpoints over the recurring-subscription detector.

ROUTES
------
GET   /api/subscriptions
        Returns the persisted recurring list (cached). Recompute is
        cheap (~20ms) but we cache to keep tab UIs snappy.

POST  /api/subscriptions/scan
        Force-re-runs the detector on the user's full lookback window.
        Idempotent — repeated calls produce identical output.

POST  /api/subscriptions/{subscription_id}/dismiss
        User says "this isn't a subscription" — flag it so we don't
        surface it again. (Detection still runs against transactions,
        but dismissed rows are filtered out of the API output.)

POST  /api/subscriptions/{subscription_id}/restore
        Undo a previous dismissal.

DESIGN
------
- Auth-gated. user_id from JWT.
- Subscription docs are owned 1-to-many by users; each has a stable
  ``subscription_id`` = ``f"{user_id}::{merchant_key}::{amount_bucket}"``.
- We never let the user MUTATE detected rows (those are derived data).
  They only toggle ``user_dismissed``.

USAGE FROM HOME / COACH
-----------------------
The Home screen calls /subscriptions on mount when there's a
``recurring_summary.biggest_leak`` set in user_coach_context. The
Coach can ALSO surface the biggest active leak as an action card
("Cancel Netflix? saves ₹7,788/yr").
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_user
from core.db import db
from services.recurring_detector import detect_recurring

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


def _serialise(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip Mongo internals and ISO-fy datetimes for JSON output."""
    out = {k: v for k, v in doc.items() if not k.startswith("_")}
    for k in ("first_seen", "last_seen", "next_predicted", "updated_at", "created_at"):
        if k in out and out[k] is not None and hasattr(out[k], "isoformat"):
            out[k] = out[k].isoformat()
    return out


@router.get("")
async def list_subscriptions(
    include_dismissed: bool = False,
    user_id: str = Depends(get_current_user),
):
    """List the user's detected recurring subscriptions.

    Default excludes user-dismissed rows. Pass ``include_dismissed=true``
    to see everything (used by the "Restore" UI).
    """
    query: Dict[str, Any] = {"user_id": user_id}
    if not include_dismissed:
        query["user_dismissed"] = {"$ne": True}

    cursor = db.recurring_subscriptions.find(query)
    docs: List[Dict[str, Any]] = await cursor.to_list(length=200)

    # Sort: active first, biggest annualised cost first (biggest leak surface)
    status_rank = {"active": 0, "dormant": 1, "cancelled": 2}
    docs.sort(key=lambda d: (
        status_rank.get(d.get("status") or "active", 9),
        -float(d.get("annualised_cost") or 0),
    ))

    summary = {
        "total":              len(docs),
        "active":             sum(1 for d in docs if d.get("status") == "active"),
        "annualised_active":  round(sum(
            float(d.get("annualised_cost") or 0)
            for d in docs if d.get("status") == "active"
        ), 2),
        "biggest_leak":       (docs[0].get("merchant_label") if docs else None),
    }

    return {
        "subscriptions": [_serialise(d) for d in docs],
        "summary": summary,
    }


@router.post("/scan")
async def scan_subscriptions(user_id: str = Depends(get_current_user)):
    """Re-run the detector on this user's transaction history.

    Idempotent. Output is identical to GET /subscriptions immediately
    after the scan completes.
    """
    out = await detect_recurring(user_id, persist=True)

    # Re-fetch to honour user_dismissed flags set previously.
    return await list_subscriptions(include_dismissed=False, user_id=user_id)


@router.post("/{subscription_id}/dismiss")
async def dismiss_subscription(
    subscription_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a subscription as 'not really recurring' so it stops
    appearing in the user's list. Detection still runs against the
    underlying transactions; we just hide the resulting row.
    """
    res = await db.recurring_subscriptions.update_one(
        {"subscription_id": subscription_id, "user_id": user_id},
        {"$set": {"user_dismissed": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "subscription not found")
    return {"ok": True, "subscription_id": subscription_id, "dismissed": True}


@router.post("/{subscription_id}/restore")
async def restore_subscription(
    subscription_id: str,
    user_id: str = Depends(get_current_user),
):
    """Undo a previous dismiss."""
    res = await db.recurring_subscriptions.update_one(
        {"subscription_id": subscription_id, "user_id": user_id},
        {"$set": {"user_dismissed": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "subscription not found")
    return {"ok": True, "subscription_id": subscription_id, "dismissed": False}


__all__ = ["router"]
