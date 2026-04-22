"""Split group CRUD, membership, chat-messages.

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


@api_router.post("/split/groups")
async def create_split_group(group: SplitGroupCreate, user_id: str = Depends(get_current_user)):
    """Create a split group. Real users only — phones that don't match any registered
    MintU user are stored as `pending_invites` (by phone) instead of creating fake
    placeholder users like "User 1234". The group surfaces these as invite-pending
    rows and the real user joins automatically once they sign up with that phone."""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Start with the creator as the first member.
    members = [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}]
    pending_invites: List[dict] = []
    seen_phones = {user.get("phone")}

    for phone in group.members:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) != 10 or not p.isdigit():
            continue
        if p in seen_phones:  # Phone-level dedup
            continue
        seen_phones.add(p)

        existing = await db.users.find_one({"phone": p})
        if existing:
            mid = str(existing["_id"])
            if mid == user_id:
                continue
            if not any(m["user_id"] == mid for m in members):  # user_id dedup
                members.append({
                    "user_id": mid,
                    "name": existing.get("name") or f"+91 {p}",
                    "phone": p,
                })
        else:
            # Do NOT auto-create placeholder user. Track as pending invite.
            if not any(pi["phone"] == p for pi in pending_invites):
                pending_invites.append({"phone": p, "invited_at": datetime.utcnow()})

    # Minimum 2 members (including creator) to create a group
    total_participants = len(members) + len(pending_invites)
    if total_participants < 2:
        raise HTTPException(status_code=400, detail="Groups need at least 2 people. Add a friend's phone number.")

    g = {
        "name": group.name.strip() or "Untitled Group",
        "members": members,
        "pending_invites": pending_invites,
        "created_by": user_id,
        "created_at": datetime.utcnow(),
    }
    if group.custom_emoji:
        g["custom_emoji"] = group.custom_emoji
    result = await db.split_groups.insert_one(g)
    return {
        "id": str(result.inserted_id),
        "name": g["name"],
        "members": members,
        "pending_invites": pending_invites,
        "custom_emoji": g.get("custom_emoji"),
    }



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



@api_router.post("/split/groups/{group_id}/members")
async def add_members_to_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Add new members to an existing split group — auto-creates users if not registered"""
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



@api_router.get("/split/groups/{group_id}/manage")
async def get_group_management(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Get group management data (GPay-style). Must be a group member."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
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
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Rename a split group. Must be a group member."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    result = await db.split_groups.update_one(
        {"_id": ObjectId(group_id), "members.user_id": user_id},
        {"$set": {"name": name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group renamed", "name": name}



@api_router.delete("/split/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Remove a member from group. Only the group admin (creator) can do this."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "created_by": user_id})
    if not group:
        raise HTTPException(status_code=403, detail="Only the group admin can remove members")
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$pull": {"members": {"user_id": member_id}}},
    )
    return {"message": "Member removed"}



@api_router.delete("/split/groups/{group_id}")
async def delete_group(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Delete a split group. Only the group admin (creator) can do this."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "created_by": user_id})
    if not group:
        raise HTTPException(status_code=403, detail="Only the group admin can delete the group")
    await db.split_groups.delete_one({"_id": ObjectId(group_id)})
    await db.split_expenses.delete_many({"group_id": group_id})
    return {"message": "Group deleted"}



@api_router.delete("/split/groups/{group_id}/leave")
async def leave_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Leave a split group"""
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
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
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Get chat messages for a group. Must be a group member."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
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
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    """Send a chat message to a group. Must be a group member."""
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
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





@api_router.get("/split/groups/{group_id}/preview")
async def preview_group_for_join(group_id: str, user_id: str = Depends(get_current_user)):
    """Lightweight preview for the invite-link join screen.

    Any authenticated user can call this — returns just the info needed to
    render the "Join [group name] · N members" card. Also reports whether
    the caller is already a member (so the UI can show "Open group" instead
    of "Join").
    """
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    creator = None
    if group.get("created_by"):
        cu = await db.users.find_one({"_id": ObjectId(group["created_by"])}) if ObjectId.is_valid(group.get("created_by", "")) else None
        if cu:
            creator = {"name": cu.get("name", "A friend"), "avatar": cu.get("avatar")}

    members = group.get("members") or []
    already_member = any(m.get("user_id") == user_id for m in members)

    return {
        "id": str(group["_id"]),
        "name": group.get("name", "MintU Group"),
        "emoji": group.get("emoji", "👥"),
        "member_count": len(members),
        "creator": creator,
        "already_member": already_member,
        # Return only first 6 member names/avatars for the preview avatar stack
        "member_preview": [
            {"name": m.get("name", "Member"), "avatar": m.get("avatar")}
            for m in members[:6]
        ],
    }


@api_router.post("/split/groups/{group_id}/join")
async def self_join_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Self-join endpoint for the invite deeplink.

    Adds the *current authenticated user* to the group. Idempotent — calling
    it twice is safe (returns `already_member: True`). Also cleans up any
    matching `pending_invites` entry (created when someone invited this
    phone before the user signed up).
    """
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group_id")
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Already a member? Idempotent success.
    if any(m.get("user_id") == user_id for m in group.get("members") or []):
        return {"ok": True, "already_member": True, "group_id": group_id}

    user = await db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    phone = user.get("phone", "")
    new_member = {
        "user_id": user_id,
        "name": user.get("name", "Member"),
        "phone": phone,
        "avatar": user.get("avatar"),
    }
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {
            "$push": {"members": new_member},
            # Remove any matching pending invite by phone (best-effort)
            "$pull": {"pending_invites": {"phone": phone}},
        },
    )
    return {"ok": True, "already_member": False, "group_id": group_id, "name": group.get("name")}
