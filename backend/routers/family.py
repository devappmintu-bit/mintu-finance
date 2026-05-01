"""Family router — shared finance groups (family budgets + combined spending)."""
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.ids import safe_oid
from core.users import get_user_by_id
from core.time import utc_now
from core.errors import (
    raise_user_not_found,
)

router = APIRouter(prefix="/family", tags=["family"])


# ---- Pydantic models ---------------------------------------------------------
class FamilyGroupCreate(BaseModel):
    name: str


class FamilyMemberAdd(BaseModel):
    phone: str


class FamilyBudgetCreate(BaseModel):
    category: str
    amount: float
    period: str = "monthly"


# ---- Helpers ------------------------------------------------------------------
async def _get_group_or_404(group_id: str, user_id: str, owner_only: bool = False) -> dict:
    """Fetch the group iff the user is a member (or owner when required)."""
    filt = {"_id": safe_oid(group_id, field_name="group_id")}
    filt["owner_id" if owner_only else "members.user_id"] = user_id
    group = await db.family_groups.find_one(filt)
    if not group:
        raise HTTPException(
            status_code=404,
            detail="Family group not found" + (" or not owner" if owner_only else ""),
        )
    return group


# ---- Endpoints ---------------------------------------------------------------
@router.post("/create")
async def create_family_group(group: FamilyGroupCreate, user_id: str = Depends(get_current_user)):
    user = await get_user_by_id(user_id)
    if not user:
        raise_user_not_found()

    family = {
        "name": group.name,
        "owner_id": user_id,
        "members": [{"user_id": user_id, "name": user["name"], "phone": user["phone"], "role": "owner"}],
        "created_at": utc_now(),
    }
    result = await db.family_groups.insert_one(family)
    return {
        "id": str(result.inserted_id),
        "name": family["name"],
        "owner_id": user_id,
        "members": family["members"],
        "created_at": family["created_at"],
    }


@router.post("/{group_id}/add-member")
async def add_family_member(group_id: str, member: FamilyMemberAdd, user_id: str = Depends(get_current_user)):
    group = await _get_group_or_404(group_id, user_id, owner_only=True)

    member_user = await db.users.find_one({"phone": member.phone})
    if not member_user:
        raise HTTPException(status_code=404, detail="User not found with this phone number")

    member_id = str(member_user["_id"])
    if any(m["user_id"] == member_id for m in group["members"]):
        raise HTTPException(status_code=400, detail="Already a member")

    new_member = {"user_id": member_id, "name": member_user["name"], "phone": member_user["phone"], "role": "member"}
    await db.family_groups.update_one({"_id": safe_oid(group_id, field_name="group_id")}, {"$push": {"members": new_member}})
    return {"message": "Member added", "member": new_member}


@router.get("/my-groups")
async def get_my_family_groups(user_id: str = Depends(get_current_user)):
    groups = await db.family_groups.find({"members.user_id": user_id}).to_list(20)
    for g in groups:
        g["id"] = str(g.pop("_id"))
    return groups


@router.post("/{group_id}/budget")
async def create_family_budget(group_id: str, budget: FamilyBudgetCreate, user_id: str = Depends(get_current_user)):
    await _get_group_or_404(group_id, user_id)

    existing = await db.family_budgets.find_one({"group_id": group_id, "category": budget.category})
    if existing:
        await db.family_budgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"amount": budget.amount, "period": budget.period}},
        )
        return {"id": str(existing["_id"]), "category": budget.category, "amount": budget.amount, "period": budget.period}

    doc = {
        "group_id": group_id,
        "category": budget.category,
        "amount": budget.amount,
        "period": budget.period,
        "created_by": user_id,
        "created_at": utc_now(),
    }
    result = await db.family_budgets.insert_one(doc)
    return {"id": str(result.inserted_id), **budget.dict()}


@router.get("/{group_id}/budgets")
async def get_family_budgets(group_id: str, user_id: str = Depends(get_current_user)):
    group = await _get_group_or_404(group_id, user_id)

    budgets = await db.family_budgets.find({"group_id": group_id}).to_list(100)
    member_ids = [m["user_id"] for m in group["members"]]
    thirty_days_ago = utc_now() - timedelta(days=30)

    # Single query for all member transactions; filter in memory to avoid N+1
    all_txns = await db.transactions.find({
        "user_id": {"$in": member_ids},
        "type": "debit",
        "date": {"$gte": thirty_days_ago},
    }).to_list(5000)

    for b in budgets:
        cat_txns = [t for t in all_txns if t["category"] == b["category"]]
        b["spent"] = sum(t["amount"] for t in cat_txns)
        b["member_spending"] = {
            m["name"]: sum(t["amount"] for t in cat_txns if t["user_id"] == m["user_id"])
            for m in group["members"]
            if sum(t["amount"] for t in cat_txns if t["user_id"] == m["user_id"]) > 0
        }
        b["id"] = str(b.pop("_id"))

    return {"group_name": group["name"], "members": group["members"], "budgets": budgets}


@router.get("/{group_id}/summary")
async def get_family_summary(group_id: str, user_id: str = Depends(get_current_user)):
    group = await _get_group_or_404(group_id, user_id)

    member_ids = [m["user_id"] for m in group["members"]]
    thirty_days_ago = utc_now() - timedelta(days=30)
    all_txns = await db.transactions.find({
        "user_id": {"$in": member_ids},
        "date": {"$gte": thirty_days_ago},
    }).to_list(5000)

    total_income = sum(t["amount"] for t in all_txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in all_txns if t["type"] == "debit")

    member_stats = []
    for m in group["members"]:
        m_txns = [t for t in all_txns if t["user_id"] == m["user_id"]]
        member_stats.append({
            "name": m["name"],
            "income": sum(t["amount"] for t in m_txns if t["type"] == "credit"),
            "expense": sum(t["amount"] for t in m_txns if t["type"] == "debit"),
            "transaction_count": len(m_txns),
        })

    return {
        "group_name": group["name"],
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "member_count": len(group["members"]),
        "member_stats": member_stats,
    }
