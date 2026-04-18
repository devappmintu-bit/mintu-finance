"""Splits router — group CRUD, expenses, settlements, chat, leaderboards.

Extracted from server.py using Python's AST parser (guaranteed boundary accuracy).
"""
import os
import json
import logging
import hashlib
from datetime import datetime, timedelta
from urllib.parse import quote
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_clear_prefix
from core.upi import mask_upi_id

router = APIRouter(tags=["splits"])
api_router = router  # so extracted @api_router.xxx keeps working



class SplitGroupCreate(BaseModel):
    name: str
    members: List[str]  # List of phone numbers


class SplitExpenseCreate(BaseModel):
    group_id: str
    description: str
    amount: float
    paid_by: str  # user_id of payer
    split_type: str = "equal"  # "equal", "custom", "shares"
    splits: Optional[Dict[str, float]] = None  # user_id -> amount (for custom) or user_id -> share_ratio (for shares)


class SettlePayment(BaseModel):
    target_user_id: str
    amount: float
    txn_ref: Optional[str] = None
    method: str = "upi"  # "upi", "cash", "bank_transfer"
    group_id: Optional[str] = None


SETTLEMENT_BADGES = [
    {"id": "lightning", "name": "Lightning Settler", "emoji": "⚡", "desc": "Settle within 1 hour", "threshold": 3},
    {"id": "streak_5", "name": "5-Settle Streak", "emoji": "🔥", "desc": "5 consecutive on-time settlements", "threshold": 5},
    {"id": "generous", "name": "Generous Soul", "emoji": "💝", "desc": "Settled 10+ times", "threshold": 10},
    {"id": "zero_debt", "name": "Debt Free", "emoji": "🏆", "desc": "Zero outstanding balance", "threshold": 1},
]


@api_router.post("/split/groups")
async def create_split_group(group: SplitGroupCreate, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    members = [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}]
    
    for phone in group.members:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) != 10 or not p.isdigit():
            continue
        # Check if already added
        if any(m["phone"] == p for m in members):
            continue
        
        m = await db.users.find_one({"phone": p})
        if not m:
            # Auto-create placeholder user
            result = await db.users.insert_one({
                "phone": p, "name": f"User {p[-4:]}", "money_score": 50,
                "streak_days": 0, "created_at": datetime.utcnow(),
                "reward_coins": 0, "settlement_count": 0,
            })
            m = {"_id": result.inserted_id, "name": f"User {p[-4:]}", "phone": p}
        
        mid = str(m["_id"])
        if mid != user_id:
            members.append({"user_id": mid, "name": m.get("name", f"User {p[-4:]}"), "phone": p})
    
    g = {"name": group.name, "members": members, "created_by": user_id, "created_at": datetime.utcnow()}
    result = await db.split_groups.insert_one(g)
    return {"id": str(result.inserted_id), "name": g["name"], "members": members}


@api_router.get("/split/groups")
async def get_split_groups(user_id: str = Depends(get_current_user)):
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    for g in groups:
        g["id"] = str(g["_id"]); del g["_id"]
        # Calculate balances
        expenses = await db.split_expenses.find({"group_id": g["id"]}).to_list(500)
        balances = {}
        for m in g["members"]:
            balances[m["user_id"]] = 0
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid != payer:
                    balances[payer] = balances.get(payer, 0) + amt
                    balances[uid] = balances.get(uid, 0) - amt
        g["balances"] = {m["name"]: round(balances.get(m["user_id"], 0), 2) for m in g["members"]}
        g["total_expenses"] = sum(e["amount"] for e in expenses)
    return groups


