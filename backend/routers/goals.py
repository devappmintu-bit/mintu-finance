"""routers/goals.py — Savings goals CRUD + budget linking.

A Goal is a target amount the user wants to save by a date. Budgets can
be "linked" to a goal so that the savings-nudge copy on the budget card
references the goal's progress.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from core.time import utc_now
from core.errors import (
    raise_goal_not_found,
)
from pydantic import BaseModel, Field, field_validator

from core import db, get_current_user

router = APIRouter(prefix="/goals", tags=["goals"])


# Hard caps applied to both create + update bodies.
#   • Name must be 1-100 chars after strip
#   • Target amount must be > 0 and <= ₹10 crore (1e8) — more than realistic savings goal
#   • Saved amount must be >= 0 and <= target_amount
_MAX_GOAL_AMOUNT = 10_00_00_000.0   # ₹10 crore ceiling
_MAX_NAME_LEN = 100


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
    name: str = Field(..., min_length=1, max_length=_MAX_NAME_LEN)
    target_amount: float = Field(..., gt=0, le=_MAX_GOAL_AMOUNT)
    saved_amount: float = Field(default=0, ge=0, le=_MAX_GOAL_AMOUNT)
    target_date: Optional[str] = None  # ISO string — any parseable date
    color: str = Field(default="#F56E1E", max_length=32)
    emoji: str = Field(default="🎯", max_length=8)
    linked_budget_id: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name cannot be empty or whitespace")
        return v

    @field_validator("saved_amount")
    @classmethod
    def _saved_le_target(cls, v: float, info) -> float:
        # Can't compare to target here (saved_amount validated before target),
        # so cap only against the absolute max; per-goal check happens in handler.
        return v


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=_MAX_NAME_LEN)
    target_amount: Optional[float] = Field(default=None, gt=0, le=_MAX_GOAL_AMOUNT)
    saved_amount: Optional[float] = Field(default=None, ge=0, le=_MAX_GOAL_AMOUNT)
    target_date: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=32)
    emoji: Optional[str] = Field(default=None, max_length=8)
    linked_budget_id: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("name cannot be empty or whitespace")
        return v


@router.get("")
async def list_goals(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    cur = db.goals.find({"user_id": user_id}).sort("created_at", -1)
    rows = await cur.to_list(200)
    return {"goals": [_doc_out(r) for r in rows]}


@router.post("")
async def create_goal(body: GoalCreate, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    # Cross-field: saved_amount cannot exceed target_amount
    if body.saved_amount > body.target_amount:
        raise HTTPException(status_code=400, detail="saved_amount cannot exceed target_amount")
    now = utc_now()
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
        raise_invalid_id("goal_id")
    updates: Dict[str, Any] = {}
    for field in ("name", "target_amount", "saved_amount", "color", "emoji", "linked_budget_id"):
        v = getattr(body, field)
        if v is not None:
            updates[field] = v
    if body.target_date is not None:
        updates["target_date"] = _parse_date(body.target_date)
    updates["updated_at"] = utc_now()
    r = await db.goals.update_one({"_id": oid, "user_id": user_id}, {"$set": updates})
    if r.matched_count == 0:
        raise_goal_not_found()
    doc = await db.goals.find_one({"_id": oid, "user_id": user_id})
    return {"ok": True, "goal": _doc_out(doc) if doc else None}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    oid = _safe_oid(goal_id)
    if not oid:
        raise_invalid_id("goal_id")
    r = await db.goals.delete_one({"_id": oid, "user_id": user_id})
    if r.deleted_count == 0:
        raise_goal_not_found()
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
