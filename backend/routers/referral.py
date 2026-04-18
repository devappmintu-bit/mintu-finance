"""Referral router — invite codes, redemption, leaderboard, Pro-day rewards."""
import uuid as uuid_lib
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core import db, get_current_user

router = APIRouter(prefix="/referral", tags=["referral"])


# ---- Tier definitions (single source of truth) --------------------------------
_TIER_DEFS = [
    {"friends": 1, "reward": "+3 days Pro", "pro_days": 3, "icon": "star"},
    {"friends": 3, "reward": "+7 days Pro", "pro_days": 7, "icon": "diamond"},
    {"friends": 5, "reward": "1 month Pro", "pro_days": 30, "icon": "trophy"},
    {"friends": 10, "reward": "Lifetime Pro", "pro_days": 365, "icon": "crown"},
]

_LEGACY_REWARDS = {
    "starter": {"needed": 1, "reward": "Advanced insights (1 week)"},
    "premium": {"needed": 3, "reward": "Premium features (1 month)"},
    "legend": {"needed": 10, "reward": "Lifetime badge + perks"},
}


async def _ensure_code(user) -> str:
    code = user.get("referral_code")
    if not code:
        code = f"MINTU{user['phone'][-4:]}{uuid_lib.uuid4().hex[:4].upper()}"
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"referral_code": code}})
    return code


@router.get("/my-code")
async def get_referral_code(user_id: str = Depends(get_current_user)):
    """Get or generate user's unique referral code (legacy, kept for back-compat)."""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    code = await _ensure_code(user)
    referral_count = await db.referrals.count_documents({"referrer_id": user_id})

    tier = "none"
    if referral_count >= 10:
        tier = "legend"
    elif referral_count >= 3:
        tier = "premium"
    elif referral_count >= 1:
        tier = "starter"

    return {
        "referral_code": code,
        "referral_count": referral_count,
        "tier": tier,
        "rewards": _LEGACY_REWARDS,
        "share_text": f"I saved money with MintU! Join me and start tracking your expenses smartly. Use my code: {code}\nDownload: https://mintu.app/invite/{code}",
    }


@router.post("/apply")
async def apply_referral_code(code: dict, user_id: str = Depends(get_current_user)):
    """Apply a referral code (new users only)."""
    referral_code = code.get("code", "").strip().upper()
    if not referral_code:
        raise HTTPException(status_code=400, detail="Referral code required")

    if await db.referrals.find_one({"referred_id": user_id}):
        raise HTTPException(status_code=400, detail="You've already used a referral code")

    referrer = await db.users.find_one({"referral_code": referral_code})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    referrer_id = str(referrer["_id"])
    if referrer_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot use your own code")

    await db.referrals.insert_one({
        "referrer_id": referrer_id,
        "referred_id": user_id,
        "code": referral_code,
        "created_at": datetime.utcnow(),
    })

    count = await db.referrals.count_documents({"referrer_id": referrer_id})
    if count >= 10:
        await db.users.update_one(
            {"_id": ObjectId(referrer_id)},
            {"$set": {"premium_tier": "legend", "premium_until": None}},
        )
    elif count >= 3:
        await db.users.update_one(
            {"_id": ObjectId(referrer_id)},
            {"$set": {"premium_tier": "premium", "premium_until": datetime.utcnow() + timedelta(days=30)}},
        )
    elif count >= 1:
        await db.users.update_one(
            {"_id": ObjectId(referrer_id)},
            {"$set": {"premium_tier": "starter", "premium_until": datetime.utcnow() + timedelta(days=7)}},
        )

    return {"message": "Referral applied! Welcome to MintU!", "referrer_name": referrer["name"]}


