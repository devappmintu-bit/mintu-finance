"""Round 37 — unified search router.

Cross-collection text search for the app-wide ⌘K-style search screen.
Returns up to 5 hits per entity kind.
"""
import re
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["search"])


@router.get("/search")
async def unified_search(q: str = "", user_id: str = Depends(get_current_user)):
    """Return up to 5 matches per bucket: transactions, budgets, goals, groups.

    Uses case-insensitive substring match (regex) rather than $text search
    so we don't require pre-created text indexes — fine for mobile scale
    (a single user's data), keeps deploy-time cost zero.
    """
    q_stripped = (q or "").strip()
    if not q_stripped:
        return {"transactions": [], "budgets": [], "goals": [], "groups": [], "total": 0}

    # Escape regex metacharacters so user input can't inject operators.
    pattern = re.escape(q_stripped)
    rx = {"$regex": pattern, "$options": "i"}

    # ── Transactions: search merchant + description ────────────────
    txn_cur = db.transactions.find({
        "user_id": user_id,
        "$or": [{"merchant": rx}, {"description": rx}, {"category": rx}],
    }).sort("date", -1).limit(5)
    transactions = []
    async for t in txn_cur:
        transactions.append({
            "id": str(t["_id"]),
            "amount": float(t.get("amount", 0) or 0),
            "merchant": t.get("merchant") or t.get("description", ""),
            "description": t.get("description", ""),
            "category": t.get("category", ""),
            "type": t.get("type", "debit"),
            "date": (t.get("date") or datetime.now(timezone.utc)).isoformat() if hasattr(t.get("date"), "isoformat") else str(t.get("date", "")),
        })

    # ── Budgets: category match ────────────────────────────────────
    bud_cur = db.budgets.find({
        "user_id": user_id,
        "$or": [{"category": rx}, {"description": rx}],
    }).limit(5)
    budgets = []
    async for b in bud_cur:
        budgets.append({
            "id": str(b["_id"]),
            "category": b.get("category", ""),
            "amount": float(b.get("amount", 0) or 0),
            "period": b.get("period", "monthly"),
            "description": b.get("description", ""),
        })

    # ── Goals: name match ──────────────────────────────────────────
    goal_cur = db.goals.find({
        "user_id": user_id,
        "$or": [{"name": rx}, {"description": rx}],
    }).limit(5)
    goals = []
    async for g in goal_cur:
        target = float(g.get("target_amount", 0) or 0)
        saved = float(g.get("saved_amount", 0) or 0)
        goals.append({
            "id": str(g["_id"]),
            "name": g.get("name", ""),
            "emoji": g.get("emoji", "🎯"),
            "target_amount": target,
            "saved_amount": saved,
            "pct": round((saved / target) * 100, 1) if target > 0 else 0,
        })

    # ── Split groups: name match (user must be a member) ───────────
    grp_cur = db.split_groups.find({
        "members.user_id": user_id,
        "name": rx,
    }).limit(5)
    groups = []
    async for gr in grp_cur:
        groups.append({
            "id": str(gr["_id"]),
            "name": gr.get("name", ""),
            "emoji": gr.get("custom_emoji", "👥"),
            "member_count": len(gr.get("members", [])),
        })

    total = len(transactions) + len(budgets) + len(goals) + len(groups)
    return {"transactions": transactions, "budgets": budgets, "goals": goals, "groups": groups, "total": total}
