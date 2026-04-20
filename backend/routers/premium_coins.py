"""Coin redemption — convert earned coins into a Razorpay payment discount.

Rate: 100 coins = ₹10 off (capped at 50% of the plan price). This is a
backend-calculated rate so clients can't tamper. The /redeem-preview
endpoint is read-only; the actual deduction happens on premium activation.
"""
import logging
from bson import ObjectId
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user
from core.constants import PRICING
from routers.premium_common import router, api_router  # noqa: F401

COINS_PER_RUPEE = 10     # 10 coins = ₹1
MAX_DISCOUNT_PCT = 0.50  # Cap redemption at 50% of plan price


class RedeemPreviewBody(BaseModel):
    plan: str
    coins_to_use: int = 0


async def _get_coin_balance(user_id: str) -> int:
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        return 0
    return int(u.get("coins", 0) or 0)


def _max_discount(plan: str) -> int:
    if plan not in PRICING:
        return 0
    return int(PRICING[plan]["price"] * MAX_DISCOUNT_PCT)


@api_router.post("/premium/coin-redeem-preview")
async def coin_redeem_preview(body: RedeemPreviewBody, user_id: str = Depends(get_current_user)):
    """Return the effective price after applying `coins_to_use` for `plan`.

    Never mutates state — safe to call repeatedly as the user moves the slider."""
    if body.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")
    balance = await _get_coin_balance(user_id)
    requested = max(0, int(body.coins_to_use or 0))
    price = int(PRICING[body.plan]["price"])
    max_disc = _max_discount(body.plan)

    applied_coins = min(requested, balance, max_disc * COINS_PER_RUPEE)
    discount = applied_coins // COINS_PER_RUPEE   # round down ₹
    effective = max(0, price - discount)

    return {
        "plan": body.plan,
        "list_price": price,
        "coin_balance": balance,
        "coins_applied": applied_coins,
        "discount": discount,
        "effective_price": effective,
        "max_discount": max_disc,
        "rate": {"coins_per_rupee": COINS_PER_RUPEE, "max_pct": int(MAX_DISCOUNT_PCT * 100)},
    }


@api_router.post("/premium/coin-redeem")
async def coin_redeem_apply(body: RedeemPreviewBody, user_id: str = Depends(get_current_user)):
    """Deduct the redeemed coins from the user's balance and return the same
    payload as preview. Call this ONLY after payment succeeds (or on mock-activate).
    """
    if body.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")
    balance = await _get_coin_balance(user_id)
    requested = max(0, int(body.coins_to_use or 0))
    max_disc_coins = _max_discount(body.plan) * COINS_PER_RUPEE
    applied_coins = min(requested, balance, max_disc_coins)
    discount = applied_coins // COINS_PER_RUPEE

    if applied_coins > 0:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"coins": -applied_coins}},
        )
        logging.info("Coin redemption: user=%s plan=%s coins=%s disc=%s", user_id, body.plan, applied_coins, discount)

    price = int(PRICING[body.plan]["price"])
    return {
        "plan": body.plan,
        "list_price": price,
        "coins_applied": applied_coins,
        "discount": discount,
        "effective_price": max(0, price - discount),
        "remaining_balance": max(0, balance - applied_coins),
    }
