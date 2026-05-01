"""core/ai_helpers.py — LLM-powered helpers extracted from server.py.

All helpers load their own dependencies lazily so the module can be imported
from anywhere without triggering circular imports against server.py.

Back-compat
-----------
`server.py` re-exports these names so existing call sites (``from server import
parse_sms_with_ai`` etc.) keep working unchanged.
"""
from __future__ import annotations

import os
import json as _json
import logging
from core.time import utc_now
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:  # pragma: no cover
    LlmChat = UserMessage = None  # type: ignore

# Round 62 — global LLM-call timeout wrapper. See core/llm_safe.py.
from core.llm_safe import safe_send  # noqa: E402

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  SMS PARSER
# ══════════════════════════════════════════════════════════════════════
async def parse_sms_with_ai(sms_text: str) -> Optional[Dict]:
    """Parse an Indian bank/UPI SMS into a transaction dict using LLM."""
    if LlmChat is None:
        return None
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"sms_parse_{utc_now().timestamp()}",
            system_message="""You are an expert at parsing Indian bank and payment app SMS messages.
            Extract transaction details and return ONLY a valid JSON object with these exact keys:
            {"amount": float, "category": string, "description": string, "type": "debit" or "credit", "merchant": string}

            Categories must be one of: Food, Transport, Shopping, Bills, Entertainment, Healthcare, Education, Investment, Other
            Type must be either "debit" or "credit"
            If you cannot parse the SMS, return: {"error": "Could not parse SMS"}
            """,
        ).with_model("openai", "gpt-5.2")

        response = await safe_send(
            chat,
            UserMessage(text=f"Parse this SMS and return JSON: {sms_text}"),
            timeout=8.0,
            label="parse_sms_with_ai",
        )
        if response is None:
            return None
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]

        parsed = _json.loads(response_text)
        if "error" in parsed:
            return None
        return parsed
    except Exception as e:
        logger.error(f"AI SMS parsing error: {str(e)}")
        return None


