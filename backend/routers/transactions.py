"""Transactions router — CRUD + SMS parsing for user spending records."""
import math
from datetime import datetime
from typing import Optional, List, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from core import db, get_current_user, cache_clear_prefix
from core.scoring import calculate_money_score

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ---- Pydantic models ---------------------------------------------------------
class TransactionCreate(BaseModel):
    amount: float = Field(..., gt=0, le=1_00_00_00_000)     # > 0 and ≤ ₹100 crore (sanity cap)
    category: str = Field(..., min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    type: str = Field(..., pattern="^(debit|credit)$")
    date: Optional[datetime] = None

    @field_validator("amount", mode="before")
    @classmethod
    def _amount_types(cls, v):
        """Reject bool (pydantic would coerce True→1.0 / False→0.0). Reject strings."""
        if isinstance(v, bool):
            raise ValueError("amount must be a number, not a boolean")
        return v

    @field_validator("amount")
    @classmethod
    def _amount_finite(cls, v: float) -> float:
        """Reject NaN, +Inf, -Inf — JSON dumps crash on these values.
        Also enforce the rounded value remains > 0 (prevents 0.0000001 → stored 0.0)."""
        if not math.isfinite(v):
            raise ValueError("amount must be a finite number (no NaN/Infinity)")
        if v <= 0:
            raise ValueError("amount must be positive")
        rounded = round(v, 2)
        if rounded <= 0:
            raise ValueError("amount too small (must be ≥ ₹0.01 after rounding)")
        return rounded


class SMSParseRequest(BaseModel):
    sms_text: str


async def _bump_money_score(user_id: str) -> None:
    new_score = await calculate_money_score(user_id)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"money_score": new_score}},
    )


def _invalidate_caches(user_id: str) -> None:
    cache_clear_prefix(f"waste:{user_id}")
    cache_clear_prefix(f"expense_report:{user_id}")


# ---- Endpoints ---------------------------------------------------------------
@router.post("")
async def create_transaction(transaction: TransactionCreate, user_id: str = Depends(get_current_user)):
    trans = transaction.dict()
    trans["user_id"] = user_id
    trans["date"] = transaction.date or datetime.utcnow()
    trans["created_at"] = datetime.utcnow()

    result = await db.transactions.insert_one(trans)
    _invalidate_caches(user_id)
    await _bump_money_score(user_id)

    # Round 30e — emit declarative event so subscribers (budget breach
    # checker, AI cache invalidation, etc.) fan out. Non-blocking.
    try:
        from core.events import emit, Events
        emit(Events.TRANSACTION_CREATED,
             user_id=user_id,
             transaction_id=str(result.inserted_id),
             amount=float(trans.get("amount", 0) or 0),
             category=trans.get("category"),
             type=trans.get("type"))
    except Exception:
        pass  # event bus must never break the primary write path

    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "amount": trans["amount"],
        "category": trans["category"],
        "description": trans["description"],
        "type": trans["type"],
        "date": trans["date"],
        "created_at": trans["created_at"],
    }


@router.get("")
async def get_transactions(
    user_id: str = Depends(get_current_user),
    limit: int = Query(100, ge=0, le=500),
    category: Optional[str] = None,
    type: Optional[str] = None,
    source: Optional[str] = None,
) -> List[dict]:
    """List the current user's transactions with optional filters.

    Query params (all optional):
      * category  — e.g. "Food", "Transport"
      * type      — "debit" or "credit"
      * source    — "manual", "sms", "cash", etc.
      * limit     — max rows (default 100)
    """
    query: Dict = {"user_id": user_id}
    if category: query["category"] = category
    if type: query["type"] = type
    if source: query["source"] = source
    rows = await db.transactions.find(query).sort("date", -1).to_list(limit)
    for r in rows:
        r["id"] = str(r["_id"]); del r["_id"]
    return rows


@router.put("/{transaction_id}")
async def update_transaction(transaction_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Update an existing transaction. Owner-only.

    Updatable fields: description, amount, type, category, source, date, notes.
    """
    from bson import ObjectId
    ALLOWED = {"description", "amount", "type", "category", "source", "date", "notes"}
    updates = {k: v for k, v in data.items() if k in ALLOWED}
    if not updates:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    if "amount" in updates:
        try:
            updates["amount"] = float(updates["amount"])
            if updates["amount"] < 0:
                raise ValueError
        except Exception:
            raise HTTPException(status_code=400, detail="amount must be a non-negative number")
    updates["updated_at"] = datetime.utcnow()
    result = await db.transactions.update_one(
        {"_id": ObjectId(transaction_id), "user_id": user_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _invalidate_caches(user_id)
    row = await db.transactions.find_one({"_id": ObjectId(transaction_id)})
    if row:
        row["id"] = str(row["_id"]); del row["_id"]
    return row or {"id": transaction_id, **updates}


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user)):
    result = await db.transactions.delete_one(
        {"_id": ObjectId(transaction_id), "user_id": user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _invalidate_caches(user_id)
    await _bump_money_score(user_id)
    return {"message": "Transaction deleted"}


@router.post("/parse-sms")
async def parse_sms(sms_data: SMSParseRequest, user_id: str = Depends(get_current_user)):
    # parse_sms_with_ai still lives in server.py — import lazily to avoid circular import.
    from server import parse_sms_with_ai  # type: ignore

    parsed = await parse_sms_with_ai(sms_data.sms_text)
    if not parsed:
        raise HTTPException(status_code=400, detail="Could not parse SMS. Please add manually.")

    trans = {
        "user_id": user_id,
        "amount": parsed["amount"],
        "category": parsed["category"],
        "description": parsed.get("description", parsed.get("merchant", "Transaction")),
        "type": parsed["type"],
        "date": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    result = await db.transactions.insert_one(trans)
    _invalidate_caches(user_id)
    await _bump_money_score(user_id)

    return {
        "id": str(result.inserted_id),
        **{k: v for k, v in trans.items() if k != "_id"},
        "parsed": parsed,
    }
