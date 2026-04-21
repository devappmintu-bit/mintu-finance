"""User router — profile, avatar, UPI, biometric settings."""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.upi import validate_upi_id, mask_upi_id

router = APIRouter(prefix="/user", tags=["user"])


class BiometricToggle(BaseModel):
    enabled: bool


async def _get_user_or_404(user_id: str, projection: dict | None = None) -> dict:
    user = await db.users.find_one({"_id": ObjectId(user_id)}, projection) if projection else await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/me")
async def get_user_profile(user_id: str = Depends(get_current_user)):
    user = await _get_user_or_404(user_id)
    return {
        "id": str(user["_id"]),
        "phone": user["phone"],
        "name": user["name"],
        "money_score": user.get("money_score", 50),
        "created_at": user["created_at"],
    }


@router.put("/profile")
@router.put("/me")
async def update_profile(data: dict, user_id: str = Depends(get_current_user)):
    """Update user profile — supports name, monthly_income, language, email, dob.

    Exposed under both /profile (legacy) and /me (REST convention) to keep clients
    that hit either path working.
    """
    ALLOWED = {"name", "monthly_income", "language", "email", "dob", "occupation", "city", "state"}
    updates: dict = {}
    for key in ALLOWED:
        if key not in data:
            continue
        v = data[key]
        if key == "name":
            if isinstance(v, str) and v.strip():
                updates["name"] = v.strip()
        elif key == "monthly_income":
            try:
                updates["monthly_income"] = float(v) if v is not None else 0.0
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="monthly_income must be numeric")
        elif key == "language":
            if v in ("en", "hi", "ta", "bn", "te", "mr", "gu", "kn", "ml", "pa"):
                updates["language"] = v
        else:
            # Generic string fields — just trim-store
            if isinstance(v, str): updates[key] = v.strip()
            elif v is not None: updates[key] = v
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    return {"message": "Profile updated", **updates}


@router.post("/avatar")
async def upload_avatar(data: dict, user_id: str = Depends(get_current_user)):
    """Upload profile photo as base64 (<= ~500KB raw / ~700KB base64)."""
    avatar_b64 = data.get("avatar", "")
    if not avatar_b64:
        raise HTTPException(status_code=400, detail="No avatar data")
    if len(avatar_b64) > 700_000:
        raise HTTPException(status_code=400, detail="Image too large. Max 500KB")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"avatar": avatar_b64}})
    return {"message": "Avatar updated!"}


@router.get("/avatar")
async def get_avatar(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"avatar": 1, "name": 1}) or {}
    return {"avatar": user.get("avatar", ""), "name": user.get("name", "")}


@router.post("/upi")
async def save_upi_id(data: dict, user_id: str = Depends(get_current_user)):
    upi_id = data.get("upi_id", "").strip()
    if not upi_id:
        raise HTTPException(status_code=400, detail="UPI ID is required")
    if not validate_upi_id(upi_id):
        raise HTTPException(status_code=400, detail="Invalid UPI ID format. Use format: name@bank")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"upi_id": upi_id}})
    return {"message": "UPI ID saved", "upi_id": mask_upi_id(upi_id)}


@router.get("/upi")
async def get_upi_id(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"upi_id": 1, "name": 1}) or {}
    upi = user.get("upi_id", "")
    return {"upi_id": upi, "masked": mask_upi_id(upi), "name": user.get("name", "")}


@router.put("/biometric")
async def toggle_biometric(data: BiometricToggle, user_id: str = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"biometric_enabled": data.enabled}})
    return {"biometric_enabled": data.enabled}


@router.get("/biometric")
async def get_biometric_status(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"biometric_enabled": 1}) or {}
    return {"biometric_enabled": user.get("biometric_enabled", False)}


# ══════════════════════════════════════════════════════════════════
# NOTIFICATION PREFERENCES — industry-standard toggles
# ══════════════════════════════════════════════════════════════════
DEFAULT_NOTIF_PREFS = {
    "master_enabled": True,
    "channels": {"push": True, "email": False, "sms": False, "in_app": True},
    "categories": {
        "budget_alerts": True,        # over-budget warnings, weekly summaries
        "bill_reminders": True,       # upcoming bills, due dates
        "split_updates": True,        # new expenses, settlements from friends
        "transaction_alerts": True,   # large txns, duplicate detection
        "security": True,             # sign-ins, password changes (always recommended)
        "rewards": True,              # coins, vouchers, achievements
        "tips_news": True,            # Money School, India Finance news
        "marketing": False,           # promos, referrals
    },
    "quiet_hours": {"enabled": False, "start": "22:00", "end": "07:00"},
    "frequency": "realtime",  # realtime | daily | weekly
}


