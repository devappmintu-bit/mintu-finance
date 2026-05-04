"""Central Pydantic schemas for the MintU backend.

Previously these lived inline in server.py (bloated to 1413 lines). Moving them
here lets server.py focus on app bootstrap while routers/* can import schemas
cleanly. For backward compatibility, server.py still re-exports every symbol
via `from schemas import *`.
"""
from datetime import datetime
from typing import Dict, List, Optional
import re

from pydantic import BaseModel, Field, field_validator
from pydantic import ConfigDict

# ── Indian phone regex — accepts "+91XXXXXXXXXX", "91XXXXXXXXXX", or
# bare 10-digit "9XXXXXXXXX". Hard-rejects dict/list/other types that
# tried to slip NoSQL operators like {"$ne": null} past Pydantic.
_PHONE_RE = re.compile(r"^(\+?91)?[6-9]\d{9}$")

def _validate_phone(v):
    if not isinstance(v, str):
        raise ValueError("phone must be a string")
    cleaned = v.replace(" ", "").replace("-", "")
    if not _PHONE_RE.match(cleaned):
        raise ValueError("phone must be a valid Indian mobile number")
    return cleaned

# Re-export BudgetCreate from its router so existing back-compat imports keep working
from routers.budgets import BudgetCreate  # noqa: F401

# ─── Auth / User ───────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str
    name: str
    password: str


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str
    password: str


class UserResponse(BaseModel):
    id: str
    phone: str
    name: str
    money_score: int = 50
    created_at: datetime


class OTPSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str

    @field_validator("phone", mode="before")
    @classmethod
    def _v(cls, v):
        return _validate_phone(v)


class OTPVerifyRequest(BaseModel):
    # Round 88 — relaxed to allow forward-compatible device_id / device_name /
    # os fields from Expo clients doing silent-auth registration.
    model_config = ConfigDict(extra="ignore")
    phone: str
    otp: str
    name: Optional[str] = None  # Required for new users
    # ── Round 88 auth upgrade ────────────────────────────────────────
    # Optional device context — when present, the verify-otp response
    # additionally carries a refresh token bound to this device. Old
    # clients that don't send these fields still work (no refresh
    # token returned → legacy 30-day JWT path).
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    os: Optional[str] = None

    @field_validator("phone", mode="before")
    @classmethod
    def _vp(cls, v):
        return _validate_phone(v)

    @field_validator("otp", mode="before")
    @classmethod
    def _vo(cls, v):
        if not isinstance(v, str) or not v.isdigit() or not (4 <= len(v) <= 8):
            raise ValueError("otp must be a 4-8 digit string")
        return v


# ─── Transactions ──────────────────────────────────────────────────────────
class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., gt=0, le=1_00_00_00_000)  # ₹100 Cr ceiling
    category: str = Field(..., min_length=1, max_length=50)
    description: str = Field(default="", max_length=500)
    type: str = Field(..., pattern="^(debit|credit)$")
    date: Optional[datetime] = None

    @field_validator("category")
    @classmethod
    def _strip_category(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("category cannot be empty")
        return v


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
    model_config = ConfigDict(extra="forbid")
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
