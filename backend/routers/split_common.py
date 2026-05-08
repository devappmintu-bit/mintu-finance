"""Shared primitives for the split-* routers (schemas, constants, router)."""
import hashlib
import math
import random
import re
import string
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

router = APIRouter(tags=["splits"])
api_router = router


# ── Phase 3 — Group code helper ─────────────────────────────────────
# Short, human-readable group identifier of the form `HSTL-7K2`. The
# 4-char prefix is derived from the group name's first alphanumeric
# letters (uppercased); the 3-char suffix is random — drawn from a
# Crockford-style alphabet that excludes confusable glyphs (0/O, 1/I).
# Collision rate at 32^3 ≈ 33k combinations per prefix; we still rely
# on a UNIQUE index on `group_code` plus DuplicateKeyError retry on
# create / find_one_and_update on backfill for race-safe issuance.
_GROUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0,O,1,I
# Hardening B — deterministic padding: consonants only, no vowels, no
# confusable digits. Lets short names like "Goa" pad to "GOAB" (or
# similar) reproducibly so a given name always produces the same prefix.
_PAD_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789"


def _prefix_from_name(name: str) -> str:
    """Take up to 4 uppercase alphanumeric chars from the name; if the
    result is shorter than 4, pad deterministically with consonants
    derived from a stable hash of the original name. Pure function —
    same input always returns same prefix."""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", name or "").upper()
    if not cleaned:
        cleaned = "GRP"
    prefix = cleaned[:4]
    if len(prefix) < 4:
        # Deterministic padding driven by md5 of the raw name; converted
        # to indices into the consonant alphabet so the result is also
        # human-readable and never produces vowels (avoids accidental
        # rude/profane words in the prefix).
        digest = hashlib.md5((name or "").encode("utf-8")).digest()
        pad = "".join(_PAD_ALPHABET[b % len(_PAD_ALPHABET)] for b in digest)
        prefix = (prefix + pad)[:4]
    return prefix


def generate_group_code(name: str, suffix_len: int = 3) -> str:
    """Generate a fresh `HSTL-7K2`-style group code. Caller is
    responsible for collision-checking against the DB. Pass
    `suffix_len=4` as a fallback if the 3-char namespace is exhausted
    for a given prefix (33K combos × 8 retries should never run dry in
    practice, but the option exists)."""
    prefix = _prefix_from_name(name)
    suffix = "".join(random.choices(_GROUP_CODE_ALPHABET, k=suffix_len))
    return f"{prefix}-{suffix}"


async def invalidate_split_cache_for_group(group_id: str, db) -> None:
    """Invalidate the split_groups list cache for all members of a group."""
    from core.cache import cache_clear_prefix
    try:
        group = await db.split_groups.find_one(
            {"_id": __import__("bson").ObjectId(group_id)},
            {"members": 1},
        )
        if group:
            for m in group.get("members", []):
                uid = m.get("user_id")
                if uid:
                    cache_clear_prefix(f"split_groups:{uid}")
    except Exception:
        pass

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


class SplitGroupMemberEntry(BaseModel):
    phone: str
    name: Optional[str] = None


class SplitGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    # R101B — accept EITHER:
    #   • members: ["9876543210", ...]                          (legacy)
    #   • entries: [{"phone": "9876543210", "name": "Rohan"}]   (new, names preserved)
    # When `entries` is provided, names are saved on pending_invites so
    # the UI never has to leak raw phone numbers as labels.
    members: List[str] = Field(default_factory=list, max_length=50)
    entries: Optional[List[SplitGroupMemberEntry]] = None
    custom_emoji: Optional[str] = None


class SplitExpenseCreate(BaseModel):
    # Round 51j — group_id is now Optional. When None, the expense is
    # saved as a "draft" (unattached, solo) via POST /split/expenses/draft
    # and can be attached to a group later via the /attach-to-group
    # endpoint. The legacy POST /split/expenses still requires a group_id
    # at the handler level, so existing flows are unaffected.
    group_id: Optional[str] = None
    description: str = Field(..., min_length=1, max_length=300)
    amount: float
    paid_by: Optional[str] = None
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

