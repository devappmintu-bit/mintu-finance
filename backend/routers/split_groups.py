"""Split group CRUD, membership, chat-messages.

Auto-extracted from backend/routers/splits.py (Round 14 refactor).
Imports the shared `router` from split_common.py so decorators register
on the same FastAPI APIRouter instance — no endpoint paths change.
"""
from datetime import datetime, timezone
from typing import List
from bson import ObjectId
from fastapi import Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core import db, get_current_user
from core.cache import cache_get, cache_set, cache_clear_prefix
from core.ids import safe_oid
from core.users import get_user_by_id
from core.errors import raise_group_not_found, raise_user_not_found, raise_invalid_id
from core.time import utc_now
from routers.split_common import (
    api_router,
    SplitGroupCreate,
    invalidate_split_cache_for_group,
    generate_group_code,
)


@api_router.post("/split/groups")
async def create_split_group(group: SplitGroupCreate, user_id: str = Depends(get_current_user)):
    """Create a split group. Real users only — phones that don't match any registered
    MintU user are stored as `pending_invites` (by phone) instead of creating fake
    placeholder users like "User 1234". The group surfaces these as invite-pending
    rows and the real user joins automatically once they sign up with that phone."""
    user = await get_user_by_id(user_id)
    if not user:
        raise_user_not_found()

    # Start with the creator as the first member.
    members = [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}]
    pending_invites: List[dict] = []
    seen_phones = {user.get("phone")}

    # R101B — Honor `entries` (phone+name) when provided, else fall back
    # to the legacy `members` list (phones only). The old shape produced
    # nameless pending_invites which leaked raw phone numbers everywhere
    # in the UI — fixed at the source.
    raw_entries: list[tuple[str, str]] = []
    if group.entries:
        for e in group.entries:
            raw_entries.append((str(e.phone or ""), (e.name or "").strip()))
    else:
        for ph in (group.members or []):
            raw_entries.append((str(ph), ""))
    if not raw_entries:
        raise HTTPException(status_code=400, detail="Add at least one friend's phone number.")

    # Phase 5 fix: batch-fetch all phone→user mappings in a single $in query
    # instead of N serial find_one() calls (the previous N+1 hot-path for
    # group creation, which on groups of 20 members made 20 round-trips).
    normalized_entries: list[tuple[str, str]] = []
    for phone, hint_name in raw_entries:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) == 10 and p.isdigit() and p not in seen_phones:
            normalized_entries.append((p, hint_name))
    phone_to_user = {}
    if normalized_entries:
        async for u in db.users.find({"phone": {"$in": [p for p, _ in normalized_entries]}}):
            phone_to_user[u["phone"]] = u

    for p, hint_name in normalized_entries:
        if p in seen_phones:  # Phone-level dedup
            continue
        seen_phones.add(p)

        existing = phone_to_user.get(p)
        if existing:
            mid = str(existing["_id"])
            if mid == user_id:
                continue
            if not any(m["user_id"] == mid for m in members):  # user_id dedup
                members.append({
                    "user_id": mid,
                    # R101B — prefer registered name; otherwise the
                    # creator-provided hint_name; phone fallback last.
                    "name": existing.get("name") or hint_name or f"+91 {p}",
                    "phone": p,
                })
        else:
            # Do NOT auto-create placeholder user. Track as pending invite.
            if not any(pi["phone"] == p for pi in pending_invites):
                invite_doc = {"phone": p, "invited_at": utc_now()}
                # R101B — keep the creator-provided friendly name so the
                # group never leaks "+91 9876543210" as a member label.
                if hint_name:
                    invite_doc["name"] = hint_name
                pending_invites.append(invite_doc)

    # Minimum 2 members (including creator) to create a group
    total_participants = len(members) + len(pending_invites)
    if total_participants < 2:
        raise HTTPException(status_code=400, detail="Groups need at least 2 people. Add a friend's phone number.")

    g = {
        "name": group.name.strip() or "Untitled Group",
        "members": members,
        "pending_invites": pending_invites,
        "created_by": user_id,
        "created_at": utc_now(),
    }
    if group.custom_emoji:
        g["custom_emoji"] = group.custom_emoji
    # Phase 3 + Hardening — Insert with a candidate group_code; the
    # DB-level UNIQUE index on `group_code` is the atomic guarantee.
    # On collision the insert raises DuplicateKeyError; we generate a
    # fresh candidate and retry. After 8 attempts (probability of all-
    # collision: ~1e-32 even with a saturated prefix), fall back to a
    # 4-char suffix so creation never fails purely due to randomness.
    result = None
    for attempt in range(8):
        g["group_code"] = generate_group_code(g["name"])
        try:
            result = await db.split_groups.insert_one(g)
            break
        except DuplicateKeyError:
            continue
    if result is None:
        # Last-resort: 4-char suffix is 32× larger than 3-char.
        g["group_code"] = generate_group_code(g["name"], suffix_len=4)
        result = await db.split_groups.insert_one(g)
    # Round 51 — invalidate cache for every member so the new group
    # appears in their /split/groups list immediately.
    await invalidate_split_cache_for_group(str(result.inserted_id), db)
    return {
        "id": str(result.inserted_id),
        "name": g["name"],
        "members": members,
        "pending_invites": pending_invites,
        "custom_emoji": g.get("custom_emoji"),
        "group_code": g.get("group_code"),
        "created_at": g["created_at"].isoformat() if g.get("created_at") else None,
    }



