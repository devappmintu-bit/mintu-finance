"""premium router — extracted from server.py.

Lazy-imports any helpers still living in server.py via _srv() shim.
"""
import os
import json
import logging
import hashlib
import hmac
import random
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix


def _srv():
    import server  # noqa: PLC0415
    return server


def _lazy_attr(name):
    class _Proxy:
        def __call__(self, *a, **kw): return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k): return getattr(_srv(), name)[k]
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
        def items(self): return getattr(_srv(), name).items()
        def keys(self): return getattr(_srv(), name).keys()
        def __contains__(self, k): return k in getattr(_srv(), name)

        def get(self, k, default=None): return getattr(_srv(), name).get(k, default)
        def values(self): return getattr(_srv(), name).values()
    return _Proxy()


# Commonly needed helper proxies (harmless if unused)
calculate_money_score = _lazy_attr("calculate_money_score")
generate_insights_with_ai = _lazy_attr("generate_insights_with_ai")
get_lang_instruction = _lazy_attr("get_lang_instruction")
AGENT_PROFILES = _lazy_attr("AGENT_PROFILES")
XP_LEVELS = _lazy_attr("XP_LEVELS")
CATEGORIES = _lazy_attr("CATEGORIES")

router = APIRouter(tags=["premium"])
api_router = router  # extracted code uses @api_router.*


class CreateOrderRequest(BaseModel):
    plan: str  # "monthly", "yearly", "intro"


def _srv():
    import server  # noqa: PLC0415
    return server
def _lazy(name):
    class _P:
        def __call__(self, *a, **kw): return getattr(_srv(), name)(*a, **kw)
        def __getitem__(self, k): return getattr(_srv(), name)[k]
        def __iter__(self): return iter(getattr(_srv(), name))
        def __len__(self): return len(getattr(_srv(), name))
        def items(self): return getattr(_srv(), name).items()
        def keys(self): return getattr(_srv(), name).keys()
        def __contains__(self, k): return k in getattr(_srv(), name)

        def get(self, k, default=None): return getattr(_srv(), name).get(k, default)
        def values(self): return getattr(_srv(), name).values()
    return _P()
PREMIUM_FEATURES = _lazy("PREMIUM_FEATURES")
PRICING = _lazy("PRICING")
razorpay_client = _lazy("razorpay_client")



@api_router.get("/premium/status")
async def get_premium_status(user_id: str = Depends(get_current_user)):
    """Check user's premium status"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    tier = user.get("premium_tier", "free")
    until = user.get("premium_until")
    is_premium = tier in ["premium", "legend"] and (until is None or until > datetime.utcnow())
    
    return {
        "is_premium": is_premium,
        "tier": tier,
        "premium_until": until,
        "features": PREMIUM_FEATURES,
        "pricing": PRICING,
    }


@api_router.get("/premium/paywall-trigger")
async def get_paywall_trigger(user_id: str = Depends(get_current_user)):
    """Generate personalized paywall data with emotional triggers"""
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_spent = sum(t["amount"] for t in txns)
    # Estimate "waste" as top discretionary category overspend
    cats = {}
    for t in txns:
        cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    
    discretionary = ["Food", "Entertainment", "Shopping"]
    waste_estimate = sum(cats.get(c, 0) for c in discretionary) * 0.25  # 25% of discretionary = potential savings
    
    return {
        "total_spent": total_spent,
        "waste_estimate": round(waste_estimate),
        "hook_text": f"You could have saved ₹{waste_estimate:.0f} this month",
        "sub_text": "MintU Premium finds your hidden money leaks",
        "pricing": PRICING,
        "features": list(PREMIUM_FEATURES.values()),
    }


@api_router.post("/premium/create-order")
async def create_razorpay_order(req: CreateOrderRequest, user_id: str = Depends(get_current_user)):
    """Create Razorpay order for premium subscription"""
    if req.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    amount_paise = PRICING[req.plan]["price"] * 100
    
    try:
        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {"user_id": user_id, "plan": req.plan}
        })
        
        await db.payment_orders.insert_one({
            "user_id": user_id,
            "order_id": order["id"],
            "plan": req.plan,
            "amount": PRICING[req.plan]["price"],
            "status": "created",
            "created_at": datetime.utcnow()
        })
        
        return {
            "order_id": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "key_id": os.environ.get('RAZORPAY_KEY_ID', ''),
            "plan": req.plan
        }
    except Exception as e:
        logging.error(f"Razorpay order error: {e}")
        raise HTTPException(status_code=500, detail="Payment service unavailable. Please try later.")


@api_router.post("/premium/verify-payment")
async def verify_razorpay_payment(payment_data: dict, user_id: str = Depends(get_current_user)):
    """Verify Razorpay payment and activate premium"""
    order_id = payment_data.get("order_id", "")
    payment_id = payment_data.get("payment_id", "")
    signature = payment_data.get("signature", "")
    
    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")
    
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    
    # Get order details
    order = await db.payment_orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Activate premium
    plan = order["plan"]
    days = 30 if plan in ["monthly", "intro"] else 365
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"premium_tier": "premium", "premium_until": datetime.utcnow() + timedelta(days=days)}}
    )
    
    await db.payment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": datetime.utcnow()}}
    )
    
    return {"message": "Premium activated!", "premium_until": (datetime.utcnow() + timedelta(days=days)).isoformat(), "plan": plan}


@api_router.post("/premium/ai-coach")
async def ai_smart_coach(user_id: str = Depends(get_current_user)):
    """AI Smart Coach — premium feature: personalized weekly advice"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    tier = user.get("premium_tier", "free")
    if tier not in ["premium", "legend", "starter"]:
        raise HTTPException(status_code=403, detail="Premium feature. Upgrade to access AI Smart Coach.")
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_income = sum(t["amount"] for t in txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in txns if t["type"] == "debit")
    cats = {}
    for t in txns:
        if t["type"] == "debit":
            cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    
    cat_text = ", ".join([f"{c}: ₹{a:.0f}" for c, a in sorted(cats.items(), key=lambda x: -x[1])])
    
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"coach_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="""You are MintU AI Smart Coach — a personal financial advisor for Indian users.
Give a detailed, actionable weekly plan. Be specific with ₹ amounts. Reference Indian services.
Return JSON: {"advice": "2-3 paragraph plan", "action_items": ["item1", "item2", "item3"], "potential_savings": number}"""
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(
            text=f"Income: ₹{total_income:.0f}, Expenses: ₹{total_expense:.0f}. Categories: {cat_text}. Score: {user.get('money_score', 50)}. What should I do with my money this week?"
        ))
        
        resp_text = response.strip()
        if resp_text.startswith("```"):
            parts = resp_text.split("```")
            resp_text = parts[1] if len(parts) > 1 else parts[0]
            if resp_text.startswith("json"): resp_text = resp_text[4:]
        
        import json as json_mod
        parsed = json_mod.loads(resp_text.strip())
        return parsed
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        return {
            "advice": "Focus on reducing your top spending category this week. Try the 50-30-20 rule.",
            "action_items": ["Review last week's spending", "Set a daily limit", "Cook 3 meals at home"],
            "potential_savings": 500
        }

