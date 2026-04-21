"""Centralized static data constants for MintU.

Previously inlined in server.py (1300+ lines). Moving them here:
- Shrinks server.py
- Lets routers import directly (no more `_lazy_attr` proxy shims)
- Keeps a single source of truth for lessons, badges, UPI app list, etc.
"""

# ══════════════════════════════════════════════════════════════════════
#  INDIA POPULATION CONTEXT
# ══════════════════════════════════════════════════════════════════════
INDIA_POPULATION_2025 = 1_460_000_000


# ══════════════════════════════════════════════════════════════════════
#  MONEY SCHOOL — LONG-FORM LESSONS (used by /money-school endpoints)
# ══════════════════════════════════════════════════════════════════════
MONEY_SCHOOL_LESSONS = [
    {"id": "sip_101", "title": "SIP: Your Wealth Machine", "category": "Investment", "content": "A Systematic Investment Plan (SIP) lets you invest ₹500-₹5,000/month into mutual funds automatically. At 12% annual returns, ₹5,000/month for 10 years becomes ₹11.6 lakhs! Start with any amount — even ₹500 works.", "tip": "Start a SIP today on Groww or Zerodha. Even ₹500/month makes a difference over 10 years."},
    {"id": "fd_basics", "title": "Fixed Deposits: Safe & Steady", "category": "Savings", "content": "FDs offer guaranteed 7-8% returns with zero risk. Best for emergency funds and short-term goals. Senior citizens get 0.5% extra. Pro tip: Ladder your FDs (split across 1yr, 2yr, 3yr) for better liquidity.", "tip": "Keep 3-6 months expenses in FD as emergency fund. Don't break it for shopping!"},
    {"id": "tax_80c", "title": "Save Tax with Section 80C", "category": "Tax", "content": "You can save up to ₹1.5 lakh/year in taxes under 80C. Options: ELSS mutual funds (best returns, 3yr lock-in), PPF (15yr, tax-free), NPS (extra ₹50K under 80CCD). Most salaried people overpay by ₹15,000-30,000!", "tip": "If you haven't invested in 80C yet, start an ELSS SIP. It saves tax AND grows your money."},
    {"id": "emergency_fund", "title": "The Emergency Fund Rule", "category": "Savings", "content": "Keep 3-6 months of expenses in a savings account or liquid fund. This protects you from job loss, medical emergencies, or car repairs without borrowing. Average Indian household needs ₹1-3 lakhs as emergency buffer.", "tip": "Calculate your monthly expenses × 6. That's your emergency fund target. Start saving towards it today."},
    {"id": "insurance_101", "title": "Term Insurance: ₹500/month for ₹1 Crore Cover", "category": "Insurance", "content": "Term insurance gives ₹50L-1Cr life cover for just ₹500-800/month if you're 25-35. It's the cheapest way to protect your family. Never mix insurance with investment (avoid ULIPs/endowment plans). Pure term = best value.", "tip": "If you have dependents, get a term insurance plan TODAY. Compare on PolicyBazaar."},
    {"id": "compound_interest", "title": "The Magic of Compounding", "category": "Investment", "content": "₹10,000/month at 12% returns: After 5 years = ₹8.2L, After 10 years = ₹23.2L, After 20 years = ₹99.9L! The secret? Start early. Someone who starts at 25 will have 3x more than someone starting at 35 with the same investment.", "tip": "The best time to start investing was yesterday. The second best time is today."},
    {"id": "credit_card_trap", "title": "Credit Card: Friend or Foe?", "category": "Budgeting", "content": "Credit cards charge 36-42% annual interest if you don't pay full amount. Minimum payment is a TRAP — a ₹50,000 balance takes 8+ years to clear with minimum payments! Always pay full balance. Use cards only for rewards, never for borrowing.", "tip": "Set up auto-pay for full credit card balance. Never carry forward a balance."},
    {"id": "50_30_20", "title": "The 50-30-20 Budget Rule", "category": "Budgeting", "content": "Allocate your income: 50% for Needs (rent, food, bills), 30% for Wants (dining, shopping, entertainment), 20% for Savings (SIP, FD, emergency). If earning ₹50,000/month: ₹25K needs, ₹15K wants, ₹10K savings.", "tip": "Open MintU budgets for each category and track against the 50-30-20 rule."},
    {"id": "health_insurance", "title": "Health Insurance Before Wealth", "category": "Insurance", "content": "One hospital stay can wipe out years of savings. A ₹5-10 lakh health cover costs ₹5,000-8,000/year for a family. Buy before 35 for lower premiums. Always take a family floater plan, not individual.", "tip": "If you don't have health insurance, get a ₹10L family floater this month. Compare on PolicyBazaar."},
    {"id": "gold_investing", "title": "Gold: Digital vs Physical", "category": "Investment", "content": "Indians love gold but physical gold has making charges (10-25%) and locker costs. Digital gold (Sovereign Gold Bonds, Gold ETFs) has zero making charges, gives 2.5% annual interest, and is tax-free after 8 years!", "tip": "Switch from buying physical gold to Sovereign Gold Bonds (SGB). Same gold, better returns, zero hassle."},
    {"id": "nps_retirement", "title": "NPS: Retire Like a King", "category": "Investment", "content": "National Pension System gives extra ₹50,000 tax deduction (above 80C). At 10% returns, ₹5,000/month from age 30 gives you ₹1.12 Crore at 60! Government employees get even better benefits.", "tip": "Open an NPS account on eNPS.nsdl.com. The extra ₹50K tax saving alone is worth it."},
    {"id": "emi_management", "title": "EMI Management: The 40% Rule", "category": "Budgeting", "content": "Total EMIs should never exceed 40% of take-home salary. If you earn ₹60,000/month, max EMI = ₹24,000. This includes home loan, car loan, personal loan, and BNPL. Beyond 40% = financial stress zone.", "tip": "Add up ALL your EMIs right now. If it's more than 40% of salary, focus on paying off the highest-interest loan first."},
    {"id": "ppf_power", "title": "PPF: Tax-Free Wealth Builder", "category": "Investment", "content": "Public Provident Fund gives 7.1% tax-free returns with ₹1.5L/year limit. After 15 years, ₹1.5L/year becomes ₹40+ lakhs — completely tax-free! It's the safest long-term investment in India after FD.", "tip": "Open a PPF account at your bank or post office. Max out ₹1.5L/year for tax-free compounding."},
    {"id": "avoid_lifestyle", "title": "Lifestyle Inflation: The Silent Killer", "category": "Budgeting", "content": "Got a raise? Don't upgrade everything. If salary goes from ₹50K to ₹70K, save the ₹20K difference instead of upgrading car/house. This is how millionaires are made — they invest raises, not spend them.", "tip": "Next time you get a raise, increase your SIP by the same amount. Your future self will thank you."},
    {"id": "upi_safety", "title": "UPI Safety: Protect Your Money", "category": "Security", "content": "Never share UPI PIN, OTP, or scan QR codes sent by strangers. Fraudsters pose as bank officials or buyers. Remember: you NEVER need to scan QR or enter PIN to RECEIVE money. If someone asks you to, it's a scam.", "tip": "Enable UPI transaction limits in your bank app. Set daily limit to what you actually need."},
]


