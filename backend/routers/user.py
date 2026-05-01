"""User router — profile, avatar, UPI, biometric settings."""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.upi import validate_upi_id, mask_upi_id
from core.users import get_user_by_id
import logging

router = APIRouter(prefix="/user", tags=["user"])


class BiometricToggle(BaseModel):
    enabled: bool


async def _get_user_or_404(user_id: str, projection: dict | None = None) -> dict:
    user = await db.users.find_one({"_id": ObjectId(user_id)}, projection) if projection else await get_user_by_id(user_id)
    if not user:
        # Return 401 (not 404) when the user doc is gone — signals the
        # "dead-token" / "account deleted" case to the frontend interceptor
        # which then triggers an auth-expired flow (token clear + re-login)
        # instead of stranding the UI on a 404 screen.
        raise HTTPException(status_code=401, detail="Account no longer exists")
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
    """Create/Update or Remove profile photo.

    Pass ``avatar`` as a base64 data URI to set, or empty string to remove.
    Max size ~500KB raw / ~700KB base64.
    """
    avatar_b64 = data.get("avatar", "") if isinstance(data, dict) else ""
    if not isinstance(avatar_b64, str):
        raise HTTPException(status_code=400, detail="avatar must be a base64 string")
    # Empty string = remove avatar (idempotent delete)
    if not avatar_b64:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$unset": {"avatar": ""}})
        return {"message": "Avatar removed", "avatar": ""}
    if len(avatar_b64) > 700_000:
        raise HTTPException(status_code=400, detail="Image too large. Max 500KB")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"avatar": avatar_b64}})
    return {"message": "Avatar updated!", "avatar": avatar_b64}


@router.delete("/avatar")
async def delete_avatar(user_id: str = Depends(get_current_user)):
    """Delete the profile photo (idempotent)."""
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$unset": {"avatar": ""}})
    return {"message": "Avatar removed", "avatar": ""}


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

    # ── Smart Status layer (Round 26) ─────────────────────────────────
    # Compute usage-health for each method so UI can show "Active · used
    # 3d ago", "Stale · 60d+", "Never used · Verify now" etc. All fields
    # optional — client falls back gracefully if absent.
    from datetime import datetime as _dt
    now = _dt.utcnow()

    def _parse(ts):
        if not ts:
            return None
        try:
            s = ts if isinstance(ts, str) else ts.isoformat()
            return _dt.fromisoformat(s.replace("Z", "").split("+")[0])
        except Exception as _exc:
            logging.warning('user L249 default-return on except: %s', _exc)
            return None

    def _days(ts):
        d = _parse(ts)
        if not d:
            return None
        return max(0, (now - d).days)

    def _compute_health(m: dict) -> dict:
        last_used = m.get("last_used_at")
        last_sync = m.get("last_sync_at") or m.get("created_at")
        last_err = m.get("last_error")  # {"ts": ISO, "reason": "..."}
        days_since_used = _days(last_used)
        # Error wins over everything
        if last_err and last_err.get("ts") and _days(last_err.get("ts")) is not None and _days(last_err.get("ts")) <= 7:
            return {
                "status": "error",
                "tone": "danger",
                "label": f"Last charge failed · {last_err.get('reason', 'Unknown')}",
                "last_used_at": last_used, "last_sync_at": last_sync,
                "action": "retry", "action_label": "Fix now",
            }
        # Never used
        if days_since_used is None:
            return {
                "status": "unused",
                "tone": "neutral",
                "label": "Never used · tap to verify",
                "last_used_at": None, "last_sync_at": last_sync,
                "action": "verify", "action_label": "Verify now",
            }
        # Fresh
        if days_since_used <= 30:
            return {
                "status": "healthy",
                "tone": "success",
                "label": f"Active · used {days_since_used}d ago" if days_since_used > 0 else "Active · used today",
                "last_used_at": last_used, "last_sync_at": last_sync,
                "action": None, "action_label": None,
            }
        # Getting cold
        if days_since_used <= 90:
            return {
                "status": "stale",
                "tone": "warning",
                "label": f"Not used in {days_since_used}d",
                "last_used_at": last_used, "last_sync_at": last_sync,
                "action": "verify", "action_label": "Verify",
            }
        # Cold
        return {
            "status": "stale",
            "tone": "warning",
            "label": f"Stale · {days_since_used}d since last use",
            "last_used_at": last_used, "last_sync_at": last_sync,
            "action": "verify", "action_label": "Verify",
        }

    for m in methods:
        m["health"] = _compute_health(m)

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


