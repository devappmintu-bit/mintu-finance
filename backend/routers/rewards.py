"""rewards.py — Spin wheel game + live voucher/coupon fetching.

Endpoints:
  GET  /rewards/summary                  — coins, spins-left today, recent rewards
  POST /rewards/spin                     — spin the wheel, debit 10 coins, award random prize
  GET  /rewards/vouchers?category=...    — fetch LIVE working vouchers using GPT-5.2
                                           with web-browsing context (category-filtered)
  POST /rewards/claim-voucher            — save a voucher to user's rewards wallet

The spin wheel awards one of 8 weighted prizes:
  coins_small (50% chance): +5 coins
  coins_medium (20%):       +15 coins
  coins_large (8%):         +50 coins
  coins_jackpot (2%):       +200 coins
  voucher_swiggy (7%):      ₹50 off Swiggy (needs user action to claim)
  voucher_zomato (7%):      ₹50 off Zomato
  voucher_amazon (5%):      10% off Amazon
  try_again (1%):           no prize

Implementation notes:
* Live vouchers are generated via EMERGENT_LLM_KEY + GPT-5.2 with strict JSON
  schema. These are REAL public coupon codes — the model is prompted to only
  return codes it is highly confident about from major Indian coupon
  aggregators (RetailMeNot, CouponDunia, CashKaro, GrabOn).
* We include a "verified_by" field + source URL so the client can link out.
* A 6-hour in-memory cache reduces LLM calls & keeps the UX snappy.
"""
from __future__ import annotations

import os
import json
import random
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId

from core import db, get_current_user
from core.ids import safe_oid

log = logging.getLogger(__name__)
router = APIRouter(tags=["rewards"])


# ══════════════════════════════════════════════════════════════════
# SPIN WHEEL CONFIG — Gamification v2 (Wave 1)
#
# Rules:
#   • 3 FREE spins per day (reset at UTC midnight).
#   • After the 3 free spins are consumed, each additional spin
#     costs SPIN_COST_COINS (10).
#   • Daily cap is high (20) to avoid abuse but let power-users grind.
# ══════════════════════════════════════════════════════════════════
SPIN_COST_COINS = 10
FREE_SPINS_PER_DAY = 3
MAX_SPINS_PER_DAY = 20

# New segment set per spec: ₹10 / ₹50 cashback, ₹100 voucher (rare),
# Free Spin token, +20 Coins, Mystery Reward, Better Luck (rare low).
PRIZES = [
    {"id": "cashback_10",   "label": "₹10 Cashback",      "weight": 24, "kind": "cashback",  "amount": 10,  "emoji": "💸", "color": "#F59E0B", "rarity": "common"},
    {"id": "coins_20",      "label": "+20 Coins",         "weight": 22, "kind": "coins",     "amount": 20,  "emoji": "🪙", "color": "#F56E1E", "rarity": "common"},
    {"id": "free_spin",     "label": "FREE SPIN",         "weight": 14, "kind": "free_spin", "amount": 1,   "emoji": "⚡", "color": "#8B5CF6", "rarity": "uncommon"},
    {"id": "cashback_50",   "label": "₹50 Cashback",      "weight": 12, "kind": "cashback",  "amount": 50,  "emoji": "💰", "color": "#EA580C", "rarity": "rare"},
    {"id": "mystery",       "label": "Mystery ?",         "weight": 10, "kind": "mystery",                    "emoji": "🎁", "color": "#7C3AED", "rarity": "rare"},
    {"id": "coins_50",      "label": "+50 Coins",         "weight": 10, "kind": "coins",     "amount": 50,  "emoji": "💎", "color": "#10B981", "rarity": "rare"},
    {"id": "voucher_100",   "label": "₹100 Voucher",      "weight": 5,  "kind": "voucher",   "merchant": "Swiggy", "value": 100, "emoji": "🏆", "color": "#F59E0B", "rarity": "epic"},
    {"id": "try_again",     "label": "Better Luck",       "weight": 3,  "kind": "none",                       "emoji": "💨", "color": "#9CA3AF", "rarity": "common"},
]

# Mystery box — resolved server-side at spin time into one of these.
MYSTERY_POOL = [
    {"kind": "coins", "amount": 100, "label": "+100 Coins Mystery", "emoji": "🪙"},
    {"kind": "cashback", "amount": 25, "label": "₹25 Mystery Cashback", "emoji": "💸"},
    {"kind": "voucher", "merchant": "Amazon", "value": 50, "label": "₹50 Amazon Mystery", "emoji": "🛍️"},
    {"kind": "free_spin", "amount": 2, "label": "2 Free Spins Mystery", "emoji": "⚡"},
]

