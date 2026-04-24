"""Settlement flow, UPI intents, balances, reminders, leaderboard, redeem.

Auto-extracted from backend/routers/splits.py (Round 14 refactor).
Imports the shared `router` from split_common.py so decorators register
on the same FastAPI APIRouter instance — no endpoint paths change.
"""
import logging
import uuid as uuid_lib
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from urllib.parse import quote, quote_plus
from typing import List, Optional, Dict, Any
from bson import ObjectId
from fastapi import Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from core import db, get_current_user
from core.upi import mask_upi_id
from routers.split_common import (
    router, api_router,
    SplitGroupCreate, SplitExpenseCreate, SettlePayment,
    SETTLEMENT_REWARDS, SETTLEMENT_BADGES,
)


# ─── Debt-pair advisory lock (Round 30 race fix) ──────────────────────
# MongoDB-native mutex: inserting a doc with the pair's `_id` succeeds
# for the first caller; concurrent inserts DuplicateKeyError → we 429.
# The lock doc auto-expires via TTL index (see server.py startup) so a
# crashed request can't block the pair forever.
def _settle_lock_key(user_id: str, target_user_id: str, group_id: Optional[str]) -> str:
    pair = ":".join(sorted([user_id or "", target_user_id or ""]))
    return f"settle:{pair}:{group_id or '*'}"


@asynccontextmanager
async def _settle_lock(user_id: str, target_user_id: str, group_id: Optional[str]):
    """Acquire a short-lived advisory lock for this (payer, payee, group) tuple.

    Prevents TOCTOU races between `compute_outstanding_debt` and
    `settlements.insert_one` under concurrent settle attempts. First
    caller wins; others get HTTP 429.
    """
    key = _settle_lock_key(user_id, target_user_id, group_id)
    try:
        await db.settle_locks.insert_one({"_id": key, "at": datetime.utcnow()})
    except DuplicateKeyError:
        raise HTTPException(status_code=429, detail="Another settlement is in progress, please retry")
    try:
        yield
    finally:
        try:
            await db.settle_locks.delete_one({"_id": key})
        except Exception:
            pass


async def dismiss_reminders_after_settle(payer_id: str, payee_id: str) -> int:
    """Auto-dismiss any pending reminders that the payee sent to the payer
    for this debt. Called from every settle path (UPI, offline, rewards,
    Razorpay) so a successful payment always clears stale reminder banners.
    Returns the count of reminders dismissed.
    """
    try:
        r = await db.split_reminders.update_many(
            {"recipient_id": payer_id, "sender_id": payee_id, "status": "pending"},
            {"$set": {"status": "settled", "dismissed_at": datetime.utcnow()}},
        )
        return int(r.modified_count or 0)
    except Exception:
        return 0


# ============== COIN REDEMPTION FOR SPLIT PAYMENTS ==============
# Rate is shared with premium coin redemption so the UX feels consistent.
COINS_PER_RUPEE = 10           # 10 coins = ₹1
SPLIT_MAX_DISCOUNT_PCT = 0.50  # Cap redemption at 50% of the debt amount


async def _get_user_coin_balance(user_id: str) -> int:
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return 0
    if not u:
        return 0
    return int(u.get("coins", 0) or 0)


def _split_max_discount(amount: float) -> int:
    return int(max(0.0, float(amount)) * SPLIT_MAX_DISCOUNT_PCT)


