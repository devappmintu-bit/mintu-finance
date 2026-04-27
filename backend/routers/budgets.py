"""Budgets router — CRUD for per-category spending limits."""
import os
import math
import json as json_mod
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from core import db, get_current_user
from core.ids import safe_oid

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:  # pragma: no cover
    LlmChat = UserMessage = None  # type: ignore

router = APIRouter(prefix="/budgets", tags=["budgets"])

# Categories list shared with frontend theme.ts — keep in sync.
KNOWN_CATEGORIES = [
    "Food", "Transport", "Shopping", "Bills", "Entertainment", "Healthcare",
    "Education", "Investment", "Groceries", "Rent", "Other",
]


class BudgetCreate(BaseModel):
    category: str
    amount: Optional[float] = None  # accept either `amount` (native) OR `limit` (spec alias)
    limit: Optional[float] = None
    period: str = "monthly"  # "daily" | "weekly" | "monthly"
    recurring: bool = True  # NEW — rolls over each period by default
    description: Optional[str] = None  # NEW — free-text; used for AI categorisation when category=="Other"
    goal_id: Optional[str] = None  # NEW — link this budget to a savings goal

    @field_validator("amount", "limit")
    @classmethod
    def _reject_nonfinite(cls, v):
        if v is None:
            return v
        try:
            fv = float(v)
        except Exception:
            raise ValueError("amount / limit must be a number")
        if not math.isfinite(fv):
            raise ValueError("amount / limit must be a finite number")
        return fv

    def resolved_amount(self) -> float:
        v = self.amount if self.amount is not None else self.limit
        if v is None or v < 0:
            raise ValueError("amount (or limit) must be a non-negative number")
        if not math.isfinite(float(v)):
            raise ValueError("amount (or limit) must be a finite number")
        return float(v)


class CategorizeRequest(BaseModel):
    description: str


