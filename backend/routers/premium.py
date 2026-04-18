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



# ============== MINTU 2.0 — TAX CALCULATOR (FY 2025-26 new regime) ==============
# India Income Tax — New Regime slabs for FY 2025-26 (AY 2026-27) as per Budget 2025
# Source: Union Budget 2025. Standard deduction: ₹75,000. Rebate u/s 87A: up to ₹60,000 for income ≤ ₹12L.
TAX_SLABS_NEW_REGIME_2025 = [
    {"from": 0, "to": 400000, "rate": 0},
    {"from": 400000, "to": 800000, "rate": 0.05},
    {"from": 800000, "to": 1200000, "rate": 0.10},
    {"from": 1200000, "to": 1600000, "rate": 0.15},
    {"from": 1600000, "to": 2000000, "rate": 0.20},
    {"from": 2000000, "to": 2400000, "rate": 0.25},
    {"from": 2400000, "to": float("inf"), "rate": 0.30},
]
STANDARD_DEDUCTION_NEW = 75000
REBATE_87A_CAP_NEW = 60000
REBATE_87A_INCOME_LIMIT_NEW = 1200000

# Old Regime FY 2025-26 (unchanged since FY 2024-25)
TAX_SLABS_OLD_REGIME = [
    {"from": 0, "to": 250000, "rate": 0},
    {"from": 250000, "to": 500000, "rate": 0.05},
    {"from": 500000, "to": 1000000, "rate": 0.20},
    {"from": 1000000, "to": float("inf"), "rate": 0.30},
]
STANDARD_DEDUCTION_OLD = 50000
REBATE_87A_CAP_OLD = 12500
REBATE_87A_INCOME_LIMIT_OLD = 500000


def _calc_tax_on_slabs(taxable: float, slabs: list) -> float:
    tax = 0.0
    for s in slabs:
        if taxable <= s["from"]:
            break
        bracket_income = min(taxable, s["to"]) - s["from"]
        if bracket_income > 0:
            tax += bracket_income * s["rate"]
    return tax


