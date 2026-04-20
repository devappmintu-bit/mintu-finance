"""split_razorpay — Razorpay-backed split debt settlement flow.

Extracted from split_settle.py (Round 25 refactor).
Adds no new endpoints — merely moves the 3 Razorpay-specific routes into
their own module for maintainability. All endpoints still register on the
shared `api_router` from `split_common.py` (same as other split modules).

Endpoints:
  POST  /split/razorpay-order         — create a Razorpay order
  GET   /split/pay-checkout           — hosted HTML checkout page
  POST  /split/verify-settle-payment  — verify signature + insert settlement
"""
import os
import logging
from datetime import datetime
from bson import ObjectId
from fastapi import Depends, HTTPException
from fastapi.responses import HTMLResponse

from core import db, get_current_user
from routers.split_common import router, api_router  # noqa: F401 — register routes
from routers.split_settle import (
    _get_user_coin_balance,
    _split_max_discount,
    _apply_split_coin_redemption,
    COINS_PER_RUPEE,
)


# ──────────────────────────────────────────────────────────────────────────
# Hosted checkout HTML template
# ──────────────────────────────────────────────────────────────────────────
_RAZORPAY_SETTLE_CHECKOUT_TMPL = """<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MintU — Settle Payment</title>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FFF7ED;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;}}
  .card{{background:#fff;border-radius:20px;padding:28px;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(124,45,18,.08);text-align:center;}}
  h1{{margin:4px 0 6px;color:#7C2D12;font-size:20px;}}
  .to{{color:#92400E;margin:2px 0 10px;font-weight:600;}}
  .amt{{font-size:30px;font-weight:800;color:#C14A06;margin:12px 0;}}
  .strike{{text-decoration:line-through;color:#9CA3AF;margin-right:8px;font-weight:600;font-size:18px;}}
  button{{background:linear-gradient(90deg,#F56E1E,#C14A06);border:0;color:#fff;padding:14px 22px;font-size:16px;font-weight:800;border-radius:12px;cursor:pointer;width:100%;}}
  .note{{font-size:12px;color:#92400E;margin-top:16px;}}
</style>
</head><body>
<div class="card">
  <div style="font-size:40px;">&#128181;</div>
  <h1>Settle with {payee_name}</h1>
  <div class="to">Group: {group_label}</div>
  <div class="amt">{strike_html}&#8377;{amount}</div>
  {coin_line_html}
  <button id="pay">Pay Now</button>
  <p class="note">Secure &middot; Razorpay &middot; Test mode</p>
  <p id="status" style="margin-top:10px;color:#065F46;font-weight:700;"></p>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function(){{
  var opts = {{
    key: "{key_id}",
    amount: {amount_paise},
    currency: "INR",
    name: "MintU Split",
    description: "Settlement to {payee_name}",
    order_id: "{order_id}",
    theme: {{ color: "#F56E1E" }},
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
        document.getElementById("status").innerText = data.message || "Payment successful";
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


# ──────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────
@api_router.post("/split/razorpay-order")
async def split_razorpay_order(data: dict, user_id: str = Depends(get_current_user)):
    """Create a Razorpay order for settling a split debt.

    Body: {target_user_id, amount, group_id?, coins_to_use?}
    Returns: {order_id, amount_paise, key_id, checkout_url, effective_amount, coin_discount}
    The actual settlement is inserted only after /split/verify-settle-payment
    succeeds — mirroring the premium flow.
    """
    from routers.premium_common import razorpay_client as _rz
    target_user_id = data.get("target_user_id")
    amount = float(data.get("amount", 0) or 0)
    group_id = data.get("group_id")
    coins_to_use = int(data.get("coins_to_use", 0) or 0)

    if not target_user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="target_user_id and positive amount required")

    # Preview coin redemption — non-mutating until signature verify succeeds.
    balance = await _get_user_coin_balance(user_id)
    max_disc_coins = _split_max_discount(amount) * COINS_PER_RUPEE
    applied_coins = min(coins_to_use, balance, max_disc_coins)
    coin_discount = applied_coins // COINS_PER_RUPEE
    effective = max(1.0, round(amount - coin_discount, 2))  # Razorpay min ₹1
    amount_paise = int(round(effective * 100))

    # Resolve names for the checkout page
    payee_name = "Friend"
    try:
        pe = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"name": 1})
        if pe:
            payee_name = pe.get("name", "Friend")
    except Exception:
        pass
    group_label = "Direct"
    if group_id:
        try:
            g = await db.split_groups.find_one({"_id": ObjectId(group_id)}, {"name": 1})
            if g:
                group_label = g.get("name", "Direct")
        except Exception:
            pass

    try:
        order = _rz.order.create({
            "amount": amount_paise, "currency": "INR", "payment_capture": 1,
            "notes": {
                "user_id": user_id, "target_user_id": target_user_id,
                "group_id": group_id or "", "kind": "split_settle",
                "coins_to_use": str(applied_coins),
            },
        })
        await db.payment_orders.insert_one({
            "user_id": user_id,
            "kind": "split_settle",
            "order_id": order["id"],
            "target_user_id": target_user_id,
            "group_id": group_id,
            "amount": float(amount),            # original debt
            "effective_amount": float(effective),
            "coins_to_use": int(applied_coins),
            "coin_discount": int(coin_discount),
            "payee_name": payee_name,
            "group_label": group_label,
            "status": "created",
            "created_at": datetime.utcnow(),
        })
        key_id = os.environ.get("RAZORPAY_KEY_ID", "")
        backend_base = os.environ.get("APP_DEEPLINK_BASE", "").rstrip("/")
        checkout_url = f"{backend_base}/api/split/pay-checkout?order_id={order['id']}" if backend_base else ""
        return {
            "order_id": order["id"],
            "amount_paise": amount_paise,
            "effective_amount": float(effective),
            "list_amount": float(amount),
            "coin_discount": int(coin_discount),
            "coins_to_use": int(applied_coins),
            "key_id": key_id,
            "currency": "INR",
            "checkout_url": checkout_url,
        }
    except Exception as e:
        logging.error("Razorpay split order error: %s", e)
        raise HTTPException(status_code=500, detail="Payment service unavailable. Please try later.")


@api_router.get("/split/pay-checkout")
async def split_razorpay_checkout_page(order_id: str):
    """Hosted Razorpay Checkout page for a split settlement."""
    order = await db.payment_orders.find_one({"order_id": order_id, "kind": "split_settle"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    base = os.environ.get("APP_DEEPLINK_BASE", "").rstrip("/")
    effective = float(order.get("effective_amount", order.get("amount", 0)))
    list_amount = float(order.get("amount", effective))
    coin_discount = int(order.get("coin_discount", 0) or 0)
    coins_used = int(order.get("coins_to_use", 0) or 0)
    payee_name = order.get("payee_name", "Friend")
    group_label = order.get("group_label", "Direct")
    amount_paise = int(round(effective * 100))

    strike = (f"<span class='strike'>&#8377;{int(list_amount)}</span>"
              if coin_discount > 0 else "")
    coin_line = (
        f"<p>&#129689; {coins_used} coins applied &mdash; &#8377;{coin_discount} off</p>"
        if coin_discount > 0 else ""
    )
    verify_url = f"{base}/api/split/verify-settle-payment"
    ok_url = f"{base}/split?settled=1"
    cancel_url = f"{base}/split?settled=0"

    html = _RAZORPAY_SETTLE_CHECKOUT_TMPL.format(
        payee_name=payee_name,
        group_label=group_label,
        amount=int(effective),
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


@api_router.post("/split/verify-settle-payment")
async def split_verify_settle_payment(payment_data: dict):
    """Verify Razorpay signature and record a settlement for the split debt.

    No bearer token — called server-to-server from the hosted checkout page.
    User identity is resolved from the saved order record.
    """
    from routers.premium_common import razorpay_client as _rz
    order_id = payment_data.get("order_id", "")
    payment_id = payment_data.get("payment_id", "")
    signature = payment_data.get("signature", "")
    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")
    try:
        _rz.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Payment verification failed")

    order = await db.payment_orders.find_one({"order_id": order_id, "kind": "split_settle"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    user_id = str(order.get("user_id", ""))
    target_user_id = str(order.get("target_user_id", ""))
    amount = float(order.get("amount", 0))
    group_id = order.get("group_id")
    coins_to_use = int(order.get("coins_to_use", 0) or 0)

    # Now apply coin redemption (mutates balance) and record settlement.
    redemption = await _apply_split_coin_redemption(user_id, amount, coins_to_use)

    settlement = {
        "payer_id": user_id,
        "payee_id": target_user_id,
        "amount": amount,
        "cash_paid": redemption["effective_amount"],
        "coin_discount": redemption["discount"],
        "coins_applied": redemption["coins_applied"],
        "method": "razorpay",
        "txn_ref": f"RZP-{payment_id[-8:].upper()}",
        "payment_id": payment_id,
        "razorpay_order_id": order_id,
        "group_id": group_id,
        "status": "completed",
        "settled_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    result = await db.settlements.insert_one(settlement)

    # Bump counters + auto-dismiss reminders for this debt
    try:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"reward_coins": 2, "settlement_count": 1}},
        )
    except Exception:
        pass
    try:
        await db.split_reminders.update_many(
            {"recipient_id": user_id, "sender_id": target_user_id, "status": "pending"},
            {"$set": {"status": "settled", "dismissed_at": datetime.utcnow()}},
        )
    except Exception:
        pass

    # Post system message in group chat so everyone sees it
    payer_name = "User"
    payee_name = order.get("payee_name", "Friend")
    try:
        p = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if p:
            payer_name = p.get("name", "User")
    except Exception:
        pass

    if group_id:
        try:
            coin_tag = (f" 🪙{redemption['coins_applied']} coins"
                        if redemption["coins_applied"] > 0 else "")
            await db.split_messages.insert_one({
                "group_id": group_id,
                "type": "system",
                "content": f"💳 {payer_name} paid ₹{amount:,.0f} to {payee_name} via Razorpay{coin_tag}",
                "sender_id": user_id,
                "sender_name": payer_name,
                "settlement_data": {
                    "amount": amount,
                    "method": "razorpay",
                    "settlement_id": str(result.inserted_id),
                    "coins_applied": redemption["coins_applied"],
                    "coin_discount": redemption["discount"],
                },
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            logging.warning(f"Could not post razorpay settlement message: {e}")

    await db.payment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": datetime.utcnow()}},
    )

    return {
        "message": f"Payment of ₹{amount:,.0f} to {payee_name} successful!",
        "settlement_id": str(result.inserted_id),
        "txn_ref": settlement["txn_ref"],
        "amount": amount,
        "coins_applied": redemption["coins_applied"],
        "coin_discount": redemption["discount"],
    }
