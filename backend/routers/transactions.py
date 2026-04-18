"""Transactions router — CRUD + SMS parsing for user spending records."""
from datetime import datetime
from typing import Optional, List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user, cache_clear_prefix
from core.scoring import calculate_money_score

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ---- Pydantic models ---------------------------------------------------------
class TransactionCreate(BaseModel):
    amount: float
    category: str
    description: str
    type: str  # "debit" or "credit"
    date: Optional[datetime] = None


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
async def get_transactions(user_id: str = Depends(get_current_user), limit: int = 100) -> List[dict]:
    txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).limit(limit).to_list(limit)
    for t in txns:
        t["id"] = str(t.pop("_id"))
    return txns


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