@router.post("/premium/tax-calculator")
async def tax_calculator(data: dict, user_id: str = Depends(get_current_user)):
    """Indian tax estimator for FY 2025-26 — compares New vs Old regime.
    Body: {
      annual_income (gross),
      hra_exempt?: float,    # HRA exemption (old regime only)
      section_80c?: float,   # ELSS, PPF, LIC, EPF up to ₹1.5L (old regime only)
      section_80d?: float,   # Health insurance premium (old regime only)
      home_loan_interest?: float,  # up to ₹2L self-occupied (old regime)
    }
    """
    income = float(data.get("annual_income", 0) or 0)
    hra = float(data.get("hra_exempt", 0) or 0)
    c80c = min(float(data.get("section_80c", 0) or 0), 150000)
    c80d = min(float(data.get("section_80d", 0) or 0), 75000)
    home_loan = min(float(data.get("home_loan_interest", 0) or 0), 200000)

    if income <= 0:
        raise HTTPException(status_code=400, detail="annual_income must be positive")

    # ===== NEW REGIME =====
    new_taxable = max(0, income - STANDARD_DEDUCTION_NEW)
    new_tax_pre = _calc_tax_on_slabs(new_taxable, TAX_SLABS_NEW_REGIME_2025)
    # 87A rebate
    new_rebate = min(new_tax_pre, REBATE_87A_CAP_NEW) if new_taxable <= REBATE_87A_INCOME_LIMIT_NEW else 0
    new_tax_after_rebate = max(0, new_tax_pre - new_rebate)
    new_cess = round(new_tax_after_rebate * 0.04, 2)
    new_total = round(new_tax_after_rebate + new_cess, 2)

    # ===== OLD REGIME =====
    old_deductions = STANDARD_DEDUCTION_OLD + hra + c80c + c80d + home_loan
    old_taxable = max(0, income - old_deductions)
    old_tax_pre = _calc_tax_on_slabs(old_taxable, TAX_SLABS_OLD_REGIME)
    old_rebate = min(old_tax_pre, REBATE_87A_CAP_OLD) if old_taxable <= REBATE_87A_INCOME_LIMIT_OLD else 0
    old_tax_after_rebate = max(0, old_tax_pre - old_rebate)
    old_cess = round(old_tax_after_rebate * 0.04, 2)
    old_total = round(old_tax_after_rebate + old_cess, 2)

    # Which regime is better?
    savings = round(abs(new_total - old_total), 2)
    recommended = "new" if new_total <= old_total else "old"

    # Smart suggestions based on income + deductions gap
    suggestions = []
    if c80c < 150000 and income >= 700000:
        gap = 150000 - c80c
        potential = gap * 0.30  # Assume highest slab
        suggestions.append({
            "title": f"Invest ₹{gap:,.0f} more in 80C (ELSS/PPF)",
            "savings": round(potential, 0),
            "detail": "ELSS mutual funds via Groww/Zerodha have 3-year lock-in and 12-15% avg returns. PPF gives 7.1% tax-free.",
            "icon": "shield-checkmark",
        })
    if c80d < 25000 and income >= 500000:
        gap = 25000 - c80d
        potential = gap * 0.30
        suggestions.append({
            "title": "Get health insurance (Section 80D)",
            "savings": round(potential, 0),
            "detail": f"₹{gap:,.0f} premium saves ₹{round(potential, 0):,.0f} in tax. ACKO, HDFC Ergo, Star Health from ₹500/month.",
            "icon": "medkit",
        })
    if income >= 900000 and home_loan == 0:
        suggestions.append({
            "title": "Claim home loan interest (up to ₹2L)",
            "savings": 60000,
            "detail": "If you have a home loan, Section 24(b) saves up to ₹60,000 on interest paid.",
            "icon": "home",
        })
    if income >= 500000 and new_total == 0 and old_total > 0:
        suggestions.append({
            "title": "New regime works for you!",
            "savings": round(old_total, 0),
            "detail": "Your income falls in the 87A rebate zone — zero tax under new regime.",
            "icon": "sparkles",
        })

    return {
        "input": {
            "annual_income": income,
            "hra_exempt": hra,
            "section_80c": c80c,
            "section_80d": c80d,
            "home_loan_interest": home_loan,
        },
        "new_regime": {
            "taxable_income": new_taxable,
            "tax_before_rebate": round(new_tax_pre, 2),
            "rebate_87a": round(new_rebate, 2),
            "tax_after_rebate": round(new_tax_after_rebate, 2),
            "cess_4pct": new_cess,
            "total_tax": new_total,
            "effective_rate_pct": round((new_total / income) * 100, 2) if income > 0 else 0,
        },
        "old_regime": {
            "total_deductions": old_deductions,
            "taxable_income": old_taxable,
            "tax_before_rebate": round(old_tax_pre, 2),
            "rebate_87a": round(old_rebate, 2),
            "tax_after_rebate": round(old_tax_after_rebate, 2),
            "cess_4pct": old_cess,
            "total_tax": old_total,
            "effective_rate_pct": round((old_total / income) * 100, 2) if income > 0 else 0,
        },
        "recommended_regime": recommended,
        "savings_by_choosing_recommended": savings,
        "suggestions": suggestions,
        "disclaimer": "Estimate based on FY 2025-26 rules. Consult a CA for final filing.",
    }