@api_router.post("/split/coin-redeem-preview")
async def split_coin_redeem_preview(data: dict, user_id: str = Depends(get_current_user)):
    """Preview coin redemption for a split settlement.

    Body: {amount: float, coins_to_use: int (optional, defaults to max)}
    Returns {amount, coin_balance, coins_applied, discount, effective_amount, max_discount, rate}.
    Never mutates state — safe for repeated slider calls.
    """
    amount = float(data.get("amount", 0) or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    balance = await _get_user_coin_balance(user_id)
    requested = int(data.get("coins_to_use", balance) or 0)
    requested = max(0, requested)

    max_disc = _split_max_discount(amount)
    applied_coins = min(requested, balance, max_disc * COINS_PER_RUPEE)
    discount = applied_coins // COINS_PER_RUPEE
    effective = max(0.0, round(amount - discount, 2))

    return {
        "amount": amount,
        "coin_balance": balance,
        "coins_applied": applied_coins,
        "discount": discount,
        "effective_amount": effective,
        "effective_price": effective,  # alias so shared CoinRedeemPanel works unchanged
        "list_price": amount,
        "max_discount": max_disc,
        "rate": {"coins_per_rupee": COINS_PER_RUPEE, "max_pct": int(SPLIT_MAX_DISCOUNT_PCT * 100)},
    }


async def _apply_split_coin_redemption(user_id: str, amount: float, coins_requested: int) -> dict:
    """Shared helper — deducts coins and returns breakdown. Used by settle endpoints below.

    Round 31 Paranoid-audit fix: now routes through `core.ledger.spend_coins`
    so the debit lands in `ledger_transactions` (the canonical ledger).
    Prior code did `$inc user.coins: -N` + legacy `coin_ledger` write, both
    silently wiped by the `/coins/balance` self-heal — letting the user
    redeem coins for a split discount while keeping the coins.
    """
    from core import ledger as ledger_service
    import uuid as _uuid

    if coins_requested <= 0 or amount <= 0:
        return {"coins_applied": 0, "discount": 0, "effective_amount": amount}

    # Canonical balance from the ledger (authoritative).
    balance = await ledger_service.get_balance(user_id)
    max_disc_coins = _split_max_discount(amount) * COINS_PER_RUPEE
    applied_coins = min(coins_requested, balance, max_disc_coins)
    discount = applied_coins // COINS_PER_RUPEE

    if applied_coins > 0:
        # Atomic debit through the ledger (idempotency keeps a double-
        # submission from double-spending).
        idem_key = f"split_redemption::{user_id}::{_uuid.uuid4().hex[:12]}"
        try:
            await ledger_service.spend_coins(
                user_id=user_id, amount=int(applied_coins),
                source="split_redemption", idempotency_key=idem_key,
            )
        except ValueError:
            # Insufficient balance (rare race) — fail gracefully with no discount.
            return {"coins_applied": 0, "discount": 0, "effective_amount": amount}

    return {
        "coins_applied": applied_coins,
        "discount": int(discount),
        "effective_amount": max(0.0, round(amount - discount, 2)),
    }




@api_router.get("/split/balances")
async def get_overall_balances(user_id: str = Depends(get_current_user)):
    """Get overall who owes you / you owe across all groups.

    CRITICAL: subtracts completed settlements (including partial + offline) so the
    balance reflects what's actually owed after payments. Mirrors the logic used in
    /split/groups/{id}/summary so both endpoints stay in sync.

    Round 30 perf fix: N+1 eliminated. Previously did 1 query per group for
    expenses → 20 groups = 20 round-trips. Now collects all group_ids and
    issues a single $in query. O(2) DB round-trips regardless of group count.
    """
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    group_ids = [str(g["_id"]) for g in groups]
    # Aggregate by the OTHER user's id (stable key across name changes)
    # Positive balance = they owe me; Negative = I owe them.
    by_uid: Dict[str, float] = {}
    uid_to_name: Dict[str, str] = {}
    for g in groups:
        uid_to_name.update({m["user_id"]: m["name"] for m in g.get("members", [])})

    # SINGLE round-trip for all expenses across all the user's groups.
    all_expenses = await db.split_expenses.find(
        {"group_id": {"$in": group_ids}}
    ).to_list(5000) if group_ids else []
    for exp in all_expenses:
        payer = exp["paid_by"]
        for uid, amt in (exp.get("splits") or {}).items():
            if uid == payer:
                continue
            if payer == user_id:
                by_uid[uid] = by_uid.get(uid, 0) + amt
            elif uid == user_id:
                by_uid[payer] = by_uid.get(payer, 0) - amt

    # Apply settlements (including partial + offline) — reduces the outstanding debt.
    # payer_id is the person who paid; payee_id is the receiver.
    settlements = await db.settlements.find({
        "$or": [{"payer_id": user_id}, {"payee_id": user_id}]
    }).to_list(1000)
    for st in settlements:
        amt = float(st.get("amount", 0))
        if amt <= 0: continue
        if st.get("payer_id") == user_id:
            # I paid them → reduces the amount I owed them (which was negative)
            other = st.get("payee_id")
            if other:
                by_uid[other] = by_uid.get(other, 0) + amt
        elif st.get("payee_id") == user_id:
            # They paid me → reduces the amount they owed me (which was positive)
            other = st.get("payer_id")
            if other:
                by_uid[other] = by_uid.get(other, 0) - amt

    # Build response dicts keyed by NAME (backwards-compat with frontend)
    owe_you: Dict[str, float] = {}
    you_owe: Dict[str, float] = {}
    # Filter small residual rounding noise (< ₹0.50)
    for other_uid, v in by_uid.items():
        if abs(v) < 0.5:
            continue
        nm = uid_to_name.get(other_uid, "Unknown")
        if v > 0:
            owe_you[nm] = round(v, 2)
        else:
            you_owe[nm] = round(abs(v), 2)

    return {
        "total_owed_to_you": round(sum(owe_you.values()), 2),
        "total_you_owe": round(sum(you_owe.values()), 2),
        "owe_you": owe_you,
        "you_owe": you_owe
    }


# ─────────────────────────────────────────────────────────────────────────
# Helper: compute the net debt the caller owes to a specific payee.
# Used by /split/settle, /split/partial-settle, /split/settle-with-rewards
# and /split/mark-paid-offline to reject phantom settles + lock out races.
# Returns a positive float when the caller owes money to target_user_id;
# 0 or negative when nothing is owed (or the other party owes the caller).
# ─────────────────────────────────────────────────────────────────────────
async def compute_outstanding_debt(user_id: str, target_user_id: str, group_id: Optional[str] = None) -> float:
    groups_q = {"members.user_id": {"$all": [user_id, target_user_id]}}
    if group_id:
        try:
            groups_q["_id"] = ObjectId(group_id)
        except Exception:
            return 0.0
    groups = await db.split_groups.find(groups_q).to_list(50)
    if not groups:
        return 0.0
    net = 0.0  # + means target owes caller; - means caller owes target
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(1000)
        for exp in expenses:
            payer = exp.get("paid_by")
            splits = exp.get("splits") or {}
            if payer == user_id and target_user_id in splits:
                net += float(splits[target_user_id] or 0)
            elif payer == target_user_id and user_id in splits:
                net -= float(splits[user_id] or 0)
    # Subtract settlements already recorded between this pair
    stl_q: Dict[str, Any] = {
        "$or": [
            {"payer_id": user_id, "payee_id": target_user_id},
            {"payer_id": target_user_id, "payee_id": user_id},
        ],
    }
    if group_id:
        stl_q["group_id"] = group_id
    settlements = await db.settlements.find(stl_q).to_list(2000)
    for st in settlements:
        amt = float(st.get("amount") or 0)
        if amt <= 0:
            continue
        if st.get("payer_id") == user_id:
            net += amt  # I already paid → my debt shrinks
        else:
            net -= amt  # They paid me → their debt shrinks
    # Caller owes `target` when net < 0; return positive magnitude.
    return round(-net, 2) if net < 0 else 0.0



@api_router.get("/split/pay-intent/{target_user_id}")
async def generate_upi_pay_intent(target_user_id: str, amount: float, user_id: str = Depends(get_current_user)):
    if not ObjectId.is_valid(target_user_id):
        raise HTTPException(status_code=400, detail="Invalid target_user_id")
    """Generate UPI deep link for payment"""
    
    target = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"upi_id": 1, "name": 1})
    if not target or not target.get("upi_id"):
        raise HTTPException(status_code=400, detail="Payee hasn't set up UPI ID")
    
    payee_name = target.get("name", "MintU User")
    upi_id = target["upi_id"]
    txn_ref = f"MINTU{uuid_lib.uuid4().hex[:8].upper()}"
    
    # UPI intent deep link (works with GPay, PhonePe, Paytm, BHIM)
    upi_link = f"upi://pay?pa={quote(upi_id)}&pn={quote(payee_name)}&am={amount:.2f}&cu=INR&tn={quote('MintU Split Settlement')}&tr={txn_ref}"
    
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
    """Mark a split payment as settled.

    Hardened (Round 29):
      • Rejects phantom settles — verifies the caller actually owes the
        payee (via compute_outstanding_debt) and amount ≤ outstanding.
      • Atomic guard — inserts the settlement inside an ordered two-step:
        re-check outstanding, then insert. Concurrent calls will still
        race but each subsequent insert will see the prior settlement
        reflected in outstanding, which prevents over-payment.
    """
    if not ObjectId.is_valid(data.target_user_id):
        raise HTTPException(status_code=400, detail="Invalid target_user_id")
    if data.amount is None or data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    async with _settle_lock(user_id, data.target_user_id, data.group_id):
        outstanding = await compute_outstanding_debt(user_id, data.target_user_id, data.group_id)
        if outstanding <= 0:
            raise HTTPException(status_code=400, detail="No outstanding debt to settle")
        if data.amount > outstanding + 0.5:  # allow ₹0.50 rounding slack
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

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

    # Auto-dismiss any pending reminders the payee had sent to the payer.
    await dismiss_reminders_after_settle(user_id, data.target_user_id)

    # Round 30e — emit declarative event for analytics/observability.
    try:
        from core.events import emit, Events
        emit(Events.SETTLEMENT_COMPLETED,
             payer_id=user_id,
             payee_id=data.target_user_id,
             amount=float(data.amount),
             group_id=data.group_id,
             method=data.method,
             settlement_id=settlement["id"])
    except Exception:
        pass

    # Get names safely
    payee_name = "User"
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