# ══════════════════════════════════════════════════════════════════════
#  MONEY SCHOOL — BITE-SIZED GAMIFIED CARDS
# ══════════════════════════════════════════════════════════════════════
MONEY_SCHOOL_CARDS = [
    {"type": "saving_hack", "emoji": "💡", "title": "Skip 1 Zomato order/week", "body": "Save ₹1,500/month → ₹18,000/year. That's a weekend trip to Goa! ✈️", "xp": 10, "level": "beginner", "color": "#10B981"},
    {"type": "investment", "emoji": "📈", "title": "FD vs Mutual Funds", "body": "Your FD gives 6.5%. A balanced mutual fund averages 12%. You're losing 5.5% returns every year!", "xp": 15, "level": "intermediate", "color": "#6366F1"},
    {"type": "daily_tip", "emoji": "🎯", "title": "The 50/30/20 Rule", "body": "50% Needs, 30% Wants, 20% Savings. Simple but powerful. Most Indians save only 8%.", "xp": 10, "level": "beginner", "color": "#F59E0B"},
    {"type": "market_trend", "emoji": "🔥", "title": "SIP Power", "body": "₹5,000/month SIP for 20 years at 12% = ₹49.9 lakhs. Start today, thank yourself later.", "xp": 20, "level": "intermediate", "color": "#EF4444"},
    {"type": "risk_alert", "emoji": "⚠️", "title": "Credit Card Trap", "body": "Minimum payment = maximum interest. Pay full bill always. 36% annual interest is a wealth destroyer.", "xp": 15, "level": "beginner", "color": "#DC2626"},
    {"type": "saving_hack", "emoji": "🏷️", "title": "Annual vs Monthly", "body": "Netflix annual = ₹600 saved. Spotify annual = ₹500 saved. Gym annual = ₹3,000 saved. Total: ₹4,100/year!", "xp": 10, "level": "beginner", "color": "#059669"},
    {"type": "investment", "emoji": "🏦", "title": "PPF: Tax-Free Magic", "body": "₹1.5L/year in PPF = tax saving + 7.1% guaranteed returns + zero risk. Best for beginners!", "xp": 20, "level": "intermediate", "color": "#7C3AED"},
    {"type": "daily_tip", "emoji": "📊", "title": "Track Before You Cut", "body": "Most people have no idea where 30% of their money goes. Track for 1 month, then optimize.", "xp": 10, "level": "beginner", "color": "#0EA5E9"},
    {"type": "market_trend", "emoji": "💰", "title": "Gold as Insurance", "body": "Keep 5-10% in Sovereign Gold Bonds. You get 2.5% interest + gold price appreciation. Win-win!", "xp": 15, "level": "advanced", "color": "#F59E0B"},
    {"type": "saving_hack", "emoji": "🛒", "title": "D-Mart vs Blinkit", "body": "Monthly groceries at D-Mart vs quick commerce saves ₹2,000-3,000/month. Plan your shopping!", "xp": 10, "level": "beginner", "color": "#10B981"},
    {"type": "investment", "emoji": "🎓", "title": "ELSS: Best Tax Saver", "body": "ELSS funds: 3-year lock-in, ~15% returns, ₹46,800 tax saved on ₹1.5L investment. Beat FD easily!", "xp": 25, "level": "advanced", "color": "#F97316"},
    {"type": "risk_alert", "emoji": "🚨", "title": "EMI Overload Check", "body": "Total EMIs should be <40% of income. Above that? You're one emergency away from trouble.", "xp": 15, "level": "intermediate", "color": "#EF4444"},
]