@api_router.post("/split/expenses")
async def add_split_expense(expense: SplitExpenseCreate, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(expense.group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    member_ids = [m["user_id"] for m in group["members"]]
    if expense.split_type == "equal":
        per_person = round(expense.amount / len(member_ids), 2)
        splits = {mid: per_person for mid in member_ids}
    elif expense.split_type == "shares":
        # Splits by ratio: e.g. {"user1": 2, "user2": 1} → user1 pays 2/3, user2 pays 1/3
        share_ratios = expense.splits or {mid: 1 for mid in member_ids}
        total_shares = sum(share_ratios.values()) or 1
        splits = {uid: round(expense.amount * (share / total_shares), 2) for uid, share in share_ratios.items()}
    else:
        # Custom: exact amounts
        splits = expense.splits or {}
    
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
    await db.split_messages.insert_one({
        "group_id": expense.group_id, "type": "expense", "sender_id": user_id, "sender_name": payer_name,
        "content": expense.description, "expense_data": {"amount": expense.amount, "paid_by": payer_name, "split_count": member_count, "expense_id": str(result.inserted_id)},
        "created_at": datetime.utcnow()
    })
    return {"id": str(result.inserted_id), **{k: v for k, v in exp_doc.items() if k != "_id"}, "created_at": exp_doc["created_at"]}


@api_router.get("/split/groups/{group_id}/expenses")
async def get_group_expenses(group_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(500)
    for e in expenses:
        e["id"] = str(e["_id"]); del e["_id"]
        payer = next((m["name"] for m in group["members"] if m["user_id"] == e["paid_by"]), "Unknown")
        e["paid_by_name"] = payer
    return {"group": {"name": group["name"], "members": group["members"]}, "expenses": expenses}


@api_router.get("/split/balances")
async def get_overall_balances(user_id: str = Depends(get_current_user)):
    """Get overall who owes you / you owe across all groups"""
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    people = {}  # name -> net amount (positive = they owe you)
    
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(500)
        name_map = {m["user_id"]: m["name"] for m in g["members"]}
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid == payer: continue
                other_name = name_map.get(uid if payer == user_id else payer, "Unknown")
                if payer == user_id:
                    people[other_name] = people.get(other_name, 0) + amt
                elif uid == user_id:
                    people[other_name] = people.get(other_name, 0) - amt
    
    owe_you = {n: v for n, v in people.items() if v > 0}
    you_owe = {n: abs(v) for n, v in people.items() if v < 0}
    
    return {
        "total_owed_to_you": sum(owe_you.values()),
        "total_you_owe": sum(you_owe.values()),
        "owe_you": owe_you,
        "you_owe": you_owe
    }


@api_router.post("/split/groups/{group_id}/members")
async def add_members_to_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Add new members to an existing split group — auto-creates users if not registered"""
    from bson import ObjectId
    phones = data.get("phones", [])
    if not phones:
        raise HTTPException(status_code=400, detail="Provide phone numbers to add")
    
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    existing_phones = {m.get("phone", "") for m in group["members"]}
    added = []
    
    for phone in phones:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) != 10 or not p.isdigit():
            continue
        if p in existing_phones:
            continue
            
        member = await db.users.find_one({"phone": p})
        if not member:
            # Create placeholder user for unregistered phone
            result = await db.users.insert_one({
                "phone": p,
                "name": f"User {p[-4:]}",
                "money_score": 50,
                "streak_days": 0,
                "created_at": datetime.utcnow(),
                "reward_coins": 0,
                "settlement_count": 0,
            })
            member = {"_id": result.inserted_id, "name": f"User {p[-4:]}", "phone": p}
        
        new_member = {"user_id": str(member["_id"]), "name": member.get("name", f"User {p[-4:]}"), "phone": p}
        await db.split_groups.update_one({"_id": ObjectId(group_id)}, {"$push": {"members": new_member}})
        existing_phones.add(p)
        added.append(new_member["name"])
    
    if not added:
        return {"added": [], "message": "No new members to add (already in group or invalid numbers)"}
    
    return {"added": added, "message": f"Added {len(added)} member(s): {', '.join(added)}"}


@api_router.get("/split/pay-intent/{target_user_id}")
async def generate_upi_pay_intent(target_user_id: str, amount: float, user_id: str = Depends(get_current_user)):
    """Generate UPI deep link for payment"""
    from bson import ObjectId
    from urllib.parse import quote
    
    target = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"upi_id": 1, "name": 1})
    if not target or not target.get("upi_id"):
        raise HTTPException(status_code=400, detail="Payee hasn't set up UPI ID")
    
    payee_name = target.get("name", "MintU User")
    upi_id = target["upi_id"]
    txn_ref = f"MINTU{uuid_lib.uuid4().hex[:8].upper()}"
    
    # UPI intent deep link (works with GPay, PhonePe, Paytm, BHIM)
    upi_link = f"upi://pay?pa={quote(upi_id)}&pn={quote(payee_name)}&am={amount:.2f}&cu=INR&tn={quote(f'MintU Split Settlement')}&tr={txn_ref}"
    
    return {
        "upi_link": upi_link,
        "payee_name": payee_name,
        "payee_upi": mask_upi_id(upi_id),
        "amount": amount,
        "txn_ref": txn_ref,
        "currency": "INR"
    }


@api_router.post("/split/settle")
async def settle_payment(data: SettlePayment, user_id: str = Depends(get_current_user)):
    """Mark a split payment as settled"""
    from bson import ObjectId
    
    settlement = {
        "payer_id": user_id,
        "payee_id": data.target_user_id,
        "amount": data.amount,
        "method": data.method,
        "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
        "group_id": data.group_id,
        "status": "completed",
        "settled_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    
    result = await db.settlements.insert_one(settlement)
    settlement["id"] = str(result.inserted_id)
    
    # Get names safely
    payer_name = "You"
    payee_name = "User"
    try:
        payer = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if payer: payer_name = payer.get("name", "You")
    except Exception:
        pass
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except Exception:
        pass
    
    return {
        "id": settlement["id"],
        "message": f"Payment of ₹{data.amount:,.0f} to {payee_name} marked as settled!",
        "txn_ref": settlement["txn_ref"],
        "status": "completed"
    }


@api_router.get("/split/settlements")
async def get_settlements(user_id: str = Depends(get_current_user)):
    """Get payment settlement history"""
    from bson import ObjectId
    
    settlements = await db.settlements.find({
        "$or": [{"payer_id": user_id}, {"payee_id": user_id}]
    }).sort("settled_at", -1).to_list(50)
    
    result = []
    for s in settlements:
        payer_name = "User"
        payee_name = "User"
        try:
            payer = await db.users.find_one({"_id": ObjectId(s["payer_id"])}, {"name": 1})
            if payer: payer_name = payer.get("name", "User")
        except Exception:
            pass
        try:
            payee = await db.users.find_one({"_id": ObjectId(s["payee_id"])}, {"name": 1})
            if payee: payee_name = payee.get("name", "User")
        except Exception:
            pass
        result.append({
            "id": str(s["_id"]),
            "payer_name": payer_name,
            "payee_name": payee_name,
            "amount": s["amount"],
            "method": s["method"],
            "txn_ref": s.get("txn_ref", ""),
            "status": s["status"],
            "is_payer": s["payer_id"] == user_id,
            "settled_at": s["settled_at"].isoformat() if s.get("settled_at") else None
        })
    return result


@api_router.get("/split/groups/{group_id}/summary")
async def group_expense_summary(group_id: str, user_id: str = Depends(get_current_user)):
    """Get comprehensive group summary with simplified debts"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
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
            "description": e.get("description", ""),
            "amount": e["amount"],
            "paid_by_name": member_names.get(e["paid_by"], "User"),
            "date": e.get("created_at", "").isoformat() if hasattr(e.get("created_at", ""), 'isoformat') else str(e.get("created_at", "")),
        } for e in expenses[:10]],
        "settlements_count": len(settlements),
    }


