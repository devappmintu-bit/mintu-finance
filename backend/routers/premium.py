"""premium router — core endpoints (status, activation, Razorpay orders, AI coach, features catalog).

Large feature modules (tax calculator, investment suggester, deep reports) live in
dedicated sibling modules that decorate on the same shared APIRouter:

    - premium_common.py  (shared APIRouter + Razorpay proxy + request models)
    - premium_tax.py     (tax-calculator)
    - premium_invest.py  (investment-suggest)
    - premium_reports.py (deep-report for paying users)
"""
import os
# Round 62 — global LLM-call timeout wrapper.
from core.llm_safe import safe_send
import json as json_mod
import logging
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.constants import PREMIUM_FEATURES, PRICING
from core.users import get_user_by_id
from core.time import utc_now
from core.errors import (
    raise_order_not_found,
)

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



# Razorpay Checkout HTML template — served at /api/premium/checkout so the payment
# UI loads cross-platform (web/Android/iOS) inside expo-web-browser. All values
# are interpolated via str.format() to sidestep Python 3.11 f-string backslash
# restrictions. `{{` / `}}` escape literal braces in CSS/JS blocks.
RAZORPAY_CHECKOUT_TMPL = """<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MintU Premium Checkout</title>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FFF7ED;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;}}
  .card{{background:#fff;border-radius:20px;padding:28px;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(124,45,18,.08);text-align:center;}}
  h1{{margin:4px 0 6px;color:#7C2D12;font-size:22px;}}
  p{{color:#78350F;margin:4px 0;}}
  .amt{{font-size:28px;font-weight:800;color:#C14A06;margin:12px 0;}}
  .strike{{text-decoration:line-through;color:#9CA3AF;margin-right:8px;font-weight:600;}}
  button{{background:linear-gradient(90deg,#F56E1E,#C14A06);border:0;color:#fff;padding:14px 22px;font-size:16px;font-weight:800;border-radius:12px;cursor:pointer;width:100%;}}
  .note{{font-size:12px;color:#92400E;margin-top:16px;}}
</style>
</head><body>
<div class="card">
  <div style="font-size:40px;">&#128274;</div>
  <h1>MintU Premium &middot; {plan_label}</h1>
  <div class="amt">{strike_html}&#8377;{amount}</div>
  {coin_line_html}
  <button id="pay">Pay Securely</button>
  <p class="note">Powered by Razorpay &middot; Test mode</p>
  <p id="status" style="margin-top:10px;color:#065F46;font-weight:700;"></p>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function(){{
  var opts = {{
    key: "{key_id}",
    amount: {amount_paise},
    currency: "INR",
    name: "MintU",
    description: "Premium {plan_label}",
    order_id: "{order_id}",
    theme: {{ color: "#F56E1E" }},
    // India-first payment UX: UPI (GPay / PhonePe / Paytm) shown first, cards/wallets second.
    // UPI AutoPay is supported when the Razorpay subscription product is attached.
    config: {{
      display: {{
        blocks: {{
          upi_block: {{
            name: "Pay with UPI",
            instruments: [{{ method: "upi", flows: ["collect", "intent"], apps: ["google_pay", "phonepe", "paytm"] }}]
          }},
          other_block: {{
            name: "Other methods",
            instruments: [
              {{ method: "card" }},
              {{ method: "wallet" }},
              {{ method: "netbanking" }}
            ]
          }}
        }},
        sequence: ["block.upi_block", "block.other_block"],
        preferences: {{ show_default_blocks: false }}
      }}
    }},
    handler: function(response){{
      document.getElementById("status").innerText = "Verifying payment...";
      fetch("{verify_url}", {{
        method: "POST",
        headers: {{"Content-Type":"application/json"}},
        body: JSON.stringify({{
          order_id: response.razorpay_order_id,
          payment_id: response.razorpay_payment_id,
          signature: response.razorpay_signature
        }})
      }}).then(function(r){{ return r.json(); }}).then(function(data){{
        document.getElementById("status").innerText = data.message || "Premium activated";
        setTimeout(function(){{ window.location.href = "{ok_url}"; }}, 900);
      }}).catch(function(){{
        document.getElementById("status").innerText = "Verification failed";
      }});
    }},
    modal: {{ ondismiss: function(){{ window.location.href = "{cancel_url}"; }} }}
  }};
  document.getElementById("pay").onclick = function(){{ new Razorpay(opts).open(); }};
  setTimeout(function(){{ document.getElementById("pay").click(); }}, 500);
}})();
</script>
</body></html>
"""