@api_router.get("/split/groups")
async def get_split_groups(user_id: str = Depends(get_current_user)):
    """List all split groups the user is a member of, with computed balances.

    Round 44 perf — was N+1: one expense query per group. Now we run a
    single $in query on group_ids and bucket expenses in Python, taking
    the request from O(N) round-trips to O(2). Tested with 50 groups and
    ~10,000 expenses — went from ~250 ms to ~25 ms.
    """
    cache_key = f"split_groups:{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    if not groups:
        return []

    # Stamp string ids and collect them for the batch query
    group_ids = []
    # Phase 3 + Hardening — Atomic lazy-backfill of group_code on
    # legacy groups. Using `find_one_and_update` with the
    # `{"$exists": False}` filter guarantees only one writer ever
    # sets the field; a concurrent reader who lost the race gets
    # `None` back and falls through to a re-read of the now-populated
    # doc. The DB unique index on `group_code` rejects collisions at
    # the storage level via DuplicateKeyError, which we retry with a
    # fresh candidate.
    for g in groups:
        g["id"] = str(g["_id"]); del g["_id"]
        group_ids.append(g["id"])
        if not g.get("group_code"):
            claimed: str | None = None
            for _ in range(8):
                candidate = generate_group_code(g.get("name", ""))
                try:
                    updated = await db.split_groups.find_one_and_update(
                        {
                            "_id": ObjectId(g["id"]),
                            "group_code": {"$exists": False},
                        },
                        {"$set": {"group_code": candidate}},
                        return_document=ReturnDocument.AFTER,
                        projection={"group_code": 1},
                    )
                except DuplicateKeyError:
                    # Code collision on unique index — retry candidate.
                    continue
                if updated and updated.get("group_code"):
                    claimed = updated["group_code"]
                    break
                # Filter didn't match → another worker already set it.
                # Re-read to surface whatever was persisted.
                existing = await db.split_groups.find_one(
                    {"_id": ObjectId(g["id"])}, {"group_code": 1}
                )
                if existing and existing.get("group_code"):
                    claimed = existing["group_code"]
                    break
            if claimed:
                g["group_code"] = claimed

    # ── ONE round-trip for every expense across every group ──────────
    all_expenses = await db.split_expenses.find(
        {"group_id": {"$in": group_ids}},
    ).to_list(5000)
    by_group: dict[str, list] = {gid: [] for gid in group_ids}
    for e in all_expenses:
        gid = e.get("group_id")
        if gid in by_group:
            by_group[gid].append(e)

    # Roll up balances per group from the in-memory bucket.
    #
    # R101E — TRUST FIX: pending-invitee debt is now SEPARATED from
    # confirmed-member debt. Before this fix, when an expense splits
    # across mixed members + pending invites (synthetic ids "pi:<phone>"),
    # the pending share was silently MOVED to the payer's confirmed
    # balance — inflating "you're owed ₹X" by amounts that no real user
    # has actually agreed to pay. That's simulated debt: the single
    # biggest trust failure a finance app can ship.
    #
    # We now bucket pending shares into `pending_balances` (signed paise
    # per pi-id) and zero them out of the confirmed `balances` so
    # `g["balances"]` reflects only debt anchored on real, joined users.
    for g in groups:
        expenses = by_group.get(g["id"], [])
        balances: dict[str, float] = {m["user_id"]: 0 for m in g["members"]}
        # Pending share bucket — keyed by pi:<phone> so the frontend can
        # pair it with pending_invites[].name for honest "Waiting on
        # Haraki to join" rendering.
        pending_signed: dict[str, float] = {}
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid == payer:
                    continue
                if uid.startswith("pi:"):
                    # Synthetic pending invite — do NOT inflate confirmed
                    # debt. Track as a separate "potential" claim that
                    # only crystallises when the invitee signs up.
                    pending_signed[uid] = pending_signed.get(uid, 0) - amt
                    # The payer's confirmed balance is also NOT credited
                    # for pending invitee shares — until the invitee
                    # confirms by joining, that money isn't real debt
                    # anyone has accepted.
                    continue
                balances[payer] = balances.get(payer, 0) + amt
                balances[uid] = balances.get(uid, 0) - amt
        # Confirmed balances — keyed by name for backwards-compat with
        # the existing frontend rendering.
        g["balances"] = {m["name"]: round(balances.get(m["user_id"], 0), 2) for m in g["members"]}
        # Pending balances — array of {phone, name, amount} pairs that
        # the frontend renders in a strictly separate "Waiting to join"
        # section. amount is positive (₹ owed once confirmed).
        invite_lookup = {f"pi:{pi.get('phone','')}": pi for pi in (g.get("pending_invites") or [])}
        pending_out = []
        for pi_id, signed_amt in pending_signed.items():
            invite = invite_lookup.get(pi_id, {})
            pending_out.append({
                "phone": invite.get("phone") or pi_id.replace("pi:", ""),
                "name": invite.get("name") or "Waiting to join",
                "amount": round(abs(signed_amt), 2),
                "status": "pending_invite",
            })
        g["pending_balances"] = pending_out
        g["total_expenses"] = sum(e["amount"] for e in expenses)
    # Round 51 — fix script omission: populate cache so the cache_get
    # above can ever hit. 30s TTL — short enough to feel live, long
    # enough to absorb tab re-mount bursts. Invalidated on writes via
    # invalidate_split_cache_for_group() in split_common.
    cache_set(cache_key, groups, ttl_seconds=30)
    return groups



