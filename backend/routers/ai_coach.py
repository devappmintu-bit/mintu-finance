"""AI coach chat (GPT-powered), agentic chat, voice transcription, memory, agent list.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
import math
import logging
from datetime import datetime, timedelta, date, timezone
from typing import List, Dict, Optional
from bson import ObjectId
from fastapi import Depends, HTTPException, UploadFile, File
from routers.ai_common import (
    router, api_router, ChatMessage, db, get_current_user,
    _lazy_server_attr, LlmChat, UserMessage, OpenAISpeechToText,
)
from core.constants import (
    AGENT_PROFILES, route_to_agent, get_lang_instruction,
)


def _fin(v, default: float = 0.0) -> float:
    """Return v coerced to a finite float. Non-finite → default (0)."""
    try:
        fv = float(v)
    except Exception:
        return float(default)
    if not math.isfinite(fv):
        return float(default)
    return fv


# ── /ai/chat — primary coach chat ─────────────────────────────────────────
@api_router.post("/ai/chat")
async def ai_financial_coach(msg: ChatMessage, user_id: str = Depends(get_current_user)):
    """AI Financial Coach — structured, data-aware, actionable (mirrors /ai/agent-chat format)."""
    
    # Gather user's financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate spending
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {}
    async for doc in db.transactions.aggregate(pipeline):
        t = _fin(doc.get("total"))
        c = int(doc.get("count", 0) or 0)
        category_spend[doc["_id"]] = {"total": t, "count": c}
    total_expense = _fin(sum(v["total"] for v in category_spend.values()))
    total_txn_count = sum(v["count"] for v in category_spend.values())
    
    # Income
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = _fin(income_docs[0]["total"]) if income_docs else 0.0
    income_count = int(income_docs[0]["count"]) if income_docs else 0
    
    # Budgets + duplicate detection
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    budget_cats = [b["category"] for b in budgets]
    duplicate_budgets = sorted({c for c in budget_cats if budget_cats.count(c) > 1})
    
    # Data mode
    if total_txn_count == 0:
        data_mode = "no_data"
    elif total_txn_count < 5 or income_count == 0:
        data_mode = "partial"
    else:
        data_mode = "full"
    
    # Detected issues
    detected_issues = []
    if duplicate_budgets:
        detected_issues.append(f"Duplicate budgets for: {', '.join(duplicate_budgets)}")
    if total_txn_count > 0 and income_count == 0:
        detected_issues.append("No income recorded this month — savings rate cannot be computed accurately")
    if total_txn_count == 0:
        detected_issues.append("No transactions tracked yet this month")
    if total_income > 0 and total_expense > total_income * 2:
        detected_issues.append(f"Expenses (₹{total_expense:,.0f}) exceed 2x income (₹{total_income:,.0f}) — possible untracked income")
    
    # Rule-based CTAs
    msg_lower = (msg.message or "").lower()
    suggested_ctas = []
    if total_txn_count == 0:
        suggested_ctas.append({"id": "scan_sms", "label": "Scan SMS for expenses", "icon": "scan", "action": "navigate:/transactions?openSmsScan=1"})
        suggested_ctas.append({"id": "add_expense", "label": "Add first expense", "icon": "add-circle", "action": "navigate:/transactions?openAdd=1"})
    elif income_count == 0:
        suggested_ctas.append({"id": "add_income", "label": "Add income", "icon": "cash", "action": "navigate:/transactions?openAdd=1&type=credit"})
    if duplicate_budgets:
        suggested_ctas.append({"id": "fix_budget", "label": "Fix duplicate budgets", "icon": "build", "action": "navigate:/budget"})
    if total_txn_count > 0 and len(budgets) == 0:
        suggested_ctas.append({"id": "set_budget", "label": "Set a budget", "icon": "pie-chart", "action": "navigate:/budget"})
    if any(k in msg_lower for k in ["split", "owe", "friend", "group"]):
        suggested_ctas.append({"id": "open_split", "label": "Open Splits", "icon": "people", "action": "navigate:/split"})
    if any(k in msg_lower for k in ["report", "weekly", "trend", "insight"]):
        suggested_ctas.append({"id": "weekly_report", "label": "View weekly report", "icon": "bar-chart", "action": "navigate:/"})
    seen = set()
    suggested_ctas = [c for c in suggested_ctas if not (c["id"] in seen or seen.add(c["id"]))][:3]
    
    savings_rate_val = round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0
    savings_rate_val = _fin(savings_rate_val)
    
    # Build structured context
    context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100
Monthly Income: ₹{total_income:,.0f} ({income_count} txns) | Monthly Expenses: ₹{total_expense:,.0f} ({total_txn_count} txns)
Savings: ₹{max(0, total_income - total_expense):,.0f} | Savings Rate: {savings_rate_val}%
DATA MODE: {data_mode.upper()}
DETECTED ISSUES: {'; '.join(detected_issues) if detected_issues else 'None'}

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS: {', '.join(f'{b["category"]}: ₹{b["amount"]:,.0f}' for b in budgets) or 'None'}"""

    mode_rules = {
        "no_data": "\nMODE: NO_DATA — DO NOT give financial advice. Guide them to add their first expense, scan SMS, or set income.",
        "partial": "\nMODE: PARTIAL_DATA — Provide LOW-CONFIDENCE insights. Explicitly mention confidence is limited. Suggest what data to add.",
        "full": "\nMODE: FULL_DATA — Deliver SPECIFIC, data-grounded recommendations using exact categories and ₹ amounts.",
    }

    system_prompt = f"""You are MintU AI Coach — a product-native financial assistant for Indian users.

{context}
{mode_rules[data_mode]}

MANDATORY RESPONSE STRUCTURE — use EXACTLY this 4-block format:

**[Direct Answer]**
One sentence directly answering the question.

**Your Snapshot:**
• Income: ₹<amount> this month
• Expenses: ₹<amount> this month
• <one more relevant data point>

**Key Insight:**
• <ONE specific observation from their actual data OR a detected issue from the list above>

**Next Step:**
• <ONE concrete action they can take right now>

RULES:
- Friendly but PROFESSIONAL. Zero slang (never "yaar", "bro", "dude", "yaan").
- Every line is a bullet or bold header. No paragraphs.
- Total response: 6-8 lines max.
- Use ₹ with thousands separators (₹12,500).
- Maximum ONE emoji per response.
- NEVER invent numbers — use only values from USER FINANCIAL PROFILE above.
- If detected issues exist, surface them in Key Insight.
- Avoid generic advice — every insight must reference a specific category, amount, or behavior.
- India-specific only (SIPs via Groww/Zerodha, ELSS, NPS, PPF, UPI, Swiggy/Zomato).
""" + get_lang_instruction(msg.lang or "en")

    try:
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"coach_{user_id}_{datetime.now(timezone.utc).timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=msg.message))
        
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        return {
            "reply": response_text,
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context_used": {
                "money_score": _fin(user.get("money_score", 50), 50),
                "monthly_expense": _fin(total_expense),
                "monthly_income": _fin(total_income),
                "savings_rate": _fin(savings_rate_val),
                "transaction_count": total_txn_count,
                "top_category": max(category_spend, key=lambda k: category_spend[k]["total"]) if category_spend else None,
            }
        }
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        # Structured rule-based fallback
        if data_mode == "no_data":
            reply = (
                "**Let's get started**\n\n"
                "**Your Snapshot:**\n"
                "• No transactions tracked this month yet\n\n"
                "**Key Insight:**\n"
                "• I cannot provide personalized advice without transaction data\n\n"
                "**Next Step:**\n"
                "• Scan your SMS inbox or add your first expense"
            )
        else:
            top_cat = max(category_spend, key=lambda k: category_spend[k]["total"]) if category_spend else "—"
            reply = (
                f"**Quick summary**\n\n"
                f"**Your Snapshot:**\n"
                f"• Income: ₹{total_income:,.0f} | Expenses: ₹{total_expense:,.0f}\n"
                f"• Top category: {top_cat}\n\n"
                f"**Key Insight:**\n"
                f"• {detected_issues[0] if detected_issues else f'Tracking {total_txn_count} transactions across {len(category_spend)} categories'}\n\n"
                f"**Next Step:**\n"
                f"• {suggested_ctas[0]['label'] if suggested_ctas else 'Keep tracking expenses for sharper insights'}"
            )
        return {
            "reply": reply,
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context_used": {
                "money_score": user.get("money_score", 50),
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": savings_rate_val,
                "transaction_count": total_txn_count,
            }
        }




# ── /ai/memory + /ai/agents ────────────────────────────────────────────
@api_router.post("/ai/memory")
async def save_agent_memory(data: dict, user_id: str = Depends(get_current_user)):
    """Store user preferences for AI agent memory"""
    prefs = data.get("preferences", {})
    habits = data.get("habits", [])
    
    await db.agent_memory.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "preferences": prefs,
                "habits": habits,
                "updated_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    return {"message": "Memory updated"}



@api_router.get("/ai/agents")
async def list_agents(user_id: str = Depends(get_current_user)):
    """List all available AI agents"""
    return {"agents": [
        {"id": k, "name": v["name"], "emoji": v["emoji"], "description": v["description"]}
        for k, v in AGENT_PROFILES.items()
    ]}



