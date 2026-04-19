"""Central Pydantic schemas for the MintU backend.

Previously these lived inline in server.py (bloated to 1413 lines). Moving them
here lets server.py focus on app bootstrap while routers/* can import schemas
cleanly. For backward compatibility, server.py still re-exports every symbol
via `from schemas import *`.
"""
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel

# Re-export BudgetCreate from its router so existing back-compat imports keep working
from routers.budgets import BudgetCreate  # noqa: F401

# ─── Auth / User ───────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    phone: str
    name: str
    password: str


class UserLogin(BaseModel):
    phone: str
    password: str


class UserResponse(BaseModel):
    id: str
    phone: str
    name: str
    money_score: int = 50
    created_at: datetime


class OTPSendRequest(BaseModel):
    phone: str


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None  # Required for new users


# ─── Transactions ──────────────────────────────────────────────────────────
class TransactionCreate(BaseModel):
    amount: float
    category: str
    description: str
    type: str  # "debit" or "credit"
    date: Optional[datetime] = None


class TransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: float
    category: str
    description: str
    type: str
    date: datetime
    created_at: datetime


class SMSParseRequest(BaseModel):
    sms_text: str


# ─── Budgets / Insights ────────────────────────────────────────────────────
class BudgetResponse(BaseModel):
    id: str
    user_id: str
    category: str
    amount: float
    spent: float = 0
    period: str
    created_at: datetime


class DailyInsightResponse(BaseModel):
    money_score: int
    insight_text: str
    spending_summary: Dict[str, float]
    recommendations: List[str]
    generated_at: datetime


# ─── Cash Tracking ─────────────────────────────────────────────────────────
class RecurringExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    frequency: str  # "daily", "weekly", "monthly"


class QuickCashEntry(BaseModel):
    text: str  # e.g. "₹50 auto", "200 sabzi", "milk 50"


# ─── Device / Notifications ────────────────────────────────────────────────
class PushTokenRegister(BaseModel):
    push_token: str


class BiometricToggle(BaseModel):
    enabled: bool


# ─── Premium / Payments ────────────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    plan: str  # "monthly", "yearly", "intro"


# ─── AI Chat ───────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None
    lang: Optional[str] = "en"


__all__ = [
    # Auth
    "UserCreate", "UserLogin", "UserResponse",
    "OTPSendRequest", "OTPVerifyRequest",
    # Transactions
    "TransactionCreate", "TransactionResponse", "SMSParseRequest",
    # Budgets / Insights
    "BudgetCreate", "BudgetResponse", "DailyInsightResponse",
    # Cash
    "RecurringExpenseCreate", "QuickCashEntry",
    # Device
    "PushTokenRegister", "BiometricToggle",
    # Premium
    "CreateOrderRequest",
    # AI
    "ChatMessage",
]
