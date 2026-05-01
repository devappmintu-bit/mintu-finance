"""Money Score calculator — shared by multiple routes (transactions, stats)."""
import logging
from datetime import datetime, timedelta, timezone

from core.db import db
from core.time import utc_now


async def calculate_money_score(user_id: str) -> int:
    """Calculate daily money score (0-100) based on spending patterns in the last 7 days."""
    try:
        seven_days_ago = utc_now() - timedelta(days=7)
        transactions = await db.transactions.find(
            {"user_id": user_id, "date": {"$gte": seven_days_ago}}
        ).to_list(1000)

        if not transactions:
            return 50  # neutral — insufficient data

        total_debit = sum(t["amount"] for t in transactions if t["type"] == "debit")
        total_credit = sum(t["amount"] for t in transactions if t["type"] == "credit")
        budgets = await db.budgets.find({"user_id": user_id}).to_list(100)

        score = 50

        # Factor 1: spending-vs-income ratio (±20 points)
        if total_credit > 0:
            r = total_debit / total_credit
            if r < 0.5:
                score += 20
            elif r < 0.7:
                score += 10
            elif r > 1.0:
                score -= 20
            elif r > 0.9:
                score -= 10

        # Factor 2: budget adherence (±10 points)
        if budgets:
            violations = sum(
                1
                for b in budgets
                if sum(
                    t["amount"]
                    for t in transactions
                    if t["type"] == "debit" and t["category"] == b["category"]
                )
                > b["amount"]
            )
            budget_score = max(0, 20 - (violations * 10))
            score += budget_score - 10

        # Factor 3: transaction frequency (±10 points)
        n = len(transactions)
        if n < 3:
            score -= 10
        elif n > 20:
            score -= 5
        else:
            score += 10

        return max(0, min(100, score))
    except Exception as e:
        logging.error(f"Money score calculation error: {e}")
        return 50