# ============== MINTU 2.0 — INVESTMENT / SIP SUGGESTER ==============
@router.post("/premium/investment-suggest")
async def investment_suggest(data: dict, user_id: str = Depends(get_current_user)):
    """Rule-based SIP/investment allocation suggestion for Indian users.
    Body: {
      monthly_income: float,
      monthly_expenses?: float (optional — fetched from tx if not provided),
      age?: int (default 28),
      risk?: "low" | "medium" | "high" (default "medium"),
      goal?: "emergency" | "wealth" | "retirement" | "short_term",
    }
    Returns an allocation recommendation (emergency, equity SIP, debt, gold, tax-saving) with real Indian products.
    """
    monthly_income = float(data.get("monthly_income", 0) or 0)
    if monthly_income <= 0:
        raise HTTPException(status_code=400, detail="monthly_income must be positive")

    age = int(data.get("age", 28))
    risk = data.get("risk", "medium").lower()
    goal = data.get("goal", "wealth").lower()

    monthly_expenses = data.get("monthly_expenses")
    if monthly_expenses is None:
        # Derive from last 30d
        now = datetime.utcnow()
        month_start = now - timedelta(days=30)
        pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["debit", "expense"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        docs = await db.transactions.aggregate(pipeline).to_list(1)
        monthly_expenses = docs[0]["total"] if docs else 0
    monthly_expenses = float(monthly_expenses)

    investible = max(0, monthly_income - monthly_expenses)
    if investible <= 0:
        return {
            "investible_monthly": 0,
            "monthly_income": monthly_income,
            "monthly_expenses": monthly_expenses,
            "headline": "No surplus to invest. Focus on reducing expenses first.",
            "allocations": [],
            "emergency_fund_target": monthly_expenses * 6,
            "disclaimer": "Mutual funds are subject to market risks. Past returns are not indicative of future performance.",
        }

    # Risk-based equity/debt split
    risk_profile = {
        "low": {"equity": 0.30, "debt": 0.50, "gold": 0.10, "cash": 0.10},
        "medium": {"equity": 0.55, "debt": 0.30, "gold": 0.10, "cash": 0.05},
        "high": {"equity": 0.75, "debt": 0.15, "gold": 0.05, "cash": 0.05},
    }.get(risk, {"equity": 0.55, "debt": 0.30, "gold": 0.10, "cash": 0.05})

    # Age-based adjustment (rule: 100 - age = equity %)
    age_equity_cap = max(30, min(90, 100 - age)) / 100
    risk_profile["equity"] = min(risk_profile["equity"], age_equity_cap)

    allocations = [
        {
            "id": "emergency_fund",
            "title": "Emergency Fund (Liquid)",
            "amount": round(min(investible * 0.10, (monthly_expenses * 6) / 12), 0),
            "pct": 10,
            "why": f"Target: 6 months of expenses (~₹{round(monthly_expenses * 6, 0):,.0f}). Keep in liquid fund.",
            "products": ["Parag Parikh Liquid Fund", "HDFC Liquid Fund", "Axis Liquid Fund"],
            "platform": "Groww / Zerodha Coin",
            "icon": "shield",
            "color": "#10B981",
        },
        {
            "id": "equity_sip",
            "title": "Equity SIP (Long-term wealth)",
            "amount": round(investible * risk_profile["equity"], 0),
            "pct": round(risk_profile["equity"] * 100, 0),
            "why": f"Equity builds wealth via compounding. Expected 12-14% CAGR over 10+ yrs.",
            "products": (
                ["Nippon India Large Cap", "Parag Parikh Flexi Cap", "Mirae Asset Large Cap"] if risk == "low"
                else ["Parag Parikh Flexi Cap", "Quant Active Fund", "ICICI Pru Nifty 50 Index"]
            ),
            "platform": "Groww / Zerodha Coin / ET Money",
            "icon": "trending-up",
            "color": "#8B5CF6",
        },
        {
            "id": "elss_tax",
            "title": "ELSS (Tax-saving + Equity)",
            "amount": round(min(investible * 0.15, 12500), 0),  # Cap at 80C limit / 12
            "pct": 15,
            "why": "Save up to ₹46,800 tax under 80C (old regime). 3-yr lockin, equity returns.",
            "products": ["Mirae Asset ELSS Tax Saver", "Parag Parikh ELSS Tax Saver", "Canara Robeco ELSS"],
            "platform": "Groww / Zerodha Coin",
            "icon": "receipt",
            "color": "#F59E0B",
        },
        {
            "id": "debt_ppf",
            "title": "Debt / PPF (Safety)",
            "amount": round(investible * risk_profile["debt"], 0),
            "pct": round(risk_profile["debt"] * 100, 0),
            "why": "PPF: 7.1% tax-free, 15-yr lockin. Corporate bond funds: 7-9% + lower risk than equity.",
            "products": ["PPF (any bank)", "ICICI Pru Corporate Bond", "HDFC Short Term Debt"],
            "platform": "SBI / Bank / Groww",
            "icon": "library",
            "color": "#3B82F6",
        },
        {
            "id": "gold",
            "title": "Gold (Hedge)",
            "amount": round(investible * risk_profile["gold"], 0),
            "pct": round(risk_profile["gold"] * 100, 0),
            "why": "10% gold allocation hedges against inflation & market crashes. SGB = 2.5% interest + gold price.",
            "products": ["Sovereign Gold Bond (RBI)", "Nippon India Gold BeES ETF"],
            "platform": "Zerodha / Groww",
            "icon": "diamond",
            "color": "#EAB308",
        },
    ]

    # Emergency fund check
    emergency_target = monthly_expenses * 6
    headline = f"You can invest ₹{investible:,.0f}/month. Here's your smart allocation."
    if monthly_expenses > 0 and monthly_income < monthly_expenses * 1.2:
        headline = "Surplus is tight. Build emergency fund first before equity investing."

    return {
        "investible_monthly": investible,
        "monthly_income": monthly_income,
        "monthly_expenses": monthly_expenses,
        "age": age,
        "risk": risk,
        "goal": goal,
        "headline": headline,
        "allocations": allocations,
        "emergency_fund_target": round(emergency_target, 0),
        "annual_investment": round(investible * 12, 0),
        "projected_10yr": round(investible * 12 * 10 * 1.5, 0),  # Rough 2x-ish at 12% CAGR
        "disclaimer": "Mutual funds are subject to market risks. Past returns are not indicative of future performance. Products listed are examples — do your own research or consult a SEBI-registered advisor.",
    }


# ============== MINTU 2.0 — PREMIUM FEATURES CATALOG ==============
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
            {
                "id": "ai",
                "title": "Advanced AI",
                "emoji": "🧠",
                "features": [
                    {"name": "Predictive insights (month-end, category trends)", "free": True, "premium": True},
                    {"name": "Waste detector with SIP comparisons", "free": True, "premium": True},
                    {"name": "Personalised AI coach (unlimited msgs)", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Auto-categorization via GPT-5.2", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Weekly proactive nudges via WhatsApp", "free": False, "premium": True, "badge": "PRO"},
                ],
            },
            {
                "id": "tax",
                "title": "Tax Planning",
                "emoji": "💼",
                "features": [
                    {"name": "Tax calculator (New vs Old regime)", "free": True, "premium": True},
                    {"name": "80C / 80D suggestions", "free": True, "premium": True},
                    {"name": "HRA exemption calculator", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Capital gains tracker (STCG/LTCG)", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "ITR-ready export (PDF)", "free": False, "premium": True, "badge": "PRO"},
                ],
            },
            {
                "id": "invest",
                "title": "Investments",
                "emoji": "📈",
                "features": [
                    {"name": "SIP allocation suggester", "free": True, "premium": True},
                    {"name": "Portfolio tracking (mutual funds, stocks)", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Goal-based planning (retirement, house)", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Fund screener & comparison", "free": False, "premium": True, "badge": "PRO"},
                ],
            },
            {
                "id": "perks",
                "title": "Everyday Perks",
                "emoji": "🎁",
                "features": [
                    {"name": "Split bills with friends", "free": True, "premium": True},
                    {"name": "Ad-free experience", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Custom categories & tags", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Multi-device sync", "free": False, "premium": True, "badge": "PRO"},
                    {"name": "Priority support", "free": False, "premium": True, "badge": "PRO"},
                ],
            },
        ],
        "cta_text": "Continue Free" if is_premium else "Upgrade to Premium",
        "cta_highlight": "Join 1,000+ smart savers" if not is_premium else "You're in the premium club 🏆",
    }