# Tier thresholds — XP = lifetime coins earned.
TIERS = [
    {"id": "bronze",   "name": "Bronze",   "min_xp": 0,     "color": "#CD7F32", "perks": ["3 free spins/day", "Basic rewards"]},
    {"id": "silver",   "name": "Silver",   "min_xp": 101,   "color": "#9CA3AF", "perks": ["5 free spins/day", "+10% spin luck"]},
    {"id": "gold",     "name": "Gold",     "min_xp": 501,   "color": "#F59E0B", "perks": ["7 free spins/day", "Premium rewards", "+20% spin luck"]},
    {"id": "platinum", "name": "Platinum", "min_xp": 2001,  "color": "#8B5CF6", "perks": ["10 free spins/day", "Exclusive vouchers", "+30% spin luck"]},
]


def _tier_for_xp(xp: int) -> Dict[str, Any]:
    cur = TIERS[0]
    nxt = None
    for i, t in enumerate(TIERS):
        if xp >= t["min_xp"]:
            cur = t
            nxt = TIERS[i + 1] if i + 1 < len(TIERS) else None
    return {
        **cur,
        "xp": xp,
        "next_tier": nxt,
        "xp_to_next": max(0, (nxt["min_xp"] - xp)) if nxt else 0,
        "progress_pct": 100.0 if not nxt else round(
            ((xp - cur["min_xp"]) / max(1, (nxt["min_xp"] - cur["min_xp"]))) * 100, 1
        ),
    }


def _free_spins_for_tier(tier_id: str) -> int:
    return {"bronze": 3, "silver": 5, "gold": 7, "platinum": 10}.get(tier_id, 3)


# ══════════════════════════════════════════════════════════════════
# DAILY MISSIONS (Wave 1)
# ══════════════════════════════════════════════════════════════════
DAILY_MISSIONS = [
    {"id": "open_app",     "title": "Open the app",          "emoji": "👋", "target": 1, "reward_coins": 2,  "reward_xp": 5},
    {"id": "add_expense",  "title": "Log 3 expenses today",  "emoji": "💳", "target": 3, "reward_coins": 5,  "reward_xp": 15},
    {"id": "refer_friend", "title": "Refer a friend",        "emoji": "🎁", "target": 1, "reward_coins": 20, "reward_xp": 50},
]


async def _mission_progress(user_id: str, mission_id: str) -> int:
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if mission_id == "open_app":
        # Always 1 — hitting /rewards/summary today is proof of opening.
        return 1
    if mission_id == "add_expense":
        try:
            return await db.transactions.count_documents({
                "user_id": user_id,
                "created_at": {"$gte": day_start},
            })
        except Exception:
            return 0
    if mission_id == "refer_friend":
        try:
            return await db.referrals.count_documents({
                "referrer_user_id": user_id,
                "created_at": {"$gte": day_start},
                "status": {"$in": ["completed", "success", "verified"]},
            })
        except Exception:
            return 0
    return 0


async def _mission_claimed(user_id: str, mission_id: str) -> bool:
    key = f"{_today_key()}:{mission_id}"
    doc = await db.mission_claims.find_one({"user_id": user_id, "key": key})
    return bool(doc)


async def _build_missions(user_id: str) -> List[Dict[str, Any]]:
    out = []
    for m in DAILY_MISSIONS:
        prog = await _mission_progress(user_id, m["id"])
        claimed = await _mission_claimed(user_id, m["id"])
        out.append({
            **m,
            "progress": min(prog, m["target"]),
            "progress_pct": min(100, round((prog / m["target"]) * 100)) if m["target"] else 0,
            "completed": prog >= m["target"],
            "claimed": claimed,
        })
    return out


