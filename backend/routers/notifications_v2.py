"""
routers/notifications_v2.py — Round 91 Surface 3.

Layered ON TOP of the existing notifications router. Adds:
  GET    /notifications/preferences          → returns prefs + quiet hours + brief time
  PATCH  /notifications/preferences          → merges into stored prefs
  GET    /notifications/log                  → recent log (paginated, last 50)
  POST   /notifications/test                 → fires one notification of `type` for the user (force=True)
  POST   /notifications/run-now              → ADMIN-ish: runs all 8 jobs for the calling user (no quiet/dedupe bypass — for visual QA)
"""
from __future__ import annotations

from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.auth import get_current_user
from core.time import utc_now
from services.notifications_engine import (
    NotificationType, dispatch,
    DEFAULT_PREFS, DEFAULT_QUIET_HOURS, DEFAULT_DAILY_BRIEF_TIME, DEFAULT_TZ,
    get_user_prefs, get_quiet_hours, get_daily_brief_time,
)


router = APIRouter(prefix="/notifications", tags=["notifications-v2"])


class PrefsPayload(BaseModel):
    # All optional — partial update.
    master:                Optional[bool] = None
    daily_brief:           Optional[bool] = None
    salary_detected:       Optional[bool] = None
    overspend_alert:       Optional[bool] = None
    goal_milestone:        Optional[bool] = None
    weekly_wrap:           Optional[bool] = None
    month_end_report:      Optional[bool] = None
    dormancy_nudge:        Optional[bool] = None
    split_reminder:        Optional[bool] = None
    quiet_hours_start:     Optional[str] = None         # "22:00"
    quiet_hours_end:       Optional[str] = None         # "07:00"
    daily_brief_time:      Optional[str] = None         # "07:30"
    timezone:              Optional[str] = None         # IANA tz name


class TestRequest(BaseModel):
    type: str
    title: Optional[str] = None
    body:  Optional[str] = None


@router.get("/preferences")
async def get_preferences(user_id: str = Depends(get_current_user)):
    from server import db
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(404, "User not found")
    prefs = get_user_prefs(user)
    qh = get_quiet_hours(user)
    return {
        "prefs": prefs,
        "quiet_hours": qh,
        "daily_brief_time": get_daily_brief_time(user),
        "timezone": user.get("notification_tz") or DEFAULT_TZ,
        "available_types": [t.value for t in NotificationType],
    }


@router.patch("/preferences")
async def patch_preferences(payload: PrefsPayload, user_id: str = Depends(get_current_user)):
    from server import db
    set_doc: dict[str, Any] = {}

    # Per-type toggles.
    pref_keys = {
        "master", "daily_brief", "salary_detected", "overspend_alert",
        "goal_milestone", "weekly_wrap", "month_end_report",
        "dormancy_nudge", "split_reminder",
    }
    pref_updates: dict[str, bool] = {}
    for k in pref_keys:
        v = getattr(payload, k, None)
        if v is not None:
            pref_updates[k] = bool(v)
    if pref_updates:
        # Merge with existing rather than replace.
        user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
        existing = user.get("notification_prefs") or {}
        merged = {**DEFAULT_PREFS, **existing, **pref_updates}
        set_doc["notification_prefs"] = merged

    # Quiet hours.
    qh_start = payload.quiet_hours_start
    qh_end = payload.quiet_hours_end
    if qh_start or qh_end:
        user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
        existing_qh = user.get("notification_quiet_hours") or {}
        merged_qh = {**DEFAULT_QUIET_HOURS, **existing_qh}
        if qh_start: merged_qh["start"] = qh_start
        if qh_end:   merged_qh["end"] = qh_end
        set_doc["notification_quiet_hours"] = merged_qh

    if payload.daily_brief_time:
        set_doc["notification_daily_brief_time"] = payload.daily_brief_time

    if payload.timezone:
        set_doc["notification_tz"] = payload.timezone

    if set_doc:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": set_doc})

    # Return the new effective state.
    return await get_preferences(user_id=user_id)


@router.get("/log")
async def get_log(limit: int = 50, user_id: str = Depends(get_current_user)):
    from server import db
    limit = max(1, min(int(limit), 200))
    cursor = db.notifications_log.find({"user_id": user_id}).sort("sent_at", -1).limit(limit)
    items: list[dict] = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        if d.get("sent_at") and hasattr(d["sent_at"], "isoformat"):
            d["sent_at"] = d["sent_at"].isoformat()
        items.append(d)
    return {"items": items}


@router.post("/test")
async def test_send(req: TestRequest, user_id: str = Depends(get_current_user)):
    """Fire a single notification of `type` to the calling user.
    Bypasses preferences + quiet hours + dedupe (force=True). Useful
    for the Notifications Settings → "Send test" button."""
    try:
        ntype = NotificationType(req.type)
    except Exception:
        raise HTTPException(400, f"Unknown type: {req.type}")
    title = req.title or f"Test · {ntype.value.replace('_', ' ').title()}"
    body = req.body or "This is a MintU test notification."
    result = await dispatch(
        user_id=user_id,
        ntype=ntype,
        title=title,
        body=body,
        deep_link="/(tabs)",
        force=True,
    )
    return result


@router.post("/run-now")
async def run_now(user_id: str = Depends(get_current_user)):
    """Run every job for the calling user *immediately* — used for
    visual QA. Honors prefs and dedupe (so a 2nd call within window
    won't fire). Returns a count of dispatched/deduped per type."""
    from server import db
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(404, "User not found")
    from services import notification_jobs
    before = await db.notifications_log.count_documents({"user_id": user_id})
    await notification_jobs.run_all_for_user(user)
    after = await db.notifications_log.count_documents({"user_id": user_id})
    return {"new_dispatches": max(0, after - before)}


__all__ = ["router"]