XP_LEVELS = [
    {"level": 1, "name": "Beginner", "emoji": "🌱", "min_xp": 0},
    {"level": 2, "name": "Learner", "emoji": "📚", "min_xp": 50},
    {"level": 3, "name": "Saver", "emoji": "💰", "min_xp": 150},
    {"level": 4, "name": "Investor", "emoji": "📈", "min_xp": 300},
    {"level": 5, "name": "Pro", "emoji": "🏆", "min_xp": 500},
    {"level": 6, "name": "Expert", "emoji": "👑", "min_xp": 800},
]


# ══════════════════════════════════════════════════════════════════════
#  AGENTIC AI PROFILES + ROUTER
# ══════════════════════════════════════════════════════════════════════
AGENT_PROFILES = {
    "expense_tracker": {
        "name": "Expense Tracker Agent",
        "emoji": "📊",
        "description": "Categorizes expenses, detects anomalies, tracks spending patterns",
        "triggers": ["spent", "expense", "purchase", "bought", "paid", "cost", "bill", "transaction", "category", "categorize"],
    },
    "budget_manager": {
        "name": "Budget Manager Agent",
        "emoji": "🎯",
        "description": "Sets dynamic budgets, alerts on thresholds, optimizes allocations",
        "triggers": ["budget", "limit", "cap", "allocat", "threshold", "overspend", "underspend", "saving target"],
    },
    "split_manager": {
        "name": "Split Manager Agent",
        "emoji": "🤝",
        "description": "Manages fair splits, payment reminders, group expenses",
        "triggers": ["split", "owe", "owes", "settle", "group", "share", "divide", "remind", "pending", "who owes"],
    },
    "insights_agent": {
        "name": "Insights & Trends Agent",
        "emoji": "📈",
        "description": "Weekly/monthly insights, spending patterns, category breakdowns, comparisons",
        "triggers": ["insight", "trend", "pattern", "week", "month", "compare", "analysis", "breakdown", "report", "summary", "how much"],
    },
    "market_intel": {
        "name": "Market Intelligence Agent",
        "emoji": "🧠",
        "description": "Subscription savings, cost alternatives, inflation-aware advice, investment tips",
        "triggers": ["subscription", "save money", "alternative", "cheaper", "invest", "sip", "fd", "mutual fund", "insurance", "tax", "market", "inflation", "switch", "plan"],
    },
    "money_school": {
        "name": "Money School",
        "emoji": "🎓",
        "description": "Financial education — explains concepts, strategies, and basics",
        "triggers": [
            "teach me", "explain", "what is", "what are", "how does", "how do", "learn",
            "basics", "beginner", "understand", "tell me about", "educate",
            "50/30/20", "credit score", "cibil", "emergency fund", "compound", "diversif",
            "elss", "nps", "ppf", "epf", "reit", "index fund", "stock", "equity", "debt fund",
            "hra", "80c", "80d", "old regime", "new regime", "tax regime",
        ],
    },
}


