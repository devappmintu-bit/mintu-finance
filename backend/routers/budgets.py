"""Budgets router — CRUD for per-category spending limits."""
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user

router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetCreate(BaseModel):
    category: str
    amount: Optional[float] = None  # accept either `amount` (native) OR `limit` (spec alias)
    limit: Optional[float] = None
    period: str = "monthly"  # "daily" | "weekly" | "monthly"

    def resolved_amount(self) -> float:
        v = self.amount if self.amount is not None else self.limit
        if v is None or v < 0:
            raise ValueError("amount (or limit) must be a non-negative number")
        return float(v)


@router.post("")
async def create_budget(budget: BudgetCreate, user_id: str = Depends(get_current_user)):
    """Upsert budget for a category (one per category per user)."""
    try:
        amount = budget.resolved_amount()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    existing = await db.budgets.find_one({"user_id": user_id, "category": budget.category})
    now = datetime.utcnow()

    if existing:
        await db.budgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"amount": amount, "period": budget.period}},
        )
        return {
            "id": str(existing["_id"]),
            "user_id": user_id,
            "category": budget.category,
            "amount": amount,
            "period": budget.period,
            "spent": existing.get("spent", 0),
            "created_at": existing.get("created_at", now),
        }

    doc = {"category": budget.category, "amount": amount, "period": budget.period, "user_id": user_id, "spent": 0, "created_at": now}
    result = await db.budgets.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "category": doc["category"],
        "amount": doc["amount"],
        "period": doc["period"],
        "spent": 0,
        "created_at": doc["created_at"],
    }


@router.put("/{budget_id}")
async def update_budget(budget_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Update budget amount / period / category. Owner-only."""
    updates: dict = {}
    # Accept both `amount` and `limit` aliases for the monetary cap
    if "amount" in data or "limit" in data:
        amt = data.get("amount", data.get("limit"))
        try:
            amt = float(amt)
            if amt < 0: raise ValueError
            updates["amount"] = amt
        except Exception:
            raise HTTPException(status_code=400, detail="amount / limit must be a non-negative number")
    if "period" in data and data["period"] in ("daily", "weekly", "monthly"):
        updates["period"] = data["period"]
    if "category" in data and data["category"]:
        updates["category"] = data["category"]
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    updates["updated_at"] = datetime.utcnow()
    result = await db.budgets.update_one(
        {"_id": ObjectId(budget_id), "user_id": user_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    doc = await db.budgets.find_one({"_id": ObjectId(budget_id)})
    if doc:
        doc["id"] = str(doc["_id"]); del doc["_id"]
    return doc or {"id": budget_id, **updates}


def _period_start(period: str) -> datetime:
    now = datetime.utcnow()
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        return now - timedelta(days=7)
    return now - timedelta(days=30)  # monthly


@router.get("")
async def get_budgets(user_id: str = Depends(get_current_user)):
    """List all budgets with current `spent` computed against the period."""
    budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
    for b in budgets:
        txns = await db.transactions.find({
            "user_id": user_id,
            "category": b["category"],
            "type": "debit",
            "date": {"$gte": _period_start(b["period"])},
        }).to_list(1000)
        b["spent"] = sum(t["amount"] for t in txns)
        b["id"] = str(b.pop("_id"))
    return budgets


@router.delete("/{budget_id}")
async def delete_budget(budget_id: str, user_id: str = Depends(get_current_user)):
    result = await db.budgets.delete_one({"_id": ObjectId(budget_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}
