"""split_insights.py — AI-powered insights + fun facts for Split tab.

Endpoints:
  GET /split/insights    — returns a list of insight cards for the Split hero:
                            - savings_month, total_split_month, most_active_group,
                              top_creditor, top_debtor, streak, fun_fact (GPT-5.2)

Designed to be called ONCE on Split tab mount (cheap — single aggregate pipeline).
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from bson import ObjectId

from core import db, get_current_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["split-insights"])
api_router = router


@api_router.get("/split/insights")
async def split_insights(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Compile lively, motivating stats for the Split tab hero.

    Keeps DB queries tight (one aggregate per dimension) so the tab stays snappy.
    """
    # Current calendar month window
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # --- 1) Total amount split this month (sum of expenses where user is a participant)
    total_this_month = 0.0
    expense_count = 0
    try:
        pipe = [
            {"$match": {
                "participants": user_id,
                "created_at": {"$gte": month_start},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]
        async for doc in db.split_expenses.aggregate(pipe):
            total_this_month = float(doc.get("total", 0))
            expense_count = int(doc.get("count", 0))
    except Exception:
        pass

    # --- 2) Savings = half of amount split (crude heuristic — shows value of splitting)
    # Better: for each expense, your share = amount / n_participants. The "savings" is
    # amount - your_share = amount * (n-1)/n. We approximate as 70% of total (avg 3 ppl).
    est_savings = round(total_this_month * 0.66, 0)

    # --- 3) Most-active group (by expense count this month)
    most_active = None
    try:
        pipe = [
            {"$match": {"participants": user_id, "created_at": {"$gte": month_start}}},
            {"$group": {"_id": "$group_id", "count": {"$sum": 1}, "total": {"$sum": "$amount"}}},
            {"$sort": {"count": -1}},
            {"$limit": 1},
        ]
        async for doc in db.split_expenses.aggregate(pipe):
            gid = doc["_id"]
            if gid:
                try:
                    g = await db.split_groups.find_one({"_id": ObjectId(gid) if not isinstance(gid, ObjectId) else gid})
                    if g:
                        most_active = {
                            "group_id": str(g["_id"]),
                            "group_name": g.get("name", "Group"),
                            "count": int(doc["count"]),
                            "total": float(doc["total"]),
                        }
                except Exception:
                    pass
    except Exception:
        pass

    # --- 4) Top debtor (who owes me the most) + top creditor (whom I owe the most)
    #     Compute across all groups via embedded expenses — balances endpoint does this live.
    top_debtor = None
    top_creditor = None
    try:
        balances = await db.split_balances_cache.find_one({"user_id": user_id}) or {}
        by_user = balances.get("by_user") or {}
        debtors = [(uid, info) for uid, info in by_user.items() if info.get("net", 0) > 0]
        creditors = [(uid, info) for uid, info in by_user.items() if info.get("net", 0) < 0]
        if debtors:
            debtors.sort(key=lambda x: -x[1].get("net", 0))
            top = debtors[0]
            top_debtor = {"user_id": top[0], "name": top[1].get("name", "Friend"), "amount": top[1].get("net", 0)}
        if creditors:
            creditors.sort(key=lambda x: x[1].get("net", 0))
            top = creditors[0]
            top_creditor = {"user_id": top[0], "name": top[1].get("name", "Friend"), "amount": abs(top[1].get("net", 0))}
    except Exception:
        pass

    # --- 5) Settlement streak — consecutive days with at least one settlement in last 30 days
    streak = 0
    try:
        window_start = now - timedelta(days=30)
        cur = db.split_settlements.find({"from_user_id": user_id, "created_at": {"$gte": window_start}})
        days = set()
        async for doc in cur:
            d = doc.get("created_at")
            if isinstance(d, datetime):
                days.add(d.date())
        # Walk back from today counting consecutive days
        d = now.date()
        while d in days:
            streak += 1
            d -= timedelta(days=1)
    except Exception:
        pass

    # --- 6) Friends count across groups
    friends = 0
    try:
        groups = await db.split_groups.find({"members": user_id}).to_list(100)
        member_set = set()
        for g in groups:
            for m in (g.get("members") or []):
                if m != user_id:
                    member_set.add(m)
        friends = len(member_set)
    except Exception:
        pass

    # --- 7) AI fun fact — cached per-user per-day, GPT-5.2 generated
    fun_fact = await _fun_fact_for_user(user_id, {
        "total_this_month": total_this_month,
        "savings": est_savings,
        "expense_count": expense_count,
        "most_active_name": (most_active or {}).get("group_name"),
        "friends": friends,
        "streak": streak,
    })

    # --- 8) Insight cards — shaped for the frontend carousel
    cards: List[Dict[str, Any]] = []
    if total_this_month > 0:
        cards.append({
            "id": "savings",
            "emoji": "💰",
            "title": f"₹{int(est_savings):,}",
            "subtitle": "you've saved splitting this month",
            "color": "#10B981",
        })
    if expense_count > 0:
        cards.append({
            "id": "activity",
            "emoji": "⚡",
            "title": f"{expense_count} expense{'s' if expense_count != 1 else ''}",
            "subtitle": f"split across {len((await db.split_groups.find({'members': user_id}).to_list(100)) or [])} group{'s' if friends > 1 else ''}",
            "color": "#F56E1E",
        })
    if most_active:
        cards.append({
            "id": "active_group",
            "emoji": "🔥",
            "title": most_active["group_name"],
            "subtitle": f"your most active group · {most_active['count']} expenses",
            "color": "#E11D48",
        })
    if streak >= 1:
        cards.append({
            "id": "streak",
            "emoji": "🏃",
            "title": f"{streak}-day streak",
            "subtitle": "settling up daily — keep going!",
            "color": "#F59E0B",
        })
    if top_debtor:
        cards.append({
            "id": "top_debtor",
            "emoji": "📥",
            "title": f"₹{int(top_debtor['amount'])}",
            "subtitle": f"{top_debtor['name']} owes you the most",
            "color": "#059669",
        })
    if top_creditor:
        cards.append({
            "id": "top_creditor",
            "emoji": "📤",
            "title": f"₹{int(top_creditor['amount'])}",
            "subtitle": f"you owe {top_creditor['name']} the most",
            "color": "#DC2626",
        })
    if friends > 0:
        cards.append({
            "id": "friends",
            "emoji": "👥",
            "title": f"{friends} friend{'s' if friends != 1 else ''}",
            "subtitle": "in your split squad",
            "color": "#7C3AED",
        })
    if fun_fact:
        cards.append({
            "id": "ai_fact",
            "emoji": "🤖",
            "title": "AI Insight",
            "subtitle": fun_fact,
            "color": "#0EA5E9",
        })

    # Default card when user has zero activity — keeps the hero lively
    if not cards:
        cards.append({
            "id": "zero_state",
            "emoji": "✨",
            "title": "Start splitting",
            "subtitle": "Create a group and add your first expense — we'll do the math",
            "color": "#F56E1E",
        })

    return {
        "cards": cards,
        "total_this_month": total_this_month,
        "est_savings": est_savings,
        "expense_count": expense_count,
        "most_active": most_active,
        "top_debtor": top_debtor,
        "top_creditor": top_creditor,
        "streak": streak,
        "friends": friends,
        "fun_fact": fun_fact,
    }


# ══════════════════════════════════════════════════════════════════
# AI fun-fact generator (cached)
# ══════════════════════════════════════════════════════════════════
_FACT_CACHE: Dict[str, Dict[str, Any]] = {}


async def _fun_fact_for_user(user_id: str, stats: Dict[str, Any]) -> str:
    """Return a 1-line witty fun fact about the user's splitting behaviour.

    Cached per-user for 6 hours. Graceful fallback if LLM fails.
    """
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_key = f"{user_id}:{today_key}"
    hit = _FACT_CACHE.get(cache_key)
    if hit and (datetime.now(timezone.utc) - hit["ts"]).seconds < 21600:
        return hit["fact"]

    # Skip LLM if zero activity — nothing interesting to say
    if (stats.get("total_this_month") or 0) == 0 and (stats.get("expense_count") or 0) == 0:
        return ""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not api_key:
            return _fallback_fact(stats)
        sys_msg = (
            "You are a witty, upbeat finance buddy. Return ONE LINE (max 90 chars) "
            "that feels fun, personal and playful, using 1 emoji and no hashtags. "
            "Reference one of the provided stats. No preamble, no quotes, just the line."
        )
        prompt = (
            f"User stats this month:\n"
            f"- Total split: ₹{stats.get('total_this_month', 0):.0f}\n"
            f"- Estimated savings: ₹{stats.get('savings', 0):.0f}\n"
            f"- Expense count: {stats.get('expense_count', 0)}\n"
            f"- Most active group: {stats.get('most_active_name') or 'none'}\n"
            f"- Friends in split squad: {stats.get('friends', 0)}\n"
            f"- Settlement streak: {stats.get('streak', 0)} days\n\n"
            f"Write one witty line."
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=f"split_fact_{user_id}_{today_key}",
            system_message=sys_msg,
        ).with_model("openai", "gpt-5.2")
        resp = await chat.send_message(UserMessage(text=prompt))
        fact = (resp or "").strip().strip('"').strip("'")[:110]
        if not fact:
            fact = _fallback_fact(stats)
        _FACT_CACHE[cache_key] = {"ts": datetime.now(timezone.utc), "fact": fact}
        return fact
    except Exception as e:
        log.warning(f"split fun_fact failed: {e}")
        return _fallback_fact(stats)


def _fallback_fact(stats: Dict[str, Any]) -> str:
    if stats.get("streak", 0) >= 3:
        return "🔥 Settling daily like a pro — your friends love you for it"
    if stats.get("total_this_month", 0) > 5000:
        return "💪 Big month on splits — trust you're tracking every rupee"
    if stats.get("expense_count", 0) >= 3:
        return "🎯 Consistent splitter — the group's unofficial treasurer"
    return "✨ Small splits compound — every ₹100 counts"