def route_to_agent(message: str) -> str:
    """Route user message to the most appropriate AI agent based on keyword scoring."""
    msg_lower = message.lower()
    scores = {}
    for agent_id, profile in AGENT_PROFILES.items():
        score = sum(1 for trigger in profile["triggers"] if trigger in msg_lower)
        scores[agent_id] = score

    # Educational-intent boost: learning questions prefer Money School
    edu_markers = ("teach me", "explain", "what is", "what are", "how does", "how do",
                    "basics", "beginner", "tell me about", "help me understand", "learn about")
    if any(m in msg_lower for m in edu_markers):
        scores["money_school"] = scores.get("money_school", 0) + 3

    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "insights_agent"  # Default to insights for general queries
    return best


# ══════════════════════════════════════════════════════════════════════
#  WASTE DETECTOR — "How much is ₹X really?" equivalences
# ══════════════════════════════════════════════════════════════════════
WASTE_EQUIVALENCES = [
    {"threshold": 500, "emoji": "☕", "text": "{count} Starbucks coffees"},
    {"threshold": 1000, "emoji": "🍕", "text": "{count} Domino's pizza nights"},
    {"threshold": 2000, "emoji": "🎬", "text": "{count} movie dates with popcorn"},
    {"threshold": 3000, "emoji": "👟", "text": "{count} pairs of Nike shoes in a year"},
    {"threshold": 5000, "emoji": "✈️", "text": "{count} weekend trips to Goa"},
    {"threshold": 8000, "emoji": "📱", "text": "1 iPhone in {months} months"},
    {"threshold": 10000, "emoji": "🏍️", "text": "1 Royal Enfield in {months} months"},
    {"threshold": 15000, "emoji": "💻", "text": "1 MacBook in {months} months"},
    {"threshold": 25000, "emoji": "🚗", "text": "1 car down-payment in {months} months"},
    {"threshold": 50000, "emoji": "🏠", "text": "Towards a flat down-payment in {months} months"},
]


