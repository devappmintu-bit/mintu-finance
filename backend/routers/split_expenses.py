"""Split expense CRUD + summary + equal/shares/custom math.

Auto-extracted from backend/routers/splits.py (Round 14 refactor).
Imports the shared `router` from split_common.py so decorators register
on the same FastAPI APIRouter instance — no endpoint paths change.
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import Depends, Header, HTTPException

from core import db, get_current_user
from core.transactions import with_atomic, with_atomic_ctx
from core.money import (
    coerce_to_paise,
    paise_to_rupees,
    rupees_to_paise,
    splits_to_rupees,
)
from core.ledger_invariant import (
    LedgerInvariantError,
    assert_balanced_event,
    build_expense_entries,
)
from core.idempotency import (
    commit_idempotency,
    replay_idempotency,
    reserve_idempotency,
)
from core.ids import safe_oid
from core.time import utc_now
from core.errors import (
    raise_expense_not_found,
    raise_group_not_found,
    raise_invalid_id,
)
from routers.split_common import (
    api_router,
    SplitExpenseCreate, invalidate_split_cache_for_group,
)


@api_router.post("/split/expenses")
async def add_split_expense(
    expense: SplitExpenseCreate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    # Round 53c — Idempotency-Key header makes retries safe.
    # Header is OPTIONAL: legacy clients keep working unchanged.
    if idempotency_key:
        cached = await replay_idempotency(user_id, "split_expense", idempotency_key)
        if cached is not None:
            return cached
        if not await reserve_idempotency(user_id, "split_expense", idempotency_key):
            # A concurrent request reserved the same key but hasn't
            # committed yet. Reject rather than serve a partial.
            raise HTTPException(status_code=409, detail="Idempotency key in flight; retry later")

    # Round 51j — group_id is now Optional on the model (so the same
    # schema can be reused for drafts). Legacy endpoint still requires it.
    if not expense.group_id:
        raise HTTPException(status_code=400, detail="group_id is required for /split/expenses. Use /split/expenses/draft for unattached expenses.")
    group = await db.split_groups.find_one({"_id": ObjectId(expense.group_id), "members.user_id": user_id})
    if not group:
        raise_group_not_found()

    member_ids = [m["user_id"] for m in group["members"]]
    # Default paid_by to the current user if not specified
    paid_by = expense.paid_by or user_id

    # ── Round 53a: integer-paise + double-entry invariant.
    # All money math runs in paise. Convert RIGHT AT THE BOUNDARY.
    amount_paise = coerce_to_paise(expense.amount)
    raw_paise: Optional[Dict[str, int]] = None
    if expense.splits:
        if expense.split_type in ("shares", "percentage"):
            raw_paise = {uid: int(v) for uid, v in expense.splits.items()}
        else:
            raw_paise = {uid: coerce_to_paise(v) for uid, v in expense.splits.items()}
    splits_paise = _compute_splits_paise(amount_paise, expense.split_type, member_ids, raw_paise)

    # ── INVARIANT: assert sum(debits) == sum(credits) BEFORE we touch the DB.
    # If this fails the books would be corrupt → reject and abort, no writes.
    try:
        entries = build_expense_entries(
            amount_paise=amount_paise, paid_by=paid_by, splits_paise=splits_paise,
        )
        assert_balanced_event(entries, expected_total_paise=amount_paise,
                              context=f"split_expense:{expense.group_id}")
    except LedgerInvariantError as exc:
        raise HTTPException(status_code=400, detail=f"Ledger invariant violation: {exc}")

    # Legacy API surface — splits in rupees floats.
    splits = splits_to_rupees(splits_paise)

    exp_doc = {
        "group_id": expense.group_id,
        "description": expense.description,
        # Dual-write: legacy float (rupees) + canonical int (paise).
        "amount": expense.amount,
        "amount_paise": amount_paise,
        "paid_by": paid_by,
        "split_type": expense.split_type,
        "splits": splits,
        "splits_paise": splits_paise,
        "created_by": user_id,
        "created_at": utc_now()
    }

    # Round 52f \u2014 ATOMIC: expense insert + chat-card insert run as a
    # single multi-document transaction on Atlas (or compensating-
    # action mode on standalone Mongo). If the chat insert fails for
    # any reason, the orphaned expense is rolled back / removed so
    # users never see a phantom expense without its chat card.
    payer_name = next((m["name"] for m in group["members"] if m["user_id"] == paid_by), "Someone")
    member_count = len(splits)
    split_member_names = [next((m["name"] for m in group["members"] if m["user_id"] == uid), "?") for uid in splits.keys()]
    _msg_now = utc_now()

    expense_id_holder: Dict[str, Optional[str]] = {"id": None}

    async def _do_writes(session, ctx):
        result = await db.split_expenses.insert_one(exp_doc, session=session)
        expense_id_holder["id"] = str(result.inserted_id)
        msg_doc = {
            "group_id": expense.group_id, "type": "expense",
            "sender_id": user_id, "sender_name": payer_name,
            "content": expense.description,
            "expense_data": {
                "amount": expense.amount,
                "amount_paise": amount_paise,
                "paid_by": payer_name,
                "split_count": member_count,
                "paid_count": 1,
                "member_names": split_member_names,
                "expense_id": expense_id_holder["id"],
            },
            "created_at": _msg_now,
        }
        msg_result = await db.split_messages.insert_one(msg_doc, session=session)

        # Round 53d — register POST-COMMIT side-effects. These fire ONLY
        # if/after the transaction commits. If we crash or rollback,
        # NO websocket emit and NO cache invalidation runs — preventing
        # phantom UI updates.
        ws_payload = {
            "type": "message",
            "data": {
                "id": str(msg_result.inserted_id),
                "group_id": expense.group_id,
                "sender_id": user_id,
                "sender_name": payer_name,
                "type": "expense",
                "content": expense.description,
                "expense_data": msg_doc["expense_data"],
                "created_at": _msg_now.isoformat(),
            },
        }

        async def _hook_broadcast():
            from core.ws_manager import manager as _ws
            await _ws.broadcast(expense.group_id, ws_payload)

        async def _hook_invalidate_cache():
            await invalidate_split_cache_for_group(expense.group_id, db)

        ctx.on_commit(_hook_broadcast)
        ctx.on_commit(_hook_invalidate_cache)
        return msg_result, msg_doc

    async def _compensate(_exc):
        # Standalone-Mongo path only — remove the orphaned expense if
        # the chat insert failed AFTER the expense was already written.
        if expense_id_holder["id"]:
            await db.split_expenses.delete_one({"_id": ObjectId(expense_id_holder["id"])})

    msg_result, _msg_doc = await with_atomic_ctx(
        db.client, _do_writes, _compensate, label="split_expense.create",
    )
    response_body = {"id": expense_id_holder["id"], **{k: v for k, v in exp_doc.items() if k != "_id"}, "created_at": exp_doc["created_at"].isoformat()}
    if idempotency_key:
        try:
            await commit_idempotency(user_id, "split_expense", idempotency_key, response_body)
        except Exception:  # never fail the user request because of caching
            pass
    return response_body


# ══════════════════════════════════════════════════════════════════════
#  ROUND 51j — DRAFT / SOLO EXPENSES
#
#  Frees the create-expense flow from the hard requirement of a group.
#  Users can save an expense first ("I just paid ₹450 for dinner") and
#  attach it to a group later — or never. Drafts live in their own
#  collection (`draft_expenses`) so they never pollute group balance
#  computations and can be migrated atomically when the user is ready.
#
#  Three endpoints, all scoped to the calling user:
#    POST  /split/expenses/draft               — save a draft
#    GET   /split/expenses/drafts              — list my unattached drafts
#    POST  /split/expenses/{id}/attach-to-group → migrate draft → real expense
#  And:
#    DELETE /split/expenses/drafts/{id}        — discard a draft
#
#  Index is created in core/lifecycle.py at startup; we ALSO
#  create_index here as a defensive fallback for first-run installs that
#  predate the lifecycle entry.
# ══════════════════════════════════════════════════════════════════════
@api_router.post("/split/expenses/draft")
async def create_draft_expense(expense: SplitExpenseCreate, user_id: str = Depends(get_current_user)):
    """Save an expense as a draft (unattached to any group). Required:
    description + amount. paid_by defaults to current user. splits, if
    provided, are kept as a hint for when the user later attaches to a
    group — but they're not validated against members until attach-time."""
    # Defensive: ensure index exists. Idempotent and cheap (mongo no-ops
    # if the index already exists).
    try:
        await db.draft_expenses.create_index([("user_id", 1), ("created_at", -1)])
    except Exception:
        pass
    paid_by = expense.paid_by or user_id
    # Round 53a — store paise canonically (still keep float for legacy reads).
    amount_paise = coerce_to_paise(expense.amount)
    splits_hint_paise: Dict[str, int] = {}
    if expense.splits:
        if expense.split_type in ("shares", "percentage"):
            splits_hint_paise = {uid: int(v) for uid, v in expense.splits.items()}
        else:
            splits_hint_paise = {uid: coerce_to_paise(v) for uid, v in expense.splits.items()}

    doc = {
        "user_id": user_id,
        "description": expense.description,
        "amount": expense.amount,
        "amount_paise": amount_paise,
        "paid_by": paid_by,
        "split_type": expense.split_type,
        "splits_hint": expense.splits or {},
        "splits_hint_paise": splits_hint_paise,
        "created_at": utc_now(),
    }
    result = await db.draft_expenses.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "description": doc["description"],
        "amount": doc["amount"],
        "amount_paise": doc["amount_paise"],
        "paid_by": doc["paid_by"],
        "split_type": doc["split_type"],
        "splits_hint": doc["splits_hint"],
        "splits_hint_paise": doc["splits_hint_paise"],
        "created_at": doc["created_at"],
    }