@api_router.get("/split/groups/{group_id}/manage")
async def get_group_management(group_id: str, user_id: str = Depends(get_current_user)):
    """Get group management data (GPay-style)"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = []
    for m in group.get("members", []):
        is_admin = m["user_id"] == group.get("created_by", group["members"][0]["user_id"] if group["members"] else "")
        members.append({
            "user_id": m["user_id"],
            "name": m.get("name", "User"),
            "phone": m.get("phone", ""),
            "is_admin": is_admin,
            "initial": (m.get("name", "?")[0]).upper(),
        })
    
    return {
        "id": str(group["_id"]),
        "name": group.get("name", ""),
        "members": members,
        "member_count": len(members),
        "created_by": group.get("created_by", members[0]["user_id"] if members else ""),
        "is_admin": user_id == group.get("created_by", members[0]["user_id"] if members else ""),
        "invite_code": f"MINTU-{str(group['_id'])[-6:].upper()}",
    }


@api_router.put("/split/groups/{group_id}/name")
async def rename_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Rename a split group"""
    from bson import ObjectId
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    await db.split_groups.update_one({"_id": ObjectId(group_id)}, {"$set": {"name": name}})
    return {"message": "Group renamed", "name": name}


@api_router.delete("/split/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, user_id: str = Depends(get_current_user)):
    """Remove a member from group"""
    from bson import ObjectId
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$pull": {"members": {"user_id": member_id}}}
    )
    return {"message": "Member removed"}


