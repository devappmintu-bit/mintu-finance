"""core/errors.py — canonical HTTPException factories.

Why this exists
---------------
The same `raise HTTPException(status_code=N, detail="...")` literal appeared
in many call sites across the codebase:

  "Invalid group_id"                        × 15
  "Group not found"                         × 12
  "User not found"                          × 10
  "Invalid target_user_id"                  ×  5
  "No outstanding debt to settle"           ×  5
  "Amount must be positive"                 ×  4
  "Invalid plan"                            ×  4
  "Order not found"                         ×  4
  "Goal not found"                          ×  4
  "Expense not found"                       ×  4

Centralising them:
  1. Keeps error copy consistent (no "Group Not Found" vs "Group not found" drift)
  2. Lets us localise error strings in one place later
  3. Lets us add structured error codes (e.g. `{"detail": {"code": "GROUP_NOT_FOUND"}}`) without touching 12 files

Usage
-----
    from core.errors import raise_group_not_found
    raise_group_not_found()

    from core.errors import raise_not_found
    raise_not_found("Invitation")   # → 404 "Invitation not found"
"""
from __future__ import annotations

from fastapi import HTTPException


# ══════════════════════════════════════════════════════════════════════
#  Generic factories
# ══════════════════════════════════════════════════════════════════════
def raise_bad_request(detail: str) -> "HTTPException":
    """400 Bad Request — always raise, never return."""
    raise HTTPException(status_code=400, detail=detail)


def raise_unauthorized(detail: str = "Not authenticated") -> "HTTPException":
    raise HTTPException(status_code=401, detail=detail)


def raise_forbidden(detail: str = "Forbidden") -> "HTTPException":
    raise HTTPException(status_code=403, detail=detail)


def raise_not_found(what: str) -> "HTTPException":
    """404 with message `f"{what} not found"` — e.g. raise_not_found("Goal")."""
    raise HTTPException(status_code=404, detail=f"{what} not found")


def raise_conflict(detail: str) -> "HTTPException":
    raise HTTPException(status_code=409, detail=detail)


# ══════════════════════════════════════════════════════════════════════
#  High-frequency specific factories (shortcuts for call sites above)
# ══════════════════════════════════════════════════════════════════════
def raise_invalid_id(field_name: str) -> "HTTPException":
    """Uniform 400 for malformed ObjectId strings (mirrors safe_oid)."""
    raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def raise_user_not_found() -> "HTTPException":
    raise HTTPException(status_code=404, detail="User not found")


def raise_group_not_found() -> "HTTPException":
    raise HTTPException(status_code=404, detail="Group not found")


def raise_expense_not_found() -> "HTTPException":
    raise HTTPException(status_code=404, detail="Expense not found")


def raise_goal_not_found() -> "HTTPException":
    raise HTTPException(status_code=404, detail="Goal not found")


def raise_order_not_found() -> "HTTPException":
    raise HTTPException(status_code=404, detail="Order not found")


def raise_positive_amount_required() -> "HTTPException":
    raise HTTPException(status_code=400, detail="Amount must be positive")


def raise_no_outstanding_debt() -> "HTTPException":
    raise HTTPException(status_code=400, detail="No outstanding debt to settle")
