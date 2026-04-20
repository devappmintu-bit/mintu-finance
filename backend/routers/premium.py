"""premium router — core endpoints (status, activation, Razorpay orders, AI coach, features catalog).

Large feature modules (tax calculator, investment suggester, deep reports) live in
dedicated sibling modules that decorate on the same shared APIRouter:

    - premium_common.py  (shared APIRouter + Razorpay proxy + request models)
    - premium_tax.py     (tax-calculator)
    - premium_invest.py  (investment-suggest)
    - premium_reports.py (deep-report for paying users)
"""
import os
import json as json_mod
import logging
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import Depends, HTTPException

from core import db, get_current_user
from core.constants import PREMIUM_FEATURES, PRICING

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:  # pragma: no cover
    LlmChat = UserMessage = None  # type: ignore

from routers.premium_common import (
    router, api_router, razorpay_client,
    CreateOrderRequest, MockActivateRequest,
)

# Importing these sibling modules registers their routes on the shared router.
from routers import premium_tax as _premium_tax  # noqa: F401
from routers import premium_invest as _premium_invest  # noqa: F401
from routers import premium_coins as _premium_coins  # noqa: F401


# ═══════════════════════════════ CORE ENDPOINTS ═════════════════════════════════

@api_router.post("/premium/mock-activate")
async def mock_activate_premium(req: MockActivateRequest, user_id: str = Depends(get_current_user)):
    """Activates premium for the user based on the selected plan — used by the
    in-app MockPaymentSheet until real Razorpay keys are wired up.

    If `coins_to_use` > 0, the coin-redeem endpoint is called server-side to
    deduct balance and record the effective (discounted) price on the user.
    """
    if req.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")

    # ── Optional coin redemption ──
    effective_price = PRICING[req.plan]["price"]
    coins_applied = 0
    if req.coins_to_use and req.coins_to_use > 0:
        from routers.premium_coins import coin_redeem_apply, RedeemPreviewBody
        redeem = await coin_redeem_apply(RedeemPreviewBody(plan=req.plan, coins_to_use=req.coins_to_use), user_id=user_id)
        effective_price = redeem["effective_price"]
        coins_applied = redeem["coins_applied"]

    now = datetime.utcnow()
    meta = PRICING[req.plan]
    if req.plan == "monthly":
        until = now + timedelta(days=31)
    elif req.plan == "yearly":
        until = now + timedelta(days=366)
    elif req.plan == "lifetime":
        until = now + timedelta(days=365 * 50)
    elif req.plan == "intro":
        until = now + timedelta(days=31)
    else:
        until = now + timedelta(days=31)
    tier = "legend" if req.plan == "lifetime" else "premium"
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "premium_tier": tier,
            "premium_plan": req.plan,
            "premium_until": until,
            "premium_activated_at": now,
            "money_school_access": bool(meta.get("includes_money_school", False)),
        }},
    )
    return {
        "success": True, "is_premium": True,
        "tier": tier, "plan": req.plan,
        "premium_until": until.isoformat(),
        "features": PREMIUM_FEATURES,
        "money_school_access": bool(meta.get("includes_money_school", False)),
    }


@api_router.get("/premium/status")
async def get_premium_status(user_id: str = Depends(get_current_user)):
    """Return current premium status + full pricing catalog."""
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    tier = user.get("premium_tier", "free")
    until = user.get("premium_until")
    is_premium = tier in ("premium", "legend") and (until is None or until > datetime.utcnow())
    return {
        "is_premium": is_premium,
        "tier": tier,
        "plan": user.get("premium_plan"),
        "premium_until": until,
        "features": PREMIUM_FEATURES,
        "pricing": PRICING,
    }


@api_router.get("/premium/paywall-trigger")
async def get_paywall_trigger(user_id: str = Depends(get_current_user)):
    """Personalised paywall: estimate monthly waste and surface upsell copy."""
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({
        "user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}
    }).to_list(1000)
    total_spent = sum(t["amount"] for t in txns)
    cats: dict = {}
    for t in txns:
        cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    discretionary = ["Food", "Entertainment", "Shopping"]
    waste_estimate = sum(cats.get(c, 0) for c in discretionary) * 0.25
    return {
        "total_spent": total_spent,
        "waste_estimate": round(waste_estimate),
        "hook_text": f"You could have saved ₹{waste_estimate:.0f} this month",
        "sub_text": "MintU Premium finds your hidden money leaks",
        "pricing": PRICING,
        "features": list(PREMIUM_FEATURES.values()),
    }


# ═══════════════════════════ RAZORPAY (real-payments path) ══════════════════════

@api_router.post("/premium/create-order")
async def create_razorpay_order(req: CreateOrderRequest, user_id: str = Depends(get_current_user)):
    """Create a Razorpay order for premium subscription."""
    if req.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")
    amount_paise = PRICING[req.plan]["price"] * 100
    try:
        order = razorpay_client.order.create({
            "amount": amount_paise, "currency": "INR", "payment_capture": 1,
            "notes": {"user_id": user_id, "plan": req.plan},
        })
        await db.payment_orders.insert_one({
            "user_id": user_id, "order_id": order["id"], "plan": req.plan,
            "amount": PRICING[req.plan]["price"], "status": "created",
            "created_at": datetime.utcnow(),
        })
        return {
            "order_id": order["id"], "amount": amount_paise, "currency": "INR",
            "key_id": os.environ.get("RAZORPAY_KEY_ID", ""), "plan": req.plan,
        }
    except Exception as e:
        logging.error("Razorpay order error: %s", e)
        raise HTTPException(status_code=500, detail="Payment service unavailable. Please try later.")