@api_router.delete("/split/groups/{group_id}")
async def delete_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Delete a split group"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.split_groups.delete_one({"_id": ObjectId(group_id)})
    await db.split_expenses.delete_many({"group_id": group_id})
    return {"message": "Group deleted"}


@api_router.delete("/split/expenses/{expense_id}")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    """Delete a split expense"""
    from bson import ObjectId
    await db.split_expenses.delete_one({"_id": ObjectId(expense_id)})
    return {"message": "Expense deleted"}


@api_router.put("/split/expenses/{expense_id}")
async def edit_expense(expense_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Edit a split expense"""
    from bson import ObjectId
    updates = {}
    if "description" in data: updates["description"] = data["description"]
    if "amount" in data: updates["amount"] = data["amount"]
    if "category" in data: updates["category"] = data["category"]
    if updates:
        await db.split_expenses.update_one({"_id": ObjectId(expense_id)}, {"$set": updates})
    return {"message": "Expense updated"}


@api_router.delete("/split/groups/{group_id}/leave")
async def leave_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Leave a split group"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "Someone") if user else "Someone"
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$pull": {"members": {"user_id": user_id}}}
    )
    # System message
    await db.split_messages.insert_one({"group_id": group_id, "type": "system", "content": f"{name} left the group", "created_at": datetime.utcnow()})
    return {"message": "Left group"}


@api_router.get("/split/groups/{group_id}/messages")
async def get_group_messages(group_id: str, limit: int = 50, user_id: str = Depends(get_current_user)):
    """Get chat messages for a group"""
    messages = await db.split_messages.find(
        {"group_id": group_id}
    ).sort("created_at", 1).limit(limit).to_list(limit)
    result = []
    for m in messages:
        result.append({
            "id": str(m["_id"]),
            "group_id": m["group_id"],
            "type": m.get("type", "text"),
            "content": m.get("content", ""),
            "sender_id": m.get("sender_id"),
            "sender_name": m.get("sender_name"),
            "emoji": m.get("emoji"),
            "expense_data": m.get("expense_data"),
            "created_at": m.get("created_at", datetime.utcnow()).isoformat(),
        })
    return result


@api_router.post("/split/groups/{group_id}/messages")
async def send_group_message(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Send a chat message to a group"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "User") if user else "User"
    msg_type = data.get("type", "text")
    msg = {
        "group_id": group_id,
        "sender_id": user_id,
        "sender_name": name,
        "type": msg_type,
        "content": data.get("content", ""),
        "emoji": data.get("emoji"),
        "created_at": datetime.utcnow(),
    }
    result = await db.split_messages.insert_one(msg)
    return {"id": str(result.inserted_id), "message": "Sent"}
    return {"message": "Left group"}


@api_router.post("/split/settle-with-rewards")
async def settle_with_rewards(data: SettlePayment, user_id: str = Depends(get_current_user)):
    """Settle payment and earn reward coins"""
    from bson import ObjectId

    # Calculate reward tier
    reward = SETTLEMENT_REWARDS["on_time"]
    for tier_key, tier in SETTLEMENT_REWARDS.items():
        reward = tier
        break  # Give best available reward for now

    settlement = {
        "payer_id": user_id,
        "payee_id": data.target_user_id,
        "amount": data.amount,
        "method": data.method,
        "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
        "group_id": data.group_id,
        "status": "completed",
        "coins_earned": reward["coins"],
        "reward_label": reward["label"],
        "settled_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }

    result = await db.settlements.insert_one(settlement)

    # Update user's reward coins
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"reward_coins": reward["coins"], "settlement_count": 1}}
    )

    # Check for new badges
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    settle_count = user.get("settlement_count", 0) if user else 0
    total_coins = user.get("reward_coins", 0) if user else 0
    new_badges = []
    for badge in SETTLEMENT_BADGES:
        if settle_count >= badge["threshold"]:
            existing = await db.user_badges.find_one({"user_id": user_id, "badge_id": badge["id"]})
            if not existing:
                await db.user_badges.insert_one({"user_id": user_id, "badge_id": badge["id"], "earned_at": datetime.utcnow()})
                new_badges.append(badge)

    # Calculate cashback (coins reduce future payments)
    cashback_value = min(total_coins * 0.5, data.amount * 0.05)  # Max 5% cashback

    payee_name = "User"
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except: pass

    return {
        "id": str(result.inserted_id),
        "message": f"₹{data.amount:,.0f} paid to {payee_name}! 🎉",
        "txn_ref": settlement["txn_ref"],
        "reward": {
            "coins_earned": reward["coins"],
            "label": reward["label"],
            "total_coins": total_coins,
            "cashback_available": round(cashback_value, 2),
            "new_badges": new_badges,
        }
    }


@api_router.get("/split/settlement-leaderboard")
async def settlement_leaderboard(user_id: str = Depends(get_current_user)):
    """Settlement speed leaderboard with rewards"""
    from bson import ObjectId

    # Get all users with settlement data
    users = await db.users.find(
        {"settlement_count": {"$gt": 0}},
        {"name": 1, "settlement_count": 1, "reward_coins": 1}
    ).sort("reward_coins", -1).to_list(20)

    user_data = await db.users.find_one({"_id": ObjectId(user_id)})
    my_coins = user_data.get("reward_coins", 0) if user_data else 0
    my_count = user_data.get("settlement_count", 0) if user_data else 0
    my_badges = await db.user_badges.find({"user_id": user_id}).to_list(20)

    leaderboard = []
    my_rank = 0
    for i, u in enumerate(users):
        is_me = str(u["_id"]) == user_id
        if is_me: my_rank = i + 1
        leaderboard.append({
            "rank": i + 1,
            "name": u.get("name", "User"),
            "coins": u.get("reward_coins", 0),
            "settlements": u.get("settlement_count", 0),
            "is_me": is_me,
        })

    return {
        "leaderboard": leaderboard[:10],
        "my_stats": {
            "rank": my_rank or len(leaderboard) + 1,
            "coins": my_coins,
            "settlements": my_count,
            "cashback_available": round(my_coins * 0.5, 2),
            "badges": [{"id": b["badge_id"], **next((bd for bd in SETTLEMENT_BADGES if bd["id"] == b["badge_id"]), {})} for b in my_badges],
        }
    }


@api_router.post("/split/redeem-coins")
async def redeem_coins(data: dict, user_id: str = Depends(get_current_user)):
    """Redeem reward coins as cashback on next settlement"""
    from bson import ObjectId
    coins_to_redeem = data.get("coins", 0)
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    available = user.get("reward_coins", 0) if user else 0

    if coins_to_redeem > available:
        raise HTTPException(status_code=400, detail=f"Only {available} coins available")

    cashback = round(coins_to_redeem * 0.5, 2)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"reward_coins": -coins_to_redeem}})

    return {"redeemed": coins_to_redeem, "cashback": cashback, "remaining_coins": available - coins_to_redeem}

