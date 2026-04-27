"""split_activity.py — Read-only activity feed & leaderboard endpoints.

Extracted from split_settle.py (Round 30g refactor, Phase 6) so the
settlement file focuses on writes (settle / partial / mark-paid / razorpay)
and the activity/social-surface read endpoints live together.

Endpoints
---------
• GET  /split/activity                 — Emotional unified feed (settlements + expenses)
• GET  /split/settlement-leaderboard   — Coin leaderboard + user's rank + badges
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import Depends

from core import db, get_current_user
from routers.split_common import api_router, SETTLEMENT_BADGES


# ══════════════════════════════════════════════════════════════════════
#  SETTLEMENT LEADERBOARD
# ══════════════════════════════════════════════════════════════════════
@api_router.get("/split/settlement-leaderboard")
async def settlement_leaderboard(user_id: str = Depends(get_current_user)):
    """Settlement speed leaderboard with rewards."""

    # Get all users with settlement data
    users = await db.users.find(
        {"settlement_count": {"$gt": 0}},
        {"name": 1, "settlement_count": 1, "reward_coins": 1},
    ).sort("reward_coins", -1).to_list(20)

    user_data = await db.users.find_one({"_id": ObjectId(user_id)})
    my_coins = user_data.get("reward_coins", 0) if user_data else 0
    my_count = user_data.get("settlement_count", 0) if user_data else 0
    my_badges = await db.user_badges.find({"user_id": user_id}).to_list(20)

    leaderboard = []
    my_rank = 0
    for i, u in enumerate(users):
        is_me = str(u["_id"]) == user_id
        if is_me:
            my_rank = i + 1
        leaderboard.append({
            "rank": i + 1,
            "name": u.get("name", "User"),
            "coins": u.get("reward_coins", 0),
            "settlements": u.get("settlement_count", 0),
            "is_me": is_me,
        })

    return {
        "leaderboard": leaderboard[:10],
        "my_stats": {
            "rank": my_rank or len(leaderboard) + 1,
            "coins": my_coins,
            "settlements": my_count,
            "cashback_available": round(my_coins * 0.5, 2),
            "badges": [
                {"id": b["badge_id"],
                 **next((bd for bd in SETTLEMENT_BADGES if bd["id"] == b["badge_id"]), {})}
                for b in my_badges
            ],
        },
    }


# ══════════════════════════════════════════════════════════════════════
#  EMOTIONAL ACTIVITY FEED (MintU 2.0)
# ══════════════════════════════════════════════════════════════════════
@api_router.get("/split/activity")
async def split_activity(limit: int = 15, user_id: str = Depends(get_current_user)):
    """Emotional activity feed — shows recent settlements, expense additions, group joins.

    Returns a unified, human-readable feed like:
      - 'You settled ₹450 with Riya 💙' — 2h ago
      - 'Arjun added ₹300 for Lunch in Goa Trip' — 5h ago
      - 'You got ₹1,200 back from Anita 🎉' — yesterday
    """
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    my_name = user.get("name", "You")

    # Pull from 3 sources: settlements (paid_by me or to me), expenses (my groups), system messages
    my_groups = await db.split_groups.find({"members.user_id": user_id}).to_list(200)
    group_ids = [str(g["_id"]) for g in my_groups]
    group_map = {
        str(g["_id"]): {"name": g["name"], "emoji": g.get("custom_emoji", "💰")}
        for g in my_groups
    }

    # Recent settlements
    settlements = await db.settlements.find({
        "group_id": {"$in": group_ids},
        "$or": [{"paid_by": user_id}, {"paid_to": user_id}],
    }).sort("created_at", -1).to_list(limit)

    # Recent expenses in my groups (non-settle)
    expenses = await db.split_expenses.find({
        "group_id": {"$in": group_ids},
    }).sort("date", -1).to_list(limit)

    # Build user lookup for names
    member_ids = set()
    for s in settlements:
        member_ids.add(s.get("paid_by"))
        member_ids.add(s.get("paid_to"))
    for e in expenses:
        member_ids.add(e.get("paid_by"))
    member_ids.discard(None)
    member_ids.discard(user_id)

    users = {}
    if member_ids:
        # Collect names from group members first (non-registered users live there)
        for g in my_groups:
            for m in g.get("members", []):
                if m.get("user_id") and m.get("user_id") in member_ids:
                    users[m["user_id"]] = m.get("name", "friend")
        # Override with registered user records when available
        valid_oids = [ObjectId(uid) for uid in member_ids if ObjectId.is_valid(uid)]
        if valid_oids:
            async for u in db.users.find({"_id": {"$in": valid_oids}}):
                users[str(u["_id"])] = u.get("name", "friend")

    feed = []
    # Settlements → emotional messages
    for s in settlements:
        grp = group_map.get(s.get("group_id"), {"name": "a group", "emoji": "💰"})
        amt = s.get("amount", 0)
        ts = s.get("created_at", datetime.now(timezone.utc))
        if s.get("paid_by") == user_id:
            other = users.get(s.get("paid_to"), "friend")
            feed.append({
                "type": "settled_out",
                "emoji": "💙",
                "title": f"You settled ₹{amt:,.0f} with {other}",
                "subtitle": f"{grp['emoji']} {grp['name']} · via {s.get('method', 'manual')}",
                "amount": amt,
                "direction": "out",
                "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                "group_id": s.get("group_id"),
            })
        else:
            other = users.get(s.get("paid_by"), "friend")
            feed.append({
                "type": "settled_in",
                "emoji": "🎉",
                "title": f"{other} paid you ₹{amt:,.0f}",
                "subtitle": f"{grp['emoji']} {grp['name']}",
                "amount": amt,
                "direction": "in",
                "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                "group_id": s.get("group_id"),
            })

    # Expense additions → social messages
    for e in expenses[: max(limit - len(feed), 0)]:
        grp = group_map.get(str(e.get("group_id")), {"name": "a group", "emoji": "💰"})
        adder = users.get(e.get("paid_by"), my_name if e.get("paid_by") == user_id else "someone")
        is_me = e.get("paid_by") == user_id
        ts = e.get("date", datetime.now(timezone.utc))
        feed.append({
            "type": "expense_added",
            "emoji": "🛍️",
            "title": (
                f"{'You' if is_me else adder} added ₹{e.get('amount', 0):,.0f} "
                f"for {e.get('description', 'an expense')}"
            ),
            "subtitle": f"{grp['emoji']} {grp['name']}",
            "amount": e.get("amount", 0),
            "direction": "neutral",
            "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
            "group_id": str(e.get("group_id")),
        })

    # Sort by timestamp desc
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    feed = feed[:limit]

    # Summary stats for emotional header
    settled_this_month_count = 0
    settled_this_month_amount = 0
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for s in settlements:
        ts = s.get("created_at")
        if ts and ts >= month_start and s.get("paid_by") == user_id:
            settled_this_month_count += 1
            settled_this_month_amount += s.get("amount", 0)

    # Top friend (most settlements with)
    friend_counter: dict = {}
    for s in settlements:
        other = s.get("paid_to") if s.get("paid_by") == user_id else s.get("paid_by")
        if other and other != user_id:
            friend_counter[other] = friend_counter.get(other, 0) + 1
    top_friend = None
    if friend_counter:
        top_id = max(friend_counter, key=friend_counter.get)
        top_friend = {
            "name": users.get(top_id, "friend"),
            "count": friend_counter[top_id],
        }

    # Emotional headline
    if settled_this_month_count >= 3:
        headline = f"You settled {settled_this_month_count} bills this month 💙 Great teamwork!"
    elif settled_this_month_count >= 1:
        plural = "s" if settled_this_month_count > 1 else ""
        headline = f"You settled {settled_this_month_count} bill{plural} this month ✨"
    elif len(feed) > 0:
        headline = "Keep the momentum going — settle pending bills to build streak 🔥"
    else:
        headline = "Start splitting with friends to see your activity here 👋"

    return {
        "feed": feed,
        "headline": headline,
        "settled_this_month": {
            "count": settled_this_month_count,
            "amount": settled_this_month_amount,
        },
        "top_friend": top_friend,
    }