@api_router.post("/premium/verify-payment")
async def verify_razorpay_payment(payment_data: dict, user_id: str = Depends(get_current_user)):
    """Verify Razorpay payment signature and activate premium on success."""
    order_id = payment_data.get("order_id", "")
    payment_id = payment_data.get("payment_id", "")
    signature = payment_data.get("signature", "")
    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Payment verification failed")

    order = await db.payment_orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    plan = order["plan"]
    days = 30 if plan in ("monthly", "intro") else 365
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "premium_tier": "premium",
            "premium_plan": plan,
            "premium_until": datetime.utcnow() + timedelta(days=days),
        }},
    )
    await db.payment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": datetime.utcnow()}},
    )
    return {
        "message": "Premium activated!",
        "premium_until": (datetime.utcnow() + timedelta(days=days)).isoformat(),
        "plan": plan,
    }


# ═══════════════════════════════ AI COACH (premium) ══════════════════════════════

@api_router.post("/premium/ai-coach")
async def ai_smart_coach(user_id: str = Depends(get_current_user)):
    """AI Smart Coach — personalised weekly advice (premium only)."""
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    tier = user.get("premium_tier", "free")
    if tier not in ("premium", "legend", "starter"):
        raise HTTPException(status_code=403, detail="Premium feature. Upgrade to access AI Smart Coach.")

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)

    total_income = sum(t["amount"] for t in txns if t.get("type") == "credit")
    total_expense = sum(t["amount"] for t in txns if t.get("type") == "debit")
    cats: dict = {}
    for t in txns:
        if t.get("type") == "debit":
            cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    cat_text = ", ".join(f"{c}: ₹{a:.0f}" for c, a in sorted(cats.items(), key=lambda x: -x[1]))

    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"coach_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=(
                "You are MintU AI Smart Coach — a personal financial advisor for Indian users.\n"
                "Give a detailed, actionable weekly plan. Be specific with ₹ amounts. Reference Indian services.\n"
                'Return JSON: {"advice": "2-3 paragraph plan", "action_items": ["item1", "item2", "item3"], "potential_savings": number}'
            ),
        ).with_model("openai", "gpt-5.2")

        response = await chat.send_message(UserMessage(text=(
            f"Income: ₹{total_income:.0f}, Expenses: ₹{total_expense:.0f}. "
            f"Categories: {cat_text}. Score: {user.get('money_score', 50)}. "
            "What should I do with my money this week?"
        )))

        resp_text = str(response).strip()
        if resp_text.startswith("```"):
            parts = resp_text.split("```")
            resp_text = parts[1] if len(parts) > 1 else parts[0]
            if resp_text.startswith("json"):
                resp_text = resp_text[4:]
        return json_mod.loads(resp_text.strip())
    except Exception as e:
        logging.error("AI Coach error: %s", e)
        return {
            "advice": "Focus on reducing your top spending category this week. Try the 50-30-20 rule.",
            "action_items": ["Review last week's spending", "Set a daily limit", "Cook 3 meals at home"],
            "potential_savings": 500,
        }


# ═══════════════════════════════ FEATURES CATALOG ════════════════════════════════

@router.get("/premium/features-catalog")
async def premium_features_catalog(user_id: str = Depends(get_current_user)):
    """Return the full MintU Premium features catalog (for upsell UI)."""
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    is_premium = bool(user.get("is_premium", False))
    return {
        "is_premium": is_premium,
        "tier": "Premium" if is_premium else "Free",
        "price": {"monthly": 99, "annual": 899, "annual_savings_pct": 24},
        "sections": [
            {"id": "ai", "title": "Advanced AI", "emoji": "🧠", "features": [
                {"name": "Predictive insights (month-end, category trends)", "free": True, "premium": True},
                {"name": "Waste detector with SIP comparisons", "free": True, "premium": True},
                {"name": "Personalised AI coach (unlimited msgs)", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Auto-categorization via GPT-5.2", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Weekly proactive nudges via WhatsApp", "free": False, "premium": True, "badge": "PRO"},
            ]},
            {"id": "tax", "title": "Tax Planning", "emoji": "💼", "features": [
                {"name": "Tax calculator (New vs Old regime)", "free": True, "premium": True},
                {"name": "80C / 80D suggestions", "free": True, "premium": True},
                {"name": "HRA exemption calculator", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Capital gains tracker (STCG/LTCG)", "free": False, "premium": True, "badge": "PRO"},
                {"name": "ITR-ready export (PDF)", "free": False, "premium": True, "badge": "PRO"},
            ]},
            {"id": "invest", "title": "Investments", "emoji": "📈", "features": [
                {"name": "SIP allocation suggester", "free": True, "premium": True},
                {"name": "Portfolio tracking (mutual funds, stocks)", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Goal-based planning (retirement, house)", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Fund screener & comparison", "free": False, "premium": True, "badge": "PRO"},
            ]},
            {"id": "reports", "title": "Deep Reports", "emoji": "📊", "features": [
                {"name": "6 / 12-month trend analytics", "free": False, "premium": True, "badge": "NEW"},
                {"name": "Shareable PDF report with graphs & tables", "free": False, "premium": True, "badge": "NEW"},
                {"name": "AI executive summary", "free": False, "premium": True, "badge": "NEW"},
            ]},
            {"id": "perks", "title": "Everyday Perks", "emoji": "🎁", "features": [
                {"name": "Split bills with friends", "free": True, "premium": True},
                {"name": "Ad-free experience", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Custom categories & tags", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Multi-device sync", "free": False, "premium": True, "badge": "PRO"},
                {"name": "Priority support", "free": False, "premium": True, "badge": "PRO"},
            ]},
        ],
        "cta_text": "Continue Free" if is_premium else "Upgrade to Premium",
        "cta_highlight": "Join 1,000+ smart savers" if not is_premium else "You're in the premium club 🏆",
    }