async def _ai_map_to_category(description: str) -> str:
    """Given a user's free-text description, pick the best-fit category from
    KNOWN_CATEGORIES using GPT-4o. Falls back to 'Other' on any failure."""
    desc = (description or "").strip()
    if not desc:
        return "Other"
    # Quick heuristic fallback first — avoids LLM calls for obvious phrases
    low = desc.lower()
    for kw, cat in {
        "rent": "Rent", "emi": "Bills", "electricity": "Bills", "wifi": "Bills",
        "mobile": "Bills", "internet": "Bills", "grocery": "Groceries", "vegetable": "Groceries",
        "swiggy": "Food", "zomato": "Food", "restaurant": "Food", "coffee": "Food",
        "uber": "Transport", "ola": "Transport", "fuel": "Transport", "petrol": "Transport",
        "movie": "Entertainment", "netflix": "Entertainment", "spotify": "Entertainment",
        "amazon": "Shopping", "flipkart": "Shopping", "myntra": "Shopping",
        "doctor": "Healthcare", "hospital": "Healthcare", "medicine": "Healthcare",
        "course": "Education", "tuition": "Education", "school": "Education",
        "sip": "Investment", "mutual fund": "Investment", "stock": "Investment",
    }.items():
        if kw in low:
            return cat

    if not (LlmChat and UserMessage and os.environ.get("EMERGENT_LLM_KEY")):
        return "Other"

    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"budgetcat_{datetime.now(timezone.utc).timestamp()}",
            system_message=(
                "You classify a user's budget description into ONE category. "
                f"Respond with ONLY a JSON object: {{\"category\":\"<one-of: {', '.join(KNOWN_CATEGORIES)}>\"}}. "
                "Pick 'Other' only if NONE of the others fit. No prose, no markdown."
            ),
        ).with_model("openai", "gpt-4o")
        resp = await chat.send_message(UserMessage(text=f"Description: {desc}"))
        raw = (getattr(resp, "content", None) or str(resp) or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json_mod.loads(raw.strip().strip("`"))
        cat = str(data.get("category", "Other")).strip()
        return cat if cat in KNOWN_CATEGORIES else "Other"
    except Exception as e:
        logging.warning("AI categorise failed: %s", e)
        return "Other"


@router.post("/categorize")
async def categorize_description(req: CategorizeRequest, user_id: str = Depends(get_current_user)):
    """Map a free-text description → a known category (AI-assisted).

    Used by the Budget form: when the user picks 'Other' and types a description,
    we automatically propose a better-fitting category (or keep 'Other')."""
    cat = await _ai_map_to_category(req.description)
    return {"category": cat, "original_category": "Other", "description": req.description}


@router.get("/smart-setup")
async def smart_budget_setup(user_id: str = Depends(get_current_user)):
    """Per-category smart setup data for the Budget create/edit UX.

    Returns, for every category:
      • last_month_spend   — actual spend in the previous calendar month
      • three_month_avg    — mean monthly spend over the last 3 months
      • recommended        — AI-suggested budget (3-month avg × 0.9 i.e.
                              a gentle 10% savings nudge; floor 500)
      • risk_level         — relative to monthly_income (low / mod / high)
      • preset_amounts     — quick-chip presets snapped to sensible steps
                              around the recommended amount
    Also returns the user's `monthly_income` so the frontend can surface
    "savings potential" copy without an extra round-trip.
    """
    now = datetime.now(timezone.utc)
    # Previous month window
    first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_prev = first_of_this - timedelta(seconds=1)
    first_prev = last_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # 3-month window
    three_mo_start = (first_of_this - timedelta(days=92)).replace(day=1)

    # Pull user income
    try:
        u = await db.users.find_one({"_id": safe_oid(user_id)})
        income = float((u or {}).get("monthly_income") or (u or {}).get("income") or 0)
    except Exception:
        income = 0.0

    # Last-month spending per category
    last_month_map: Dict[str, float] = {}
    try:
        cursor = db.transactions.find({
            "user_id": user_id,
            "created_at": {"$gte": first_prev, "$lte": last_prev},
            "type": {"$in": ["expense", "debit", None]},
        })
        async for tx in cursor:
            cat = tx.get("category") or "Other"
            last_month_map[cat] = last_month_map.get(cat, 0.0) + float(tx.get("amount", 0) or 0)
    except Exception:
        pass

    # 3-month-avg spending per category
    three_mo_map: Dict[str, float] = {}
    months_counted = 3
    try:
        cursor = db.transactions.find({
            "user_id": user_id,
            "created_at": {"$gte": three_mo_start, "$lte": last_prev},
            "type": {"$in": ["expense", "debit", None]},
        })
        async for tx in cursor:
            cat = tx.get("category") or "Other"
            three_mo_map[cat] = three_mo_map.get(cat, 0.0) + float(tx.get("amount", 0) or 0)
    except Exception:
        pass

    # Existing budgets (so UI can prefill for edit)
    existing: Dict[str, Dict[str, Any]] = {}
    try:
        async for b in db.budgets.find({"user_id": user_id}):
            existing[b.get("category", "Other")] = {
                "id": str(b.get("_id")),
                "amount": float(b.get("amount", 0) or 0),
                "period": b.get("period", "monthly"),
                "recurring": b.get("recurring", True),
            }
    except Exception:
        pass

    categories = ["Food", "Transport", "Shopping", "Entertainment", "Bills", "Health", "Travel", "Groceries", "Education", "Other"]

    def _preset_steps(recommended: float) -> List[int]:
        """Generate 4 quick-pick amounts around the recommended value."""
        if recommended <= 0:
            return [1000, 2500, 5000, 10000]
        # Snap to 500 / 1000 depending on magnitude
        step = 500 if recommended < 10000 else 1000
        base = max(step, round(recommended / step) * step)
        return [int(max(step, base - step)), int(base), int(base + step), int(base + 2 * step)]

    def _risk(rec: float) -> str:
        if income <= 0:
            return "moderate"
        pct = (rec / income) * 100.0
        if pct < 10:
            return "low"
        if pct < 25:
            return "moderate"
        return "high"

    result = []
    for cat in categories:
        lm = round(last_month_map.get(cat, 0.0))
        three_total = three_mo_map.get(cat, 0.0)
        avg = round(three_total / months_counted) if three_total > 0 else lm
        # Recommendation: 3-mo avg × 0.9 (10% savings nudge), floor 500
        rec = max(500, int(round(avg * 0.9))) if avg > 0 else 0
        result.append({
            "category": cat,
            "last_month_spend": lm,
            "three_month_avg": avg,
            "recommended": rec,
            "risk_level": _risk(rec) if rec > 0 else "low",
            "preset_amounts": _preset_steps(rec),
            "existing_budget": existing.get(cat),
        })

    return {
        "monthly_income": income,
        "categories": result,
    }



@router.post("")
async def create_budget(budget: BudgetCreate, user_id: str = Depends(get_current_user)):
    """Upsert budget for a category (one per category per user)."""
    try:
        amount = budget.resolved_amount()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    existing = await db.budgets.find_one({"user_id": user_id, "category": budget.category})
    now = datetime.now(timezone.utc)

    if existing:
        await db.budgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"amount": amount, "period": budget.period, "recurring": budget.recurring, "description": budget.description}},
        )
        return {
            "id": str(existing["_id"]),
            "user_id": user_id,
            "category": budget.category,
            "amount": amount,
            "period": budget.period,
            "recurring": budget.recurring,
            "description": budget.description,
            "goal_id": budget.goal_id,
            "spent": existing.get("spent", 0),
            "created_at": existing.get("created_at", now),
        }

    doc = {"category": budget.category, "amount": amount, "period": budget.period, "recurring": budget.recurring, "description": budget.description, "goal_id": budget.goal_id, "user_id": user_id, "spent": 0, "created_at": now}
    result = await db.budgets.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "category": doc["category"],
        "amount": doc["amount"],
        "period": doc["period"],
        "recurring": doc["recurring"],
        "description": doc["description"],
        "spent": 0,
        "created_at": doc["created_at"],
    }