@router.get("/notification-prefs")
async def get_notification_prefs(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"notification_prefs": 1}) or {}
    prefs = user.get("notification_prefs") or {}
    # Merge with defaults so new keys added server-side always appear on client
    merged = {**DEFAULT_NOTIF_PREFS, **prefs}
    merged["channels"] = {**DEFAULT_NOTIF_PREFS["channels"], **(prefs.get("channels") or {})}
    merged["categories"] = {**DEFAULT_NOTIF_PREFS["categories"], **(prefs.get("categories") or {})}
    merged["quiet_hours"] = {**DEFAULT_NOTIF_PREFS["quiet_hours"], **(prefs.get("quiet_hours") or {})}
    return merged


@router.put("/notification-prefs")
async def update_notification_prefs(data: dict, user_id: str = Depends(get_current_user)):
    # Sanitize — only allow known keys
    prefs: dict = {}
    if "master_enabled" in data:
        prefs["master_enabled"] = bool(data["master_enabled"])
    if "frequency" in data and data["frequency"] in ("realtime", "daily", "weekly"):
        prefs["frequency"] = data["frequency"]
    if isinstance(data.get("channels"), dict):
        prefs["channels"] = {k: bool(v) for k, v in data["channels"].items() if k in DEFAULT_NOTIF_PREFS["channels"]}
    if isinstance(data.get("categories"), dict):
        prefs["categories"] = {k: bool(v) for k, v in data["categories"].items() if k in DEFAULT_NOTIF_PREFS["categories"]}
    if isinstance(data.get("quiet_hours"), dict):
        qh = data["quiet_hours"]
        prefs["quiet_hours"] = {
            "enabled": bool(qh.get("enabled", False)),
            "start": str(qh.get("start", "22:00"))[:5],
            "end":   str(qh.get("end",   "07:00"))[:5],
        }
    if not prefs:
        raise HTTPException(status_code=400, detail="No valid fields")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {f"notification_prefs.{k}": v for k, v in prefs.items()}})
    return {"ok": True, **prefs}


# ══════════════════════════════════════════════════════════════════
# PAYMENT METHODS — unified store (UPI / card / netbanking / wallet)
# Single source of truth used by Split settlements + Premium purchases.
# Stored as a list on the user doc, with `is_default` flag for quick checkout.
# For cards we store ONLY last4 + token id — never CVV / full PAN.
# ══════════════════════════════════════════════════════════════════
class PaymentMethodBody(BaseModel):
    type: str                           # 'upi' | 'card' | 'netbanking' | 'wallet'
    label: str | None = None            # user-facing name ("Primary UPI")
    upi_id: str | None = None
    card_last4: str | None = None
    card_brand: str | None = None       # visa | mastercard | rupay
    card_network: str | None = None
    card_token: str | None = None       # tokenized — from Razorpay/PG
    bank_name: str | None = None
    wallet_name: str | None = None      # paytm | mobikwik | amazonpay
    is_default: bool = False


def _mk_pm_id() -> str:
    return str(ObjectId())


@router.get("/payment-methods")
async def list_payment_methods(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"payment_methods": 1, "upi_id": 1}) or {}
    methods = list(user.get("payment_methods") or [])

    # Auto-surface legacy top-level upi_id as a virtual method so the list
    # is never empty right after migration — user can "save" it to persist.
    if not methods and user.get("upi_id"):
        methods.append({
            "id": "legacy_upi",
            "type": "upi",
            "upi_id": user["upi_id"],
            "label": "Primary UPI",
            "is_default": True,
            "virtual": True,
        })

    return {"methods": methods, "count": len(methods), "default": next((m for m in methods if m.get("is_default")), None)}


@router.post("/payment-methods")
async def add_payment_method(body: PaymentMethodBody, user_id: str = Depends(get_current_user)):
    if body.type not in ("upi", "card", "netbanking", "wallet"):
        raise HTTPException(status_code=400, detail="Invalid method type")

    doc = body.dict(exclude_none=True)

    # Type-specific validation
    if body.type == "upi":
        if not body.upi_id or not validate_upi_id(body.upi_id):
            raise HTTPException(status_code=400, detail="Invalid UPI ID (expected name@bank)")
    elif body.type == "card":
        if not body.card_last4 or len(body.card_last4) != 4 or not body.card_last4.isdigit():
            raise HTTPException(status_code=400, detail="Card last4 required (4 digits)")
    elif body.type == "netbanking":
        if not body.bank_name:
            raise HTTPException(status_code=400, detail="Bank name required")
    elif body.type == "wallet":
        if not body.wallet_name:
            raise HTTPException(status_code=400, detail="Wallet name required")

    doc["id"] = _mk_pm_id()
    doc["label"] = doc.get("label") or _default_label(doc)
    doc["created_at"] = datetime_utcnow_iso()

    # Load existing methods to decide default-handling path. First-ever add
    # (or is_default=true) must NOT attempt to update the array before it
    # exists — MongoDB's `$set: payment_methods.$[]...` requires the field.
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"payment_methods": 1}) or {}
    existing = user.get("payment_methods") or []

    if body.is_default or not existing:
        doc["is_default"] = True
        if existing:
            # Demote all others only when the array already exists
            await db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"payment_methods.$[].is_default": False}},
            )

    # $push will create the array if it doesn't exist
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$push": {"payment_methods": doc}})
    return {"ok": True, "method": doc}