@api_router.post("/split/partial-settle")
async def partial_settle(data: dict, user_id: str = Depends(get_current_user)):
    """Record a partial payment toward a debt.

    Unlike /split/settle-with-rewards which assumes full settlement, this allows any amount
    less than or equal to the remaining debt. Multiple partials accumulate into a single
    conceptual 'settlement_amount' that reduces the balance in /summary calculations.
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    method = data.get("method", "upi")
    note = (data.get("note") or "").strip()
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")
    if not ObjectId.is_valid(target_user_id):
        raise HTTPException(status_code=400, detail="Invalid target_user_id")
    async with _settle_lock(user_id, target_user_id, group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, target_user_id, group_id)
        if outstanding <= 0:
            raise HTTPException(status_code=400, detail="No outstanding debt to settle")
        if amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        redemption = await _apply_split_coin_redemption(user_id, amount, coins_to_use)

        settlement = {
            "payer_id": user_id,
            "payee_id": target_user_id,
            "amount": amount,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
            "method": method,
            "txn_ref": f"PART-{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": group_id,
            "note": note,
            "is_partial": True,
            "status": "completed",
            "settled_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        }
        result = await db.settlements.insert_one(settlement)

    # Auto-dismiss any pending reminders for this debt (Round 30 — mirrors
    # mark-paid-offline behaviour so payments via any channel clear the banner).
    await dismiss_reminders_after_settle(user_id, target_user_id)

    # Coin reward proportional to amount (max 5 coins for partial)
    coins_earned = min(5, max(1, int(amount / 500)))
    try:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"reward_coins": coins_earned, "settlement_count": 1}}
        )
    except Exception:
        pass

    # System chat message
    payer_name = "User"
    payee_name = "User"
    try:
        p = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if p: payer_name = p.get("name", "User")
    except Exception:
        pass
    try:
        pe = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1})
        if pe: payee_name = pe.get("name", "User")
    except Exception:
        pass

    if group_id:
        try:
            coin_tag = f" 🪙{redemption['coins_applied']} coins" if redemption["coins_applied"] > 0 else ""
            await db.split_messages.insert_one({
                "group_id": group_id,
                "type": "system",
                "content": f"💰 {payer_name} paid ₹{amount:,.0f} (partial) to {payee_name}{coin_tag}",
                "sender_id": user_id,
                "sender_name": payer_name,
                "settlement_data": {
                    "amount": amount,
                    "method": method,
                    "settlement_id": str(result.inserted_id),
                    "is_partial": True,
                    "coins_applied": redemption["coins_applied"],
                    "coin_discount": redemption["discount"],
                },
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            logging.warning(f"Could not post partial settlement message: {e}")

    return {
        "id": str(result.inserted_id),
        "message": f"Partial ₹{amount:,.0f} to {payee_name} recorded ✅",
        "amount": amount,
        "coins_earned": coins_earned,
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
        "txn_ref": settlement["txn_ref"],
        "is_partial": True,
    }



@api_router.post("/split/settle-with-rewards")
async def settle_with_rewards(data: SettlePayment, user_id: str = Depends(get_current_user)):
    """Settle payment and earn reward coins. Supports optional coin redemption via data.coins_to_use."""

    if not ObjectId.is_valid(data.target_user_id):
        raise HTTPException(status_code=400, detail="Invalid target_user_id")
    if data.amount is None or data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    async with _settle_lock(user_id, data.target_user_id, data.group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, data.target_user_id, data.group_id)
        if outstanding <= 0:
            raise HTTPException(status_code=400, detail="No outstanding debt to settle")
        if data.amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Calculate reward tier
        reward = SETTLEMENT_REWARDS["on_time"]
        for tier_key, tier in SETTLEMENT_REWARDS.items():
            reward = tier
            break  # Give best available reward for now

        # Apply coin redemption first (deducts from balance). Debt still cleared fully.
        redemption = await _apply_split_coin_redemption(user_id, data.amount, int(data.coins_to_use or 0))

        settlement = {
            "payer_id": user_id,
            "payee_id": data.target_user_id,
            "amount": data.amount,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
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

    # Auto-dismiss any pending reminders for this debt (Round 30)
    await dismiss_reminders_after_settle(user_id, data.target_user_id)

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
    except Exception:
        pass

    return {
        "id": str(result.inserted_id),
        "message": f"₹{data.amount:,.0f} paid to {payee_name}! 🎉",
        "txn_ref": settlement["txn_ref"],
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
        "reward": {
            "coins_earned": reward["coins"],
            "label": reward["label"],
            "total_coins": total_coins,
            "cashback_available": round(cashback_value, 2),
            "new_badges": new_badges,
        }
    }



@api_router.post("/split/redeem-coins")
async def redeem_coins(data: dict, user_id: str = Depends(get_current_user)):
    """Redeem reward coins as cashback on next settlement"""
    coins_to_redeem = data.get("coins", 0)
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    available = user.get("reward_coins", 0) if user else 0

    if coins_to_redeem > available:
        raise HTTPException(status_code=400, detail=f"Only {available} coins available")

    cashback = round(coins_to_redeem * 0.5, 2)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"reward_coins": -coins_to_redeem}})

    return {"redeemed": coins_to_redeem, "cashback": cashback, "remaining_coins": available - coins_to_redeem}


# ============== PAYMENT REMINDERS ==============


@api_router.post("/split/mark-paid-offline")
async def mark_paid_offline(data: dict, user_id: str = Depends(get_current_user)):
    """Mark a debt as paid offline (cash/bank transfer) without triggering UPI flow.

    Creates a settlement record + posts a system message in group chat.
    Used when a user says 'I already paid in cash' without going through UPI.
    Supports optional `coins_to_use` to apply a coin-based discount (debt is still
    fully settled — coins cover the discount portion; the payer only pays the
    remainder in cash/bank).
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    method = data.get("method", "cash")  # cash | bank_transfer | other
    note = (data.get("note") or "").strip()
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")
    if not ObjectId.is_valid(target_user_id):
        raise HTTPException(status_code=400, detail="Invalid target_user_id")
    async with _settle_lock(user_id, target_user_id, group_id):
        # Phantom-settle + double-settle guard (Round 29, locked Round 30)
        outstanding = await compute_outstanding_debt(user_id, target_user_id, group_id)
        if outstanding <= 0:
            raise HTTPException(status_code=400, detail="No outstanding debt to settle")
        if amount > outstanding + 0.5:
            raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding ₹{outstanding:.2f}")

        # Apply coin redemption (deducts coins from balance). Still settle the FULL
        # debt amount — coins cover a discount on the actual cash outflow.
        redemption = await _apply_split_coin_redemption(user_id, amount, coins_to_use)

        settlement = {
            "payer_id": user_id,
            "payee_id": target_user_id,
            "amount": amount,
            "cash_paid": redemption["effective_amount"],
            "coin_discount": redemption["discount"],
            "coins_applied": redemption["coins_applied"],
            "method": method,
            "txn_ref": f"OFFLINE-{uuid_lib.uuid4().hex[:8].upper()}",
            "group_id": group_id,
            "note": note,
            "status": "completed",
            "is_offline": True,
            "settled_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        }
        result = await db.settlements.insert_one(settlement)

    # Award smaller coin reward for offline settlements (1 coin, honor system)
    try:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"reward_coins": 1, "settlement_count": 1}}
        )
    except Exception:
        pass

    # Auto-dismiss any pending reminders for this debt
    try:
        await db.split_reminders.update_many(
            {"recipient_id": user_id, "sender_id": target_user_id, "status": "pending"},
            {"$set": {"status": "settled", "dismissed_at": datetime.utcnow()}}
        )
    except Exception:
        pass

    # System message in group chat
    payer_name = "User"
    payee_name = "User"
    try:
        p = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if p: payer_name = p.get("name", "User")
    except Exception:
        pass
    try:
        pe = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1})
        if pe: payee_name = pe.get("name", "User")
    except Exception:
        pass

    if group_id:
        try:
            method_label = {"cash": "💵 cash", "bank_transfer": "🏦 bank transfer", "other": "✅"}.get(method, "offline")
            coin_tag = f" (🪙{redemption['coins_applied']} coins applied — ₹{redemption['discount']} off)" if redemption["coins_applied"] > 0 else ""
            await db.split_messages.insert_one({
                "group_id": group_id,
                "type": "system",
                "content": f"✅ {payer_name} paid ₹{amount:,.0f} to {payee_name} ({method_label}){coin_tag}",
                "sender_id": user_id,
                "sender_name": payer_name,
                "settlement_data": {
                    "amount": amount,
                    "method": method,
                    "settlement_id": str(result.inserted_id),
                    "coins_applied": redemption["coins_applied"],
                    "coin_discount": redemption["discount"],
                },
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            logging.warning(f"Could not post settlement system message: {e}")

    coin_suffix = f" · 🪙{redemption['coins_applied']} coins applied" if redemption["coins_applied"] > 0 else ""
    return {
        "id": str(result.inserted_id),
        "message": f"₹{amount:,.0f} marked as paid to {payee_name} ✅{coin_suffix}",
        "method": method,
        "txn_ref": settlement["txn_ref"],
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
        "cash_paid": redemption["effective_amount"],
    }




# Activity feed & leaderboard moved to split_activity.py (Phase 6)