# ═══════════════════════════════ CORE ENDPOINTS ═════════════════════════════════

# Round 45 — `/premium/investment-suggester` was being called from the
# frontend (`components/premium/InvestmentSuggester.tsx`) but had no
# matching route — every tap returned 404 silently. The frontend already
# implements the locked/unlocked gate so we only need a small handler that
# computes a deterministic asset-allocation split based on a few inputs.

class InvestmentSuggesterBody(BaseModel):
    monthly_income: float = 0
    monthly_expenses: float = 0
    risk_tolerance: str = "moderate"  # conservative | moderate | aggressive


@api_router.post("/premium/investment-suggester")
async def premium_investment_suggester(
    body: InvestmentSuggesterBody,
    user_id: str = Depends(get_current_user),
):
    """Return a sane equity/debt/gold split + investable surplus.
    Pure-fn — no DB writes; safe to spam from the UI."""
    surplus = max(0.0, float(body.monthly_income) - float(body.monthly_expenses))
    risk = (body.risk_tolerance or "moderate").lower()
    # Standard Indian retail allocations by risk bucket
    if risk == "conservative":
        eq, debt, gold = 30, 60, 10
    elif risk == "aggressive":
        eq, debt, gold = 75, 15, 10
    else:
        eq, debt, gold = 60, 30, 10

    monthly = {
        "equity": round(surplus * eq / 100),
        "debt": round(surplus * debt / 100),
        "gold": round(surplus * gold / 100),
    }
    return {
        "investable_surplus": round(surplus),
        "allocation_pct": {"equity": eq, "debt": debt, "gold": gold},
        "monthly_amounts": monthly,
        "recommendations": [
            {
                "asset": "Equity",
                "percent": eq,
                "amount": monthly["equity"],
                "vehicles": ["Index funds (Nifty 50 / Next 50)", "Flexi-cap MFs", "ELSS for tax saving"],
                "note": "Long-term wealth creation. Stay invested 5+ years.",
            },
            {
                "asset": "Debt",
                "percent": debt,
                "amount": monthly["debt"],
                "vehicles": ["Liquid funds", "Short-duration debt funds", "PPF / EPF"],
                "note": "Stability + capital preservation. Tax-efficient over 3 years.",
            },
            {
                "asset": "Gold",
                "percent": gold,
                "amount": monthly["gold"],
                "vehicles": ["Sovereign Gold Bonds (SGB)", "Gold ETFs"],
                "note": "Hedge against inflation. Limit to ~10% of portfolio.",
            },
        ],
        "risk_tolerance": risk,
    }


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

    now = utc_now()
    meta = PRICING[req.plan]
    # India-Hack ladder: all 3 paid tiers are monthly-billed (intro=Micro, monthly=Standard, yearly=Premium).
    # Lifetime tier removed — old ₹2999 exceeded the ₹150 cap.
    until = now + timedelta(days=31)
    tier = "premium"  # all paid plans map to the same "premium" user tier
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
        "effective_price": effective_price,
        "coins_applied": coins_applied,
    }


