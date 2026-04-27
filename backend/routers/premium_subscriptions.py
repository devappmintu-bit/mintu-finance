"""premium_subscriptions — Razorpay recurring subscriptions with UPI AutoPay.

Endpoints:
  • POST /api/premium/create-subscription  — creates a Razorpay subscription for
    the chosen tier (lite/pro/elite) and returns the hosted checkout URL where
    the user authorises a UPI AutoPay mandate.
  • POST /api/premium/cancel-subscription  — cancels an active subscription.
  • GET  /api/premium/subscription-status  — returns the user's current
    subscription state (useful for the app UI to show "Manage Subscription").
  • POST /api/premium/webhook              — Razorpay webhook listener that
    activates / extends / deactivates premium on subscription lifecycle events
    (subscription.charged, subscription.completed, subscription.cancelled, etc.)

SETUP REQUIRED (one-time, in the Razorpay Dashboard):
  1. Enable Subscriptions product on your Razorpay account
  2. Dashboard → Settings → Payment methods → enable UPI AutoPay
  3. Subscriptions → Plans → New Plan → create 3 monthly plans:
       Lite  — ₹29  (item.amount=2900 paise, period=monthly, interval=1)
       Pro   — ₹99  (item.amount=9900 paise, period=monthly, interval=1)
       Elite — ₹149 (item.amount=14900 paise, period=monthly, interval=1)
  4. Copy each plan_id into backend/.env:
       RAZORPAY_PLAN_ID_LITE=plan_xxx
       RAZORPAY_PLAN_ID_PRO=plan_yyy
       RAZORPAY_PLAN_ID_ELITE=plan_zzz
  5. Dashboard → Settings → Webhooks → add endpoint:
       URL    : https://<your-domain>/api/premium/webhook
       Events : subscription.activated, subscription.charged,
                subscription.completed, subscription.cancelled,
                subscription.halted, subscription.pending
       Copy the signing secret into RAZORPAY_WEBHOOK_SECRET in .env
  6. Restart backend — the new endpoints become fully live.
"""
import os
import hmac
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from bson import ObjectId

from routers.premium_common import router, api_router, razorpay_client
from core import db, get_current_user

logger = logging.getLogger("premium_subscriptions")

# Maps internal plan keys → env-var names that hold the Razorpay plan_id.
# The user populates these in .env after creating the plans in dashboard.
TIER_TO_ENV = {
    "lite":  "RAZORPAY_PLAN_ID_LITE",
    "pro":   "RAZORPAY_PLAN_ID_PRO",
    "elite": "RAZORPAY_PLAN_ID_ELITE",
}

# Internal name (shown in UI) → PRICING dict key (for back-compat with mock-activate flow)
TIER_TO_PLAN = {
    "lite":  "intro",
    "pro":   "monthly",
    "elite": "yearly",
}


class CreateSubBody(BaseModel):
    tier: str  # "lite" | "pro" | "elite"
    total_count: int = 12  # number of billing cycles (12 = 1 year of monthly charges)


