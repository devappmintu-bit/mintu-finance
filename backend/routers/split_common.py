"""Shared primitives for the split-* routers (schemas, constants, router)."""
import math
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

router = APIRouter(tags=["splits"])
api_router = router

# Local copy of settlement reward tiers (also in server.py for legacy refs)
SETTLEMENT_REWARDS = {
    "instant": {"coins": 15, "label": "Lightning Settler ⚡", "hours": 1},
    "same_day": {"coins": 10, "label": "Quick Payer 🏃", "hours": 24},
    "on_time": {"coins": 5, "label": "Reliable 👍", "hours": 72},
    "late": {"coins": 1, "label": "Better Late 🐢", "hours": 999999},
}


def _finite_positive(v: float) -> float:
    """Reject NaN/±Inf/negative. Round to 2 decimals."""
    if not math.isfinite(v):
        raise ValueError("amount must be a finite number")
    if v <= 0:
        raise ValueError("amount must be positive")
    if v > 1_00_00_00_000:                # ₹100 crore sanity cap
        raise ValueError("amount too large")
    return round(v, 2)


class SplitGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    members: List[str] = Field(..., min_length=1, max_length=50)
    custom_emoji: Optional[str] = None


class SplitExpenseCreate(BaseModel):
    group_id: str
    description: str = Field(..., min_length=1, max_length=300)
    amount: float
    paid_by: str
    split_type: str = "equal"
    splits: Optional[Dict[str, float]] = None

    @field_validator("amount")
    @classmethod
    def _amt(cls, v: float) -> float:
        return _finite_positive(v)


class SettlePayment(BaseModel):
    target_user_id: str
    amount: float
    txn_ref: Optional[str] = None
    method: str = "upi"
    group_id: Optional[str] = None
    coins_to_use: Optional[int] = Field(default=0, ge=0, le=1_00_000)

    @field_validator("amount")
    @classmethod
    def _amt(cls, v: float) -> float:
        return _finite_positive(v)


SETTLEMENT_BADGES = [
    {"id": "lightning", "name": "Lightning Settler", "emoji": "⚡", "desc": "Settle within 1 hour", "threshold": 3},
    {"id": "streak_5", "name": "5-Settle Streak", "emoji": "🔥", "desc": "5 consecutive on-time settlements", "threshold": 5},
    {"id": "generous", "name": "Generous Soul", "emoji": "💝", "desc": "Settled 10+ times", "threshold": 10},
    {"id": "zero_debt", "name": "Debt Free", "emoji": "🏆", "desc": "Zero outstanding balance", "threshold": 1},
]