@api_router.get("/premium/status")
async def get_premium_status(user_id: str = Depends(get_current_user)):
    """Return current premium status + full pricing catalog."""
    user = await get_user_by_id(user_id) or {}
    tier = user.get("premium_tier", "free")
    until = user.get("premium_until")
    if isinstance(until, datetime) and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    is_premium = tier in ("premium", "legend") and (until is None or until > utc_now())
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
    thirty_days_ago = utc_now() - timedelta(days=30)
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
    """Create a Razorpay order for premium subscription — optionally discounted by coins."""
    if req.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")

    list_price = int(PRICING[req.plan]["price"])
    coins_to_use = int(req.coins_to_use or 0)

    # Preview coin discount (non-mutating) so order is created for the effective amount.
    effective_price = list_price
    coin_discount = 0
    applied_coins = 0
    if coins_to_use > 0:
        try:
            from routers.premium_coins import coin_redeem_preview, RedeemPreviewBody
            preview = await coin_redeem_preview(RedeemPreviewBody(plan=req.plan, coins_to_use=coins_to_use), user_id=user_id)
            effective_price = int(preview["effective_price"])
            coin_discount = int(preview["discount"])
            applied_coins = int(preview["coins_applied"])
        except Exception as e:
            logging.warning(f"Coin preview failed, proceeding at list price: {e}")

    # Razorpay minimum charge is ₹1 (100 paise). Guard against zero-rupee orders.
    if effective_price < 1:
        effective_price = 1
    amount_paise = effective_price * 100

    try:
        order = razorpay_client.order.create({
            "amount": amount_paise, "currency": "INR", "payment_capture": 1,
            "notes": {"user_id": user_id, "plan": req.plan, "coins_to_use": str(applied_coins)},
        })
        await db.payment_orders.insert_one({
            "user_id": user_id, "order_id": order["id"], "plan": req.plan,
            "list_price": list_price, "amount": effective_price,
            "coins_to_use": applied_coins, "coin_discount": coin_discount,
            "status": "created", "created_at": utc_now(),
        })
        key_id = os.environ.get("RAZORPAY_KEY_ID", "")
        backend_base = os.environ.get("APP_DEEPLINK_BASE", "").rstrip("/")
        checkout_url = f"{backend_base}/api/premium/checkout?order_id={order['id']}" if backend_base else ""
        return {
            "order_id": order["id"], "amount": amount_paise, "currency": "INR",
            "key_id": key_id, "plan": req.plan,
            "list_price": list_price, "effective_price": effective_price,
            "coins_to_use": applied_coins, "coin_discount": coin_discount,
            "checkout_url": checkout_url,
        }
    except Exception as e:
        logging.error("Razorpay order error: %s", e)
        raise HTTPException(status_code=500, detail="Payment service unavailable. Please try later.")


# ────────────────────────────── HOSTED CHECKOUT PAGE ─────────────────────────────
@api_router.get("/premium/checkout")
async def razorpay_checkout_page(order_id: str):
    """Server-rendered HTML page that mounts Razorpay Checkout.js.

    Works cross-platform (web/iOS/Android) when opened via expo-web-browser.
    Razorpay JS handles the payment UI; on success we POST back to
    /api/premium/verify-payment server-side and redirect the user to
    `${APP_DEEPLINK_BASE}/premium-activated?ok=1`.
    """
    from fastapi.responses import HTMLResponse
    order = await db.payment_orders.find_one({"order_id": order_id})
    if not order:
        raise_order_not_found()
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    base = os.environ.get("APP_DEEPLINK_BASE", "").rstrip("/")
    amount_paise = int(order["amount"]) * 100
    plan_label = str(order.get("plan", "")).title()
    list_price = int(order.get("list_price", order["amount"]))
    coin_discount = int(order.get("coin_discount", 0) or 0)
    coins_used = int(order.get("coins_to_use", 0) or 0)
    strike = f"<span class='strike'>&#8377;{list_price}</span>" if coin_discount > 0 else ""
    coin_line = f"<p>&#129689; {coins_used} coins applied &mdash; &#8377;{coin_discount} off</p>" if coin_discount > 0 else ""
    verify_url = f"{base}/api/premium/verify-payment"
    ok_url = f"{base}/premium-activated?ok=1"
    cancel_url = f"{base}/premium-activated?ok=0&reason=cancelled"

    html = RAZORPAY_CHECKOUT_TMPL.format(
        plan_label=plan_label,
        amount=int(order["amount"]),
        strike_html=strike,
        coin_line_html=coin_line,
        key_id=key_id,
        amount_paise=amount_paise,
        order_id=order_id,
        verify_url=verify_url,
        ok_url=ok_url,
        cancel_url=cancel_url,
    )
    return HTMLResponse(content=html)


