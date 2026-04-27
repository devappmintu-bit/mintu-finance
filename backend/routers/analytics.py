"""Analytics router — stats, weekly reports, savings leaderboard, friend comparison."""
from datetime import datetime, timedelta, timezone
from typing import Dict
from bson import ObjectId
from fastapi import APIRouter, Depends

from core import db, get_current_user

router = APIRouter(tags=["analytics"])


# ============== STATS OVERVIEW ==============
@router.get("/stats/overview")
@router.get("/analytics/summary")
@router.get("/analytics/monthly")
async def get_stats_overview(user_id: str = Depends(get_current_user)):
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": thirty_days_ago},
    }).to_list(1000)

    total_income = sum(t["amount"] for t in txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in txns if t["type"] == "debit")

    category_breakdown: dict = {}
    for t in txns:
        if t["type"] == "debit":
            category_breakdown[t["category"]] = category_breakdown.get(t["category"], 0) + t["amount"]

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "transaction_count": len(txns),
        "category_breakdown": category_breakdown,
    }


# ============== WEEKLY REPORT ==============
@router.get("/reports/weekly")
async def weekly_report(user_id: str = Depends(get_current_user)):
    """Weekly Report — emotional + actionable summary."""
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = week_start - timedelta(days=7)

    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}

    async def _category_totals(gte, lt=None):
        match = {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": gte}}
        if lt is not None:
            match["date"]["$lt"] = lt
        out: dict = {}
        async for doc in db.transactions.aggregate([
            {"$match": match},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        ]):
            out[doc["_id"]] = doc["total"]
        return out

    this_week = await _category_totals(week_start)
    last_week = await _category_totals(prev_week_start, week_start)

    this_total = sum(this_week.values())
    last_total = sum(last_week.values())
    change_pct = ((this_total - last_total) / max(last_total, 1) * 100) if last_total > 0 else 0

    top_category = max(this_week, key=this_week.get) if this_week else "Nothing tracked"
    top_amount = this_week.get(top_category, 0)

    if change_pct < -10:
        mood, mood_text = "🎉", "Great week! You spent less than last week"
    elif change_pct < 5:
        mood, mood_text = "😊", "Steady week — spending is stable"
    elif change_pct < 20:
        mood, mood_text = "👀", "Watch out! Spending crept up a bit"
    else:
        mood, mood_text = "🔥", "Big spending week! Let's course-correct"

    potential_save = int(this_total * 0.15)
    money_score = user.get("money_score", 50)

    return {
        "period": f"{week_start.strftime('%b %d')} - {now.strftime('%b %d, %Y')}",
        "total_spent": this_total,
        "last_week_spent": last_total,
        "change_pct": round(change_pct, 1),
        "mood": mood,
        "mood_text": mood_text,
        "top_category": {"name": top_category, "amount": top_amount},
        "category_breakdown": dict(sorted(this_week.items(), key=lambda x: x[1], reverse=True)),
        "savings_suggestion": f"Cut ₹{potential_save:,} next week by reducing {top_category} spending",
        "streak": user.get("streak_days", 0),
        "money_score": money_score,
        "headline": f"You {'wasted' if change_pct > 10 else 'spent'} ₹{this_total:,.0f} this week {mood}",
        "shareable_text": f"My week: ₹{this_total:,.0f} spent | Top: {top_category} ₹{top_amount:,.0f} | Score: {money_score}/100 💸 #MintU",
    }


# ============== SAVINGS LEADERBOARD ==============
@router.get("/leaderboard/savings")
async def savings_leaderboard(user_id: str = Depends(get_current_user)):
    """Global savings leaderboard with user's rank + percentile."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    all_users = await db.users.find(
        {"money_score": {"$exists": True}},
        {"name": 1, "money_score": 1, "phone": 1, "streak_days": 1},
    ).sort("money_score", -1).to_list(100)

    user_rank = 0
    user_score = 0
    for i, u in enumerate(all_users):
        if str(u["_id"]) == user_id:
            user_rank = i + 1
            user_score = u.get("money_score", 0)
            break

    total_users = len(all_users)
    percentile = (
        max(1, min(99, int(((total_users - user_rank) / max(total_users, 1)) * 100)))
        if user_rank > 0 else 50
    )

    top_10 = []
    for i, u in enumerate(all_users[:10]):
        is_me = str(u["_id"]) == user_id
        phone = u.get("phone", "")
        masked_phone = f"***{phone[-4:]}" if len(phone) >= 4 else "****"
        top_10.append({
            "rank": i + 1,
            "name": u.get("name", "MintU User"),
            "score": u.get("money_score", 0),
            "streak": u.get("streak_days", 0),
            "is_me": is_me,
            "phone_masked": masked_phone,
        })

    # User's monthly saved amount
    user_stats: dict = {}
    async for doc in db.transactions.aggregate([
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]):
        user_stats[doc["_id"]] = doc["total"]

    saved = max(0, user_stats.get("credit", 0) - user_stats.get("debit", 0))

    if percentile >= 80:
        comparison_text = f"🏆 You're in the top {100 - percentile}% of savers! Financial rockstar!"
    elif percentile >= 60:
        comparison_text = f"💪 You save better than {percentile}% of users. Push for top 20%!"
    elif percentile >= 40:
        comparison_text = f"👀 You're in the middle — {percentile}% of users save less than you. Room to grow!"
    else:
        comparison_text = f"🚀 {percentile}% of users save less than you. Small changes = big results!"

    streak_banner = (
        f"🔥 {all_users[user_rank - 1].get('streak_days', 0)}-day streak!"
        if user_rank > 0 and user_rank <= len(all_users)
        else ""
    )

    return {
        "user_rank": user_rank,
        "total_users": total_users,
        "percentile": percentile,
        "user_score": user_score,
        "monthly_saved": saved,
        "comparison_text": comparison_text,
        "top_10": top_10,
        "motivations": [
            f"You saved more than {percentile}% of users this week 👀",
            f"Your Money Score: {user_score}/100 — {'Top tier!' if user_score >= 75 else 'Getting there!'}",
            streak_banner,
        ],
    }


# ============== UNIFIED LEADERBOARD (global + your contacts) ==============
@router.get("/leaderboard/unified")
async def unified_leaderboard(
    scope: str = "contacts",
    user_id: str = Depends(get_current_user),
):
    """Unified leaderboard used by Home, Rewards and Split screens.

    scope: "contacts" (split-group co-members + referred users + self) or "global" (top 50)

    Returns: {you: {...}, contenders: [...ranked], scope, total}
    Contenders are sorted by money_score desc. Each includes:
      rank, id, name, score, streak, coins, is_me, phone_masked, settlements_count.
    """
    from bson import ObjectId

    # Build the set of user_ids we want to rank:
    if scope == "global":
        ids_query: Dict = {}  # every user
    else:
        # Contact network: people in any of my split groups, people who referred me or I referred, plus me.
        network_ids = {user_id}
        # Split group co-members
        my_groups = await db.split_groups.find(
            {"members.user_id": user_id},
            {"members.user_id": 1},
        ).to_list(100)
        for g in my_groups:
            for m in g.get("members", []):
                if m.get("user_id"):
                    network_ids.add(m["user_id"])
        # Users I referred
        referred = await db.users.find(
            {"referred_by": user_id},
            {"_id": 1},
        ).to_list(500)
        for r in referred:
            network_ids.add(str(r["_id"]))
        # User who referred me
        try:
            me = await db.users.find_one({"_id": ObjectId(user_id)}, {"referred_by": 1})
            if me and me.get("referred_by"):
                network_ids.add(me["referred_by"])
        except Exception:
            pass
        ids_query = {"_id": {"$in": [ObjectId(uid) for uid in network_ids if ObjectId.is_valid(uid)]}}

    projection = {"name": 1, "money_score": 1, "phone": 1, "streak_days": 1, "reward_coins": 1, "settlement_count": 1, "avatar": 1}
    candidates = await db.users.find(ids_query, projection).to_list(500)
    # Sort by money_score desc (secondary: coins)
    candidates.sort(key=lambda u: (-u.get("money_score", 0), -u.get("reward_coins", 0)))

    contenders = []
    you = None
    for i, u in enumerate(candidates):
        uid = str(u["_id"])
        is_me = uid == user_id
        phone = u.get("phone", "")
        masked = f"***{phone[-4:]}" if len(phone) >= 4 else "****"
        entry = {
            "rank": i + 1,
            "id": uid,
            "name": u.get("name", "MintU User"),
            "score": u.get("money_score", 0),
            "streak": u.get("streak_days", 0),
            "coins": u.get("reward_coins", 0),
            "settlements": u.get("settlement_count", 0),
            "is_me": is_me,
            "phone_masked": masked,
            "has_avatar": bool(u.get("avatar")),
        }
        contenders.append(entry)
        if is_me:
            you = entry

    total = len(contenders)
    if you:
        you_rank = you["rank"]
        you["percentile"] = max(1, min(99, int(((total - you_rank) / max(total, 1)) * 100))) if total > 1 else 100

    # Leader headline
    leader = contenders[0] if contenders else None
    if leader and not leader["is_me"]:
        headline = f"👑 {leader['name']} leads with {leader['score']}/100"
    elif leader and leader["is_me"]:
        headline = f"🏆 You're leading among your {total - 1} contacts!"
    else:
        headline = "Invite friends to start competing"

    return {
        "scope": scope,
        "total": total,
        "you": you,
        "leader": leader,
        "headline": headline,
        "contenders": contenders[:50],  # cap at 50
    }


# ============== MINTU 2.0 — COINS & REWARDS (habit loop) ==============
# Award rules: simple, non-cumulative within a window to prevent farming.
COIN_RULES = {
    "add_transaction": {"amount": 5, "daily_cap": 50, "label": "Add a transaction"},
    "scan_sms": {"amount": 10, "daily_cap": 50, "label": "Scan SMS for expenses"},
    "settle_split": {"amount": 15, "daily_cap": 60, "label": "Settle a split"},
    "complete_lesson": {"amount": 20, "daily_cap": 40, "label": "Complete a Money School lesson"},
    "open_app_daily": {"amount": 3, "daily_cap": 3, "label": "Open MintU today"},
    "set_budget": {"amount": 10, "daily_cap": 10, "label": "Set a new budget"},
    "add_income": {"amount": 10, "daily_cap": 20, "label": "Log income"},
    "share_report": {"amount": 15, "daily_cap": 15, "label": "Share a report"},
}


@router.post("/coins/award")
async def award_coins(data: dict, user_id: str = Depends(get_current_user)):
    """Award coins for a user action, capped daily to prevent abuse.

    Hardened (Round 30 / Paranoid audit):
    1. Routes through the immutable ledger (`core.ledger.award_coins`) so
       the action and idempotency are enforced at the DB-unique-index layer.
    2. The daily-cap is enforced ATOMICALLY via `find_one_and_update`
       with a `$lt` guard on the per-day counter, closing the prior
       race where 20 parallel requests could all pass the non-atomic
       "remaining_cap > 0" check and bypass the limit.

    `dedupe_key` in the payload (e.g. transaction_id) is an optional
    client-supplied idempotency key. If omitted, the server generates a
    per-minute bucket so spam-clicks within the same minute collapse.
    """
    from core import safe_oid
    from core import ledger as ledger_service

    action = data.get("action", "")
    if action not in COIN_RULES:
        return {"awarded": 0, "reason": "invalid_action", "balance": 0}

    rule = COIN_RULES[action]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter_path = f"daily_coin_caps.{today_str}.{action}"
    cap = int(rule["daily_cap"])
    amount = int(rule["amount"])

    # ── ATOMIC CAP RESERVATION ─────────────────────────────────────────
    # Reserve `amount` from today's bucket only if the new total would
    # NOT exceed the cap. MongoDB evaluates the filter + $inc as a single
    # atomic operation — no race possible across parallel requests.
    oid = safe_oid(user_id)
    if oid is None:
        return {"awarded": 0, "reason": "invalid_user", "balance": 0}

    reserved = await db.users.find_one_and_update(
        {
            "_id": oid,
            "$or": [
                {counter_path: {"$exists": False}},             # first award today
                {counter_path: {"$lte": cap - amount}},         # enough headroom
            ],
        },
        {"$inc": {counter_path: amount}},
        return_document=True,
    )

    if reserved is None:
        # Cap already reached (or would be exceeded by this call).
        current_awarded = int(
            ((reserved or {}).get("daily_coin_caps") or {})
            .get(today_str, {})
            .get(action, 0)
        )
        # If reserved is None, we need a separate read for the display number
        u = await db.users.find_one({"_id": oid}, {counter_path: 1})
        current_awarded = int(
            (u or {}).get("daily_coin_caps", {}).get(today_str, {}).get(action, 0)
        )
        bal = await ledger_service.get_balance(user_id)
        return {
            "awarded": 0, "reason": "daily_cap_reached",
            "balance": bal, "daily_cap": cap, "daily_awarded": current_awarded,
        }

    # ── IDEMPOTENCY KEY ────────────────────────────────────────────────
    dedupe_key = (data.get("dedupe_key") or "").strip()
    if dedupe_key:
        idem_key = f"action::{action}::{user_id}::{dedupe_key}"
    else:
        minute_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        idem_key = f"action::{action}::{user_id}::{minute_bucket}"

    # ── LEDGER WRITE ──────────────────────────────────────────────────
    res = await ledger_service.award_coins(
        user_id=user_id, amount=amount, source=f"action:{action}",
        idempotency_key=idem_key, txn_type="earn",
    )
    today_awarded_after = int(
        reserved.get("daily_coin_caps", {}).get(today_str, {}).get(action, amount)
    )

    if not res["created"]:
        # Duplicate idempotency key — ROLLBACK the reservation so the cap
        # isn't silently burned by duplicate clicks.
        await db.users.update_one({"_id": oid}, {"$inc": {counter_path: -amount}})
        return {
            "awarded": 0, "reason": "already_awarded",
            "balance": res["balance"], "daily_cap": cap,
            "daily_awarded": today_awarded_after - amount,
        }

    return {
        "awarded": amount, "reason": "ok", "action": action,
        "label": rule["label"], "balance": res["balance"],
        "daily_cap": cap, "daily_awarded": today_awarded_after,
    }


@router.get("/coins/status")
async def coins_status(user_id: str = Depends(get_current_user)):
    """Return coin balance + today's earnings + next streakable actions."""
    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    balance = user.get("coins", 0)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    today_breakdown: dict = {}
    async for d in db.coin_ledger.aggregate([
        {"$match": {"user_id": user_id, "at": {"$gte": today_start}}},
        {"$group": {"_id": "$action", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]):
        today_breakdown[d["_id"]] = {"total": d["total"], "count": d["count"]}

    today_total = sum(b["total"] for b in today_breakdown.values())

    # Suggest next action based on what they haven't done today
    actions_done = set(today_breakdown.keys())
    next_actions = []
    for action_id, rule in COIN_RULES.items():
        if action_id not in actions_done:
            next_actions.append({
                "id": action_id,
                "label": rule["label"],
                "reward": rule["amount"],
            })
        elif today_breakdown[action_id]["total"] < rule["daily_cap"]:
            remaining = rule["daily_cap"] - today_breakdown[action_id]["total"]
            next_actions.append({
                "id": action_id,
                "label": rule["label"],
                "reward": min(rule["amount"], remaining),
            })

    return {
        "balance": balance,
        "today_earned": today_total,
        "today_breakdown": today_breakdown,
        "next_actions": next_actions[:4],
        "streak_days": user.get("streak_days", 0),
        "rules": COIN_RULES,
    }


# ============== FRIEND COMPARISON ==============
@router.get("/leaderboard/friends")
async def friend_comparison(user_id: str = Depends(get_current_user)):
    """Compare savings with friends from your split groups."""
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(20)
    friend_ids = {m["user_id"] for g in groups for m in g.get("members", []) if m["user_id"] != user_id}

    if not friend_ids:
        return {"friends": [], "message": "Add friends in Split groups to compare savings! 👥"}

    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}
    user_score = user.get("money_score", 50)
    user_name = user.get("name", "You")

    # Batch-fetch all friends in a single query (avoids N+1)
    try:
        friend_oids = [ObjectId(fid) for fid in friend_ids]
    except Exception:
        friend_oids = []
    friend_docs = await db.users.find(
        {"_id": {"$in": friend_oids}},
        {"name": 1, "money_score": 1, "streak_days": 1},
    ).to_list(len(friend_oids) + 1)
    friend_map = {str(doc["_id"]): doc for doc in friend_docs}

    friends = []
    for fid in friend_ids:
        friend = friend_map.get(fid)
        if not friend:
            continue

        f_score = friend.get("money_score", 50)
        diff = user_score - f_score
        if diff > 10:
            taunt = f"You're crushing it vs {friend['name']}! 😎"
        elif diff > 0:
            taunt = f"Slightly ahead of {friend['name']} — keep it up!"
        elif diff > -10:
            taunt = f"{friend['name']} is just ahead — catch up! 💪"
        else:
            taunt = f"{friend['name']} is killing it! Time to step up 😏"

        friends.append({
            "name": friend.get("name", "Friend"),
            "score": f_score,
            "streak": friend.get("streak_days", 0),
            "diff": diff,
            "taunt": taunt,
            "ahead": diff > 0,
        })

    friends.sort(key=lambda x: x["diff"])  # ones beating you first (motivational)

    winning = sum(1 for f in friends if f["ahead"])
    total = len(friends)

    return {
        "you": {"name": user_name, "score": user_score},
        "friends": friends,
        "summary": f"You're beating {winning}/{total} friends 🏆" if total else "No friends to compare yet",
        "challenge_text": f"Hey! My MintU score is {user_score}. Can you beat me? 😏 Download MintU!",
    }


# ============== MINTU 2.0 — HOME SNAPSHOT (dynamic insights) ==============
@router.get("/home/snapshot")
async def home_snapshot(user_id: str = Depends(get_current_user)):
    """Unified Home insights — sparkline, pace prediction, top category, score level."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    days_in_month = (now.replace(month=now.month % 12 + 1, day=1) - timedelta(days=1)).day if now.month < 12 else 31
    day_of_month = now.day

    user = await db.users.find_one({"_id": ObjectId(user_id)}) or {}

    # 7-day spend sparkline (today + 6 previous days)
    week_start = today_start - timedelta(days=6)
    daily_spend = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        next_day = day + timedelta(days=1)
        total = 0
        async for doc in db.transactions.aggregate([
            {"$match": {"user_id": user_id, "type": {"$in": ["debit", "expense"]}, "date": {"$gte": day, "$lt": next_day}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]):
            total = doc["total"]
        daily_spend.append({"day": day.strftime("%a"), "date": day.strftime("%b %d"), "amount": total})

    # Month-to-date spend + pace prediction
    mtd_txns = await db.transactions.find({
        "user_id": user_id,
        "type": {"$in": ["debit", "expense"]},
        "date": {"$gte": month_start},
    }).to_list(2000)
    mtd_spend = sum(t["amount"] for t in mtd_txns)
    daily_avg = mtd_spend / max(day_of_month, 1)
    projected_month_end = daily_avg * days_in_month

    # MTD income
    mtd_income_docs = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": {"$in": ["credit", "income"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    mtd_income = mtd_income_docs[0]["total"] if mtd_income_docs else 0

    # Top category this month
    cat_totals: dict = {}
    for t in mtd_txns:
        cat_totals[t["category"]] = cat_totals.get(t["category"], 0) + t["amount"]
    top_cat_name = max(cat_totals, key=cat_totals.get) if cat_totals else None
    top_cat = {"name": top_cat_name, "amount": cat_totals[top_cat_name], "pct": round((cat_totals[top_cat_name] / max(mtd_spend, 1)) * 100, 1)} if top_cat_name else None

    # Last week vs this week
    last_week_start = today_start - timedelta(days=13)
    last_week_end = today_start - timedelta(days=7)
    last_week_docs = await db.transactions.aggregate([
        {"$match": {"user_id": user_id, "type": {"$in": ["debit", "expense"]}, "date": {"$gte": last_week_start, "$lt": last_week_end}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    last_week_total = last_week_docs[0]["total"] if last_week_docs else 0
    this_week_total = sum(d["amount"] for d in daily_spend)
    week_change_pct = ((this_week_total - last_week_total) / last_week_total * 100) if last_week_total > 0 else 0

    # Money Score tier
    score = user.get("money_score", 50)
    tiers = [
        {"min": 0, "name": "Just Starting", "emoji": "🌱", "color": "#94A3B8"},
        {"min": 35, "name": "Growing Saver", "emoji": "🌿", "color": "#6366F1"},
        {"min": 55, "name": "Consistent", "emoji": "🌳", "color": "#10B981"},
        {"min": 70, "name": "Smart Spender", "emoji": "⭐", "color": "#F59E0B"},
        {"min": 85, "name": "Money Expert", "emoji": "🏆", "color": "#EC4899"},
        {"min": 95, "name": "Wealth Sage", "emoji": "👑", "color": "#7C3AED"},
    ]
    current_tier = tiers[0]
    next_tier = tiers[1]
    for i, t in enumerate(tiers):
        if score >= t["min"]:
            current_tier = t
            next_tier = tiers[i + 1] if i + 1 < len(tiers) else None
    progress_to_next = ((score - current_tier["min"]) / (next_tier["min"] - current_tier["min"]) * 100) if next_tier else 100

    # Pace headline
    savings_rate = round(((mtd_income - mtd_spend) / max(mtd_income, 1)) * 100, 1) if mtd_income > 0 else 0
    # Safety cap: clamp to realistic band (prevent misleading 99% savings when user hasn't tracked expenses).
    if savings_rate > 95:
        savings_rate = 95.0
    if savings_rate < -200:
        savings_rate = -200.0
    if mtd_spend == 0:
        pace_headline = "No spending tracked yet this month"
        pace_emoji = "📭"
    elif mtd_income > 0 and projected_month_end > mtd_income:
        pace_headline = f"At this pace, you'll overshoot income by ₹{int(projected_month_end - mtd_income):,}"
        pace_emoji = "🚨"
    elif savings_rate >= 30:
        pace_headline = f"On track to save {savings_rate:.0f}% — great pace!"
        pace_emoji = "🎯"
    elif savings_rate >= 10:
        pace_headline = f"Saving {savings_rate:.0f}% — push for 20%+"
        pace_emoji = "💪"
    else:
        pace_headline = f"Saving only {savings_rate:.0f}% — room to grow"
        pace_emoji = "🌱"

    return {
        "mtd_spend": mtd_spend,
        "mtd_income": mtd_income,
        "savings_rate": savings_rate,
        "projected_month_end": round(projected_month_end),
        "daily_avg": round(daily_avg),
        "day_of_month": day_of_month,
        "days_in_month": days_in_month,
        "sparkline": daily_spend,
        "this_week_total": this_week_total,
        "last_week_total": last_week_total,
        "week_change_pct": round(week_change_pct, 1),
        "top_category": top_cat,
        "pace_headline": pace_headline,
        "pace_emoji": pace_emoji,
        "tier": {
            "current": current_tier,
            "next": next_tier,
            "progress_pct": round(progress_to_next, 0),
            "score": score,
            "streak_days": user.get("streak_days", 0),
        },
        "transaction_count": len(mtd_txns),
    }


# ============== MINTU 2.0 — AI PREDICTIVE INSIGHTS ==============
@router.get("/ai/predict")
async def ai_predict(user_id: str = Depends(get_current_user)):
    """Predictive insights: month-end projection, overspending alerts, relatable waste comparisons."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    day_of_month = now.day
    days_in_month = (now.replace(month=now.month % 12 + 1, day=1) - timedelta(days=1)).day if now.month < 12 else 31

    txns = await db.transactions.find({
        "user_id": user_id,
        "type": {"$in": ["debit", "expense"]},
        "date": {"$gte": month_start},
    }).to_list(3000)

    cat_totals: dict = {}
    for t in txns:
        cat_totals[t["category"]] = cat_totals.get(t["category"], 0) + t["amount"]
    total = sum(cat_totals.values())

    # Budgets
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    overspend_alerts = []
    for b in budgets:
        spent = cat_totals.get(b["category"], 0)
        pct = (spent / max(b["amount"], 1)) * 100
        if pct >= 90:
            overspend_alerts.append({
                "category": b["category"],
                "spent": spent,
                "budget": b["amount"],
                "pct": round(pct, 0),
                "severity": "critical" if pct >= 100 else "warning",
                "message": f"{b['category']} is at {pct:.0f}% of budget — {'exceeded' if pct >= 100 else 'slow down'}",
            })

    # Relatable "waste" comparisons — based on categories users often overspend
    comparisons = []
    dining_like = sum(cat_totals.get(c, 0) for c in ["Food", "Dining", "Entertainment", "Coffee"])
    if dining_like >= 500:
        chai_count = int(dining_like / 20)
        sip_equiv = int(dining_like / 400) * 400
        comparisons.append({
            "icon": "cafe",
            "title": "Food & Dining",
            "amount": dining_like,
            "comparison": f"≈ {chai_count} chais, or a ₹{sip_equiv:,}/month SIP for 1 year = ₹{sip_equiv * 12:,}",
        })
    transport = cat_totals.get("Transport", 0)
    if transport >= 300:
        km_eq = int(transport / 12)  # Avg petrol rate
        comparisons.append({
            "icon": "car",
            "title": "Transport",
            "amount": transport,
            "comparison": f"≈ {km_eq} km of fuel, or {int(transport / 50)} auto rides",
        })
    shopping = sum(cat_totals.get(c, 0) for c in ["Shopping", "Clothing"])
    if shopping >= 1000:
        comparisons.append({
            "icon": "bag",
            "title": "Shopping",
            "amount": shopping,
            "comparison": f"≈ ₹{int(shopping / 12):,}/month invested in Nifty50 over 5 yrs = ~₹{int(shopping / 12 * 12 * 5 * 1.12):,}",
        })

    # Projected month-end
    daily_avg = total / max(day_of_month, 1)
    projected = daily_avg * days_in_month
    remaining_days = days_in_month - day_of_month
    projected_remaining = daily_avg * remaining_days

    # Category trend predictions (current pace → month-end per category)
    cat_predictions = []
    for cat, amt in sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)[:5]:
        cat_daily = amt / max(day_of_month, 1)
        cat_projection = cat_daily * days_in_month
        cat_predictions.append({
            "category": cat,
            "mtd": amt,
            "projected": round(cat_projection),
            "daily_avg": round(cat_daily),
        })

    return {
        "mtd_spend": total,
        "daily_avg": round(daily_avg),
        "projected_month_end": round(projected),
        "projected_remaining_days": round(projected_remaining),
        "day_of_month": day_of_month,
        "days_in_month": days_in_month,
        "overspend_alerts": overspend_alerts,
        "waste_comparisons": comparisons,
        "category_predictions": cat_predictions,
        "headline": (
            f"📊 At this pace: ₹{int(projected):,} by month-end"
            if total > 0 else "📭 No spending data yet — add transactions to unlock predictions"
        ),
    }

# ============== MINTU 2.0 — YEARLY ANALYTICS DASHBOARD (12-month view) ==============
@router.get("/analytics/yearly")
async def analytics_yearly(year: int = 0, user_id: str = Depends(get_current_user)):
    """Return 12 months of income + expense + category breakdown for yearly dashboard.
    If year=0, returns the trailing 12 months ending this month.
    Else returns calendar year Jan-Dec of `year`.
    """
    from calendar import monthrange

    now = datetime.now(timezone.utc)
    if year == 0:
        # Trailing 12 months
        months = []
        for i in range(11, -1, -1):
            d = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month = d.month - i
            year_adj = d.year
            while month <= 0:
                month += 12
                year_adj -= 1
            start = datetime(year_adj, month, 1)
            last_day = monthrange(year_adj, month)[1]
            end = datetime(year_adj, month, last_day, 23, 59, 59)
            months.append((start, end, start.strftime("%b %y")))
        mode = "trailing_12"
        label = "Last 12 months"
    else:
        # Calendar year
        months = []
        for m in range(1, 13):
            start = datetime(year, m, 1)
            last_day = monthrange(year, m)[1]
            end = datetime(year, m, last_day, 23, 59, 59)
            months.append((start, end, start.strftime("%b")))
        mode = "calendar"
        label = f"Calendar {year}"

    overall_start = months[0][0]
    overall_end = months[-1][1]

    # Bulk fetch all transactions in range
    txns = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": overall_start, "$lte": overall_end},
    }).to_list(50000)

    # Aggregate per month
    monthly: list = []
    yearly_cat: dict = {}
    yearly_income = 0.0
    yearly_expense = 0.0
    month_of_max_spend = None
    month_of_min_spend = None
    best_savings_month = None
    best_savings_rate = -1.0

    for start, end, lbl in months:
        income_m = 0.0
        expense_m = 0.0
        cats_m: dict = {}
        txn_count_m = 0
        for t in txns:
            td = t.get("date")
            if not td or td < start or td > end:
                continue
            amt = float(t.get("amount", 0))
            if t.get("type") in ("credit", "income"):
                income_m += amt
            else:
                expense_m += amt
                cats_m[t.get("category", "Other")] = cats_m.get(t.get("category", "Other"), 0) + amt
                yearly_cat[t.get("category", "Other")] = yearly_cat.get(t.get("category", "Other"), 0) + amt
            txn_count_m += 1
        yearly_income += income_m
        yearly_expense += expense_m
        savings = income_m - expense_m
        rate = round((savings / max(income_m, 1)) * 100, 1) if income_m > 0 else 0
        top_cat = max(cats_m, key=cats_m.get) if cats_m else None
        monthly.append({
            "label": lbl,
            "month_num": start.month,
            "year": start.year,
            "income": round(income_m, 2),
            "expense": round(expense_m, 2),
            "savings": round(savings, 2),
            "savings_rate": rate,
            "txn_count": txn_count_m,
            "top_category": top_cat,
        })

    # Track best/worst
    for m in monthly:
        if m["expense"] > 0:
            if month_of_max_spend is None or m["expense"] > month_of_max_spend["expense"]:
                month_of_max_spend = m
            if month_of_min_spend is None or m["expense"] < month_of_min_spend["expense"]:
                month_of_min_spend = m
        if m["income"] > 0 and m["savings_rate"] > best_savings_rate:
            best_savings_rate = m["savings_rate"]
            best_savings_month = m

    yearly_savings = yearly_income - yearly_expense
    yearly_savings_rate = round((yearly_savings / max(yearly_income, 1)) * 100, 1) if yearly_income > 0 else 0

    # Top 5 categories year-wide
    top_cats_list = sorted(yearly_cat.items(), key=lambda x: x[1], reverse=True)[:5]
    top_cats_total = sum(v for _, v in top_cats_list) or 1
    top_cats = [
        {"name": k, "amount": round(v, 2), "pct": round((v / top_cats_total) * 100, 1)}
        for k, v in top_cats_list
    ]

    # Month-over-month momentum
    non_zero = [m for m in monthly if m["expense"] > 0]
    momentum = "steady"
    momentum_pct = 0
    if len(non_zero) >= 2:
        first_half = non_zero[:len(non_zero) // 2]
        second_half = non_zero[len(non_zero) // 2:]
        first_avg = sum(m["expense"] for m in first_half) / max(len(first_half), 1)
        second_avg = sum(m["expense"] for m in second_half) / max(len(second_half), 1)
        if first_avg > 0:
            momentum_pct = round(((second_avg - first_avg) / first_avg) * 100, 1)
            if momentum_pct > 15:
                momentum = "rising"
            elif momentum_pct < -15:
                momentum = "falling"

    # Yearly narrative headline
    if yearly_expense == 0:
        headline = "No spending tracked yet — add transactions to see your year"
    elif yearly_savings_rate >= 30:
        headline = f"Stellar year! You saved {yearly_savings_rate}% · ₹{int(yearly_savings):,}"
    elif yearly_savings_rate >= 15:
        headline = f"Good year. {yearly_savings_rate}% savings rate · push for 30%+"
    elif yearly_savings_rate >= 0:
        headline = f"Tight year — {yearly_savings_rate}% savings. Time to cut discretionary spend"
    else:
        headline = f"Spending exceeded income by ₹{int(abs(yearly_savings)):,} — review recurring bills"

    return {
        "mode": mode,
        "label": label,
        "year": year if year > 0 else now.year,
        "monthly": monthly,
        "yearly": {
            "income": round(yearly_income, 2),
            "expense": round(yearly_expense, 2),
            "savings": round(yearly_savings, 2),
            "savings_rate": yearly_savings_rate,
            "avg_monthly_spend": round(yearly_expense / 12, 2),
            "avg_monthly_income": round(yearly_income / 12, 2),
            "txn_count": len(txns),
        },
        "top_categories": top_cats,
        "momentum": {
            "direction": momentum,
            "change_pct": momentum_pct,
            "commentary": (
                f"Your spending rose {momentum_pct}% in the second half" if momentum == "rising"
                else f"Your spending fell {abs(momentum_pct)}% in the second half — great job!" if momentum == "falling"
                else "Your spending stayed steady across the year"
            ),
        },
        "highlights": {
            "highest_spend_month": month_of_max_spend,
            "lowest_spend_month": month_of_min_spend,
            "best_savings_month": best_savings_month,
        },
        "headline": headline,
    }