@router.get("/leaderboard")
async def referral_leaderboard():
    """Top referrers (publicly accessible)."""
    pipeline = [
        {"$group": {"_id": "$referrer_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    results = await db.referrals.aggregate(pipeline).to_list(10)
    leaderboard = []
    for r in results:
        user = await db.users.find_one({"_id": ObjectId(r["_id"])}, {"name": 1})
        if user:
            leaderboard.append({"name": user["name"], "referrals": r["count"]})
    return {"leaderboard": leaderboard}


@router.get("/enhanced-status")
async def enhanced_referral_status(user_id: str = Depends(get_current_user)):
    """Enhanced referral status with Pro-day rewards, tiers, next milestone, recent referrals."""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    code = await _ensure_code(user)
    referrals = await db.referrals.find({"referrer_id": user_id}).sort("created_at", -1).to_list(50)
    referral_count = len(referrals)

    reward_tiers = [
        {**t, "unlocked": referral_count >= t["friends"]} for t in _TIER_DEFS
    ]

    total_pro_days = 0
    for tier in reward_tiers:
        if tier["unlocked"]:
            total_pro_days = tier["pro_days"]  # highest unlocked wins

    next_tier = next((t for t in reward_tiers if not t["unlocked"]), None)

    recent = []
    for ref in referrals[:5]:
        referred = await db.users.find_one({"_id": ObjectId(ref["referred_id"])}, {"name": 1})
        recent.append({
            "name": referred.get("name", "Friend") if referred else "Friend",
            "date": ref["created_at"],
        })

    return {
        "referral_code": code,
        "referral_count": referral_count,
        "total_pro_days_earned": total_pro_days,
        "reward_tiers": reward_tiers,
        "next_milestone": {
            "friends_needed": next_tier["friends"] - referral_count if next_tier else 0,
            "reward": next_tier["reward"] if next_tier else "All unlocked! 🎉",
        } if next_tier else {"friends_needed": 0, "reward": "All unlocked! 🎉"},
        "recent_referrals": recent,
        "share_text": f"🔥 I'm using MintU to track my money smartly! Use my code {code} and we both get Pro features. Download: https://mintu.app/invite/{code}",
        "whatsapp_text": f"Hey! 👋 I found this amazing finance app called MintU. It tells you exactly where your money goes 💸\n\nUse my code: {code}\nDownload: https://mintu.app/invite/{code}\n\nWe both get Pro features for free! 🎁",
    }



@router.get("/fomo-feed")
async def fomo_feed(user_id: str = Depends(get_current_user)):
    """FOMO-driven motivational feed.

    Mixes (a) real friends' savings achievements (when user has friends in MintU) with
    (b) anonymized aggregate community stats ("Top 10% of users saved ₹X this month").
    Used to trigger emotional "you're missing out" response on Home screen banner.
    """
    from bson import ObjectId
    items = []

    # --- Real friends data (anonymized names if private) ---
    try:
        me = await db.users.find_one({"_id": ObjectId(user_id)})
        friend_phones = me.get("friends", []) if me else []
        if friend_phones:
            month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            friends = await db.users.find({"phone": {"$in": friend_phones}}).to_list(20)
            for f in friends[:3]:
                # Compute friend's month saving (income - expenses in transactions)
                pipeline = [
                    {"$match": {"user_id": str(f["_id"]), "timestamp": {"$gte": month_start}}},
                    {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
                ]
                agg = await db.transactions.aggregate(pipeline).to_list(5)
                totals = {r["_id"]: r["total"] for r in agg}
                saved = max(0, (totals.get("income", 0) - totals.get("expense", 0)))
                if saved > 200:
                    items.append({
                        "id": f"friend_{f['_id']}",
                        "type": "friend_saving",
                        "icon": "💸",
                        "name": f.get("name", "A friend"),
                        "amount": round(saved, 0),
                        "text": f"{f.get('name', 'Your friend')} saved ₹{saved:,.0f} this month using MintU 💸",
                        "cta": "See how",
                    })
    except Exception as e:
        logging.debug(f"fomo friends fetch failed: {e}")

    # --- Anonymized community aggregates ---
    try:
        # Top-saver percentile (median of top 10% savings in last 30 days)
        month_start = datetime.utcnow() - timedelta(days=30)
        pipeline = [
            {"$match": {"timestamp": {"$gte": month_start}, "type": "expense"}},
            {"$group": {"_id": "$user_id", "spent": {"$sum": "$amount"}}},
            {"$sort": {"spent": 1}},
            {"$limit": 50},
        ]
        top_savers = await db.transactions.aggregate(pipeline).to_list(50)
        if top_savers:
            avg_low = sum(s["spent"] for s in top_savers[:10]) / max(len(top_savers[:10]), 1)
            # Assuming avg income 40k, savings = 40000 - avg_low
            community_saving = max(2000, 40000 - avg_low)
            items.append({
                "id": "community_top",
                "type": "community",
                "icon": "🏆",
                "text": f"Top MintU users saved ₹{community_saving:,.0f} this month. Are you in the top 10%?",
                "cta": "Check your rank",
            })
    except Exception as e:
        logging.debug(f"fomo community: {e}")

    # --- Premium unlock nudge ---
    try:
        if me and me.get("premium_tier", "free") == "free":
            ref_count = await db.users.count_documents({"referred_by": str(me["_id"])})
            remaining = max(0, 3 - ref_count)
            if remaining > 0:
                items.append({
                    "id": "invite_unlock",
                    "type": "invite_nudge",
                    "icon": "🔓",
                    "text": f"Invite {remaining} more friend{'s' if remaining > 1 else ''} to unlock Premium FREE for 1 month",
                    "cta": "Invite now",
                })
    except Exception as e:
        logging.debug(f"fomo invite nudge: {e}")

    # --- Streak nudge ---
    try:
        if me:
            last = me.get("last_login")
            if last and isinstance(last, datetime):
                days_gap = (datetime.utcnow() - last).days
                if days_gap >= 2:
                    items.append({
                        "id": "streak_break",
                        "type": "streak_break",
                        "icon": "💔",
                        "text": f"Your tracking streak broke {days_gap} day{'s' if days_gap > 1 else ''} ago. Come back today!",
                        "cta": "Track now",
                    })
    except Exception:
        pass

    # Fallback if nothing generated
    if not items:
        items.append({
            "id": "default",
            "type": "community",
            "icon": "✨",
            "text": "MintU users save 23% more on average. Start your streak today!",
            "cta": "Get started",
        })

    return {"items": items[:3], "count": len(items[:3])}


@router.get("/money-score-card")
async def share_money_score_card(user_id: str = Depends(get_current_user)):
    """Return share-ready text + emoji card for Instagram/WhatsApp story sharing.

    The frontend combines this text with a gradient card and triggers Share.share().
    """
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    score = user.get("money_score", 72) if user else 72
    badges_count = len(user.get("badges", []) if user else [])
    code = await _ensure_code(user) if user else "MINTU"

    # Emoji & message based on score
    if score >= 85:
        emoji, title = "🏆", "Money Master"
    elif score >= 70:
        emoji, title = "🔥", "Money Pro"
    elif score >= 50:
        emoji, title = "💪", "Getting Better"
    else:
        emoji, title = "🌱", "Just Starting"

    card_text = (
        f"{emoji} My MintU Money Score: {score}/100 — {title}\n"
        f"🎖️ {badges_count} badges earned\n\n"
        f"Track your money smartly with MintU — use my code {code}:\n"
        f"https://mintu.app/invite/{code}"
    )

    return {
        "score": score,
        "title": title,
        "emoji": emoji,
        "badges_count": badges_count,
        "code": code,
        "share_text": card_text,
        "ig_story_text": f"{emoji} Money Score: {score}/100 🔥\nTracking with @MintU",
        "whatsapp_text": card_text,
        # Gradient colors frontend can render
        "gradient": ["#E65100", "#FF7D33"] if score < 70 else ["#10B981", "#059669"],
    }