# ══════════════════════════════════════════════════════════════════════
#  WEEKLY INSIGHTS GENERATOR
# ══════════════════════════════════════════════════════════════════════
async def generate_insights_with_ai(
    user_id: str,
    money_score: int,
    spending_summary: Dict[str, float],
    lang: str = "en",
) -> Dict:
    """Generate personalized weekly insights using LLM + user's transaction context."""
    # Lazy imports to dodge circular-import pitfalls
    from core import db
    from core.constants import get_lang_instruction

    try:
        now = utc_now()
        this_week_start = now - timedelta(days=now.weekday())
        last_week_start = this_week_start - timedelta(days=7)

        this_week_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": this_week_start},
        }).to_list(1000)
        prev_week_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": last_week_start, "$lt": this_week_start},
        }).to_list(1000)

        this_week_total = sum(t["amount"] for t in this_week_txns if t.get("type") == "debit")
        prev_week_total = sum(t["amount"] for t in prev_week_txns if t.get("type") == "debit")
        week_trend = "up" if this_week_total > prev_week_total else "down" if this_week_total < prev_week_total else "flat"

        this_week_cats: Dict[str, float] = {}
        prev_week_cats: Dict[str, float] = {}
        for t in this_week_txns:
            if t.get("type") == "debit":
                cat = t.get("category", "Other")
                this_week_cats[cat] = this_week_cats.get(cat, 0) + t["amount"]
        for t in prev_week_txns:
            if t.get("type") == "debit":
                cat = t.get("category", "Other")
                prev_week_cats[cat] = prev_week_cats.get(cat, 0) + t["amount"]

        top_category = max(this_week_cats, key=this_week_cats.get) if this_week_cats else "None"

        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": month_start},
        }).to_list(2000)
        month_income = sum(t["amount"] for t in month_txns if t.get("type") == "credit")
        month_expense = sum(t["amount"] for t in month_txns if t.get("type") == "debit")
        savings_rate = ((month_income - month_expense) / month_income * 100) if month_income > 0 else 0

        budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
        budget_text = "\n".join(
            f"- {b['category']}: ₹{b.get('spent', 0):.0f}/₹{b['amount']:.0f}"
            for b in budgets
        ) or "No budgets set"

        alerts = []
        for b in budgets:
            spent = b.get("spent", 0)
            if spent >= b["amount"] * 0.8:
                pct = (spent / b["amount"]) * 100
                alerts.append(f"{b['category']} budget at {pct:.0f}%")

        spending_text = "\n".join(
            f"- {cat}: ₹{amt:.0f}"
            for cat, amt in sorted(this_week_cats.items(), key=lambda x: -x[1])[:5]
        )
        alerts_text = "\n".join(f"- {a}" for a in alerts) or "None"

        system_prompt = """You are MintU AI — India's smartest money coach. Generate personalized insights:

1. Use the user's FULL context: money score, weekly trend, top categories, budgets, alerts
2. Compare this week vs last week with specific numbers
3. Call out overspending with empathy, not judgment
4. Suggest ONE clear action they can take this week
5. Reference Indian saving habits: SIP, FD, gold, EPF
6. Keep it concise — max 3 sentences per insight
7. Use casual Indian English — "yaar", "solid", "chill" are ok sparingly

Return ONLY valid JSON:
{
  "daily_insight": "2-3 sentence personalized insight about today/this week",
  "weekly_summary": "3-4 sentence summary comparing this week vs last week",
  "recommendations": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
  "savings_tip": "One specific way to save money this month",
  "mood": "great" | "good" | "okay" | "concerning" | "alert"
}""" + get_lang_instruction(lang)

        user_prompt = f"""FINANCIAL SNAPSHOT:
- Money Score: {money_score}/100
- This week total spent: ₹{this_week_total:.0f}
- Last week total spent: ₹{prev_week_total:.0f}
- Week trend: {week_trend}
- Top spending category: {top_category}
- Monthly income: ₹{month_income:.0f} | Monthly expenses: ₹{month_expense:.0f}
- Savings rate: {savings_rate:.0f}%
- {len(this_week_txns)} transactions this week

CATEGORY BREAKDOWN (this week):
{spending_text}

BUDGETS SET:
{budget_text}

ALERTS DETECTED:
{alerts_text}

Generate personalized insights based on this data."""

        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"insights_v2_{user_id}_{now.timestamp()}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-5.2")
        # Round 62 — global LLM-call timeout. The legacy unbounded
        # send_message was the smoking gun behind the 30-57 s
        # `/api/profile/identity` and `/api/rewards/summary` traces
        # we saw in production access logs.
        response = await safe_send(
            chat,
            UserMessage(text=user_prompt),
            timeout=10.0,    # generous — heavy synthesis, ~6s P99
            label="generate_insights",
        )
        if response is None:
            # Fall back to a minimal "soft" insights payload so the UI
            # still renders something useful instead of erroring out.
            return {
                "insight_text": "Keep tracking your expenses.",
                "weekly_summary": "",
                "recommendations": [
                    "Track all your expenses",
                    "Set category budgets",
                    "Review spending weekly",
                ],
                "savings_tip": "",
                "mood": "good",
                "alerts": alerts,
                "trends": {},
            }

        response_text = response.strip()
        if response_text.startswith("```"):
            parts = response_text.split("```")
            response_text = parts[1] if len(parts) > 1 else parts[0]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        parsed = _json.loads(response_text)

        return {
            "insight_text": parsed.get("daily_insight", "Keep tracking your expenses!"),
            "weekly_summary": parsed.get("weekly_summary", ""),
            "recommendations": parsed.get("recommendations", [
                "Track all your expenses", "Set category budgets", "Review spending weekly"
            ]),
            "savings_tip": parsed.get("savings_tip", ""),
            "mood": parsed.get("mood", "good"),
            "alerts": alerts,
            "trends": {
                "this_week_total": this_week_total,
                "prev_week_total": prev_week_total,
                "week_change_pct": (
                    (this_week_total - prev_week_total) / prev_week_total * 100
                ) if prev_week_total > 0 else 0,
                "top_category": top_category,
                "savings_rate": savings_rate,
                "category_trends": {
                    cat: {
                        "this_week": this_week_cats.get(cat, 0),
                        "last_week": prev_week_cats.get(cat, 0),
                        "change_pct": (
                            (this_week_cats.get(cat, 0) - prev_week_cats.get(cat, 0))
                            / prev_week_cats.get(cat, 1) * 100
                        ) if prev_week_cats.get(cat, 0) > 0 else 0,
                    }
                    for cat in set(list(this_week_cats.keys()) + list(prev_week_cats.keys()))
                },
            },
        }
    except Exception as e:
        logger.error(f"AI insights v2 error: {str(e)}")
        return {
            "insight_text": "Keep up the good work tracking your finances!",
            "weekly_summary": "",
            "recommendations": [
                "Monitor your top spending categories",
                "Set budgets for better control",
                "Review your spending weekly",
            ],
            "savings_tip": "Try setting up a SIP to automate savings",
            "mood": "good",
            "alerts": [],
            "trends": {},
        }


# ══════════════════════════════════════════════════════════════════════
#  PUSH NOTIFICATIONS (Expo Push API)
# ══════════════════════════════════════════════════════════════════════
async def send_expo_push(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> bool:
    """Send a push notification via the Expo Push API."""
    if not token or not token.startswith("ExponentPushToken"):
        return False
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                "https://exp.host/--/api/v2/push/send",
                json={
                    "to": token, "title": title, "body": body,
                    "data": data or {}, "sound": "default",
                },
                headers={"Content-Type": "application/json"},
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Push send error: {e}")
        return False