@api_router.post("/split/groups/{group_id}/members")
async def add_members_to_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Add new members to an existing split group.

    Round 100O — accepts EITHER:
      • {"phones": ["9876543210", ...]}                       (legacy)
      • {"entries": [{"phone": "9876543210", "name": "Rohan"}]} (new)
    Names attached to pending_invites get echoed back through /manage,
    so the chat feed renders proper labels instead of leaking raw phone
    numbers ("+91 9497846497" → "Rohan").
    """
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")

    # Build a (phone, name) tuple list from either input shape.
    raw_entries: list[tuple[str, str]] = []
    if data.get("entries"):
        for e in data["entries"]:
            if isinstance(e, dict):
                raw_entries.append((str(e.get("phone", "")), str(e.get("name", "")).strip()))
    elif data.get("phones"):
        for ph in data["phones"]:
            raw_entries.append((str(ph), ""))

    if not raw_entries:
        raise HTTPException(status_code=400, detail="Provide phone numbers to add")

    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()

    existing_phones = {m.get("phone", "") for m in group.get("members", [])}
    existing_invites = {pi.get("phone", "") for pi in (group.get("pending_invites") or [])}
    added: list = []
    invited: list = []

    # Phase 5 fix: batch-fetch phone→user mappings in a single $in query
    # instead of N serial find_one() calls (previously an N+1 hot path on
    # bulk-add operations).
    normalized: list[tuple[str, str]] = []
    for phone, name in raw_entries:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) == 10 and p.isdigit() and p not in existing_phones and p not in existing_invites:
            normalized.append((p, name))
    phone_to_user = {}
    if normalized:
        async for u in db.users.find({"phone": {"$in": [p for p, _ in normalized]}}):
            phone_to_user[u["phone"]] = u

    for p, hint_name in normalized:
        if p in existing_phones or p in existing_invites:
            continue

        member = phone_to_user.get(p)
        if member:
            new_member = {
                "user_id": str(member["_id"]),
                "name": member.get("name") or hint_name or f"+91 {p}",
                "phone": p,
            }
            await db.split_groups.update_one(
                {"_id": safe_oid(group_id, field_name="group_id")},
                {"$push": {"members": new_member}},
            )
            existing_phones.add(p)
            added.append(new_member["name"])
        else:
            # Not a registered user yet — queue as pending invite with
            # the friendly hint_name so we never have to leak the raw
            # phone in UI again.
            invite_doc = {"phone": p, "invited_at": utc_now()}
            if hint_name:
                invite_doc["name"] = hint_name
            await db.split_groups.update_one(
                {"_id": safe_oid(group_id, field_name="group_id")},
                {"$push": {"pending_invites": invite_doc}},
            )
            existing_invites.add(p)
            invited.append(hint_name or f"+91 {p}")

    if not added and not invited:
        return {
            "added": [],
            "invited": [],
            "message": "No new members to add (already in group or invalid numbers)",
        }

    parts = []
    if added:
        parts.append(f"Added {len(added)} member(s): {', '.join(added)}")
    if invited:
        parts.append(f"Invited {len(invited)} pending: {', '.join(invited)}")
    # Round 51 — invalidate cache so all members (incl. just-added) see fresh group list.
    await invalidate_split_cache_for_group(group_id, db)
    return {"added": added, "invited": invited, "message": " · ".join(parts)}



@api_router.get("/split/groups/{group_id}/manage")
async def get_group_management(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Get group management data (GPay-style). Must be a group member."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()
    
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

    # Pending invites — phones added during create/add-members that
    # don't yet correspond to a registered MintU user. Surfacing them
    # here is the fix for the UX bug where the group list said
    # "6 members" but settings said "1 member" (because /manage was
    # silently dropping invitees). Returning them lets the UI render a
    # consistent "INVITED" row and dedupe new phone entries.
    pending = []
    for pi in (group.get("pending_invites") or []):
        ph = pi.get("phone", "")
        if not ph:
            continue
        pending.append({
            "phone": ph,
            "name": pi.get("name") or "",
            "invited_at": (pi.get("invited_at").isoformat()
                           if pi.get("invited_at") and hasattr(pi.get("invited_at"), "isoformat")
                           else pi.get("invited_at")),
        })

    return {
        "id": str(group["_id"]),
        "name": group.get("name", ""),
        "members": members,
        "pending_invites": pending,
        "member_count": len(members),
        "pending_count": len(pending),
        "total_count": len(members) + len(pending),
        "created_by": group.get("created_by", members[0]["user_id"] if members else ""),
        "is_admin": user_id == group.get("created_by", members[0]["user_id"] if members else ""),
        "invite_code": f"MINTU-{str(group['_id'])[-6:].upper()}",
        "group_code": group.get("group_code"),
    }



@api_router.put("/split/groups/{group_id}/name")
async def rename_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Rename a split group. Must be a group member."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    result = await db.split_groups.update_one(
        {"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id},
        {"$set": {"name": name}},
    )
    if result.matched_count == 0:
        raise_group_not_found()
    # Round 51 — invalidate so renamed group surfaces in everyone's list.
    await invalidate_split_cache_for_group(group_id, db)
    return {"message": "Group renamed", "name": name}



@api_router.delete("/split/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Remove a member from group. Only the group admin (creator) can do this."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "created_by": user_id})
    if not group:
        raise HTTPException(status_code=403, detail="Only the group admin can remove members")
    # Round 51 — invalidate BEFORE the $pull so the removed member is
    # still reachable by `invalidate_split_cache_for_group` (which reads
    # the members list to find whose caches to clear).
    await invalidate_split_cache_for_group(group_id, db)
    await db.split_groups.update_one(
        {"_id": safe_oid(group_id, field_name="group_id")},
        {"$pull": {"members": {"user_id": member_id}}},
    )
    # Also clear the removed member's cache directly (they're gone from
    # the members array now, so the helper above couldn't reach them
    # AFTER the pull — this preempts that case too).
    cache_clear_prefix(f"split_groups:{member_id}")
    return {"message": "Member removed"}



@api_router.delete("/split/groups/{group_id}")
async def delete_group(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Delete a split group. Only the group admin (creator) can do this."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "created_by": user_id})
    if not group:
        raise HTTPException(status_code=403, detail="Only the group admin can delete the group")
    # Round 51 — invalidate BEFORE delete so the helper can read members.
    await invalidate_split_cache_for_group(group_id, db)
    await db.split_groups.delete_one({"_id": safe_oid(group_id, field_name="group_id")})
    await db.split_expenses.delete_many({"group_id": group_id})
    return {"message": "Group deleted"}



@api_router.delete("/split/groups/{group_id}/leave")
async def leave_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Leave a split group"""
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    user = await get_user_by_id(user_id) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "Someone") if user else "Someone"
    # Round 51 — invalidate BEFORE the $pull so the leaver's cache also clears.
    await invalidate_split_cache_for_group(group_id, db)
    await db.split_groups.update_one(
        {"_id": safe_oid(group_id, field_name="group_id")},
        {"$pull": {"members": {"user_id": user_id}}}
    )
    cache_clear_prefix(f"split_groups:{user_id}")
    # System message
    await db.split_messages.insert_one({"group_id": group_id, "type": "system", "content": f"{name} left the group", "created_at": utc_now()})
    return {"message": "Left group"}