@router.post("/payment-methods/{pm_id}/verify")
async def verify_payment_method(pm_id: str, user_id: str = Depends(get_current_user)):
    """Mock-verify a payment method — stamps last_sync_at and last_used_at
    to move the method into "healthy" status. Real integrations would ping
    the PSP (Razorpay/BBPS) to validate the UPI/card/bank handle; here we
    simulate that verification so the Smart Status layer has freshness
    signal. Handles legacy virtual methods by promoting them to real docs.
    """
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"payment_methods": 1, "upi_id": 1}) or {}
    methods = user.get("payment_methods") or []
    now_iso = datetime_utcnow_iso()

    # Promote legacy_upi virtual method → real persisted doc
    if pm_id == "legacy_upi" and user.get("upi_id") and not any(m.get("id") == "legacy_upi" for m in methods):
        doc = {
            "id": _mk_pm_id(),
            "type": "upi",
            "upi_id": user["upi_id"],
            "label": "Primary UPI",
            "is_default": not any(m.get("is_default") for m in methods),
            "created_at": now_iso,
            "last_sync_at": now_iso,
            "last_used_at": now_iso,
        }
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$push": {"payment_methods": doc}},
        )
        return {"ok": True, "status": "healthy", "verified_at": now_iso, "method_id": doc["id"]}

    if not any(m.get("id") == pm_id for m in methods):
        raise HTTPException(status_code=404, detail="Method not found")

    await db.users.update_one(
        {"_id": ObjectId(user_id), "payment_methods.id": pm_id},
        {"$set": {
            "payment_methods.$.last_sync_at": now_iso,
            "payment_methods.$.last_used_at": now_iso,
            "payment_methods.$.last_error": None,
        }},
    )
    return {"ok": True, "status": "healthy", "verified_at": now_iso, "method_id": pm_id}


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

    from datetime import datetime as _dt, timedelta as _td

    if mode == "soft":
        purge_at = _dt.utcnow() + _td(days=30)
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {
                "deleted_at":  _dt.utcnow(),
                "deleted_mode": "soft",
                "scheduled_purge_at": purge_at,
            }},
        )
        return {
            "ok": True,
            "mode": "soft",
            "scheduled_purge_at": purge_at.isoformat(),
            "message": "Account scheduled for deletion in 30 days. Log in to restore.",
        }

    # HARD delete — cascade across collections. Use a known list matching the
    # real collections in use (Round 30 sync with live schema).
    result = await _hard_purge_user(user_id)
    return {"ok": True, "mode": "hard", **result}