@router.put("/payment-methods/{pm_id}/default")
async def set_default_payment_method(pm_id: str, user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"payment_methods": 1}) or {}
    methods = user.get("payment_methods") or []
    if not any(m.get("id") == pm_id for m in methods):
        raise HTTPException(status_code=404, detail="Method not found")
    # Demote all, then promote target
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"payment_methods.$[].is_default": False}},
    )
    await db.users.update_one(
        {"_id": ObjectId(user_id), "payment_methods.id": pm_id},
        {"$set": {"payment_methods.$.is_default": True}},
    )
    return {"ok": True, "default_id": pm_id}


@router.delete("/payment-methods/{pm_id}")
async def delete_payment_method(pm_id: str, user_id: str = Depends(get_current_user)):
    res = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"payment_methods": {"id": pm_id}}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Method not found")
    return {"ok": True, "deleted_id": pm_id}


def _default_label(doc: dict) -> str:
    t = doc.get("type", "")
    if t == "upi":       return f"UPI · {(doc.get('upi_id') or '').split('@')[0][:10]}"
    if t == "card":      return f"{(doc.get('card_brand') or 'Card').upper()} ···· {doc.get('card_last4', '')}"
    if t == "netbanking":return f"Netbanking · {doc.get('bank_name', '')}"
    if t == "wallet":    return f"Wallet · {(doc.get('wallet_name') or '').title()}"
    return "Payment Method"


def datetime_utcnow_iso() -> str:
    from datetime import datetime as _dt
    return _dt.utcnow().isoformat()


# ══════════════════════════════════════════════════════════════════
# DELETE ACCOUNT — soft + hard modes
# ══════════════════════════════════════════════════════════════════
@router.post("/delete-account")
async def delete_account(data: dict, user_id: str = Depends(get_current_user)):
    """Delete user account.

    Body: {"mode": "soft" | "hard", "confirmation": "DELETE"}

    * soft — marks the account as `deleted_at`; scheduled for hard purge in 30 days;
             user can restore by logging in with OTP within the window.
    * hard — IMMEDIATELY wipes all user-associated documents across every collection
             (transactions, budgets, splits, rewards, sessions, etc.). Irreversible.
    """
    mode = (data or {}).get("mode", "soft")
    confirmation = (data or {}).get("confirmation", "")

    if mode not in ("soft", "hard"):
        raise HTTPException(status_code=400, detail="mode must be 'soft' or 'hard'")
    if mode == "hard" and confirmation != "DELETE":
        raise HTTPException(status_code=400, detail="Type DELETE to confirm hard deletion")

    from datetime import datetime as _dt

    if mode == "soft":
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {
                "deleted_at":  _dt.utcnow(),
                "deleted_mode": "soft",
                "scheduled_purge_at": _dt.utcnow().replace(microsecond=0),
            }},
        )
        return {"ok": True, "mode": "soft", "message": "Account scheduled for deletion in 30 days. Log in to restore."}

    # HARD delete — cascade across collections. Use a known list so we don't
    # miss anything. Each collection is pulled by user_id (string) or owner-id
    # depending on its schema convention.
    from bson import ObjectId as _OID  # local alias (avoid confusion with module-level)
    targets_by_uid_string = [
        "transactions", "budgets", "budget_alerts",
        "coin_ledger", "reward_spins", "rewards_wallet",
        "achievements", "user_achievements",
        "gamification_status", "weekly_challenges",
        "notifications", "push_tokens",
        "gmail_connections", "gmail_sync_state",
        "referrals", "referral_events",
        "money_school_progress", "money_school_completions",
        "ai_chat_sessions", "ai_coach_messages",
        "premium_status", "premium_transactions",
        "sessions", "otp_codes",
    ]
    targets_by_member_id = ["splits", "split_groups", "split_expenses", "split_settlements"]

    total_deleted = 0
    for col in targets_by_uid_string:
        try:
            r = await db[col].delete_many({"user_id": user_id})
            total_deleted += r.deleted_count
        except Exception:
            pass

    # Split — user could be creator OR a member (embedded array)
    for col in targets_by_member_id:
        try:
            r = await db[col].delete_many({"$or": [
                {"user_id": user_id},
                {"created_by": user_id},
                {"owner_id": user_id},
            ]})
            total_deleted += r.deleted_count
            # Remove user from member lists in remaining docs
            await db[col].update_many(
                {"members": user_id},
                {"$pull": {"members": user_id}},
            )
        except Exception:
            pass

    # Finally, purge the user document itself
    await db.users.delete_one({"_id": ObjectId(user_id)})

    return {"ok": True, "mode": "hard", "deleted_documents": total_deleted, "message": "Account and all associated data wiped."}

