"""Premium-only deep reports — personalized analytics for paying users.

Aggregates 6-12 months of transactions into chart-ready + table-ready data
for the Premium Reports screen. Gated: returns 403 when user is not premium.
Also returns an AI-generated executive summary (GPT-4o via EMERGENT_LLM_KEY).
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from core import db, get_current_user
from core.users import get_user_by_id
from core.time import utc_now

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    # Round 62 — global LLM-call timeout wrapper.
    from core.llm_safe import safe_send
except Exception:  # pragma: no cover
    LlmChat = UserMessage = None  # type: ignore

router = APIRouter(tags=["premium"])
api_router = router


async def _is_premium(user_id: str) -> bool:
    try:
        user = await get_user_by_id(user_id)
    except Exception:
        return False
    if not user:
        return False
    tier = user.get("premium_tier", "free")
    until = user.get("premium_until")
    if isinstance(until, datetime) and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return tier in ("premium", "legend") and (until is None or until > utc_now())


@api_router.get("/premium/deep-report")
async def deep_report(
    months: int = Query(6, ge=1, le=12),
    user_id: str = Depends(get_current_user),
):
    """Personalized deep-insights report. Returns JSON ready to render
    charts, tables and an executive summary. Premium users only."""
    if not await _is_premium(user_id):
        raise HTTPException(status_code=403, detail="Premium subscription required")

    now = utc_now()
    since = now - timedelta(days=30 * months)

    cursor = db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": since},
    })
    txns = await cursor.to_list(20000)

    # Aggregations ----------------------------------------------------
    income_total = 0.0
    expense_total = 0.0
    by_month: dict = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    by_category: dict = defaultdict(float)
    by_merchant: dict = defaultdict(float)
    txn_count = 0

    for t in txns:
        amt = float(t.get("amount", 0) or 0)
        kind = t.get("type", "debit")
        dt = t.get("date")
        if not isinstance(dt, datetime):
            continue
        month_key = dt.strftime("%Y-%m")
        txn_count += 1
        if kind == "credit":
            income_total += amt
            by_month[month_key]["income"] += amt
        else:
            expense_total += amt
            by_month[month_key]["expense"] += amt
            cat = t.get("category", "Other") or "Other"
            by_category[cat] += amt
            merchant = (t.get("merchant") or t.get("description") or "").strip() or "Unknown"
            by_merchant[merchant] += amt

    # Series (sorted) -------------------------------------------------
    sorted_months = sorted(by_month.keys())
    monthly_series = [
        {
            "month": m,
            "income": round(by_month[m]["income"], 2),
            "expense": round(by_month[m]["expense"], 2),
            "net": round(by_month[m]["income"] - by_month[m]["expense"], 2),
        }
        for m in sorted_months
    ]

    # Top categories
    total_exp = expense_total or 1.0
    top_categories = sorted(
        [{"name": k, "amount": round(v, 2), "pct": round((v / total_exp) * 100, 1)} for k, v in by_category.items()],
        key=lambda x: -x["amount"],
    )[:10]

    top_merchants = sorted(
        [{"name": k, "amount": round(v, 2), "pct": round((v / total_exp) * 100, 1)} for k, v in by_merchant.items()],
        key=lambda x: -x["amount"],
    )[:10]

    # Derived metrics ------------------------------------------------
    avg_monthly_exp = expense_total / max(len(sorted_months), 1)
    avg_monthly_inc = income_total / max(len(sorted_months), 1)
    savings = income_total - expense_total
    savings_rate = round((savings / income_total) * 100, 1) if income_total > 0 else 0.0
    predicted_year_exp = round(avg_monthly_exp * 12, 2)
    predicted_year_save = round((avg_monthly_inc - avg_monthly_exp) * 12, 2)

    # Month-over-month growth
    mom_growth = 0.0
    if len(monthly_series) >= 2:
        last = monthly_series[-1]["expense"]
        prev = monthly_series[-2]["expense"] or 1
        mom_growth = round(((last - prev) / prev) * 100, 1)

    # Round 70 — AI exec summary now flows through llm_cache.
    # Request path NEVER blocks on the LLM; first caller gets a
    # deterministic placeholder, subsequent ones get the cached
    # AI summary as soon as the background regen lands.
    cache_key = f"premium_exec_summary:{user_id}:{months}m:{now.strftime('%Y-%m')}"

    fallback_exec = (
        f"Income ₹{int(income_total):,} · Expense ₹{int(expense_total):,} · "
        f"Savings rate {savings_rate}%. "
        f"Top category: {top_categories[0]['name'] if top_categories else 'N/A'} "
        f"({top_categories[0]['pct'] if top_categories else 0}% of spend). "
        f"Month-over-month change: {mom_growth}%."
    )

    async def _compute_summary():
        if not (LlmChat and UserMessage and os.environ.get("EMERGENT_LLM_KEY")):
            return None
        try:
            prompt = (
                f"Give a crisp 4-line executive summary for this user's finances in INR. "
                f"Total income ₹{int(income_total)}, expense ₹{int(expense_total)}, "
                f"savings rate {savings_rate}%, top category {top_categories[0]['name'] if top_categories else 'N/A'} "
                f"at {top_categories[0]['pct'] if top_categories else 0}% of spend. "
                f"Month-over-month expense change {mom_growth}%. Be specific, Indian context, use ₹."
            )
            chat = LlmChat(
                api_key=os.environ["EMERGENT_LLM_KEY"],
                session_id=f"deep_report_{user_id}_{now.timestamp()}",
                system_message="You are a CFA coaching an Indian user. Write 4 lines max, no markdown.",
            ).with_model("openai", "gpt-4o")
            resp = await safe_send(chat, UserMessage(text=prompt), timeout=15.0, label='premium_reports')
            text = (getattr(resp, "content", None) or str(resp) or "").strip()
            return text or None
        except Exception as e:
            logging.warning("deep_report summary failed: %s", e)
            return None

    from core.llm_cache import get_or_regen
    exec_summary = await get_or_regen(
        key=cache_key,
        compute_fn=_compute_summary,
        ttl_fresh=6 * 3600,        # 6h — execs read this once a day
        ttl_stale=14 * 86400,
        fallback=fallback_exec,
    ) or fallback_exec

    return {
        "range": {"months": months, "from": since.isoformat(), "to": now.isoformat()},
        "totals": {
            "income": round(income_total, 2),
            "expense": round(expense_total, 2),
            "savings": round(savings, 2),
            "savings_rate": savings_rate,
            "transaction_count": txn_count,
        },
        "averages": {
            "monthly_income": round(avg_monthly_inc, 2),
            "monthly_expense": round(avg_monthly_exp, 2),
            "mom_expense_growth_pct": mom_growth,
        },
        "predicted": {
            "year_expense": predicted_year_exp,
            "year_savings": predicted_year_save,
        },
        "monthly_series": monthly_series,
        "top_categories": top_categories,
        "top_merchants": top_merchants,
        "exec_summary": exec_summary,
        "generated_at": now.isoformat(),
    }
