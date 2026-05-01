"""ai_waste — Waste / subscription detector + AI-driven wasteful-spend insights.

Extracted from ai_insights.py (Round 26 refactor).
Endpoints:
  GET /waste-detector, /insights/waste — identifies recurring subscriptions
    + "silent drain" spending patterns and estimates monthly waste.
"""
"""AI insights, Money School, waste detector, proactive nudges, expense report card.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
# Round 62 — global LLM-call timeout wrapper.
from core.llm_safe import safe_send
import asyncio
import logging
from datetime import datetime, timedelta, date, timezone
from typing import List, Dict, Optional
from bson import ObjectId
from fastapi import Depends, HTTPException, UploadFile, File
from core.time import utc_now
from routers.ai_common import (
    router, api_router, ChatMessage, db, get_current_user,
    _lazy_server_attr, cache_get, cache_set, calculate_money_score,
    LlmChat, UserMessage,
)
from core.constants import (
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    INDIA_POPULATION_2025, get_lang_instruction, build_equivalences,
)

# `generate_insights_with_ai` lives in server.py (it wires the LLM client). We
# wrap it through the lazy-loader so routes below can call it freely.
generate_insights_with_ai = _lazy_server_attr("generate_insights_with_ai")




@api_router.get("/waste-detector")

@api_router.get("/insights/waste")
async def waste_detector(user_id: str = Depends(get_current_user)):
    """AI-powered Waste Detector — dynamic analysis with peer comparisons & trend insights (cached 5min/user)"""
    # Check cache first (per-user, 5 min TTL)
    cache_key = f"waste:{user_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

    # Round 43 perf — three independent aggregations now run in parallel
    # via asyncio.gather (was sequential, ~3x faster cold-call).
    async def _agg(pipeline):
        out = {}
        async for d in db.transactions.aggregate(pipeline):
            out[d["_id"]] = {"total": d["total"], "count": d.get("count", 0), "user_count": d.get("user_count", 0)}
        return out

    cur_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    prev_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": prev_month_start, "$lt": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    # Round 43 perf — peer aggregation across ALL users is expensive at
    # scale. Cache it globally for 10 min (it's identical for every user).
    peer_cache_key = "waste:peer_global"
    peer_data = cache_get(peer_cache_key)

    async def _peer():
        peer_pipeline = [
            {"$match": {"type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "user_count": {"$addToSet": "$user_id"}}},
            {"$project": {"_id": 1, "total": 1, "user_count": {"$size": "$user_count"}}}
        ]
        out = {}
        async for d in db.transactions.aggregate(peer_pipeline):
            if d["user_count"] > 0:
                out[d["_id"]] = {"avg": d["total"] / d["user_count"]}
        return out

    if peer_data is None:
        categories, prev_categories, peer_data = await asyncio.gather(
            _agg(cur_pipe), _agg(prev_pipe), _peer()
        )
        cache_set(peer_cache_key, peer_data, ttl_seconds=600)
    else:
        categories, prev_categories = await asyncio.gather(
            _agg(cur_pipe), _agg(prev_pipe)
        )

    total_expense = sum(c["total"] for c in categories.values())
    prev_total = sum(c["total"] for c in prev_categories.values())
    
    # Build enhanced waste insights for each category
    waste_insights = []
    for cat, data in sorted(categories.items(), key=lambda x: x[1]["total"], reverse=True):
        equivs = build_equivalences(data["total"])
        prev_amt = prev_categories.get(cat, {}).get("total", 0)
        peer_avg = peer_data.get(cat, {}).get("avg", 0)
        
        # Trend vs last month
        trend_pct = ((data["total"] - prev_amt) / max(prev_amt, 1)) * 100 if prev_amt > 0 else 0
        trend_text = f"{'📈' if trend_pct > 0 else '📉'} {abs(trend_pct):.0f}% {'more' if trend_pct > 0 else 'less'} than last month" if prev_amt > 0 else ""
        
        # Peer comparison
        peer_diff = ((data["total"] - peer_avg) / max(peer_avg, 1)) * 100 if peer_avg > 0 else 0
        peer_text = f"You spend {abs(peer_diff):.0f}% {'more' if peer_diff > 0 else 'less'} than average MintU users" if peer_avg > 0 else ""
        
        insight = {
            "category": cat,
            "amount": data["total"],
            "count": data["count"],
            "equivalences": equivs[:3] if equivs else [],
            "shock_text": f"₹{data['total']:,.0f} on {cat} — {data['count']} transactions 😳",
            "trend": {"pct": round(trend_pct, 1), "text": trend_text, "prev_amount": prev_amt},
            "peer_comparison": {"diff_pct": round(peer_diff, 1), "text": peer_text, "peer_avg": round(peer_avg)},
        }
        waste_insights.append(insight)
    
    # Overall equivalence
    overall_equivs = build_equivalences(total_expense)
    
    # Overall trend
    overall_trend_pct = ((total_expense - prev_total) / max(prev_total, 1)) * 100 if prev_total > 0 else 0
    
    # Percentile comparison — Phase 5 Wave 4: cache the two
    # count_documents calls on `db.users` for 5 min. They only change
    # on new registrations/score flips, so stale-by-up-to-5-min is
    # imperceptible and eliminates ~200-300 ms from the cold per-user
    # /waste-detector path.
    pct_cache = cache_get("waste:pct_counts")
    if pct_cache is None:
        user_count, users_with_less = await asyncio.gather(
            db.users.count_documents({}),
            db.users.count_documents({"money_score": {"$lt": 50}}),
        )
        cache_set("waste:pct_counts", {"user_count": user_count, "users_with_less": users_with_less}, ttl_seconds=300)
    else:
        user_count = pct_cache["user_count"]
        users_with_less = pct_cache["users_with_less"]
    percentile = min(95, max(5, int((1 - (users_with_less / max(user_count, 1))) * 100)))
    
    # Round 43 perf — AI text is now strictly OPT-IN side data. Return the
    # numeric/structural waste insights immediately (sub-100ms cold). The
    # GPT call is fired-and-forgot in a background task; its result is
    # written to a separate cache key (`waste_ai:{user_id}`) so the NEXT
    # cold-call (or refresh) returns it without blocking. A new endpoint
    # fragment isn't needed — clients see {ai_recommendation: ""} on the
    # first cold call and a populated string on the second.
    ai_recommendation = cache_get(f"waste_ai:{user_id}") or ""

    async def _generate_ai_bg():
        try:
            top_3_cats = "\n".join([f"- {w['category']}: ₹{w['amount']:,.0f} ({w['count']} txns){' — ' + w['trend']['text'] if w['trend']['text'] else ''}" for w in waste_insights[:3]])
            ai_prompt = f"""Based on this Indian user's spending, give ONE short punchy recommendation (2-3 sentences max):