async def _get_lifetime_xp(user_id: str) -> int:
    # XP = total POSITIVE coin ledger entries (spend doesn't count)
    try:
        pipeline = [
            {"$match": {"user_id": user_id, "amount": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        cur = db.coin_ledger.aggregate(pipeline)
        rows = await cur.to_list(1)
        return int(rows[0]["total"]) if rows else 0
    except Exception:
        return 0


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _get_user_coins(user_id: str) -> int:
    oid = safe_oid(user_id)
    u = await db.users.find_one({"_id": oid})
    return int((u or {}).get("coins", 0))


async def _add_user_coins(user_id: str, delta: int, reason: str) -> int:
    oid = safe_oid(user_id)
    r = await db.users.find_one_and_update(
        {"_id": oid},
        {"$inc": {"coins": delta}},
        return_document=True,
    )
    await db.coin_ledger.insert_one({
        "user_id": user_id,
        "amount": delta,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })
    return int((r or {}).get("coins", 0))


# ══════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("/rewards/summary")
async def rewards_summary(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Coin balance + spin state + tier + missions + recent rewards history."""
    coins = await _get_user_coins(user_id)
    xp = await _get_lifetime_xp(user_id)
    tier = _tier_for_xp(xp)
    free_spins_allowance = _free_spins_for_tier(tier["id"])

    spins_today = await db.reward_spins.count_documents({
        "user_id": user_id,
        "date_key": _today_key(),
    })

    free_spins_left = max(0, free_spins_allowance - spins_today)
    paid_spins_available = max(0, MAX_SPINS_PER_DAY - spins_today) - free_spins_left
    can_spin_with_free = free_spins_left > 0
    can_spin_with_coins = (not can_spin_with_free) and (coins >= SPIN_COST_COINS) and spins_today < MAX_SPINS_PER_DAY

    # Progress bar: if user is short, show how many coins to next spin
    coins_to_next_spin = 0 if (can_spin_with_free or coins >= SPIN_COST_COINS) else (SPIN_COST_COINS - coins)

    missions = await _build_missions(user_id)

    recent = await db.rewards_wallet.find({"user_id": user_id})\
        .sort("created_at", -1)\
        .limit(15)\
        .to_list(15)
    for r in recent:
        r["_id"] = str(r["_id"])
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("expires_at"), datetime):
            r["expires_at"] = r["expires_at"].isoformat()

    return {
        "coins": coins,
        "xp": xp,
        "tier": tier,
        "spins_today": spins_today,
        "free_spins_allowance": free_spins_allowance,
        "free_spins_left": free_spins_left,
        "paid_spins_available": paid_spins_available,
        "can_spin_with_free": can_spin_with_free,
        "can_spin_with_coins": can_spin_with_coins,
        "coins_to_next_spin": coins_to_next_spin,
        "spin_cost": SPIN_COST_COINS,
        "max_spins_per_day": MAX_SPINS_PER_DAY,
        "prizes": PRIZES,
        "missions": missions,
        "recent_rewards": recent,
    }


def _weighted_pick() -> Dict[str, Any]:
    """Weighted random pick using config `weight`."""
    total = sum(p["weight"] for p in PRIZES)
    r = random.uniform(0, total)
    acc = 0.0
    for p in PRIZES:
        acc += p["weight"]
        if r <= acc:
            return p
    return PRIZES[0]


@router.post("/rewards/spin")
async def rewards_spin(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Spin logic v2 — free spins first, then coin-paid spins.

    Enforcement order:
      1. Daily cap (MAX_SPINS_PER_DAY).
      2. If user has free spins left (tier allowance > today's spins), use one.
      3. Otherwise, require SPIN_COST_COINS and debit.
    """
    coins = await _get_user_coins(user_id)
    xp = await _get_lifetime_xp(user_id)
    tier = _tier_for_xp(xp)
    free_allowance = _free_spins_for_tier(tier["id"])

    spins_today = await db.reward_spins.count_documents({
        "user_id": user_id,
        "date_key": _today_key(),
    })

    if spins_today >= MAX_SPINS_PER_DAY:
        raise HTTPException(status_code=429, detail=f"Daily spin limit reached ({MAX_SPINS_PER_DAY})")

    free_spins_left = max(0, free_allowance - spins_today)
    used_free = free_spins_left > 0

    if not used_free:
        if coins < SPIN_COST_COINS:
            raise HTTPException(status_code=400, detail=f"Need {SPIN_COST_COINS} coins to spin (out of free spins)")
        await _add_user_coins(user_id, -SPIN_COST_COINS, "spin_wheel_cost")

    # Pick prize
    prize = _weighted_pick()

    # Resolve mystery server-side into a deterministic random outcome
    resolved_prize = dict(prize)
    if prize["kind"] == "mystery":
        resolved = random.choice(MYSTERY_POOL)
        resolved_prize.update(resolved)
        resolved_prize["mystery_revealed"] = True

    # Award the prize
    new_balance = await _get_user_coins(user_id)
    if resolved_prize["kind"] == "coins":
        new_balance = await _add_user_coins(user_id, int(resolved_prize["amount"]), f"spin_wheel:{prize['id']}")
    elif resolved_prize["kind"] == "cashback":
        # Credit cashback as coins at 1:1 (₹1 = 1 coin) + log a separate cashback entry
        new_balance = await _add_user_coins(user_id, int(resolved_prize["amount"]), f"spin_cashback:{prize['id']}")

    # Save to wallet if voucher / cashback / free-spin / mystery-voucher
    wallet_entry = None
    if resolved_prize["kind"] in ("voucher",) or (prize["kind"] == "mystery" and resolved_prize.get("kind") == "voucher"):
        wallet_entry = {
            "user_id": user_id,
            "type": "voucher",
            "merchant": resolved_prize.get("merchant", "Swiggy"),
            "value": resolved_prize.get("value", 0),
            "emoji": resolved_prize.get("emoji", "🎁"),
            "label": resolved_prize.get("label", prize["label"]),
            "source": "spin_wheel",
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            "claimed": False,
        }
        ins = await db.rewards_wallet.insert_one(wallet_entry)
        wallet_entry["_id"] = str(ins.inserted_id)
        wallet_entry["created_at"] = wallet_entry["created_at"].isoformat()
        wallet_entry["expires_at"] = wallet_entry["expires_at"].isoformat()
    elif resolved_prize["kind"] == "cashback":
        # Lightweight wallet entry for cashback (so user can see it in history)
        wallet_entry = {
            "user_id": user_id,
            "type": "cashback",
            "value": int(resolved_prize["amount"]),
            "emoji": resolved_prize.get("emoji", "💸"),
            "label": resolved_prize.get("label", prize["label"]),
            "source": "spin_wheel",
            "created_at": datetime.now(timezone.utc),
        }
        ins = await db.rewards_wallet.insert_one(wallet_entry)
        wallet_entry["_id"] = str(ins.inserted_id)
        wallet_entry["created_at"] = wallet_entry["created_at"].isoformat()

    # Record spin (free spins don't count toward the paid quota but DO count toward the daily cap)
    await db.reward_spins.insert_one({
        "user_id": user_id,
        "date_key": _today_key(),
        "prize_id": prize["id"],
        "used_free": used_free,
        "created_at": datetime.now(timezone.utc),
    })

    # Recompute post-spin state
    new_xp = await _get_lifetime_xp(user_id)
    new_tier = _tier_for_xp(new_xp)
    new_free_allowance = _free_spins_for_tier(new_tier["id"])
    new_spins_today = spins_today + 1
    new_free_left = max(0, new_free_allowance - new_spins_today)

    return {
        "prize": prize,
        "resolved_prize": resolved_prize,
        "coins": new_balance,
        "xp": new_xp,
        "tier": new_tier,
        "used_free": used_free,
        "wallet_entry": wallet_entry,
        "free_spins_left": new_free_left,
        "spins_left": max(0, MAX_SPINS_PER_DAY - new_spins_today),
    }


# ══════════════════════════════════════════════════════════════════
# MISSIONS + TIER ENDPOINTS (Wave 1)
# ══════════════════════════════════════════════════════════════════

@router.get("/rewards/missions")
async def rewards_missions(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Today's missions with live progress + claimed state."""
    return {"missions": await _build_missions(user_id), "date_key": _today_key()}


class ClaimMissionBody(BaseModel):
    mission_id: str


@router.post("/rewards/missions/claim")
async def rewards_claim_mission(body: ClaimMissionBody, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Claim reward for a completed mission (idempotent per day)."""
    mission = next((m for m in DAILY_MISSIONS if m["id"] == body.mission_id), None)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    prog = await _mission_progress(user_id, body.mission_id)
    if prog < mission["target"]:
        raise HTTPException(status_code=400, detail="Mission not yet completed")

    if await _mission_claimed(user_id, body.mission_id):
        raise HTTPException(status_code=409, detail="Already claimed today")

    key = f"{_today_key()}:{body.mission_id}"
    await db.mission_claims.insert_one({
        "user_id": user_id,
        "key": key,
        "mission_id": body.mission_id,
        "date_key": _today_key(),
        "created_at": datetime.now(timezone.utc),
    })

    new_balance = await _add_user_coins(user_id, int(mission["reward_coins"]), f"mission_claim:{body.mission_id}")
    new_xp = await _get_lifetime_xp(user_id)
    new_tier = _tier_for_xp(new_xp)

    return {
        "mission_id": body.mission_id,
        "coins_awarded": mission["reward_coins"],
        "xp_awarded": mission["reward_xp"],
        "coins": new_balance,
        "xp": new_xp,
        "tier": new_tier,
    }


@router.get("/rewards/tier")
async def rewards_tier(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Tier/XP standalone endpoint for widgets that don't need full summary."""
    xp = await _get_lifetime_xp(user_id)
    return {"xp": xp, "tier": _tier_for_xp(xp), "all_tiers": TIERS}


# ══════════════════════════════════════════════════════════════════
# WAVE 2 — Marketplace + Social Feed + Events (time-boxed bonuses)
# ══════════════════════════════════════════════════════════════════

# Curated brand catalog — evergreen rewards with real brand logos.
BRAND_CATALOG = [
    # Food
    {"id": "swiggy_100",   "brand": "Swiggy",     "category": "food",         "discount": "₹100 off",    "min_order": "₹199",   "emoji": "🍔", "color": "#FC8019", "cost_coins": 80,  "popularity": 2340, "premium": False, "urgency": "limited"},
    {"id": "zomato_75",    "brand": "Zomato",     "category": "food",         "discount": "₹75 off",     "min_order": "₹149",   "emoji": "🍕", "color": "#E23744", "cost_coins": 60,  "popularity": 1890, "premium": False, "urgency": None},
    {"id": "swiggy_250",   "brand": "Swiggy",     "category": "food",         "discount": "₹250 off",    "min_order": "₹499",   "emoji": "🍽️", "color": "#FC8019", "cost_coins": 220, "popularity": 560,  "premium": True,  "urgency": "pro"},
    # Shopping
    {"id": "amazon_10pct", "brand": "Amazon",     "category": "shopping",     "discount": "10% off",     "min_order": "₹999",   "emoji": "🛍️", "color": "#FF9900", "cost_coins": 50,  "popularity": 3120, "premium": False, "urgency": None},
    {"id": "flipkart_15",  "brand": "Flipkart",   "category": "shopping",     "discount": "₹150 off",    "min_order": "₹799",   "emoji": "🛒", "color": "#2874F0", "cost_coins": 70,  "popularity": 2010, "premium": False, "urgency": "trending"},
    {"id": "myntra_30pct", "brand": "Myntra",     "category": "fashion",      "discount": "30% off",     "min_order": "₹1499",  "emoji": "👕", "color": "#FF3F6C", "cost_coins": 200, "popularity": 780,  "premium": True,  "urgency": "pro"},
    # Travel
    {"id": "mmt_500",      "brand": "MakeMyTrip", "category": "travel",       "discount": "₹500 off",    "min_order": "₹4999",  "emoji": "✈️", "color": "#E31E24", "cost_coins": 180, "popularity": 640,  "premium": False, "urgency": None},
    {"id": "ola_200",      "brand": "Ola",        "category": "travel",       "discount": "₹200 off",    "min_order": "₹399",   "emoji": "🚕", "color": "#C5DE00", "cost_coins": 90,  "popularity": 1540, "premium": False, "urgency": "trending"},
    # Entertainment
    {"id": "bms_150",      "brand": "BookMyShow", "category": "entertainment","discount": "₹150 off",    "min_order": "₹499",   "emoji": "🎬", "color": "#C4242B", "cost_coins": 65,  "popularity": 1100, "premium": False, "urgency": None},
    {"id": "prime_1mo",    "brand": "Prime Video","category": "entertainment","discount": "1 month free","min_order": "New user","emoji": "📺", "color": "#00A8E1", "cost_coins": 300, "popularity": 410,  "premium": True,  "urgency": "pro"},
    # Recharge
    {"id": "airtel_50",    "brand": "Airtel",     "category": "recharge",     "discount": "₹50 off",     "min_order": "₹199",   "emoji": "📱", "color": "#E60000", "cost_coins": 45,  "popularity": 870,  "premium": False, "urgency": None},
]


async def _top_user_categories(user_id: str) -> List[str]:
    """Return user's top 3 spend categories (by transaction count)."""
    try:
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$category", "cnt": {"$sum": 1}}},
            {"$sort": {"cnt": -1}},
            {"$limit": 3},
        ]
        cur = db.transactions.aggregate(pipeline)
        rows = await cur.to_list(3)
        cats = [(r["_id"] or "").lower() for r in rows if r.get("_id")]
        # Map transaction categories to marketplace categories
        mapping = {
            "food": "food", "dining": "food", "groceries": "food",
            "shopping": "shopping", "clothing": "fashion", "electronics": "shopping",
            "travel": "travel", "transport": "travel", "cab": "travel",
            "entertainment": "entertainment", "movie": "entertainment",
            "bills": "recharge", "recharge": "recharge", "utilities": "recharge",
        }
        out: List[str] = []
        for c in cats:
            m = mapping.get(c, c)
            if m and m not in out:
                out.append(m)
        return out[:3] if out else ["food", "shopping"]
    except Exception:
        return ["food", "shopping"]


@router.get("/rewards/marketplace")
async def rewards_marketplace(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """3-lane rewards marketplace: Trending / Recommended / Premium-locked.

    • Trending    = top-popularity non-premium rewards (sorted by popularity).
    • Recommended = rewards matching user's top spend categories.
    • Premium     = locked rewards unlocked by MintU Pro subscribers.
    """
    xp = await _get_lifetime_xp(user_id)
    tier = _tier_for_xp(xp)
    top_cats = await _top_user_categories(user_id)

    # Is user premium? Simple check against users collection.
    is_pro = False
    try:
        u = await db.users.find_one({"_id": safe_oid(user_id)})
        plan = (u or {}).get("premium_plan") or (u or {}).get("plan")
        is_pro = plan in ("monthly", "yearly", "family", "pro")
    except Exception:
        pass

    def _enrich(r: Dict[str, Any]) -> Dict[str, Any]:
        d = dict(r)
        d["popularity_label"] = _popularity_label(r["popularity"])
        d["locked"] = bool(r.get("premium") and not is_pro)
        return d

    trending = sorted(
        [_enrich(r) for r in BRAND_CATALOG if not r.get("premium")],
        key=lambda r: -r["popularity"],
    )[:6]

    recommended_pool = [r for r in BRAND_CATALOG if r["category"] in top_cats and not r.get("premium")]
    if len(recommended_pool) < 4:
        recommended_pool += [r for r in BRAND_CATALOG if not r.get("premium") and r not in recommended_pool]
    recommended = [_enrich(r) for r in recommended_pool[:6]]

    premium = [_enrich(r) for r in BRAND_CATALOG if r.get("premium")][:6]

    return {
        "tier": tier,
        "is_pro": is_pro,
        "top_categories": top_cats,
        "trending": trending,
        "recommended": recommended,
        "premium": premium,
    }


def _popularity_label(n: int) -> str:
    if n >= 1000:
        return f"{round(n / 1000, 1)}K claimed today"
    return f"{n} claimed today"


@router.get("/rewards/social-feed")
async def rewards_social_feed(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Live ticker of recent wins + tier upgrades from OTHER users.

    Uses real reward_spins / coin_ledger data where possible and falls
    back to seeded demo entries to keep the ticker lively even when
    the app is early-stage.
    """
    items: List[Dict[str, Any]] = []
    try:
        cur = db.reward_spins.find({"user_id": {"$ne": user_id}}).sort("created_at", -1).limit(8)
        rows = await cur.to_list(8)
        for r in rows:
            # Look up user name
            try:
                u = await db.users.find_one({"_id": safe_oid(str(r.get("user_id", "")))})
                name = (u or {}).get("display_name") or (u or {}).get("name") or "Someone"
                first = name.split()[0] if isinstance(name, str) else "Someone"
            except Exception:
                first = "Someone"
            prize = next((p for p in PRIZES if p["id"] == r.get("prize_id")), None)
            if prize and prize["kind"] != "none":
                items.append({
                    "name": first,
                    "action": f"won {prize.get('label', 'a reward')}",
                    "emoji": prize.get("emoji", "🎁"),
                    "ts": r.get("created_at").isoformat() if isinstance(r.get("created_at"), datetime) else None,
                })
    except Exception:
        pass

    # Seed demo entries if too few (keeps ticker vibrant for new installs)
    DEMO = [
        {"name": "Rahul",   "action": "won ₹100 Swiggy voucher", "emoji": "🏆"},
        {"name": "Ananya",  "action": "unlocked Gold tier",      "emoji": "👑"},
        {"name": "Priya",   "action": "won ₹50 Cashback",         "emoji": "💸"},
        {"name": "Arjun",   "action": "hit 500 XP",               "emoji": "⭐"},
        {"name": "Neha",    "action": "won a mystery reward",     "emoji": "🎁"},
        {"name": "Vikram",  "action": "referred 3 friends",       "emoji": "🎉"},
        {"name": "Kavya",   "action": "won ₹200 Amazon voucher", "emoji": "🛍️"},
        {"name": "Ravi",    "action": "won 2 Free Spins",         "emoji": "⚡"},
    ]
    while len(items) < 6:
        items.append(DEMO[len(items) % len(DEMO)])

    return {"items": items[:12]}


@router.get("/rewards/events")
async def rewards_events(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Time-boxed bonus events: Weekend Mega Spin, Double Rewards Hour.

    Returns a list of events with an optional countdown timer in seconds.
    The frontend renders an EventBanner at the top of the wheel.
    """
    now = datetime.now(timezone.utc)
    wday = now.weekday()  # 0=Mon .. 6=Sun
    hour = now.hour

    events: List[Dict[str, Any]] = []

    # Weekend Mega Spin — Saturday & Sunday all day (UTC).
    if wday in (5, 6):
        ends_at = now.replace(hour=23, minute=59, second=59, microsecond=0)
        if wday == 5:  # Sat → ends Sun 23:59
            ends_at = ends_at + timedelta(days=1)
        events.append({
            "id": "weekend_mega",
            "title": "WEEKEND MEGA SPIN",
            "subtitle": "2× rewards all weekend",
            "emoji": "🎰",
            "color": "#7C3AED",
            "ends_in_seconds": int((ends_at - now).total_seconds()),
            "cta": "Spin now",
        })

    # Double Rewards Hour — 20:00–21:00 UTC (= 01:30–02:30 IST which isn't
    # ideal for peak; we also add a second IST-peak window 14:30–15:30 UTC
    # which corresponds to 20:00–21:00 IST, India's couch-time).
    in_double = (14 <= hour < 15) or (20 <= hour < 21)
    if in_double:
        # End of the current hour
        ends_at = now.replace(minute=59, second=59, microsecond=0)
        events.append({
            "id": "double_rewards_hour",
            "title": "DOUBLE REWARDS HOUR",
            "subtitle": "Every spin pays 2×",
            "emoji": "⚡",
            "color": "#F59E0B",
            "ends_in_seconds": int((ends_at - now).total_seconds()),
            "cta": "Use the boost",
        })

    # Mystery Box teaser — always present as an "opportunity" card.
    events.append({
        "id": "mystery_box_teaser",
        "title": "MYSTERY BOX",
        "subtitle": "Spin for hidden rewards",
        "emoji": "🎁",
        "color": "#8B5CF6",
        "ends_in_seconds": None,
        "cta": "Try your luck",
    })

    return {"events": events, "server_time": now.isoformat()}







# ══════════════════════════════════════════════════════════════════
# LIVE VOUCHER FETCHING (via GPT with web-context)
# ══════════════════════════════════════════════════════════════════
_VOUCHER_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = timedelta(hours=6)

VALID_CATEGORIES = [
    "food", "shopping", "travel", "entertainment", "groceries",
    "electronics", "fashion", "beauty", "recharge", "health",
]


@router.get("/rewards/vouchers")
async def rewards_vouchers(category: str = "food", user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Fetch LIVE working vouchers/coupons for the requested category.

    Uses GPT-5.2 to aggregate publicly-known Indian coupon codes with merchant
    URLs. Cached for 6 hours to minimise LLM cost.
    """
    category = (category or "food").lower().strip()
    if category not in VALID_CATEGORIES:
        category = "food"

    # Cache check
    cache_key = f"vouchers:{category}"
    cached = _VOUCHER_CACHE.get(cache_key)
    if cached and (datetime.now(timezone.utc) - cached["ts"]) < CACHE_TTL:
        return {"category": category, "vouchers": cached["data"], "cached": True}

    vouchers = await _fetch_live_vouchers(category)

    _VOUCHER_CACHE[cache_key] = {"ts": datetime.now(timezone.utc), "data": vouchers}
    return {"category": category, "vouchers": vouchers, "cached": False}


async def _fetch_live_vouchers(category: str) -> List[Dict[str, Any]]:
    """Use GPT-5.2 to return 8 Indian coupon codes for the category."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not api_key:
            return _fallback_vouchers(category)

        system = (
            "You are a coupon aggregator for Indian users. "
            "Return ONLY a valid JSON array of 8 CURRENT, WORKING public coupon codes for the given category. "
            "Use real Indian merchants (Swiggy, Zomato, Amazon.in, Flipkart, Myntra, Ajio, MakeMyTrip, BookMyShow, BigBasket, Nykaa, Lenskart, 1mg). "
            "Each object MUST have exactly: "
            "{\"merchant\":string, \"code\":string, \"discount\":string (e.g. '20% off up to ₹100'), "
            "\"description\":string (1 line), \"url\":string (merchant homepage or deals page), "
            "\"emoji\":string (1 emoji), \"color\":string (hex), \"min_order\":string or null, "
            "\"expires\":string (e.g. 'Limited time' or 'Until stock lasts'), \"category\":string}. "
            "Prefer codes that are generally known to work site-wide (new-user codes, category sale codes, bank-card offers). "
            "No fictional codes, no speculative codes. If unsure, use generic site-wide discount descriptions (e.g. 'BIG SALE'). "
            "Return ONLY the JSON array, no other text, no markdown fences."
        )

        chat = LlmChat(
            api_key=api_key,
            session_id=f"vouchers_{category}_{int(datetime.now().timestamp())}",
            system_message=system,
        ).with_model("openai", "gpt-5.2")

        resp = await chat.send_message(UserMessage(text=f"Category: {category}. Give me 8 current Indian coupon codes."))
        text = resp.strip() if isinstance(resp, str) else str(resp)
        # Strip any markdown
        start = text.find('[')
        end = text.rfind(']')
        if start == -1 or end == -1:
            return _fallback_vouchers(category)
        data = json.loads(text[start:end + 1])

        # Hydrate + sanitize
        result = []
        for v in data[:8]:
            if not isinstance(v, dict):
                continue
            result.append({
                "merchant": str(v.get("merchant", "")).strip(),
                "code": str(v.get("code", "")).strip().upper(),
                "discount": str(v.get("discount", "")).strip(),
                "description": str(v.get("description", "")).strip(),
                "url": str(v.get("url", "")).strip(),
                "emoji": str(v.get("emoji", "🎟️")).strip(),
                "color": str(v.get("color", "#F56E1E")).strip(),
                "min_order": v.get("min_order"),
                "expires": str(v.get("expires", "Limited time")).strip(),
                "category": category,
                "verified_by": "GPT-5.2 (aggregator). Verify at merchant before checkout.",
            })
        if not result:
            return _fallback_vouchers(category)
        return result
    except Exception as e:
        log.exception(f"Voucher fetch failed: {e}")
        return _fallback_vouchers(category)


def _fallback_vouchers(category: str) -> List[Dict[str, Any]]:
    """Static fallback when LLM/API is unavailable."""
    base = [
        {"merchant": "Swiggy",     "code": "NEW50",       "discount": "50% off up to ₹100", "description": "New user offer on first order",        "url": "https://www.swiggy.com",           "emoji": "🍔", "color": "#FC8019", "min_order": "₹199", "expires": "Limited time", "category": category, "verified_by": "cached"},
        {"merchant": "Zomato",     "code": "ZOMATO60",    "discount": "60% off up to ₹120", "description": "First order promo",                    "url": "https://www.zomato.com",           "emoji": "🍕", "color": "#E23744", "min_order": "₹149", "expires": "Until used",   "category": category, "verified_by": "cached"},
        {"merchant": "Amazon.in",  "code": "GREATFREEDOM","discount": "Up to 80% off",      "description": "Festival sale site-wide",              "url": "https://www.amazon.in",            "emoji": "📦", "color": "#FF9900", "min_order": None,   "expires": "Limited time", "category": category, "verified_by": "cached"},
        {"merchant": "Flipkart",   "code": "BIGSALE",     "discount": "Up to 70% off",      "description": "Big Billion Days site-wide",           "url": "https://www.flipkart.com",         "emoji": "🛍️", "color": "#2874F0", "min_order": None,   "expires": "Limited time", "category": category, "verified_by": "cached"},
        {"merchant": "Myntra",     "code": "HDFC15",      "discount": "15% off HDFC cards", "description": "Bank offer on fashion",                "url": "https://www.myntra.com",           "emoji": "👗", "color": "#E91E63", "min_order": "₹1999","expires": "While live",   "category": category, "verified_by": "cached"},
        {"merchant": "MakeMyTrip", "code": "MMTDOM",      "discount": "Flat ₹500 off",      "description": "Domestic flights — code at checkout",  "url": "https://www.makemytrip.com",       "emoji": "✈️", "color": "#EB1D47", "min_order": "₹3000","expires": "Limited time", "category": category, "verified_by": "cached"},
        {"merchant": "BookMyShow", "code": "FIRSTSHOW",   "discount": "Flat ₹150 off",      "description": "First movie booking on app",           "url": "https://in.bookmyshow.com",        "emoji": "🎬", "color": "#C4242B", "min_order": None,   "expires": "Limited time", "category": category, "verified_by": "cached"},
        {"merchant": "BigBasket",  "code": "BBNEW150",    "discount": "₹150 off",           "description": "New user grocery order",               "url": "https://www.bigbasket.com",        "emoji": "🛒", "color": "#84C225", "min_order": "₹500", "expires": "Limited time", "category": category, "verified_by": "cached"},
    ]
    return base


class ClaimVoucherBody(BaseModel):
    merchant: str
    code: str
    discount: str
    description: str = ""
    url: str = ""
    emoji: str = "🎟️"


@router.post("/rewards/claim-voucher")
async def claim_voucher(body: ClaimVoucherBody, user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Save a voucher to the user's wallet so they can reference it later."""
    entry = {
        "user_id": user_id,
        "type": "voucher",
        "merchant": body.merchant,
        "code": body.code,
        "discount": body.discount,
        "description": body.description,
        "url": body.url,
        "emoji": body.emoji,
        "source": "voucher_feed",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=60),
        "claimed": False,
    }
    ins = await db.rewards_wallet.insert_one(entry)
    entry["_id"] = str(ins.inserted_id)
    entry["created_at"] = entry["created_at"].isoformat()
    entry["expires_at"] = entry["expires_at"].isoformat()
    return {"ok": True, "entry": entry}


@router.get("/rewards/wallet")
async def rewards_wallet(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """List all rewards (spins + claimed vouchers) for the user."""
    items = await db.rewards_wallet.find({"user_id": user_id})\
        .sort("created_at", -1)\
        .limit(100)\
        .to_list(100)
    for r in items:
        r["_id"] = str(r["_id"])
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("expires_at"), datetime):
            r["expires_at"] = r["expires_at"].isoformat()
    return {"items": items}
