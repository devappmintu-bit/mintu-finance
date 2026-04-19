"""Tax calculator — Indian FY 2025-26 New vs Old regime estimator."""
import logging
from fastapi import Depends, HTTPException

from core import get_current_user
from routers.premium_common import router, api_router  # noqa: F401  (registers on shared router)


# ── FY 2025-26 new regime slabs (Budget 2025) ────────────────────────
TAX_SLABS_NEW_REGIME_2025 = [
    {"from": 0, "to": 400000, "rate": 0},
    {"from": 400000, "to": 800000, "rate": 0.05},
    {"from": 800000, "to": 1200000, "rate": 0.10},
    {"from": 1200000, "to": 1600000, "rate": 0.15},
    {"from": 1600000, "to": 2000000, "rate": 0.20},
    {"from": 2000000, "to": 2400000, "rate": 0.25},
    {"from": 2400000, "to": float("inf"), "rate": 0.30},
]
STANDARD_DEDUCTION_NEW = 75000
REBATE_87A_CAP_NEW = 60000
REBATE_87A_INCOME_LIMIT_NEW = 1200000

# Old regime (unchanged since FY 2024-25)
TAX_SLABS_OLD_REGIME = [
    {"from": 0, "to": 250000, "rate": 0},
    {"from": 250000, "to": 500000, "rate": 0.05},
    {"from": 500000, "to": 1000000, "rate": 0.20},
    {"from": 1000000, "to": float("inf"), "rate": 0.30},
]
STANDARD_DEDUCTION_OLD = 50000
REBATE_87A_CAP_OLD = 12500
REBATE_87A_INCOME_LIMIT_OLD = 500000


def _calc_tax_on_slabs(taxable: float, slabs: list) -> float:
    tax = 0.0
    for s in slabs:
        if taxable <= s["from"]:
            break
        bracket_income = min(taxable, s["to"]) - s["from"]
        if bracket_income > 0:
            tax += bracket_income * s["rate"]
    return tax


@router.post("/premium/tax-calculator")
async def tax_calculator(data: dict, user_id: str = Depends(get_current_user)):
    """Indian tax estimator for FY 2025-26 — compares New vs Old regime.
    Body: {annual_income, hra_exempt?, section_80c?, section_80d?, home_loan_interest?}
    """
    income = float(data.get("annual_income", 0) or 0)
    hra = float(data.get("hra_exempt", 0) or 0)
    c80c = min(float(data.get("section_80c", 0) or 0), 150000)
    c80d = min(float(data.get("section_80d", 0) or 0), 75000)
    home_loan = min(float(data.get("home_loan_interest", 0) or 0), 200000)

    if income <= 0:
        raise HTTPException(status_code=400, detail="annual_income must be positive")

    # New regime
    new_taxable = max(0, income - STANDARD_DEDUCTION_NEW)
    new_tax_pre = _calc_tax_on_slabs(new_taxable, TAX_SLABS_NEW_REGIME_2025)
    new_rebate = min(new_tax_pre, REBATE_87A_CAP_NEW) if new_taxable <= REBATE_87A_INCOME_LIMIT_NEW else 0
    new_tax_after_rebate = max(0, new_tax_pre - new_rebate)
    new_cess = round(new_tax_after_rebate * 0.04, 2)
    new_total = round(new_tax_after_rebate + new_cess, 2)

    # Old regime
    old_deductions = STANDARD_DEDUCTION_OLD + hra + c80c + c80d + home_loan
    old_taxable = max(0, income - old_deductions)
    old_tax_pre = _calc_tax_on_slabs(old_taxable, TAX_SLABS_OLD_REGIME)
    old_rebate = min(old_tax_pre, REBATE_87A_CAP_OLD) if old_taxable <= REBATE_87A_INCOME_LIMIT_OLD else 0
    old_tax_after_rebate = max(0, old_tax_pre - old_rebate)
    old_cess = round(old_tax_after_rebate * 0.04, 2)
    old_total = round(old_tax_after_rebate + old_cess, 2)

    savings = round(abs(new_total - old_total), 2)
    recommended = "new" if new_total <= old_total else "old"

    # Smart suggestions ---------------------------------------------
    suggestions = []
    if c80c < 150000 and income >= 700000:
        gap = 150000 - c80c
        potential = gap * 0.30
        suggestions.append({
            "title": f"Invest ₹{gap:,.0f} more in 80C (ELSS/PPF)",
            "savings": round(potential, 0),
            "detail": "ELSS mutual funds via Groww/Zerodha have 3-year lock-in and 12-15% avg returns. PPF gives 7.1% tax-free.",
            "icon": "shield-checkmark",
        })
    if c80d < 25000 and income >= 500000:
        gap = 25000 - c80d
        potential = gap * 0.30
        suggestions.append({
            "title": "Get health insurance (Section 80D)",
            "savings": round(potential, 0),
            "detail": f"₹{gap:,.0f} premium saves ₹{round(potential, 0):,.0f} in tax. ACKO, HDFC Ergo, Star Health from ₹500/month.",
            "icon": "medkit",
        })
    if income >= 900000 and home_loan == 0:
        suggestions.append({
            "title": "Claim home loan interest (up to ₹2L)",
            "savings": 60000,
            "detail": "If you have a home loan, Section 24(b) saves up to ₹60,000 on interest paid.",
            "icon": "home",
        })
    if income >= 500000 and new_total == 0 and old_total > 0:
        suggestions.append({
            "title": "New regime works for you!",
            "savings": round(old_total, 0),
            "detail": "Your income falls in the 87A rebate zone — zero tax under new regime.",
            "icon": "sparkles",
        })

    return {
        "input": {
            "annual_income": income,
            "hra_exempt": hra,
            "section_80c": c80c,
            "section_80d": c80d,
            "home_loan_interest": home_loan,
        },
        "new_regime": {
            "taxable_income": new_taxable,
            "tax_before_rebate": round(new_tax_pre, 2),
            "rebate_87a": round(new_rebate, 2),
            "tax_after_rebate": round(new_tax_after_rebate, 2),
            "cess_4pct": new_cess,
            "total_tax": new_total,
            "effective_rate_pct": round((new_total / income) * 100, 2) if income > 0 else 0,
        },
        "old_regime": {
            "total_deductions": old_deductions,
            "taxable_income": old_taxable,
            "tax_before_rebate": round(old_tax_pre, 2),
            "rebate_87a": round(old_rebate, 2),
            "tax_after_rebate": round(old_tax_after_rebate, 2),
            "cess_4pct": old_cess,
            "total_tax": old_total,
            "effective_rate_pct": round((old_total / income) * 100, 2) if income > 0 else 0,
        },
        "recommended_regime": recommended,
        "savings_by_choosing_recommended": savings,
        "suggestions": suggestions,
        "disclaimer": "Estimate based on FY 2025-26 rules. Consult a CA for final filing.",
    }