@api_router.post("/premium/verify-payment")
async def verify_razorpay_payment(payment_data: dict):
    """Verify Razorpay payment signature and activate premium on success.

    No bearer token required — this endpoint is called server-to-server by the
    Razorpay Checkout HTML page. The signature itself is proof of authenticity,
    and the `user_id` is resolved from the original order record in Mongo.
    """
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

    order = await db.payment_orders.find_one({"order_id": order_id})
    if not order:
        raise_order_not_found()
    user_id = str(order.get("user_id", ""))
    if not user_id:
        raise HTTPException(status_code=400, detail="Order missing user linkage")

    plan = order["plan"]
    days = 30 if plan in ("monthly", "intro") else 365

    # Apply coin redemption if the order requested any — this deducts coins from
    # the user's balance. The discount was already baked into the Razorpay amount.
    coins_to_use = int(order.get("coins_to_use", 0) or 0)
    coin_discount = int(order.get("coin_discount", 0) or 0)
    if coins_to_use > 0:
        try:
            from routers.premium_coins import coin_redeem_apply, RedeemPreviewBody
            await coin_redeem_apply(RedeemPreviewBody(plan=plan, coins_to_use=coins_to_use), user_id=user_id)
        except Exception as e:
            logging.warning(f"Coin redemption apply failed post-payment: {e}")

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "premium_tier": "premium",
            "premium_plan": plan,
            "premium_until": utc_now() + timedelta(days=days),
        }},
    )
    await db.payment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": utc_now()}},
    )
    return {
        "message": "Premium activated!",
        "premium_until": (utc_now() + timedelta(days=days)).isoformat(),
        "plan": plan,
        "coins_applied": coins_to_use,
        "coin_discount": coin_discount,
    }


# ═══════════════════════════════ AI COACH (premium) ══════════════════════════════

@api_router.post("/premium/ai-coach")
async def ai_smart_coach(user_id: str = Depends(get_current_user)):
    """AI Smart Coach — personalised weekly advice (premium only)."""
    user = await get_user_by_id(user_id) or {}
    tier = user.get("premium_tier", "free")
    if tier not in ("premium", "legend", "starter"):
        raise HTTPException(status_code=403, detail="Premium feature. Upgrade to access AI Smart Coach.")

    thirty_days_ago = utc_now() - timedelta(days=30)
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
            session_id=f"coach_{user_id}_{utc_now().timestamp()}",
            system_message=(
                "You are MintU AI Smart Coach — a personal financial advisor for Indian users.\n"
                "Give a detailed, actionable weekly plan. Be specific with ₹ amounts. Reference Indian services.\n"
                'Return JSON: {"advice": "2-3 paragraph plan", "action_items": ["item1", "item2", "item3"], "potential_savings": number}'
            ),
        ).with_model("openai", "gpt-5.2")

        response = (await safe_send(chat, UserMessage(text=(
            f"Income: ₹{total_income:.0f}, Expenses: ₹{total_expense:.0f}. "
            f"Categories: {cat_text}. Score: {user.get('money_score', 50)}. "
            "What should I do with my money this week?"
        )), timeout=15.0, label='premium') or "")

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
    user = await get_user_by_id(user_id) or {}
    is_premium = bool(user.get("is_premium", False))
    return {
        "is_premium": is_premium,
        "tier": "Premium" if is_premium else "Free",
        # India-Hack 4-tier ladder (all monthly, capped ₹150)
        "price": {
            "free": 0,
            "micro": 29,
            "standard": 99,
            "premium": 149,
            "cap": 150,
            "best_seller": "standard",
        },
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