def build_equivalences(monthly_amount: float) -> list:
    """Build fun spending equivalences for waste detector."""
    results = []
    yearly = monthly_amount * 12
    for eq in WASTE_EQUIVALENCES:
        if monthly_amount >= eq["threshold"] * 0.3:
            if "{count}" in eq["text"]:
                count = int(yearly / eq["threshold"])
                if count > 0:
                    results.append({"emoji": eq["emoji"], "text": eq["text"].format(count=count)})
            elif "{months}" in eq["text"]:
                months = max(1, int(eq["threshold"] / max(monthly_amount, 1)))
                results.append({"emoji": eq["emoji"], "text": eq["text"].format(months=months)})
    return results[:4]  # Top 4 most impactful


# ══════════════════════════════════════════════════════════════════════
#  PREMIUM FEATURES + PRICING
# ══════════════════════════════════════════════════════════════════════
PREMIUM_FEATURES = {
    "ai_smart_coach": {"name": "AI Smart Coach", "desc": "Personalized weekly money advice"},
    "waste_analysis": {"name": "Waste Analysis", "desc": "Find hidden spending leaks"},
    "goal_planning": {"name": "Goal Planning", "desc": "Save ₹1L in 6 months with a step-by-step plan"},
    "advanced_insights": {"name": "Advanced Insights", "desc": "Category trends, peer comparison"},
    "unlimited_budgets": {"name": "Unlimited Budgets", "desc": "Set budgets for every category"},
    "family_budgets": {"name": "Family Budgets", "desc": "Shared household budget tracking"},
    "ad_free": {"name": "Ad-Free", "desc": "Clean, distraction-free experience"},
}

PRICING = {
    # ═══════════════════════════════════════════════════════════════
    #  MINTU MONETIZATION LADDER (Apr 2026)  —  India-tier optimised
    #  Tier          Price    Emotion / Trigger              Target Tier
    #  Free          ₹0       Trust / Habit                  T1→T5 acquisition
    #  Lite          ₹29      "It's just ₹1/day"             T2→T4 mass-play
    #  Pro           ₹99      "Useful" / "I save more"       T1 + aspirational T2
    #  Elite         ₹149     "Status + control"             T1 flex + serious savers
    # ═══════════════════════════════════════════════════════════════
    "intro":   {"price": 29,  "label": "₹29/month",  "tag": "It's just ₹1/day",
                "period": "per month", "order": 1,
                "emotion": "It's just ₹1/day",
                "plan_name": "Lite"},
    "monthly": {"price": 99,  "label": "₹99/month",  "tag": "Useful — I save more",
                "period": "per month", "order": 2,
                "emotion": "Useful — I save more",
                "best_seller": True,
                "plan_name": "Pro"},
    "yearly":  {"price": 149, "label": "₹149/month", "tag": "Status + Control",
                "period": "per month", "order": 3,
                "emotion": "Status + Control",
                "includes_money_school": True,
                "plan_name": "Elite"},
    # NOTE: `lifetime` tier removed — previous ₹2,999 exceeded the ₹150 India-hack cap.
    # NOTE: Plan keys (`intro`/`monthly`/`yearly`) kept stable for back-compat.
    #       Display labels live in `plan_name` field (Lite / Pro / Elite).
}