@api_router.get("/split/expenses/drafts")
async def list_draft_expenses(user_id: str = Depends(get_current_user)):
    """Current user's unattached drafts, newest first."""
    cursor = db.draft_expenses.find({"user_id": user_id}).sort("created_at", -1).limit(100)
    drafts = []
    async for d in cursor:
        drafts.append({
            "id": str(d["_id"]),
            "description": d.get("description", ""),
            "amount": float(d.get("amount", 0) or 0),
            "paid_by": d.get("paid_by"),
            "split_type": d.get("split_type", "equal"),
            "splits_hint": d.get("splits_hint", {}),
            "created_at": d.get("created_at"),
        })
    return {"drafts": drafts, "count": len(drafts)}


@api_router.delete("/split/expenses/drafts/{draft_id}")
async def delete_draft_expense(draft_id: str, user_id: str = Depends(get_current_user)):
    """Discard a draft. Only the owner can delete their own."""
    if not ObjectId.is_valid(draft_id):
        raise HTTPException(status_code=400, detail="Invalid draft id")
    result = await db.draft_expenses.delete_one({"_id": ObjectId(draft_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"deleted": True}


@api_router.post("/split/expenses/{draft_id}/attach-to-group")
async def attach_draft_to_group(
    draft_id: str,
    payload: dict,  # expects {"group_id": "..."}
    user_id: str = Depends(get_current_user),
):
    """Atomically migrate a draft into a real group expense.

    Steps (best-effort atomic):
      1. Fetch the draft (validate ownership)
      2. Fetch the target group (validate user is a member)
      3. Compute splits against current group members
      4. Insert the real expense + chat card message
      5. Delete the draft
      6. Invalidate /split/groups cache so balances appear instantly

    On any failure between steps 4 and 5 we leave the draft intact so
    the user can retry — preferable to silent data loss.
    """
    group_id = (payload or {}).get("group_id")
    if not group_id:
        raise HTTPException(status_code=400, detail="group_id is required")
    if not ObjectId.is_valid(draft_id):
        raise HTTPException(status_code=400, detail="Invalid draft id")
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group id")

    draft = await db.draft_expenses.find_one({"_id": ObjectId(draft_id), "user_id": user_id})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or you're not a member")

    member_ids = [m["user_id"] for m in group["members"]]
    paid_by = draft.get("paid_by") or user_id
    # If a paid_by was set on the draft but isn't a current member, fall
    # back to the current user. Avoids creating an orphan expense whose
    # payer isn't in the group.
    if paid_by not in member_ids:
        paid_by = user_id

    raw_splits = draft.get("splits_hint") or None
    # Drop split entries for users who aren't in this group.
    if isinstance(raw_splits, dict):
        raw_splits = {uid: v for uid, v in raw_splits.items() if uid in member_ids} or None

    # Round 53a — paise-canonical math + invariant.
    from core.money import paise_from_doc
    amount_paise = paise_from_doc(draft, "amount")
    split_type = draft.get("split_type", "equal")
    raw_paise: Optional[Dict[str, int]] = None
    if raw_splits:
        if split_type in ("shares", "percentage"):
            raw_paise = {uid: int(v) for uid, v in raw_splits.items()}
        else:
            raw_paise = {uid: coerce_to_paise(v) for uid, v in raw_splits.items()}

    splits_paise = _compute_splits_paise(amount_paise, split_type, member_ids, raw_paise)
    try:
        entries = build_expense_entries(
            amount_paise=amount_paise, paid_by=paid_by, splits_paise=splits_paise,
        )
        assert_balanced_event(entries, expected_total_paise=amount_paise,
                              context=f"attach_draft:{draft_id}")
    except LedgerInvariantError as exc:
        raise HTTPException(status_code=400, detail=f"Ledger invariant violation: {exc}")

    splits = splits_to_rupees(splits_paise)

    exp_doc = {
        "group_id": group_id,
        "description": draft["description"],
        "amount": paise_to_rupees(amount_paise),
        "amount_paise": amount_paise,
        "paid_by": paid_by,
        "split_type": split_type,
        "splits": splits,
        "splits_paise": splits_paise,
        "created_by": user_id,
        "created_at": utc_now(),
        "from_draft_id": draft_id,  # audit trail
    }
    result = await db.split_expenses.insert_one(exp_doc)

    # Mirror the chat card the regular create-expense path produces.
    payer_name = next((m["name"] for m in group["members"] if m["user_id"] == paid_by), "Someone")
    split_member_names = [next((m["name"] for m in group["members"] if m["user_id"] == uid), "?") for uid in splits.keys()]
    await db.split_messages.insert_one({
        "group_id": group_id, "type": "expense", "sender_id": user_id, "sender_name": payer_name,
        "content": draft["description"],
        "expense_data": {
            "amount": paise_to_rupees(amount_paise),
            "amount_paise": amount_paise,
            "paid_by": payer_name,
            "split_count": len(splits),
            "paid_count": 1,
            "member_names": split_member_names,
            "expense_id": str(result.inserted_id),
        },
        "created_at": utc_now()
    })

    # Only delete the draft after the real expense is durably written.
    await db.draft_expenses.delete_one({"_id": ObjectId(draft_id), "user_id": user_id})
    await invalidate_split_cache_for_group(group_id, db)
    return {
        "id": str(result.inserted_id),
        "group_id": group_id,
        "description": exp_doc["description"],
        "amount": exp_doc["amount"],
        "amount_paise": exp_doc["amount_paise"],
        "paid_by": paid_by,
        "splits": splits,
        "splits_paise": splits_paise,
        "attached_from_draft": draft_id,
    }



def _compute_splits_paise(
    amount_paise: int,
    split_type: str,
    member_ids: List[str],
    raw_splits_paise: Optional[Dict[str, int]] = None,
) -> Dict[str, int]:
    """Largest-remainder method for split calculations — pure paise (int).

    Guarantees ``sum(splits.values()) == amount_paise`` exactly. This is
    the canonical implementation; the float-returning ``_compute_splits``
    is a thin wrapper that converts back to rupees for legacy callers.
    """
    if amount_paise <= 0:
        return {mid: 0 for mid in member_ids}

    if split_type == "equal":
        n = len(member_ids) or 1
        base = amount_paise // n
        remainder = amount_paise - (base * n)
        out: Dict[str, int] = {mid: base for mid in member_ids}
        # Distribute 1-paise remainders deterministically (sorted user_id).
        for mid in sorted(member_ids)[:remainder]:
            out[mid] += 1
        return out

    if split_type == "shares":
        share_ratios = raw_splits_paise or {mid: 1 for mid in member_ids}
        total_shares = sum(share_ratios.values()) or 1
        allocated = 0
        out = {}
        for uid, share in share_ratios.items():
            p = int((amount_paise * share) // total_shares)
            out[uid] = p
            allocated += p
        remainder = amount_paise - allocated
        if remainder > 0:
            frac = []
            for uid, share in share_ratios.items():
                exact = (amount_paise * share) / total_shares
                frac.append((exact - out[uid], uid))
            frac.sort(reverse=True)
            for _, uid in frac[:remainder]:
                out[uid] += 1
        return out

    if split_type == "percentage":
        pct = raw_splits_paise or {}
        allocated = 0
        out = {}
        for uid, p in pct.items():
            paise = int((amount_paise * p) // 100)
            out[uid] = paise
            allocated += paise
        remainder = amount_paise - allocated
        if remainder > 0:
            frac = [((amount_paise * pct.get(uid, 0) / 100) - out[uid], uid) for uid in out]
            frac.sort(reverse=True)
            for _, uid in frac[:remainder]:
                out[uid] += 1
        return out

    # Custom / Unequal — splits are exact paise amounts (already coerced upstream).
    if raw_splits_paise:
        return {uid: int(v) for uid, v in raw_splits_paise.items()}
    return {}


def _compute_splits(amount: float, split_type: str, member_ids: List[str], raw_splits: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    """Backward-compat wrapper: rupees-in, rupees-out.

    Delegates to ``_compute_splits_paise`` for the canonical math, then
    converts back to rupees-floats for any legacy caller / API response.
    All amounts are computed in paise (int) to avoid float rounding errors.
    """
    amount_paise = rupees_to_paise(float(amount)) if amount and amount > 0 else 0
    if amount_paise <= 0:
        return {mid: 0.0 for mid in member_ids}

    raw_paise: Optional[Dict[str, int]] = None
    if raw_splits:
        if split_type in ("shares", "percentage"):
            # `raw_splits` here are RATIOS / PERCENTAGES, not money — pass
            # straight through as ints.
            raw_paise = {uid: int(v) for uid, v in raw_splits.items()}
        else:
            # `unequal` / custom — values are rupee amounts; convert to paise.
            raw_paise = {uid: rupees_to_paise(float(v or 0)) for uid, v in raw_splits.items()}

    out_paise = _compute_splits_paise(amount_paise, split_type, member_ids, raw_paise)
    return splits_to_rupees(out_paise)



@api_router.get("/split/groups/{group_id}/expenses")
async def get_group_expenses(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(500)
    for e in expenses:
        e["id"] = str(e["_id"]); del e["_id"]
        payer = next((m["name"] for m in group["members"] if m["user_id"] == e["paid_by"]), "Unknown")
        e["paid_by_name"] = payer
    return {"group": {"name": group["name"], "members": group["members"]}, "expenses": expenses}



@api_router.get("/split/groups/{group_id}/summary")
async def group_expense_summary(group_id: str, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(group_id):
        raise_invalid_id("group_id")
    """Get comprehensive group summary with simplified debts. Must be a group member."""
    group = await db.split_groups.find_one({"_id": safe_oid(group_id, field_name="group_id"), "members.user_id": user_id})
    if not group:
        raise_group_not_found()
    
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
    existing = await db.split_expenses.find_one({"_id": safe_oid(expense_id, field_name="expense_id")})
    if not existing:
        raise_expense_not_found()
    group = await db.split_groups.find_one({
        "_id": ObjectId(existing["group_id"]),
        "members.user_id": user_id,
    }) if ObjectId.is_valid(str(existing.get("group_id") or "")) else None
    if not group:
        # Caller is not a group member — treat as not-found to avoid enumeration.
        raise_expense_not_found()
    is_creator = existing.get("created_by") == user_id
    is_payer = existing.get("paid_by") == user_id
    is_admin = group.get("created_by") == user_id
    if not (is_creator or is_payer or is_admin):
        raise HTTPException(status_code=403, detail="Only the expense creator, payer, or group admin can delete this expense")
    await db.split_expenses.delete_one({"_id": safe_oid(expense_id, field_name="expense_id")})
    # Round 51 — invalidate all members' /split/groups cache (balances changed).
    await invalidate_split_cache_for_group(str(existing.get("group_id") or ""), db)
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
    existing = await db.split_expenses.find_one({"_id": safe_oid(expense_id, field_name="expense_id")})
    if not existing:
        raise_expense_not_found()
    group = await db.split_groups.find_one({
        "_id": ObjectId(existing["group_id"]),
        "members.user_id": user_id,
    }) if ObjectId.is_valid(str(existing.get("group_id") or "")) else None
    if not group:
        raise_expense_not_found()
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

        # Round 53a — paise-canonical math + invariant.
        new_amount_paise = coerce_to_paise(new_amount)
        raw_paise: Optional[Dict[str, int]] = None
        if raw:
            if new_type in ("shares", "percentage"):
                raw_paise = {uid: int(v) for uid, v in raw.items()}
            else:
                raw_paise = {uid: coerce_to_paise(v) for uid, v in raw.items()}
        new_splits_paise = _compute_splits_paise(new_amount_paise, new_type, participant_ids, raw_paise)

        # INVARIANT: must balance BEFORE we persist.
        new_paid_by = updates.get("paid_by") or existing.get("paid_by") or user_id
        try:
            entries = build_expense_entries(
                amount_paise=new_amount_paise, paid_by=new_paid_by, splits_paise=new_splits_paise,
            )
            assert_balanced_event(entries, expected_total_paise=new_amount_paise,
                                  context=f"edit_expense:{expense_id}")
        except LedgerInvariantError as exc:
            raise HTTPException(status_code=400, detail=f"Ledger invariant violation: {exc}")

        new_splits = splits_to_rupees(new_splits_paise)
        updates["amount"] = paise_to_rupees(new_amount_paise)
        updates["amount_paise"] = new_amount_paise
        updates["split_type"] = new_type
        updates["splits"] = new_splits
        updates["splits_paise"] = new_splits_paise

    if updates:
        updates["updated_at"] = utc_now()
        await db.split_expenses.update_one({"_id": safe_oid(expense_id, field_name="expense_id")}, {"$set": updates})
        # Round 51 — invalidate when amount/splits/payer changed (balance-affecting fields).
        if any(k in updates for k in ("amount", "splits", "split_type", "paid_by")):
            await invalidate_split_cache_for_group(str(existing.get("group_id") or ""), db)
    return {"message": "Expense updated", "splits": updates.get("splits", existing.get("splits", {}))}


