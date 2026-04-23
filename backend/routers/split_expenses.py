"""Split expense CRUD + summary + equal/shares/custom math.

Auto-extracted from backend/routers/splits.py (Round 14 refactor).
Imports the shared `router` from split_common.py so decorators register
on the same FastAPI APIRouter instance — no endpoint paths change.
"""
import logging
import uuid as uuid_lib
from datetime import datetime, timedelta
from urllib.parse import quote, quote_plus
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import Depends, HTTPException

from core import db, get_current_user
from core.upi import mask_upi_id
from routers.split_common import (
    router, api_router,
    SplitGroupCreate, SplitExpenseCreate, SettlePayment,
    SETTLEMENT_REWARDS, SETTLEMENT_BADGES,
)


@api_router.post("/split/expenses")
async def add_split_expense(expense: SplitExpenseCreate, user_id: str = Depends(get_current_user)):
    group = await db.split_groups.find_one({"_id": ObjectId(expense.group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    member_ids = [m["user_id"] for m in group["members"]]
    splits = _compute_splits(expense.amount, expense.split_type, member_ids, expense.splits)
    
    exp_doc = {
        "group_id": expense.group_id,
        "description": expense.description,
        "amount": expense.amount,
        "paid_by": expense.paid_by,
        "split_type": expense.split_type,
        "splits": splits,
        "created_by": user_id,
        "created_at": datetime.utcnow()
    }
    result = await db.split_expenses.insert_one(exp_doc)
    # Auto-insert chat message for the expense
    payer_name = next((m["name"] for m in group["members"] if m["user_id"] == user_id), "Someone")
    member_count = len(splits)
    # Collect display names for the avatar stack in the chat card
    split_member_names = [next((m["name"] for m in group["members"] if m["user_id"] == uid), "?") for uid in splits.keys()]
    await db.split_messages.insert_one({
        "group_id": expense.group_id, "type": "expense", "sender_id": user_id, "sender_name": payer_name,
        "content": expense.description,
        "expense_data": {
            "amount": expense.amount,
            "paid_by": payer_name,
            "split_count": member_count,
            "paid_count": 1,  # payer auto-counts as paid
            "member_names": split_member_names,
            "expense_id": str(result.inserted_id),
        },
        "created_at": datetime.utcnow()
    })
    return {"id": str(result.inserted_id), **{k: v for k, v in exp_doc.items() if k != "_id"}, "created_at": exp_doc["created_at"]}



def _compute_splits(amount: float, split_type: str, member_ids: List[str], raw_splits: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    """Largest-remainder method for split calculations. Guarantees sum(splits) == amount exactly.
    All amounts are computed in paise (int) to avoid float rounding errors, then converted back to rupees.
    """
    total_paise = round(amount * 100)
    if total_paise <= 0:
        return {mid: 0.0 for mid in member_ids}

    if split_type == "equal":
        n = len(member_ids) or 1
        base = total_paise // n
        remainder = total_paise - (base * n)
        out: Dict[str, int] = {mid: base for mid in member_ids}
        # Distribute 1-paise remainders deterministically (by sorted user_id for stability)
        for mid in sorted(member_ids)[:remainder]:
            out[mid] += 1
        return {mid: v / 100 for mid, v in out.items()}

    if split_type == "shares":
        share_ratios = raw_splits or {mid: 1 for mid in member_ids}
        total_shares = sum(share_ratios.values()) or 1
        # First-pass floor division in paise
        allocated = 0
        out = {}
        for uid, share in share_ratios.items():
            p = int((total_paise * share) // total_shares)
            out[uid] = p
            allocated += p
        remainder = total_paise - allocated
        # Distribute leftover paise one-by-one to members with highest fractional share remainders
        if remainder > 0:
            frac = []
            for uid, share in share_ratios.items():
                exact = (total_paise * share) / total_shares
                frac.append((exact - out[uid], uid))
            frac.sort(reverse=True)
            for _, uid in frac[:remainder]:
                out[uid] += 1
        return {uid: v / 100 for uid, v in out.items()}

    if split_type == "percentage":
        pct = raw_splits or {}
        allocated = 0
        out = {}
        for uid, p in pct.items():
            paise = int((total_paise * p) // 100)
            out[uid] = paise
            allocated += paise
        remainder = total_paise - allocated
        if remainder > 0:
            frac = [((total_paise * pct.get(uid, 0) / 100) - out[uid], uid) for uid in out]
            frac.sort(reverse=True)
            for _, uid in frac[:remainder]:
                out[uid] += 1
        return {uid: v / 100 for uid, v in out.items()}

    # Custom / Unequal — splits are exact amounts; normalize to paise to avoid float noise
    if raw_splits:
        return {uid: round(v * 100) / 100 for uid, v in raw_splits.items()}
    return {}



@api_router.get("/split/groups/{group_id}/expenses")
async def get_group_expenses(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(500)
    for e in expenses:
        e["id"] = str(e["_id"]); del e["_id"]
        payer = next((m["name"] for m in group["members"] if m["user_id"] == e["paid_by"]), "Unknown")
        e["paid_by_name"] = payer
    return {"group": {"name": group["name"], "members": group["members"]}, "expenses": expenses}



@api_router.get("/split/groups/{group_id}/summary")
async def group_expense_summary(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Get comprehensive group summary with simplified debts. Must be a group member."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(200)
    settlements = await db.settlements.find({"group_id": group_id}).to_list(200)
    
    members = group.get("members", [])
    member_names = {m["user_id"]: m.get("name", "User") for m in members}
    
    # Calculate net balances
    balances = {m["user_id"]: 0.0 for m in members}
    total_spent = 0
    
    for exp in expenses:
        paid_by = exp["paid_by"]
        amount = exp["amount"]
        total_spent += amount
        splits = exp.get("splits", {})
        
        if isinstance(splits, dict):
            balances[paid_by] = balances.get(paid_by, 0) + amount
            for uid, share in splits.items():
                balances[uid] = balances.get(uid, 0) - share
    
    # Account for settlements
    for s in settlements:
        balances[s["payer_id"]] = balances.get(s["payer_id"], 0) + s["amount"]
        balances[s["payee_id"]] = balances.get(s["payee_id"], 0) - s["amount"]
    
    # Simplify debts (minimize transactions)
    debtors = []
    creditors = []
    for uid, bal in balances.items():
        if bal < -0.5:
            debtors.append({"id": uid, "name": member_names.get(uid, "User"), "amount": abs(bal)})
        elif bal > 0.5:
            creditors.append({"id": uid, "name": member_names.get(uid, "User"), "amount": bal})
    
    debtors.sort(key=lambda x: x["amount"], reverse=True)
    creditors.sort(key=lambda x: x["amount"], reverse=True)
    
    simplified = []
    di, ci = 0, 0
    while di < len(debtors) and ci < len(creditors):
        d, c = debtors[di], creditors[ci]
        settle_amt = min(d["amount"], c["amount"])
        if settle_amt > 0.5:
            simplified.append({
                "from_id": d["id"], "from_name": d["name"],
                "to_id": c["id"], "to_name": c["name"],
                "amount": round(settle_amt, 2)
            })
        d["amount"] -= settle_amt
        c["amount"] -= settle_amt
        if d["amount"] < 0.5: di += 1
        if c["amount"] < 0.5: ci += 1
    
    # Category breakdown
    cat_totals = {}
    for exp in expenses:
        cat = exp.get("category", "Other")
        cat_totals[cat] = cat_totals.get(cat, 0) + exp["amount"]
    
    return {
        "group_name": group.get("name", ""),
        "member_count": len(members),
        "total_expenses": len(expenses),
        "total_spent": round(total_spent, 2),
        "simplified_debts": simplified,
        "category_breakdown": dict(sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)),
        "recent_expenses": [{
            "id": str(e["_id"]),
            "description": e.get("description", ""),
            "amount": e["amount"],
            "paid_by": e.get("paid_by", ""),
            "paid_by_name": member_names.get(e["paid_by"], "User"),
            "split_type": e.get("split_type", "equal"),
            "splits": e.get("splits", {}),
            "date": e.get("created_at", "").isoformat() if hasattr(e.get("created_at", ""), 'isoformat') else str(e.get("created_at", "")),
        } for e in expenses[:10]],
        "settlements_count": len(settlements),
    }



@api_router.delete("/split/expenses/{expense_id}")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    """Delete a split expense.

    Hardened (Round 30 IDOR fix):
      • Must be a member of the group the expense belongs to.
      • Must be either the creator of the expense, the payer, OR the group admin
        (group.created_by). Prevents any random MintU user from deleting
        expenses in groups they don't belong to simply by guessing the ObjectId.
    """
    if not ObjectId.is_valid(expense_id):
        raise HTTPException(status_code=400, detail="Invalid expense_id")
    existing = await db.split_expenses.find_one({"_id": ObjectId(expense_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    group = await db.split_groups.find_one({
        "_id": ObjectId(existing["group_id"]),
        "members.user_id": user_id,
    }) if ObjectId.is_valid(str(existing.get("group_id") or "")) else None
    if not group:
        # Caller is not a group member — treat as not-found to avoid enumeration.
        raise HTTPException(status_code=404, detail="Expense not found")
    is_creator = existing.get("created_by") == user_id
    is_payer = existing.get("paid_by") == user_id
    is_admin = group.get("created_by") == user_id
    if not (is_creator or is_payer or is_admin):
        raise HTTPException(status_code=403, detail="Only the expense creator, payer, or group admin can delete this expense")
    await db.split_expenses.delete_one({"_id": ObjectId(expense_id)})
    return {"message": "Expense deleted"}



@api_router.put("/split/expenses/{expense_id}")
async def edit_expense(expense_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Edit a split expense — full support for amount/splits/split_type/description/category.

    Hardened (Round 30 IDOR fix):
      • Caller must be a group member.
      • Caller must be either the expense creator, the payer, OR the group admin.
    """
    if not ObjectId.is_valid(expense_id):
        raise HTTPException(status_code=400, detail="Invalid expense_id")
    existing = await db.split_expenses.find_one({"_id": ObjectId(expense_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    group = await db.split_groups.find_one({
        "_id": ObjectId(existing["group_id"]),
        "members.user_id": user_id,
    }) if ObjectId.is_valid(str(existing.get("group_id") or "")) else None
    if not group:
        raise HTTPException(status_code=404, detail="Expense not found")
    is_creator = existing.get("created_by") == user_id
    is_payer = existing.get("paid_by") == user_id
    is_admin = group.get("created_by") == user_id
    if not (is_creator or is_payer or is_admin):
        raise HTTPException(status_code=403, detail="Only the expense creator, payer, or group admin can edit this expense")

    updates: Dict = {}
    if "description" in data: updates["description"] = data["description"]
    if "category" in data: updates["category"] = data["category"]
    if "paid_by" in data: updates["paid_by"] = data["paid_by"]

    # If amount OR split_type OR splits changed — recompute with largest-remainder
    new_amount = float(data.get("amount", existing["amount"]))
    new_type = data.get("split_type", existing.get("split_type", "equal"))
    raw = data.get("splits")

    if "amount" in data or "split_type" in data or "splits" in data:
        # Get member_ids from the group
        group = await db.split_groups.find_one({"_id": ObjectId(existing["group_id"])})
        member_ids = [m["user_id"] for m in (group.get("members", []) if group else [])]
        # For non-equal types, `raw` contains only active participants; for equal, use all members
        if new_type == "equal":
            participant_ids = list(raw.keys()) if raw else member_ids
        else:
            participant_ids = list(raw.keys()) if raw else member_ids
        new_splits = _compute_splits(new_amount, new_type, participant_ids, raw)
        updates["amount"] = new_amount
        updates["split_type"] = new_type
        updates["splits"] = new_splits

    if updates:
        updates["updated_at"] = datetime.utcnow()
        await db.split_expenses.update_one({"_id": ObjectId(expense_id)}, {"$set": updates})
    return {"message": "Expense updated", "splits": updates.get("splits", existing.get("splits", {}))}