# ══════════════════════════════════════════════════════════════════════
#  UPI APPS + SETTLEMENT REWARDS
# ══════════════════════════════════════════════════════════════════════
UPI_APPS = [
    {"id": "gpay", "name": "Google Pay", "package": "com.google.android.apps.nbu.paisa.user", "color": "#4285F4", "icon": "logo-google"},
    {"id": "phonepe", "name": "PhonePe", "package": "com.phonepe.app", "color": "#5F259F", "icon": "phone-portrait"},
    {"id": "paytm", "name": "Paytm", "package": "net.one97.paytm", "color": "#00BAF2", "icon": "wallet"},
    {"id": "bhim", "name": "BHIM", "package": "in.org.npci.upiapp", "color": "#00695C", "icon": "shield-checkmark"},
]

SETTLEMENT_REWARDS = {
    "instant": {"coins": 15, "label": "Lightning Settler ⚡", "hours": 1},
    "same_day": {"coins": 10, "label": "Quick Payer 🏃", "hours": 24},
    "on_time": {"coins": 5, "label": "Reliable 👍", "hours": 72},
    "late": {"coins": 1, "label": "Better Late 🐢", "hours": 999999},
}


# ══════════════════════════════════════════════════════════════════════
#  SAMPLE SMS INBOX (demo/bulk-import)
# ══════════════════════════════════════════════════════════════════════
SAMPLE_INDIAN_SMS = [
    "Your A/c XX1234 is debited for Rs.450.00 on 15-Apr-26. Info: UPI/SWIGGY/Payment",
    "Rs.2500.00 credited to your A/c XX1234 on 15-Apr-26 by NEFT-SALARY-COMPANY",
    "Your SBI A/c X5678 debited Rs.150.00 on 14Apr UPI-Ola Cabs",
    "ICICI Bank Acct XX9012 debited with Rs 1,200.00 on 14-APR-26; Info:AMAZON",
    "You paid Rs.80 to Tea Junction via Paytm Wallet",
    "Sent Rs.300 to Zomato from HDFC XX1234 via UPI",
    "Rs.35000.00 credited to your A/c XX1234 by NEFT from ACME CORP SALARY APR26",
    "Your A/c XX1234 debited Rs.500.00 ATM Cash Withdrawal",
    "Rs.199 debited from your Axis Bank A/c for NETFLIX subscription",
    "Your HDFC A/c XX1234 debited Rs.3500.00 for Electricity Bill TATA POWER",
    "Paid Rs.250 to PhonePe for BigBasket order",
    "Your A/c XX1234 debited Rs.1800.00 on 12-Apr-26. Info: UPI/MYNTRA/Shopping",
]


# ══════════════════════════════════════════════════════════════════════
#  LANGUAGE NAMES (used by get_lang_instruction)
# ══════════════════════════════════════════════════════════════════════
LANG_NAMES = {
    "en": "English", "hi": "Hindi (हिन्दी)", "ta": "Tamil (தமிழ்)", "te": "Telugu (తెలుగు)",
    "mr": "Marathi (मराठी)", "bn": "Bengali (বাংলা)", "kn": "Kannada (ಕನ್ನಡ)",
    "gu": "Gujarati (ગુજરાતી)", "ml": "Malayalam (മലയാളം)", "as": "Assamese (অসমীয়া)",
}


def get_lang_instruction(lang: str) -> str:
    """Returns AI instruction for responding in the user's language."""
    if lang == "en" or lang not in LANG_NAMES:
        return ""
    return f"\n\nIMPORTANT: Respond ENTIRELY in {LANG_NAMES[lang]}. Use the native script. Keep ₹ amounts in digits. Do NOT respond in English."


__all__ = [
    "INDIA_POPULATION_2025",
    "MONEY_SCHOOL_LESSONS", "MONEY_SCHOOL_CARDS", "XP_LEVELS",
    "AGENT_PROFILES", "route_to_agent",
    "WASTE_EQUIVALENCES", "build_equivalences",
    "PREMIUM_FEATURES", "PRICING",
    "UPI_APPS", "SETTLEMENT_REWARDS",
    "SAMPLE_INDIAN_SMS",
    "LANG_NAMES", "get_lang_instruction",
]