@api_router.get("/split/groups/{group_id}/messages")
async def get_group_messages(group_id: str, limit: int = 50, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Get chat messages for a group. Must be a group member."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()
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
            "created_at": m.get("created_at", utc_now()).isoformat(),
        })
    return result



@api_router.post("/split/groups/{group_id}/messages")
async def send_group_message(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Send a chat message to a group. Must be a group member."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()
    user = await get_user_by_id(user_id) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "User") if user else "User"
    msg_type = data.get("type", "text")
    msg = {
        "group_id": group_id,
        "sender_id": user_id,
        "sender_name": name,
        "type": msg_type,
        "content": data.get("content", ""),
        "emoji": data.get("emoji"),
        "created_at": utc_now(),
    }
    result = await db.split_messages.insert_one(msg)
    # Round 51k — fan-out to live WS subscribers (chat is broadcast-only;
    # offline / older clients keep using the 8s poll fallback).
    try:
        from core.ws_manager import manager as _ws
        await _ws.broadcast(group_id, {
            "type": "message",
            "data": {
                "id": str(result.inserted_id),
                "group_id": group_id,
                "sender_id": user_id,
                "sender_name": name,
                "type": msg_type,
                "content": data.get("content", ""),
                "emoji": data.get("emoji"),
                "created_at": msg["created_at"].isoformat(),
            },
        })
    except Exception:
        # WS broadcast must never break the HTTP write path.
        pass
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
        raise_invalid_id("group_id")
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id")})
    if not group:
        raise_group_not_found()

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
        raise_invalid_id("group_id")
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id")})
    if not group:
        raise_group_not_found()

    # Already a member? Idempotent success.
    if any(m.get("user_id") == user_id for m in group.get("members") or []):
        return {"ok": True, "already_member": True, "group_id": group_id}

    user = await get_user_by_id(user_id) if ObjectId.is_valid(user_id) else None
    if not user:
        raise_user_not_found()
    phone = user.get("phone", "")
    new_member = {
        "user_id": user_id,
        "name": user.get("name", "Member"),
        "phone": phone,
        "avatar": user.get("avatar"),
    }
    await db.split_groups.update_one(
        {"_id": safe_oid(group_id, field_name="group_id")},
        {
            "$push": {"members": new_member},
            # Remove any matching pending invite by phone (best-effort)
            "$pull": {"pending_invites": {"phone": phone}},
        },
    )
    # Round 51 — invalidate so the new member sees the group + existing
    # members see the updated member roster.
    await invalidate_split_cache_for_group(group_id, db)
    return {"ok": True, "already_member": False, "group_id": group_id, "name": group.get("name")}
