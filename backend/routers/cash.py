"""cash router — quick natural-language cash entry + recurring expenses."""
import os
import re
import json
import logging
import hashlib
import hmac
import random
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import db, get_current_user, cache_get, cache_set, cache_clear_prefix


class RecurringExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    frequency: str  # "daily", "weekly", "monthly"


class QuickCashEntry(BaseModel):
    text: str  # e.g. "₹50 auto", "200 sabzi", "milk 50"


router = APIRouter(tags=["cash"])
api_router = router  # extracted code uses @api_router.*



@api_router.post("/cash/quick-entry")
async def quick_cash_entry(entry: QuickCashEntry, user_id: str = Depends(get_current_user)):
    """Parse natural language cash entry like '50 auto' or '200 sabzi'"""
    text = entry.text.strip()

    # Simple parser: extract amount and description
    amount_match = re.search(r'[\u20B9]?\s*(\d+(?:\.\d+)?)', text)
    if not amount_match:
        raise HTTPException(status_code=400, detail="Could not find amount. Try: '50 auto' or '₹200 groceries'")

    amount = float(amount_match.group(1))
    desc = re.sub(r'[\u20B9]?\s*\d+(?:\.\d+)?', '', text).strip()
    if not desc:
        desc = "Cash expense"

    # Simple keyword-based categorization for cash
    cat_map = {
        "auto": "Transport", "ola": "Transport", "uber": "Transport", "taxi": "Transport",
        "petrol": "Transport", "diesel": "Transport", "bus": "Transport", "metro": "Transport",
        "sabzi": "Groceries", "grocery": "Groceries", "vegetables": "Groceries", "fruits": "Groceries",
        "dmart": "Groceries", "kirana": "Groceries",
        "chai": "Food", "tea": "Food", "coffee": "Food", "lunch": "Food", "dinner": "Food",
        "breakfast": "Food", "snack": "Food", "biryani": "Food", "thali": "Food",
        "maid": "Bills", "bai": "Bills", "dhobi": "Bills", "cook": "Bills",
        "milk": "Groceries", "doodh": "Groceries", "bread": "Groceries",
        "newspaper": "Bills", "akhbar": "Bills",
        "medicine": "Healthcare", "doctor": "Healthcare", "pharmacy": "Healthcare",
        "temple": "Other", "mandir": "Other", "donation": "Other",
    }
    category = "Other"
    desc_lower = desc.lower()
    for keyword, cat in cat_map.items():
        if keyword in desc_lower:
            category = cat
            break

    trans_dict = {
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": desc,
        "type": "debit",
        "source": "cash",
        "date": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    result = await db.transactions.insert_one(trans_dict)

    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": desc,
        "type": "debit",
        "source": "cash",
        "date": trans_dict["date"],
        "created_at": trans_dict["created_at"]
    }


@api_router.post("/cash/recurring")
async def create_recurring_expense(expense: RecurringExpenseCreate, user_id: str = Depends(get_current_user)):
    """Create a recurring cash expense (maid, milk, newspaper etc.)"""
    rec = {
        "user_id": user_id,
        "description": expense.description,
        "amount": expense.amount,
        "category": expense.category,
        "frequency": expense.frequency,
        "active": True,
        "last_applied": None,
        "created_at": datetime.utcnow()
    }
    result = await db.recurring_expenses.insert_one(rec)
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "description": rec["description"],
        "amount": rec["amount"],
        "category": rec["category"],
        "frequency": rec["frequency"],
        "active": True,
        "created_at": rec["created_at"]
    }


@api_router.get("/cash/recurring")
async def get_recurring_expenses(user_id: str = Depends(get_current_user)):
    """Get all recurring expenses for user"""
    expenses = await db.recurring_expenses.find({"user_id": user_id, "active": True}).to_list(100)
    for e in expenses:
        e["id"] = str(e["_id"])
        del e["_id"]
    return expenses


@api_router.delete("/cash/recurring/{expense_id}")
async def delete_recurring_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    result = await db.recurring_expenses.delete_one({"_id": ObjectId(expense_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    return {"message": "Recurring expense deleted"}


@api_router.post("/cash/apply-recurring")
async def apply_recurring_expenses(user_id: str = Depends(get_current_user)):
    """Apply all due recurring expenses as transactions"""
    expenses = await db.recurring_expenses.find({"user_id": user_id, "active": True}).to_list(100)
    now = datetime.utcnow()
    added = 0

    for exp in expenses:
        last = exp.get("last_applied")
        should_apply = False

        if last is None:
            should_apply = True
        elif exp["frequency"] == "daily" and (now - last).days >= 1:
            should_apply = True
        elif exp["frequency"] == "weekly" and (now - last).days >= 7:
            should_apply = True
        elif exp["frequency"] == "monthly" and (now - last).days >= 28:
            should_apply = True

        if should_apply:
            await db.transactions.insert_one({
                "user_id": user_id,
                "amount": exp["amount"],
                "category": exp["category"],
                "description": exp["description"] + " (recurring)",
                "type": "debit",
                "source": "cash_recurring",
                "date": now,
                "created_at": now,
            })
            await db.recurring_expenses.update_one(
                {"_id": exp["_id"]},
                {"$set": {"last_applied": now}}
            )
            added += 1

    return {"applied": added, "total_recurring": len(expenses)}