# ════════════════════════════════════════════════════════════════════════
#   CREATE subscription  →  returns hosted checkout short_url
# ════════════════════════════════════════════════════════════════════════
@api_router.post("/premium/create-subscription")
async def create_subscription(body: CreateSubBody, user_id: str = Depends(get_current_user)):
    tier = (body.tier or "").lower()
    if tier not in TIER_TO_ENV:
        raise HTTPException(status_code=400, detail="Invalid tier. Use 'lite', 'pro', or 'elite'.")

    plan_id = os.environ.get(TIER_TO_ENV[tier], "").strip()
    if not plan_id:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Subscription plan for '{tier}' not configured yet. "
                f"Admin must create the plan in Razorpay Dashboard and set "
                f"{TIER_TO_ENV[tier]} in backend/.env"
            ),
        )

    # Total billing cycles — Razorpay UPI AutoPay requires a finite `total_count`.
    # Default 12 (1 year). App may pass other values (e.g., 24 = 2 years, 120 = 10 years).
    total_count = max(1, min(240, int(body.total_count or 12)))

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        sub = razorpay_client.subscription.create({
            "plan_id": plan_id,
            "total_count": total_count,
            "customer_notify": 1,
            "notes": {
                "user_id": user_id,
                "tier": tier,
                "phone": user.get("phone", ""),
            },
        })
    except Exception as e:
        logger.exception("Razorpay subscription.create failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)[:200]}")

    # Persist the pending subscription locally so webhook can cross-reference.
    await db.subscriptions.update_one(
        {"razorpay_subscription_id": sub["id"]},
        {"$set": {
            "user_id": user_id,
            "razorpay_subscription_id": sub["id"],
            "tier": tier,
            "plan": TIER_TO_PLAN[tier],
            "plan_id": plan_id,
            "status": sub.get("status", "created"),
            "total_count": total_count,
            "short_url": sub.get("short_url"),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    return {
        "subscription_id": sub["id"],
        "short_url": sub.get("short_url"),   # User opens this to authorise AutoPay mandate
        "status": sub.get("status", "created"),
        "plan_id": plan_id,
        "tier": tier,
        "total_count": total_count,
        "ok": True,
    }


# ════════════════════════════════════════════════════════════════════════
#   CANCEL subscription
# ════════════════════════════════════════════════════════════════════════
@api_router.post("/premium/cancel-subscription")
async def cancel_subscription(user_id: str = Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "status": {"$in": ["authenticated", "active", "pending"]}},
        sort=[("created_at", -1)],
    )
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    try:
        res = razorpay_client.subscription.cancel(
            sub["razorpay_subscription_id"],
            {"cancel_at_cycle_end": 0},  # cancel immediately
        )
    except Exception as e:
        logger.exception("Razorpay subscription.cancel failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)[:200]}")

    await db.subscriptions.update_one(
        {"_id": sub["_id"]},
        {"$set": {"status": res.get("status", "cancelled"), "cancelled_at": datetime.now(timezone.utc)}},
    )
    return {"status": res.get("status", "cancelled"), "ok": True}


# ════════════════════════════════════════════════════════════════════════
#   GET current subscription status
# ════════════════════════════════════════════════════════════════════════
@api_router.get("/premium/subscription-status")
async def subscription_status(user_id: str = Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user_id},
        sort=[("created_at", -1)],
    )
    if not sub:
        return {"has_subscription": False}
    return {
        "has_subscription": True,
        "subscription_id": sub["razorpay_subscription_id"],
        "tier": sub.get("tier"),
        "status": sub.get("status"),
        "short_url": sub.get("short_url"),
        "paid_count": sub.get("paid_count", 0),
        "total_count": sub.get("total_count"),
        "next_charge_at": sub.get("next_charge_at"),
        "cancelled_at": sub.get("cancelled_at"),
    }


# ════════════════════════════════════════════════════════════════════════
#   WEBHOOK  (called by Razorpay on subscription lifecycle events)
# ════════════════════════════════════════════════════════════════════════
def _verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Razorpay signs webhooks as HMAC-SHA256 of the raw body using the webhook secret."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@api_router.post("/premium/webhook")
async def razorpay_webhook(request: Request):
    """Razorpay → backend lifecycle events. Must return 200 quickly (<5s)."""
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()
    if not secret:
        # If webhook secret isn't configured, accept but log — this is OK during
        # initial dashboard setup but should be flipped to 403 once live.
        logger.warning("RAZORPAY_WEBHOOK_SECRET not set — webhook signature NOT verified")

    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if secret and not _verify_webhook_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed JSON")

    event = (payload or {}).get("event", "")
    sub_entity = (((payload or {}).get("payload") or {}).get("subscription") or {}).get("entity") or {}
    sub_id = sub_entity.get("id")

    if not sub_id:
        # Some events (payment.captured without subscription_id) we just ack.
        return {"ok": True, "ignored": True, "event": event}

    notes = sub_entity.get("notes") or {}
    user_id = notes.get("user_id")
    tier = notes.get("tier") or "pro"
    plan = TIER_TO_PLAN.get(tier, "monthly")

    # Mirror the subscription into our DB regardless of event.
    await db.subscriptions.update_one(
        {"razorpay_subscription_id": sub_id},
        {"$set": {
            "status": sub_entity.get("status"),
            "paid_count": sub_entity.get("paid_count"),
            "current_start": _epoch_to_dt(sub_entity.get("current_start")),
            "current_end":   _epoch_to_dt(sub_entity.get("current_end")),
            "next_charge_at": _epoch_to_dt(sub_entity.get("charge_at")),
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    # Event-specific actions on the user record.
    # IMPORTANT: webhook must be idempotent + always 200 on valid signature — if
    # user_id is malformed or the user record is gone, log and continue, don't 4xx
    # (Razorpay retries up to 24× on non-2xx, causing mandate state drift).
    def _safe_oid(v):
        try:
            return ObjectId(v) if v and isinstance(v, str) and len(v) == 24 else None
        except Exception:
            return None

    uid_obj = _safe_oid(user_id)
    if event in ("subscription.activated", "subscription.charged", "subscription.resumed"):
        if uid_obj:
            now = datetime.now(timezone.utc)
            await db.users.update_one(
                {"_id": uid_obj},
                {"$set": {
                    "premium_tier": "premium",
                    "premium_plan": plan,
                    "premium_until": now + timedelta(days=31),
                    "premium_activated_at": now,
                    "autopay_active": True,
                }},
            )
    elif event in ("subscription.cancelled", "subscription.halted", "subscription.completed"):
        if uid_obj:
            await db.users.update_one(
                {"_id": uid_obj},
                {"$set": {"autopay_active": False}},
            )

    return {"ok": True, "event": event, "subscription_id": sub_id}


def _epoch_to_dt(epoch_val):
    """Razorpay sends unix-epoch ints; convert to datetime or None."""
    if not epoch_val:
        return None
    try:
        return datetime.utcfromtimestamp(int(epoch_val))
    except Exception:
        return None
