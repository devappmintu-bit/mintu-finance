"""core/cache_warmup.py — Pre-warm LLM caches for active users.

Round 70 — Architectural pass companion to ``core/llm_cache.py``.

Why
---
``llm_cache.get_or_regen`` returns a deterministic fallback on a cold miss
and kicks a background regen so the *next* call gets the LLM-enriched copy.
That's perfect for response-time but it means the *first* call of the day
for an active user still sees the placeholder. This warmup loop closes
that gap by periodically hitting ``get_or_regen`` for each active user's
canonical keys, ensuring the cache is hot before they open the app.

How
---
A single ``_llm_cache_warmup_loop()`` task runs on app boot. Every 30 min:

1. Scan ``users`` for accounts with ``last_login`` (or ``last_active_at``)
   in the last 7 days. Hard cap at 200 users per pass to bound LLM cost.
2. For each user, kick warmup for their three canonical keys
   (insights, monthly report, daily school lesson) via ``get_or_regen``.
   ``get_or_regen`` already dedupes per key so concurrent passes don't
   fan-out duplicate LLM calls.
3. Run with bounded concurrency (4 simultaneous regens) so we don't burst
   the LiteLLM provider's per-key concurrency limit.

Cost ceiling: 200 users × 3 keys × 1 call/day ≈ 600 LLM calls/day worst
case. In practice, ``get_or_regen`` short-circuits when entries are
already fresh, so steady-state cost is much lower (only cold/stale
entries trigger a real LLM call).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Tuple, Optional

from core.time import utc_now

logger = logging.getLogger(__name__)

# Tunables — kept conservative to avoid blowing through the LiteLLM
# rate limit during warmup bursts.
ACTIVE_WINDOW_DAYS = 7
MAX_USERS_PER_PASS = 200
WARMUP_INTERVAL_SECONDS = 30 * 60     # every 30 min
PER_PASS_CONCURRENCY = 4               # max parallel regens
INITIAL_BOOT_DELAY_SECONDS = 30        # wait for primary request traffic


# ─────────────────────────────────────────────────────────────────────
#  Warmup task builders
# ─────────────────────────────────────────────────────────────────────
async def _warmup_insights(user_id: str) -> None:
    """Pre-warm the weekly insights cache (key: insights_v2:{uid}:{YYYY-WK}).

    Internally calls ``generate_insights_with_ai`` which already
    short-circuits to ``llm_cache.get_or_regen`` — so calling this
    when the cache is fresh is essentially free (one DB read).
    """
    try:
        from core.ai_helpers import generate_insights_with_ai
        from routers.ai_common import calculate_money_score
        from core import db

        money_score = await calculate_money_score(user_id)
        seven_days_ago = utc_now() - timedelta(days=7)
        cursor = db.transactions.find({
            "user_id": user_id,
            "type": "debit",
            "date": {"$gte": seven_days_ago},
        })
        spending: Dict[str, float] = {}
        async for t in cursor:
            cat = t.get("category", "Other")
            spending[cat] = spending.get(cat, 0) + float(t.get("amount", 0) or 0)
        # Discard return; we only care that the cache is touched.
        await generate_insights_with_ai(user_id, money_score, spending, lang="en")
    except Exception as e:
        logger.debug(f"warmup_insights({user_id}): {type(e).__name__}: {e}")


async def _warmup_expense_report(user_id: str) -> None:
    """Pre-warm the monthly expense report cache (key:
    insights_report:{uid}:{YYYY-MM}).

    Reproduces the data-prep + ``get_or_regen`` from the
    /reports/ai-expense-card endpoint, then awaits the cache call.
    """
    try:
        import os
        import json as _json
        from core import db
        from core.llm_cache import get_or_regen
        from core.llm_safe import safe_send

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception:
            return

        now = utc_now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

        pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]},
                        "date": {"$gte": month_start}}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]
        categories: Dict[str, Dict[str, Any]] = {}
        async for doc in db.transactions.aggregate(pipeline):
            categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}

        prev_pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]},
                        "date": {"$gte": prev_month_start, "$lt": month_start}}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        ]
        prev_total = 0
        async for doc in db.transactions.aggregate(prev_pipeline):
            prev_total += doc["total"]

        total = sum(c["total"] for c in categories.values())
        txn_count = sum(c["count"] for c in categories.values())
        income_pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]},
                        "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        income = 0
        async for doc in db.transactions.aggregate(income_pipeline):
            income = doc["total"]
        savings_rate = round(((income - total) / max(income, 1)) * 100) if income > 0 else 0
        cat_summary = "\n".join([
            f"- {cat}: ₹{d['total']:,.0f} ({d['count']} txns)"
            for cat, d in sorted(categories.items(), key=lambda x: x[1]["total"], reverse=True)[:6]
        ])

        cache_key = f"insights_report:{user_id}:{now.strftime('%Y-%m')}"
        fallback_report = {
            "headline": "Your Monthly Snapshot",
            "health_grade": "B",
            "health_color": "yellow",
            "savings_rate": savings_rate,
            "top_insight": f"You spent ₹{total:,.0f} across {len(categories)} categories this month.",
            "highlights": [],
            "recommendations": [],
            "comparison_text": "",
        }

        async def _compute_report():
            try:
                prompt = (
                    f"Generate a personalized monthly expense report for an Indian user:\n"
                    f"Income: ₹{income:,.0f} | Expenses: ₹{total:,.0f} | Savings Rate: {savings_rate}%\n"
                    f"Last Month Expenses: ₹{prev_total:,.0f}\n"
                    f"Transaction Count: {txn_count}\n"
                    f"Category Breakdown:\n{cat_summary}\n\n"
                    "Generate a JSON report with these EXACT keys: "
                    "{\"headline\": str, \"health_grade\": \"A/B/C/D/F\", "
                    "\"health_color\": \"green/yellow/red\", "
                    f"\"savings_rate\": {savings_rate}, "
                    "\"top_insight\": str, \"highlights\": [str], "
                    "\"recommendations\": [str], \"comparison_text\": str}\n"
                    "Return ONLY valid JSON."
                )
                chat = LlmChat(
                    api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
                    session_id=f"warmup_report_{user_id}_{now.timestamp()}",
                    system_message="You are a certified financial planner analyzing an Indian user's expenses.",
                ).with_model("openai", "gpt-5.2")
                resp = (await safe_send(chat, UserMessage(text=prompt), timeout=15.0, label='cache_warmup') or "")
                resp_text = resp.strip() if isinstance(resp, str) else str(resp)
                if not resp_text:
                    return None
                return _json.loads(resp_text) if resp_text.startswith("{") \
                    else _json.loads(resp_text[resp_text.index("{"):resp_text.rindex("}") + 1])
            except Exception:
                return None

        await get_or_regen(
            key=cache_key,
            compute_fn=_compute_report,
            ttl_fresh=600,
            ttl_stale=7 * 86400,
            fallback=fallback_report,
        )
    except Exception as e:
        logger.debug(f"warmup_expense_report({user_id}): {type(e).__name__}: {e}")


async def _warmup_school_daily(user_id: str) -> None:
    """Pre-warm today's Money School daily personalized tip
    (key: school_daily:{uid}:en:{day_index})."""
    try:
        import os
        from datetime import date
        from core import db
        from core.llm_cache import get_or_regen
        from core.llm_safe import safe_send
        from core.constants import MONEY_SCHOOL_LESSONS, get_lang_instruction

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception:
            return

        day_index = date.today().toordinal() % len(MONEY_SCHOOL_LESSONS)
        lesson = MONEY_SCHOOL_LESSONS[day_index]
        cache_key = f"school_daily:{user_id}:en:{day_index}"
        fallback_tip = lesson["tip"]

        thirty_days_ago = utc_now() - timedelta(days=30)
        cursor = db.transactions.find({
            "user_id": user_id, "type": "debit",
            "date": {"$gte": thirty_days_ago},
        })
        total_spent = 0
        top_cat: Dict[str, float] = {}
        async for t in cursor:
            amt = float(t.get("amount", 0) or 0)
            total_spent += amt
            cat = t.get("category", "Other")
            top_cat[cat] = top_cat.get(cat, 0) + amt
        top_category = max(top_cat, key=top_cat.get) if top_cat else "Food"

        async def _compute() -> Optional[str]:
            try:
                lang_instr = get_lang_instruction("en")
                chat = LlmChat(
                    api_key=os.environ['EMERGENT_LLM_KEY'],
                    session_id=f"warmup_school_{user_id}_{utc_now().timestamp()}",
                    system_message="You are MintU's financial literacy buddy. Give ONE short personalized tip (1-2 sentences) connecting the lesson topic to user's actual spending. Be warm and specific with numbers. Use ₹." + lang_instr,
                ).with_model("openai", "gpt-5.2")
                msg = f"Lesson: {lesson['title']}. User spent ₹{total_spent:.0f} this month, top category: {top_category}."
                resp = (await safe_send(chat, UserMessage(text=msg), timeout=15.0, label='cache_warmup') or "")
                tip = resp.strip() if isinstance(resp, str) else str(resp).strip()
                return tip or None
            except Exception:
                return None

        await get_or_regen(
            key=cache_key,
            compute_fn=_compute,
            ttl_fresh=6 * 3600,
            ttl_stale=7 * 86400,
            fallback=fallback_tip,
        )
    except Exception as e:
        logger.debug(f"warmup_school_daily({user_id}): {type(e).__name__}: {e}")


# ─────────────────────────────────────────────────────────────────────
#  Per-pass driver
# ─────────────────────────────────────────────────────────────────────
async def _run_warmup_pass(db) -> Tuple[int, int]:
    """One full pass: pick active users, fire warmup tasks bounded by
    ``PER_PASS_CONCURRENCY``. Returns (users_visited, errors)."""
    cutoff = utc_now() - timedelta(days=ACTIVE_WINDOW_DAYS)

    # Active = recent login OR recent activity timestamp. Either field
    # gates qualification; both are common in this codebase depending
    # on the auth path the user signed in through.
    cursor = db.users.find(
        {"$or": [
            {"last_login": {"$gte": cutoff}},
            {"last_active_at": {"$gte": cutoff}},
        ]},
        {"_id": 1},
    ).limit(MAX_USERS_PER_PASS)

    user_ids: List[str] = []
    async for u in cursor:
        user_ids.append(str(u["_id"]))

    if not user_ids:
        return (0, 0)

    sem = asyncio.Semaphore(PER_PASS_CONCURRENCY)
    err_count = 0

    warmup_tasks: List[Callable] = [
        _warmup_insights,
        _warmup_expense_report,
        _warmup_school_daily,
    ]

    async def _bounded(task_fn, uid):
        nonlocal err_count
        async with sem:
            try:
                await task_fn(uid)
            except Exception:
                err_count += 1

    coros: List[Any] = []
    for uid in user_ids:
        for task_fn in warmup_tasks:
            coros.append(_bounded(task_fn, uid))

    await asyncio.gather(*coros, return_exceptions=True)
    return (len(user_ids), err_count)


async def llm_cache_warmup_loop(db) -> None:
    """Background worker entry-point. Started by ``core.lifecycle``."""
    await asyncio.sleep(INITIAL_BOOT_DELAY_SECONDS)
    while True:
        try:
            users_n, err_n = await _run_warmup_pass(db)
            if users_n > 0:
                logger.info(
                    f"🔥 LLM cache warmup pass: {users_n} active users · "
                    f"{err_n} errors"
                )
        except Exception as e:
            logger.warning(f"llm_cache_warmup_loop iteration failed: {e}")
        await asyncio.sleep(WARMUP_INTERVAL_SECONDS)


__all__ = ["llm_cache_warmup_loop"]
