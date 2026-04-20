"""Settlement flow, UPI intents, balances, reminders, leaderboard, redeem.

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
    """Shared helper — deducts coins and returns breakdown. Used by settle endpoints below."""
    if coins_requested <= 0 or amount <= 0:
        return {"coins_applied": 0, "discount": 0, "effective_amount": amount}
    balance = await _get_user_coin_balance(user_id)
    max_disc_coins = _split_max_discount(amount) * COINS_PER_RUPEE
    applied_coins = min(coins_requested, balance, max_disc_coins)
    discount = applied_coins // COINS_PER_RUPEE
    if applied_coins > 0:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"coins": -applied_coins}})
        try:
            await db.coin_ledger.insert_one({
                "user_id": user_id,
                "action": "split_redemption",
                "amount": -applied_coins,
                "at": datetime.utcnow(),
            })
        except Exception:
            pass
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
    """
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    # Aggregate by the OTHER user's id (stable key across name changes)
    # Positive balance = they owe me; Negative = I owe them.
    by_uid: Dict[str, float] = {}
    uid_to_name: Dict[str, str] = {}

    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(500)
        name_map = {m["user_id"]: m["name"] for m in g["members"]}
        uid_to_name.update(name_map)
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid == payer: continue
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



@api_router.post("/split/partial-settle")
async def partial_settle(data: dict, user_id: str = Depends(get_current_user)):
    """Record a partial payment toward a debt.

    Unlike /split/settle-with-rewards which assumes full settlement, this allows any amount
    less than or equal to the remaining debt. Multiple partials accumulate into a single
    conceptual 'settlement_amount' that reduces the balance in /summary calculations.
    """
    from bson import ObjectId
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    method = data.get("method", "upi")
    note = (data.get("note") or "").strip()
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")

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
    from bson import ObjectId

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


# ============== PAYMENT REMINDERS ==============


