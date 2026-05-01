"""split_reminders.py — Reminder & invite-to-settle endpoints.

Extracted from split_settle.py (Round 30g refactor) to keep that file
focused on the settlement flow itself. These 4 endpoints are pure
messaging/social glue — they don't touch balances or locks.

Endpoints
---------
• POST /split/remind                          — Nudge a friend who owes you
• GET  /split/reminders                       — Inbox of pending reminders
• POST /split/reminders/{reminder_id}/dismiss — Mark a reminder as handled
• POST /split/invite-to-settle                — Build WhatsApp/UPI share payload

All four reuse the shared ``api_router`` from ``split_common`` so no
path changes occur on the client side.
"""
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, quote_plus

from bson import ObjectId
from fastapi import Depends, HTTPException

from core import db, get_current_user
from core.users import get_user_by_id
from core.time import utc_now
from core.errors import (
    raise_positive_amount_required,
)
from routers.split_common import api_router


# ══════════════════════════════════════════════════════════════════════
#  SEND / LIST / DISMISS REMINDERS
# ══════════════════════════════════════════════════════════════════════
@api_router.post("/split/remind")
async def send_payment_reminder(data: dict, user_id: str = Depends(get_current_user)):
    """Send a payment reminder to a friend who owes you money.

    Records the reminder in DB, posts a system message in the group chat
    (if group_id given), and returns a WhatsApp share text + local push
    payload for the frontend to use.

    Throttled to 1 reminder per (sender, recipient, group) per hour
    to avoid spam.
    """
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_id = data.get("group_id")
    note = (data.get("note") or "").strip()

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")

    # Anti-spam: 1 reminder/hour per pair
    one_hour_ago = utc_now() - timedelta(hours=1)
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
        "created_at": utc_now(),
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
                "reminder_data": {
                    "amount": amount,
                    "recipient_id": target_user_id,
                    "reminder_id": reminder_id,
                },
                "created_at": utc_now(),
            })
        except Exception as e:
            logging.warning(f"Could not post reminder system message: {e}")

    # WhatsApp deep link (works only if recipient has WhatsApp on that phone)
    wa_text = (
        f"Hey {recipient_name}! Friendly reminder: you owe ₹{amount:,.0f} on MintU.\n"
        f"Tap to settle: https://mintu.app/settle\n— {sender_name}"
    )
    if note:
        wa_text = (
            f"Hey {recipient_name}! {note}\n\n"
            f"You owe ₹{amount:,.0f}. Settle here: https://mintu.app/settle\n— {sender_name}"
        )

    wa_phone = recipient_phone if recipient_phone else ""
    wa_link = (
        f"https://wa.me/91{wa_phone}?text={quote(wa_text)}"
        if wa_phone else
        f"whatsapp://send?text={quote(wa_text)}"
    )

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
            "created_at": (
                r.get("created_at", utc_now()).isoformat()
                if hasattr(r.get("created_at"), "isoformat")
                else str(r.get("created_at", ""))
            ),
        }

    return {
        "received": [_ser(r) for r in received],
        "sent": [_ser(r) for r in sent],
        "received_count": len(received),
    }


@api_router.post("/split/reminders/{reminder_id}/dismiss")
async def dismiss_reminder(reminder_id: str, user_id: str = Depends(get_current_user)):
    """Dismiss a received reminder (mark as read)."""
    try:
        await db.split_reminders.update_one(
            {"_id": ObjectId(reminder_id), "recipient_id": user_id},
            {"$set": {"status": "dismissed", "dismissed_at": utc_now()}},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Dismissed"}


# ══════════════════════════════════════════════════════════════════════
#  INVITE-TO-SETTLE (share payload for UPI + WhatsApp)
# ══════════════════════════════════════════════════════════════════════
@api_router.post("/split/invite-to-settle")
async def invite_to_settle(data: dict, user_id: str = Depends(get_current_user)):
    """Generate a ready-to-share 'Invite to settle' payload
    (UPI deep link + WhatsApp text).

    Body: ``{target_user_id, target_name, target_phone (optional), amount,
              group_name (optional)}``
    Returns: ``{upi_link, whatsapp_text, web_fallback, share_text}``
    """
    target_name = data.get("target_name", "Friend")
    target_phone = (data.get("target_phone") or "").replace("+", "").replace(" ", "").replace("-", "")
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0))
    group_name = data.get("group_name", "a shared expense")
    note = data.get("note", "")

    if amount <= 0:
        raise_positive_amount_required()

    # Resolve payee UPI ID (if registered user)
    payee_upi = None
    payee_name = target_name
    if target_user_id and ObjectId.is_valid(target_user_id):
        target_user = await get_user_by_id(target_user_id)
        if target_user:
            payee_upi = target_user.get("upi_id")
            payee_name = target_user.get("name", target_name)

    # Resolve payer info (me)
    me = await get_user_by_id(user_id) or {}
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
        + f"\n👉 Tap to settle in 1 tap: upi://pay?pa={my_upi or 'pay@mintu'}"
          f"&pn={my_name}&am={upi_am}&tn=MintU%20split&cu=INR\n"
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