@router.put("/{budget_id}")
async def update_budget(budget_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Update budget amount / period / category. Owner-only."""
    updates: dict = {}
    # Accept both `amount` and `limit` aliases for the monetary cap
    if "amount" in data or "limit" in data:
        amt = data.get("amount", data.get("limit"))
        try:
            amt = float(amt)
            if not math.isfinite(amt): raise ValueError
            if amt < 0: raise ValueError
            updates["amount"] = amt
        except Exception:
            raise HTTPException(status_code=400, detail="amount / limit must be a finite, non-negative number")
    if "period" in data and data["period"] in ("daily", "weekly", "monthly"):
        updates["period"] = data["period"]
    if "category" in data and data["category"]:
        updates["category"] = data["category"]
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.budgets.update_one(
        {"_id": ObjectId(budget_id), "user_id": user_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    doc = await db.budgets.find_one({"_id": ObjectId(budget_id)})
    if doc:
        doc["id"] = str(doc["_id"]); del doc["_id"]
    return doc or {"id": budget_id, **updates}


def _period_start(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        return now - timedelta(days=7)
    return now - timedelta(days=30)  # monthly


@router.get("")
async def get_budgets(user_id: str = Depends(get_current_user)):
    """List all budgets with current `spent` computed against the period.

    Round 44 perf — was N+1 (one txn query per budget). Now we run a
    single aggregation per period type ($in on category) and bucket the
    sums in Python. With 5 budgets across 2 periods, the request drops
    from 5 round-trips to 2.
    """
    budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
    if not budgets:
        return []

    # Group budgets by period — each period needs a separate aggregation
    # because the date filter differs.
    by_period: dict[str, list[str]] = {}
    for b in budgets:
        by_period.setdefault(b["period"], []).append(b["category"])

    spent_map: dict[tuple[str, str], float] = {}  # (period, category) → spent
    for period, categories in by_period.items():
        pipeline = [
            {"$match": {
                "user_id": user_id,
                "type": "debit",
                "category": {"$in": categories},
                "date": {"$gte": _period_start(period)},
            }},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        ]
        async for doc in db.transactions.aggregate(pipeline):
            spent_map[(period, doc["_id"])] = float(doc["total"] or 0)

    for b in budgets:
        b["spent"] = spent_map.get((b["period"], b["category"]), 0.0)
        b["id"] = str(b.pop("_id"))
    return budgets


@router.delete("/{budget_id}")
async def delete_budget(budget_id: str, user_id: str = Depends(get_current_user)):
    result = await db.budgets.delete_one({"_id": ObjectId(budget_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}