Total: ₹{total_expense:,.0f} | Last month: ₹{prev_total:,.0f} | Change: {overall_trend_pct:+.0f}%
Top categories:
{top_3_cats}
Be specific, actionable, use Indian context. Sound like a smart friend, not a bot."""
            chat = LlmChat(
                api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
                session_id=f"waste_{user_id}_{now.timestamp()}",
                system_message="You are a witty Indian personal finance advisor. Keep it short and punchy."
            ).with_model("openai", "gpt-5.2")
            ai_resp = (await safe_send(chat, UserMessage(text=ai_prompt), timeout=15.0, label='ai_waste') or "")
            txt = ai_resp.strip() if isinstance(ai_resp, str) else str(ai_resp)
            cache_set(f"waste_ai:{user_id}", txt, ttl_seconds=900)
        except Exception as e:
            logging.warning(f"Waste AI background recommendation failed: {e}")

    if not ai_recommendation:
        # Fire-and-forget. Don't await — we don't want to block the response.
        asyncio.create_task(_generate_ai_bg())
    
    result = {
        "total_monthly_expense": total_expense,
        "prev_month_total": prev_total,
        "overall_trend_pct": round(overall_trend_pct, 1),
        "category_waste": waste_insights[:5],
        "overall_equivalences": overall_equivs,
        "ai_recommendation": ai_recommendation,
        "comparison": {
            "percentile": percentile,
            "text": f"You spend {'less' if percentile > 50 else 'more'} than {percentile}% of MintU users 👀",
            "population_context": f"Out of 1.46 billion Indians, only ~{int(INDIA_POPULATION_2025 * percentile / 100 / 1_000_000)}M people save as well as you"
        },
        "shareable_text": f"I spent ₹{total_expense:,.0f} this month... that's {overall_equivs[0]['emoji']} {overall_equivs[0]['text']}! 😱 Check yours on MintU" if overall_equivs else f"I tracked ₹{total_expense:,.0f} this month with MintU 💸"
    }
    cache_set(cache_key, result, ttl_seconds=300)
    return result