@api_router.post("/split/remind")
async def send_payment_reminder(data: dict, user_id: str = Depends(get_current_user)):
    """Send a payment reminder to a friend who owes you money.

    Records the reminder in DB, posts a system message in the group chat (if group_id given),
    and returns a WhatsApp share text + local push payload for the frontend to use.
    Throttled to 1 reminder per (sender, recipient, group) per hour to avoid spam.
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    note = (data.get("note") or "").strip()

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")

    # Anti-spam: 1 reminder/hour per pair
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = await db.split_reminders.find_one({
        "sender_id": user_id,
        "recipient_id": target_user_id,
        "group_id": group_id,
        "created_at": {"$gt": one_hour_ago},
    })
    if recent:
        raise HTTPException(status_code=429, detail="Reminder already sent. Wait an hour before sending again.")

    sender = None
    recipient = None
    try:
        sender = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1, "phone": 1})
    except Exception:
        pass
    try:
        recipient = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1, "phone": 1})
    except Exception:
        pass

    sender_name = (sender or {}).get("name", "A friend")
    recipient_name = (recipient or {}).get("name", "User")
    recipient_phone = (recipient or {}).get("phone", "")

    reminder = {
        "sender_id": user_id,
        "sender_name": sender_name,
        "recipient_id": target_user_id,
        "recipient_name": recipient_name,
        "recipient_phone": recipient_phone,
        "amount": amount,
        "group_id": group_id,
        "note": note,
        "status": "pending",
        "created_at": datetime.utcnow(),
    }
    result = await db.split_reminders.insert_one(reminder)
    reminder_id = str(result.inserted_id)

    # System message in group chat so recipient sees it in chat feed
    if group_id:
        try:
            await db.split_messages.insert_one({
                "group_id": group_id,
                "type": "system",
                "content": f"🔔 ₹{amount:,.0f}",
                "meta": {
                    "sender": sender_name,
                    "recipient": recipient_name,
                    "amount": float(amount),
                    "kind": "reminder",
                },
                "sender_id": user_id,
                "sender_name": sender_name,
                "reminder_data": {"amount": amount, "recipient_id": target_user_id, "reminder_id": reminder_id},
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            logging.warning(f"Could not post reminder system message: {e}")

    # WhatsApp deep link (works only if recipient has WhatsApp on that phone)
    wa_text = f"Hey {recipient_name}! Friendly reminder: you owe ₹{amount:,.0f} on MintU.\nTap to settle: https://mintu.app/settle\n— {sender_name}"
    if note:
        wa_text = f"Hey {recipient_name}! {note}\n\nYou owe ₹{amount:,.0f}. Settle here: https://mintu.app/settle\n— {sender_name}"

    wa_phone = recipient_phone if recipient_phone else ""
    wa_link = f"https://wa.me/91{wa_phone}?text={quote(wa_text)}" if wa_phone else f"whatsapp://send?text={quote(wa_text)}"

    return {
        "id": reminder_id,
        "message": f"Reminded {recipient_name} ✅",
        "whatsapp_link": wa_link,
        "whatsapp_text": wa_text,
        "recipient_name": recipient_name,
        "amount": amount,
    }



@api_router.get("/split/reminders")
async def get_my_reminders(user_id: str = Depends(get_current_user)):
    """Get pending reminders received by current user + reminders sent by current user.

    Used to show a yellow banner on main Split screen: 'Ravi reminded you about ₹500'.
    """
    received = await db.split_reminders.find({
        "recipient_id": user_id,
        "status": "pending",
    }).sort("created_at", -1).to_list(20)

    sent = await db.split_reminders.find({
        "sender_id": user_id,
    }).sort("created_at", -1).to_list(20)

    def _ser(r):
        return {
            "id": str(r["_id"]),
            "sender_id": r.get("sender_id"),
            "sender_name": r.get("sender_name", "Friend"),
            "recipient_id": r.get("recipient_id"),
            "recipient_name": r.get("recipient_name", "User"),
            "amount": r.get("amount", 0),
            "group_id": r.get("group_id"),
            "note": r.get("note", ""),
            "status": r.get("status", "pending"),
            "created_at": r.get("created_at", datetime.utcnow()).isoformat() if hasattr(r.get("created_at"), "isoformat") else str(r.get("created_at", "")),
        }

    return {
        "received": [_ser(r) for r in received],
        "sent": [_ser(r) for r in sent],
        "received_count": len(received),
    }



@api_router.post("/split/reminders/{reminder_id}/dismiss")
async def dismiss_reminder(reminder_id: str, user_id: str = Depends(get_current_user)):
    """Dismiss a received reminder (mark as read)"""
    from bson import ObjectId
    try:
        await db.split_reminders.update_one(
            {"_id": ObjectId(reminder_id), "recipient_id": user_id},
            {"$set": {"status": "dismissed", "dismissed_at": datetime.utcnow()}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Dismissed"}



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



# ============== MINTU 2.0 — SPLIT ACTIVITY FEED (emotional redesign) ==============

@api_router.get("/split/activity")
async def split_activity(limit: int = 15, user_id: str = Depends(get_current_user)):
    """Emotional activity feed — Shows recent settlements, expense additions, group joins.
    Returns a unified, human-readable feed like:
      - 'You settled ₹450 with Riya 💙' — 2h ago
      - 'Arjun added ₹300 for Lunch in Goa Trip' — 5h ago
      - 'You got ₹1,200 back from Anita 🎉' — yesterday
    """
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    my_name = user.get("name", "You")

    # Pull from 3 sources: settlements (paid_by me or to me), expenses (my groups), system messages
    my_groups = await db.split_groups.find({"members.user_id": user_id}).to_list(200)
    group_ids = [str(g["_id"]) for g in my_groups]
    group_map = {str(g["_id"]): {"name": g["name"], "emoji": g.get("custom_emoji", "💰")} for g in my_groups}

    # Recent settlements
    settlements = await db.settlements.find({
        "group_id": {"$in": group_ids},
        "$or": [{"paid_by": user_id}, {"paid_to": user_id}],
    }).sort("created_at", -1).to_list(limit)

    # Recent expenses in my groups (non-settle)
    expenses = await db.split_expenses.find({
        "group_id": {"$in": group_ids},
    }).sort("date", -1).to_list(limit)

    # Build user lookup for names
    member_ids = set()
    for s in settlements:
        member_ids.add(s.get("paid_by"))
        member_ids.add(s.get("paid_to"))
    for e in expenses:
        member_ids.add(e.get("paid_by"))
    member_ids.discard(None)
    member_ids.discard(user_id)

    users = {}
    if member_ids:
        # Collect names from group members first (non-registered users live there)
        for g in my_groups:
            for m in g.get("members", []):
                if m.get("user_id") and m.get("user_id") in member_ids:
                    users[m["user_id"]] = m.get("name", "friend")
        # Override with registered user records when available
        for u in await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in member_ids if ObjectId.is_valid(uid)]}}).to_list(100):
            users[str(u["_id"])] = u.get("name", "friend")

    feed = []
    # Settlements → emotional messages
    for s in settlements:
        grp = group_map.get(s.get("group_id"), {"name": "a group", "emoji": "💰"})
        amt = s.get("amount", 0)
        ts = s.get("created_at", datetime.utcnow())
        if s.get("paid_by") == user_id:
            other = users.get(s.get("paid_to"), "friend")
            feed.append({
                "type": "settled_out",
                "emoji": "💙",
                "title": f"You settled ₹{amt:,.0f} with {other}",
                "subtitle": f"{grp['emoji']} {grp['name']} · via {s.get('method', 'manual')}",
                "amount": amt,
                "direction": "out",
                "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                "group_id": s.get("group_id"),
            })
        else:
            other = users.get(s.get("paid_by"), "friend")
            feed.append({
                "type": "settled_in",
                "emoji": "🎉",
                "title": f"{other} paid you ₹{amt:,.0f}",
                "subtitle": f"{grp['emoji']} {grp['name']}",
                "amount": amt,
                "direction": "in",
                "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                "group_id": s.get("group_id"),
            })

    # Expense additions → social messages
    for e in expenses[: max(limit - len(feed), 0)]:
        grp = group_map.get(str(e.get("group_id")), {"name": "a group", "emoji": "💰"})
        adder = users.get(e.get("paid_by"), my_name if e.get("paid_by") == user_id else "someone")
        is_me = e.get("paid_by") == user_id
        ts = e.get("date", datetime.utcnow())
        feed.append({
            "type": "expense_added",
            "emoji": "🛍️",
            "title": f"{'You' if is_me else adder} added ₹{e.get('amount', 0):,.0f} for {e.get('description', 'an expense')}",
            "subtitle": f"{grp['emoji']} {grp['name']}",
            "amount": e.get("amount", 0),
            "direction": "neutral",
            "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
            "group_id": str(e.get("group_id")),
        })

    # Sort by timestamp desc
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    feed = feed[:limit]

    # Summary stats for emotional header
    settled_this_month_count = 0
    settled_this_month_amount = 0
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for s in settlements:
        ts = s.get("created_at")
        if ts and ts >= month_start and s.get("paid_by") == user_id:
            settled_this_month_count += 1
            settled_this_month_amount += s.get("amount", 0)

    # Top friend (most settlements with)
    friend_counter: dict = {}
    for s in settlements:
        other = s.get("paid_to") if s.get("paid_by") == user_id else s.get("paid_by")
        if other and other != user_id:
            friend_counter[other] = friend_counter.get(other, 0) + 1
    top_friend = None
    if friend_counter:
        top_id = max(friend_counter, key=friend_counter.get)
        top_friend = {
            "name": users.get(top_id, "friend"),
            "count": friend_counter[top_id],
        }

    # Emotional headline
    if settled_this_month_count >= 3:
        headline = f"You settled {settled_this_month_count} bills this month 💙 Great teamwork!"
    elif settled_this_month_count >= 1:
        headline = f"You settled {settled_this_month_count} bill{'s' if settled_this_month_count > 1 else ''} this month ✨"
    elif len(feed) > 0:
        headline = "Keep the momentum going — settle pending bills to build streak 🔥"
    else:
        headline = "Start splitting with friends to see your activity here 👋"

    return {
        "feed": feed,
        "headline": headline,
        "settled_this_month": {
            "count": settled_this_month_count,
            "amount": settled_this_month_amount,
        },
        "top_friend": top_friend,
    }



@api_router.post("/split/invite-to-settle")
async def invite_to_settle(data: dict, user_id: str = Depends(get_current_user)):
    """Generate a ready-to-share 'Invite to settle' payload (UPI deep link + WhatsApp text).
    Body: {target_user_id, target_name, target_phone (optional), amount, group_name (optional)}
    Returns: {upi_link, whatsapp_text, web_fallback, share_text}
    """
    from bson import ObjectId
    target_name = data.get("target_name", "Friend")
    target_phone = (data.get("target_phone") or "").replace("+", "").replace(" ", "").replace("-", "")
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_name = data.get("group_name", "a shared expense")
    note = data.get("note", "")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Resolve payee UPI ID (if registered user)
    payee_upi = None
    payee_name = target_name
    if target_user_id and ObjectId.is_valid(target_user_id):
        target_user = await db.users.find_one({"_id": ObjectId(target_user_id)})
        if target_user:
            payee_upi = target_user.get("upi_id")
            payee_name = target_user.get("name", target_name)

    # Resolve payer info (me)
    me = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    my_name = me.get("name", "a MintU user")
    my_upi = me.get("upi_id", "")

    # Build UPI intent — pre-fills recipient's UPI + amount in payer's UPI app
    upi_pa = payee_upi or "settle@mintu"  # Fallback dummy — payer picks in app
    upi_tn = f"MintU split: {group_name[:40]}"
    upi_am = f"{amount:.2f}"
    upi_link = f"upi://pay?pa={upi_pa}&pn={payee_name}&am={upi_am}&tn={upi_tn}&cu=INR"

    # WhatsApp share text — invite target to pay ME via my UPI
    msg = (
        f"Hey {target_name}! 👋\n\n"
        f"Quick settlement request — you owe ₹{amount:,.0f} for {group_name}.\n"
        + (f"\n_{note}_\n" if note else "")
        + (f"\n💳 Pay to my UPI: {my_upi}\n" if my_upi else "")
        + f"\n👉 Tap to settle in 1 tap: upi://pay?pa={my_upi or 'pay@mintu'}&pn={my_name}&am={upi_am}&tn=MintU%20split&cu=INR\n"
        f"\nSent via MintU 💸"
    )

    wa_url = None
    if target_phone and target_phone.isdigit() and len(target_phone) >= 10:
        # Include phone for direct WhatsApp chat if provided
        wa_url = f"https://wa.me/{target_phone}?text={quote_plus(msg)}"
    else:
        wa_url = f"https://wa.me/?text={quote_plus(msg)}"

    return {
        "upi_link": upi_link,  # For target to PAY me
        "whatsapp_url": wa_url,  # Rich WhatsApp share
        "whatsapp_text": msg,
        "share_text": msg,
        "payee_upi": payee_upi,
        "has_upi": bool(my_upi),
    }



