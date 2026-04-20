"""Shared primitives for the split-* routers (schemas, constants, router)."""
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["splits"])
api_router = router

# Local copy of settlement reward tiers (also in server.py for legacy refs)
SETTLEMENT_REWARDS = {
    "instant": {"coins": 15, "label": "Lightning Settler ⚡", "hours": 1},
    "same_day": {"coins": 10, "label": "Quick Payer 🏃", "hours": 24},
    "on_time": {"coins": 5, "label": "Reliable 👍", "hours": 72},
    "late": {"coins": 1, "label": "Better Late 🐢", "hours": 999999},
}


class SplitGroupCreate(BaseModel):
    name: str
    members: List[str]  # List of phone numbers
    custom_emoji: Optional[str] = None  # Optional user-selected emoji icon (overrides auto-derived)


class SplitExpenseCreate(BaseModel):
    group_id: str
    description: str
    amount: float
    paid_by: str  # user_id of payer
    split_type: str = "equal"  # "equal", "custom", "shares"
    splits: Optional[Dict[str, float]] = None  # user_id -> amount (for custom) or user_id -> share_ratio (for shares)


class SettlePayment(BaseModel):
    target_user_id: str
    amount: float
    txn_ref: Optional[str] = None
    method: str = "upi"  # "upi", "cash", "bank_transfer"
    group_id: Optional[str] = None
    coins_to_use: Optional[int] = 0  # Optional coin redemption (applied as discount on cash outflow)


SETTLEMENT_BADGES = [
    {"id": "lightning", "name": "Lightning Settler", "emoji": "⚡", "desc": "Settle within 1 hour", "threshold": 3},
    {"id": "streak_5", "name": "5-Settle Streak", "emoji": "🔥", "desc": "5 consecutive on-time settlements", "threshold": 5},
    {"id": "generous", "name": "Generous Soul", "emoji": "💝", "desc": "Settled 10+ times", "threshold": 10},
    {"id": "zero_debt", "name": "Debt Free", "emoji": "🏆", "desc": "Zero outstanding balance", "threshold": 1},
]

