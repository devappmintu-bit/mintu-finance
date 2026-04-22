"""routers/goals.py — Savings goals CRUD + budget linking.

A Goal is a target amount the user wants to save by a date. Budgets can
be "linked" to a goal so that the savings-nudge copy on the budget card
references the goal's progress.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, get_current_user

router = APIRouter(prefix="/goals", tags=["goals"])


def _safe_oid(s: str) -> Optional[ObjectId]:
    try:
        return ObjectId(s)
    except Exception:
        return None


def _doc_out(d: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(d)
    d["id"] = str(d.pop("_id"))
    for k in ("created_at", "updated_at", "target_date"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].isoformat()
    return d


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    saved_amount: float = 0
    target_date: Optional[str] = None  # ISO string — any parseable date
    color: str = "#F56E1E"
    emoji: str = "🎯"
    linked_budget_id: Optional[str] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    saved_amount: Optional[float] = None
    target_date: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None
    linked_budget_id: Optional[str] = None


@router.get("")
async def list_goals(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    cur = db.goals.find({"user_id": user_id}).sort("created_at", -1)
    rows = await cur.to_list(200)
    return {"goals": [_doc_out(r) for r in rows]}


@router.post("")
async def create_goal(body: GoalCreate, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    doc: Dict[str, Any] = {
        "user_id": user_id,
        "name": body.name.strip(),
        "target_amount": float(body.target_amount),
        "saved_amount": float(body.saved_amount or 0),
        "target_date": _parse_date(body.target_date),
        "color": body.color or "#F56E1E",
        "emoji": body.emoji or "🎯",
        "linked_budget_id": body.linked_budget_id,
        "created_at": now,
        "updated_at": now,
    }
    ins = await db.goals.insert_one(doc)
    doc["_id"] = ins.inserted_id
    return {"ok": True, "goal": _doc_out(doc)}


@router.patch("/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    oid = _safe_oid(goal_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Goal not found")
    updates: Dict[str, Any] = {}
    for field in ("name", "target_amount", "saved_amount", "color", "emoji", "linked_budget_id"):
        v = getattr(body, field)
        if v is not None:
            updates[field] = v
    if body.target_date is not None:
        updates["target_date"] = _parse_date(body.target_date)
    updates["updated_at"] = datetime.now(timezone.utc)
    r = await db.goals.update_one({"_id": oid, "user_id": user_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    doc = await db.goals.find_one({"_id": oid, "user_id": user_id})
    return {"ok": True, "goal": _doc_out(doc) if doc else None}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    oid = _safe_oid(goal_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Goal not found")
    r = await db.goals.delete_one({"_id": oid, "user_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    # Unlink any budgets that referenced this goal
    await db.budgets.update_many({"user_id": user_id, "goal_id": goal_id}, {"$unset": {"goal_id": ""}})
    return {"ok": True}


def _parse_date(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(v, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