async def _hard_purge_user(user_id: str) -> dict:
    """Cascade-delete all documents belonging to `user_id` across every
    owned collection. Called by:
      • /user/delete-account mode=hard (immediate, user-initiated)
      • the startup soft-delete worker (after 30-day grace lapses)
    Returns a summary dict with the number of deleted documents.
    """
    from bson import ObjectId as _OID
    # Collections where docs are owned by `user_id` (string uid).
    targets_by_uid_string = [
        "transactions", "budgets", "budget_alerts",
        "cash_entries", "recurring_expenses",
        "goals", "score_history",
        "coin_ledger", "coins_wallet", "rewards_wallet",
        "reward_spins", "mission_claims", "user_badges",
        "agent_memory", "ab_events",
        "referrals",
        "sent_notifications",
        "gmail_tokens",
        "subscriptions", "payment_orders",
        "school_progress",
        "audit_logs",
    ]
    # Collections owned by phone (OTP/audit are phone-keyed)
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)}, {"phone": 1})
    user_phone = (user_doc or {}).get("phone")

    total_deleted = 0
    for col in targets_by_uid_string:
        try:
            r = await db[col].delete_many({"user_id": user_id})
            total_deleted += r.deleted_count
        except Exception as _exc:
            logging.warning('user L526 silent-except: %s', _exc)
    # Phone-keyed collections
    if user_phone:
        for col in ("otps", "otp_audit"):
            try:
                r = await db[col].delete_many({"phone": user_phone})
                total_deleted += r.deleted_count
            except Exception as _exc:
                logging.warning('user L534 silent-except: %s', _exc)

    # Settlements — user can be payer OR payee; wipe both sides so orphaned
    # debts don't haunt the other party's balance summary.
    try:
        r = await db.settlements.delete_many({
            "$or": [{"payer_id": user_id}, {"payee_id": user_id}],
        })
        total_deleted += r.deleted_count
    except Exception as _exc:
        logging.warning('user L544 silent-except: %s', _exc)

    # Reminders — user can be sender OR recipient
    try:
        r = await db.split_reminders.delete_many({
            "$or": [{"sender_id": user_id}, {"recipient_id": user_id}],
        })
        total_deleted += r.deleted_count
    except Exception as _exc:
        logging.warning('user L553 silent-except: %s', _exc)

    # Split messages — authored by the user. Keep system messages (sender_id=None)
    # for historical context in groups that still exist.
    try:
        r = await db.split_messages.delete_many({"sender_id": user_id})
        total_deleted += r.deleted_count
    except Exception as _exc:
        logging.warning('user L561 silent-except: %s', _exc)

    # Split groups — delete groups the user created (cascade expenses in those
    # groups), and REMOVE the user from `members` of any other groups they were
    # in. CRITICAL: members is an array of dicts `{user_id, name, phone}` so
    # the correct $pull filter is `{members: {user_id: uid}}`, NOT `{members: uid}`
    # (the latter only matches when members is an array of strings → silent noop
    # for the current schema, which was the Round 29 delete-account bug).
    try:
        # 1) Groups this user created → drop them AND their expenses/messages.
        created_groups = await db.split_groups.find(
            {"created_by": user_id}, {"_id": 1},
        ).to_list(200)
        created_ids = [str(g["_id"]) for g in created_groups]
        if created_ids:
            r = await db.split_groups.delete_many({"created_by": user_id})
            total_deleted += r.deleted_count
            for gid in created_ids:
                try:
                    r2 = await db.split_expenses.delete_many({"group_id": gid})
                    total_deleted += r2.deleted_count
                    r3 = await db.split_messages.delete_many({"group_id": gid})
                    total_deleted += r3.deleted_count
                except Exception as _exc:
                    logging.warning('user L585 silent-except: %s', _exc)
        # 2) Groups the user is a member of (but did NOT create) → pull them out.
        await db.split_groups.update_many(
            {"members.user_id": user_id},
            {"$pull": {"members": {"user_id": user_id}}},
        )
        # 3) Pending invites under the user's phone
        if user_phone:
            await db.split_groups.update_many(
                {"pending_invites.phone": user_phone},
                {"$pull": {"pending_invites": {"phone": user_phone}}},
            )
    except Exception as _exc:
        logging.warning('user L598 silent-except: %s', _exc)

    # Expenses where the user is the payer but in a group that survives —
    # leave them (other members' balance math still needs them). Only purge
    # expenses in groups that no longer exist.
    # (Handled implicitly via step (1) above for groups the user created.)

    # Finally, purge the user document itself
    await db.users.delete_one({"_id": ObjectId(user_id)})

    return {"deleted_documents": total_deleted, "message": "Account and all associated data wiped."}

