"""Split expense comments — R107.

Lightweight per-expense discussion thread so split flatmates can ask
"why is this 1.5×?" or "I wasn't there for the dessert" without
leaving the receipt context. Stored in `split_expense_comments`.

Endpoints:
  GET   /api/split/expenses/{expense_id}/comments
  POST  /api/split/expenses/{expense_id}/comments      body: {text}
  DELETE /api/split/expenses/{expense_id}/comments/{comment_id}

Auth: every read/write must be a member of the expense's group. We
lookup the expense → group → membership before allowing reads/writes.
"""
from bson import ObjectId
from fastapi import Depends, HTTPException

from core import db, get_current_user
from core.ids import safe_oid
from core.time import utc_now
from routers.split_common import api_router, invalidate_split_cache_for_group


MAX_TEXT = 600


async def _ensure_member(expense_id: str, user_id: str) -> tuple[dict, dict]:
    """Resolve expense + group, raise if user is not a member."""
    eoid = safe_oid(expense_id)
    if not eoid:
        raise HTTPException(400, "Invalid expense id")
    exp = await db.split_expenses.find_one({"_id": eoid})
    if not exp:
        raise HTTPException(404, "Expense not found")
    group = await db.split_groups.find_one({"_id": ObjectId(exp["group_id"])})
    if not group:
        raise HTTPException(404, "Group not found")
    member_ids = {str(m.get("user_id")) for m in group.get("members", []) if m.get("user_id")}
    if user_id not in member_ids:
        raise HTTPException(403, "Not a group member")
    return exp, group


async def _user_name(user_id: str) -> str:
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1, "phone": 1})
        if u:
            return (u.get("name") or u.get("phone") or "Member")
    except Exception:
        pass
    return "Member"


@api_router.get("/split/expenses/{expense_id}/comments")
async def list_expense_comments(
    expense_id: str,
    user_id: str = Depends(get_current_user),
):
    """Return chronological comment list for the expense."""
    await _ensure_member(expense_id, user_id)
    cursor = db.split_expense_comments.find(
        {"expense_id": expense_id}
    ).sort("created_at", 1).limit(200)
    out: list[dict] = []
    async for c in cursor:
        out.append({
            "id": str(c["_id"]),
            "expense_id": expense_id,
            "user_id": str(c.get("user_id", "")),
            "user_name": c.get("user_name") or "Member",
            "text": c.get("text", ""),
            "created_at": c.get("created_at").isoformat() if c.get("created_at") else None,
            "is_mine": str(c.get("user_id")) == user_id,
        })
    return {"comments": out, "count": len(out)}


@api_router.post("/split/expenses/{expense_id}/comments")
async def add_expense_comment(
    expense_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """Add a comment. Trims + caps at MAX_TEXT chars."""
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Comment text is required")
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT]
    exp, group = await _ensure_member(expense_id, user_id)
    name = await _user_name(user_id)
    doc = {
        "expense_id": expense_id,
        "group_id": str(exp["group_id"]),
        "user_id": user_id,
        "user_name": name,
        "text": text,
        "created_at": utc_now(),
    }
    res = await db.split_expense_comments.insert_one(doc)
    # Invalidate group caches so any UI surface listing recent activity
    # reflects the comment immediately.
    try:
        await invalidate_split_cache_for_group(str(exp["group_id"]))
    except Exception:
        pass
    return {
        "id": str(res.inserted_id),
        "expense_id": expense_id,
        "user_id": user_id,
        "user_name": name,
        "text": text,
        "created_at": doc["created_at"].isoformat(),
        "is_mine": True,
    }


@api_router.delete("/split/expenses/{expense_id}/comments/{comment_id}")
async def delete_expense_comment(
    expense_id: str,
    comment_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete own comment (any group member can delete their own)."""
    coid = safe_oid(comment_id)
    if not coid:
        raise HTTPException(400, "Invalid comment id")
    await _ensure_member(expense_id, user_id)
    c = await db.split_expense_comments.find_one({"_id": coid})
    if not c or str(c.get("expense_id")) != expense_id:
        raise HTTPException(404, "Comment not found")
    if str(c.get("user_id")) != user_id:
        raise HTTPException(403, "Can only delete your own comment")
    await db.split_expense_comments.delete_one({"_id": coid})
    return {"deleted": True, "id": comment_id}
