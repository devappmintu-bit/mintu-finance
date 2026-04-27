"""Investment / SIP suggester — rule-based allocation for Indian users."""
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException

from core import db, get_current_user
from routers.premium_common import router, api_router  # noqa: F401


@router.post("/premium/investment-suggest")
async def investment_suggest(data: dict, user_id: str = Depends(get_current_user)):
    """Rule-based SIP/investment allocation for Indian users.
    Body: {monthly_income, monthly_expenses?, age?=28, risk?='medium', goal?='wealth'}"""
    monthly_income = float(data.get("monthly_income", 0) or 0)
    if monthly_income <= 0:
        raise HTTPException(status_code=400, detail="monthly_income must be positive")

    age = int(data.get("age", 28))
    risk = data.get("risk", "medium").lower()
    goal = data.get("goal", "wealth").lower()

    monthly_expenses = data.get("monthly_expenses")
    if monthly_expenses is None:
        now = datetime.now(timezone.utc)
        month_start = now - timedelta(days=30)
        pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["debit", "expense"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        docs = await db.transactions.aggregate(pipeline).to_list(1)
        monthly_expenses = docs[0]["total"] if docs else 0
    monthly_expenses = float(monthly_expenses)

    investible = max(0, monthly_income - monthly_expenses)
    if investible <= 0:
        return {
            "investible_monthly": 0,
            "monthly_income": monthly_income,
            "monthly_expenses": monthly_expenses,
            "headline": "No surplus to invest. Focus on reducing expenses first.",
            "allocations": [],
            "emergency_fund_target": monthly_expenses * 6,
            "disclaimer": "Mutual funds are subject to market risks. Past returns are not indicative of future performance.",
        }

    risk_profile = {
        "low": {"equity": 0.30, "debt": 0.50, "gold": 0.10, "cash": 0.10},
        "medium": {"equity": 0.55, "debt": 0.30, "gold": 0.10, "cash": 0.05},
        "high": {"equity": 0.75, "debt": 0.15, "gold": 0.05, "cash": 0.05},
    }.get(risk, {"equity": 0.55, "debt": 0.30, "gold": 0.10, "cash": 0.05})

    age_equity_cap = max(30, min(90, 100 - age)) / 100
    risk_profile["equity"] = min(risk_profile["equity"], age_equity_cap)

    allocations = [
        {
            "id": "emergency_fund", "title": "Emergency Fund (Liquid)",
            "amount": round(min(investible * 0.10, (monthly_expenses * 6) / 12), 0),
            "pct": 10,
            "why": f"Target: 6 months of expenses (~₹{round(monthly_expenses * 6, 0):,.0f}). Keep in liquid fund.",
            "products": ["Parag Parikh Liquid Fund", "HDFC Liquid Fund", "Axis Liquid Fund"],
            "platform": "Groww / Zerodha Coin", "icon": "shield", "color": "#10B981",
        },
        {
            "id": "equity_sip", "title": "Equity SIP (Long-term wealth)",
            "amount": round(investible * risk_profile["equity"], 0),
            "pct": round(risk_profile["equity"] * 100, 0),
            "why": "Equity builds wealth via compounding. Expected 12-14% CAGR over 10+ yrs.",
            "products": (
                ["Nippon India Large Cap", "Parag Parikh Flexi Cap", "Mirae Asset Large Cap"] if risk == "low"
                else ["Parag Parikh Flexi Cap", "Quant Active Fund", "ICICI Pru Nifty 50 Index"]
            ),
            "platform": "Groww / Zerodha Coin / ET Money", "icon": "trending-up", "color": "#8B5CF6",
        },
        {
            "id": "elss_tax", "title": "ELSS (Tax-saving + Equity)",
            "amount": round(min(investible * 0.15, 12500), 0),
            "pct": 15,
            "why": "Save up to ₹46,800 tax under 80C (old regime). 3-yr lockin, equity returns.",
            "products": ["Mirae Asset ELSS Tax Saver", "Parag Parikh ELSS Tax Saver", "Canara Robeco ELSS"],
            "platform": "Groww / Zerodha Coin", "icon": "receipt", "color": "#F59E0B",
        },
        {
            "id": "debt_ppf", "title": "Debt / PPF (Safety)",
            "amount": round(investible * risk_profile["debt"], 0),
            "pct": round(risk_profile["debt"] * 100, 0),
            "why": "PPF: 7.1% tax-free, 15-yr lockin. Corporate bond funds: 7-9% + lower risk than equity.",
            "products": ["PPF (any bank)", "ICICI Pru Corporate Bond", "HDFC Short Term Debt"],
            "platform": "SBI / Bank / Groww", "icon": "library", "color": "#3B82F6",
        },
        {
            "id": "gold", "title": "Gold (Hedge)",
            "amount": round(investible * risk_profile["gold"], 0),
            "pct": round(risk_profile["gold"] * 100, 0),
            "why": "10% gold allocation hedges against inflation & market crashes. SGB = 2.5% interest + gold price.",
            "products": ["Sovereign Gold Bond (RBI)", "Nippon India Gold BeES ETF"],
            "platform": "Zerodha / Groww", "icon": "diamond", "color": "#EAB308",
        },
    ]

    emergency_target = monthly_expenses * 6
    headline = f"You can invest ₹{investible:,.0f}/month. Here's your smart allocation."
    if monthly_expenses > 0 and monthly_income < monthly_expenses * 1.2:
        headline = "Surplus is tight. Build emergency fund first before equity investing."

    return {
        "investible_monthly": investible,
        "monthly_income": monthly_income,
        "monthly_expenses": monthly_expenses,
        "age": age, "risk": risk, "goal": goal,
        "headline": headline,
        "allocations": allocations,
        "emergency_fund_target": round(emergency_target, 0),
        "annual_investment": round(investible * 12, 0),
        "projected_10yr": round(investible * 12 * 10 * 1.5, 0),
        "disclaimer": "Mutual funds are subject to market risks. Past returns are not indicative of future performance. Products listed are examples — do your own research or consult a SEBI-registered advisor.",
    }
