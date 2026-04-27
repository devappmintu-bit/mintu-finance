"""ai_agent — Agentic multi-tool chat (GPT-5.2 with tool-calling).

Extracted from ai_coach.py (Round 26 refactor). Isolated because agent
tool-orchestration is the most expensive code path — easier to profile,
tune, and swap out when moved to its own module.
Endpoint: POST /ai/agent-chat
"""
"""AI coach chat (GPT-powered), agentic chat, voice transcription, memory, agent list.

Auto-extracted from backend/routers/ai.py (Round 14 refactor).
Decorators register on the shared APIRouter from routers.ai_common.
"""
import os
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


@api_router.post("/ai/agent-chat")
async def agentic_ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    """Product-native AI Financial Assistant — structured, data-aware, actionable."""
    
    message = data.get("message", "")
    lang = data.get("lang", "en")
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message required")
    
    # Route to appropriate agent
    agent_id = route_to_agent(message)
    agent = AGENT_PROFILES[agent_id]
    
    # Gather comprehensive financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Spending data
    cat_pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {}
    async for doc in db.transactions.aggregate(cat_pipeline):
        category_spend[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    total_expense = sum(c["total"] for c in category_spend.values())
    total_txn_count = sum(c["count"] for c in category_spend.values())
    
    # Income
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    income_count = income_docs[0]["count"] if income_docs else 0
    
    # Budgets — collect all to detect duplicates
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    budget_categories = [b["category"] for b in budgets]
    duplicate_budgets = sorted({c for c in budget_categories if budget_categories.count(c) > 1})
    budget_info = []
    for b in budgets:
        spent = category_spend.get(b["category"], {}).get("total", 0)
        pct = (spent / max(b["amount"], 1)) * 100
        budget_info.append(f"{b['category']}: ₹{spent:,.0f}/₹{b['amount']:,.0f} ({pct:.0f}%)")
    
    # Recent transactions (last 7)
    recent_txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(10)
    recent_str = "\n".join([
        f"  - {t.get('description','?')}: ₹{t['amount']:,.0f} ({t.get('category','?')}) on {t['date'].strftime('%b %d') if t.get('date') else '?'}"
        for t in recent_txns[:7]
    ])
    
    # ─── DATA MODE DETECTION ───
    # no_data: 0 txns → guide onboarding only
    # partial: 1-4 txns OR no income → low confidence insights
    # full: 5+ txns AND income → strong insights
    if total_txn_count == 0:
        data_mode = "no_data"
    elif total_txn_count < 5 or income_count == 0:
        data_mode = "partial"
    else:
        data_mode = "full"
    
    # ─── APP ISSUE DETECTION ───
    detected_issues = []
    if duplicate_budgets:
        detected_issues.append(f"Duplicate budgets for: {', '.join(duplicate_budgets)}")
    if total_txn_count > 0 and income_count == 0:
        detected_issues.append("No income recorded this month — savings rate cannot be computed accurately")
    if total_txn_count == 0:
        detected_issues.append("No transactions tracked yet this month")
    if total_income > 0 and total_expense > total_income * 2:
        detected_issues.append(f"Expenses (₹{total_expense:,.0f}) exceed 2x income (₹{total_income:,.0f}) — possible untracked income")
    
    # ─── RELEVANT CTAs (rule-based, based on data state + message intent) ───
    suggested_ctas = []
    msg_lower = message.lower()
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
    # Dedup CTAs, max 3
    seen_cta = set()
    suggested_ctas = [c for c in suggested_ctas if not (c["id"] in seen_cta or seen_cta.add(c["id"]))][:3]
    
    # Load agent memory
    memory = await db.agent_memory.find_one({"user_id": user_id})
    memory_context = ""
    if memory:
        prefs = memory.get("preferences", {})
        habits = memory.get("habits", [])
        memory_context = f"\nUser Preferences: {prefs}\nKnown Habits: {', '.join(habits[:5])}"
    
    # Build agent-specific system prompt
    savings_rate_val = round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0
    financial_context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100 | Streak: {user.get('streak_days', 0)} days
Monthly Income: ₹{total_income:,.0f} ({income_count} txns) | Monthly Expenses: ₹{total_expense:,.0f} ({total_txn_count} txns) | Savings: ₹{max(0, total_income - total_expense):,.0f}
Savings Rate: {savings_rate_val}%
DATA MODE: {data_mode.upper()}
DETECTED ISSUES: {'; '.join(detected_issues) if detected_issues else 'None'}

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS:
{chr(10).join(f'  {b}' for b in budget_info) or '  No budgets set'}

RECENT TRANSACTIONS:
{recent_str or '  None yet'}
{memory_context}"""

    agent_system_prompts = {
        "expense_tracker": f"""You are MintU's {agent['emoji']} Expense Tracker — a precise, data-first assistant for Indian users.

CAPABILITIES:
- Categorize expenses: Food, Transport, Entertainment, Shopping, Bills, Health, Education, Groceries, Other
- Detect spending anomalies and potential duplicate charges
- Identify recurring expenses and miscategorization

{financial_context}""",

        "budget_manager": f"""You are MintU's {agent['emoji']} Budget Manager — proactive budget optimizer for Indian users.

CAPABILITIES:
- Set and adjust realistic budgets based on Indian cost-of-living benchmarks (25% food, 10% transport, 20% bills, 30% savings)
- Alert when approaching/exceeding thresholds
- Suggest specific ₹ reallocation — never vague advice

{financial_context}""",

        "split_manager": f"""You are MintU's {agent['emoji']} Split Manager — fair split calculator and payment coordinator.

CAPABILITIES:
- Calculate fair splits (equal, income-weighted, consumption-based)
- Track balances across groups and suggest simplest settlement paths
- Recommend UPI for instant settlements

{financial_context}""",

        "insights_agent": f"""You are MintU's {agent['emoji']} Insights Agent — data storyteller who surfaces actionable patterns.

CAPABILITIES:
- Summarize weekly/monthly spending with specific ₹ comparisons
- Identify rising/falling categories vs prior period
- Surface one clear actionable pattern, not generic commentary

{financial_context}""",

        "market_intel": f"""You are MintU's {agent['emoji']} Market Intelligence — India-specific money-saving advisor.

CAPABILITIES:
- Subscription savings, cheaper alternatives, inflation-aware advice
- Tax-saving recommendations (80C, 80D, HRA, ELSS) grounded in user's income
- Reference real Indian products only: Zerodha, Groww, HDFC, SBI, LIC
- Never give specific stock picks (education only)

{financial_context}""",

        "money_school": f"""You are MintU's {agent['emoji']} Money School — concise finance educator for Indian users.

CAPABILITIES:
- Teach SIPs, mutual funds, FDs, PPF, NPS, ELSS, CIBIL, tax regimes, term/health insurance
- Use relatable Indian analogies (SIP = pocket-money jar)
- Reference real platforms: Zerodha, Groww, HDFC, SBI

{financial_context}"""
    }

    # ─── STRUCTURED RESPONSE RULES (replaces old conversational tone) ───
    mode_rules = {
        "no_data": """
MODE: NO_DATA — User has zero transactions this month.
- DO NOT give financial advice or recommendations.
- Guide them to onboard: add first expense, scan SMS, or set monthly income.
- Be welcoming but short. Acknowledge you cannot analyze without data.
""",
        "partial": """
MODE: PARTIAL_DATA — User has < 5 transactions or no income recorded.
- Provide LOW-CONFIDENCE insights — explicitly state the confidence is limited.
- Suggest what data to add for sharper insights (e.g., "Add income to get savings-rate analysis").
- Avoid strong recommendations like "cut ₹2000" when sample is tiny.
""",
        "full": """
MODE: FULL_DATA — User has enough data for high-confidence insights.
- Deliver SPECIFIC, data-grounded recommendations.
- Reference exact categories, ₹ amounts, and percentages from their actual data.
- Flag real issues from DETECTED ISSUES list above with actionable fixes.
""",
    }

    STRUCTURED_RESPONSE_RULES = f"""
{mode_rules[data_mode]}

MANDATORY RESPONSE STRUCTURE (for every response):
Use EXACTLY this 4-block format with line breaks between blocks. NO preamble. NO sign-off.

**[Direct Answer]**
One sentence answering the question directly.

**Your Snapshot:**
• Income: ₹<amount> this month
• Expenses: ₹<amount> this month
• <one more relevant data point — top category, savings rate, or txn count>

**Key Insight:**
• <ONE specific observation grounded in their actual data, OR a detected issue from the list above>

**Next Step:**
• <ONE concrete action they can take right now — e.g., "Add your salary as income", "Scan SMS to catch missed expenses", "Merge duplicate Food budgets">

TONE RULES:
- Friendly but PROFESSIONAL. Zero slang — never "yaar", "bro", "dude", "yaan".
- Every line is a bullet or a bold header. NO paragraphs longer than 2 lines.
- Total response length: 6-8 lines max (excluding headers).
- Use ₹ with thousands separators (₹12,500 not 12500).
- Use bold markdown (**word**) only for headers and critical numbers.
- Maximum ONE emoji per response, placed in the header of Key Insight or Next Step.

CONTENT RULES:
- NEVER invent numbers. Use only values from the USER FINANCIAL PROFILE above.
- If DETECTED ISSUES exist, surface them in Key Insight.
- Avoid generic advice (e.g., "save more", "track expenses") — every insight must reference a specific category, amount, or behavior from their data.
- If asked a conceptual question (e.g., "What is SIP?"), reply briefly in the same 4-block format with Snapshot showing their income and a Next Step tailored to their capacity.
"""

    system_prompt = agent_system_prompts.get(agent_id, agent_system_prompts["insights_agent"])
    system_prompt += STRUCTURED_RESPONSE_RULES
    system_prompt += get_lang_instruction(lang)
    
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"agent_{agent_id}_{user_id}_{now.timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=message))
        reply = response.strip() if isinstance(response, str) else str(response)
        
        # Store interaction in agent memory
        await db.agent_memory.update_one(
            {"user_id": user_id},
            {
                "$set": {"user_id": user_id, "last_interaction": now},
                "$push": {
                    "interactions": {
                        "$each": [{"agent": agent_id, "query": message[:200], "timestamp": now}],
                        "$slice": -50  # Keep last 50 interactions
                    }
                }
            },
            upsert=True
        )
        
        return {
            "reply": reply,
            "agent": {
                "id": agent_id,
                "name": agent["name"],
                "emoji": agent["emoji"],
            },
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context": {
                "money_score": user.get("money_score", 50) if user else 50,
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": savings_rate_val,
                "transaction_count": total_txn_count,
            }
        }
    except Exception as e:
        logging.error(f"Agent chat error: {e}")
        # Structured fallback (rule-based, mirrors the 4-block format)
        if data_mode == "no_data":
            fallback_reply = (
                "**Let's get started**\n\n"
                "**Your Snapshot:**\n"
                "• No transactions tracked this month yet\n\n"
                "**Key Insight:**\n"
                "• I cannot provide personalized advice without transaction data\n\n"
                "**Next Step:**\n"
                "• Scan your SMS inbox or add your first expense"
            )
        else:
            top_cat = max(category_spend, key=lambda k: category_spend[k]['total']) if category_spend else "—"
            fallback_reply = (
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
            "reply": fallback_reply,
            "agent": {"id": agent_id, "name": agent["name"], "emoji": agent["emoji"]},
            "mode": data_mode,
            "issues": detected_issues,
            "ctas": suggested_ctas,
            "context": {"money_score": user.get("money_score", 50) if user else 50}
        }



