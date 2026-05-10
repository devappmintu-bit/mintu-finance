"""beta_waitlist router — public signup queue for App Store beta launch.

Endpoints (public, no auth required):
  POST /api/beta/waitlist       — register email (+ optional phone) for beta
  GET  /api/beta/stats          — total signups + recent activity (for
                                  social-proof counter on landing page)

Storage:
  Collection: `beta_waitlist`
  Document:
    {
      "_id": ObjectId,
      "email": str (lowercased + trimmed, unique key),
      "phone": Optional[str],
      "referrer": Optional[str],
      "platform_pref": Optional[Literal['ios','android','either']],
      "joined_at": datetime (UTC),
      "position": int (1-indexed FIFO),
      "ip_hash": Optional[str],
      "ua": Optional[str],
    }

Idempotency:
  Email is the natural key. Re-submitting the same email returns
  the existing position rather than creating duplicates. This lets
  the landing page show a deterministic "You're #1,234 in line"
  message even if the user double-taps the submit button.
"""
from __future__ import annotations

import hashlib
import re
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from core import db
from core.time import utc_now
import logging

logger = logging.getLogger("beta_waitlist")
router = APIRouter(prefix="/beta", tags=["beta"])

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


class WaitlistJoin(BaseModel):
    email: str = Field(..., min_length=4, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    referrer: Optional[str] = Field(None, max_length=80)
    platform_pref: Optional[Literal["ios", "android", "either"]] = None

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("invalid_email")
        return v

    @field_validator("phone")
    @classmethod
    def _norm_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        digits = re.sub(r"[^0-9+]", "", v)
        return digits or None


def _hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:16]


@router.post("/waitlist")
async def join_waitlist(payload: WaitlistJoin, request: Request):
    """Idempotent join — same email returns the same position."""
    email = payload.email
    existing = await db.beta_waitlist.find_one({"email": email})
    if existing:
        return {
            "ok": True,
            "already_joined": True,
            "position": int(existing.get("position", 0)) or 0,
            "joined_at": existing.get("joined_at"),
        }

    # Atomic-ish FIFO position counter.
    total = await db.beta_waitlist.count_documents({})
    next_pos = total + 1

    ip_hash = _hash_ip(request.client.host if request.client else None)
    ua = (request.headers.get("user-agent") or "")[:200]

    doc = {
        "email": email,
        "phone": payload.phone,
        "referrer": payload.referrer,
        "platform_pref": payload.platform_pref or "either",
        "joined_at": utc_now(),
        "position": next_pos,
        "ip_hash": ip_hash,
        "ua": ua,
    }
    try:
        await db.beta_waitlist.insert_one(doc)
    except Exception as e:  # likely a duplicate-key race
        logger.warning(f"waitlist insert race for {email}: {e}")
        existing = await db.beta_waitlist.find_one({"email": email})
        if existing:
            return {
                "ok": True,
                "already_joined": True,
                "position": int(existing.get("position", 0)) or 0,
                "joined_at": existing.get("joined_at"),
            }
        raise HTTPException(status_code=500, detail="waitlist_insert_failed")

    logger.info(f"beta_waitlist join · email={email} · pos={next_pos}")
    return {
        "ok": True,
        "already_joined": False,
        "position": next_pos,
        "joined_at": doc["joined_at"],
    }


@router.get("/stats")
async def waitlist_stats():
    """Public snapshot for the landing page social-proof counter.

    NEVER exposes individual rows — just the aggregate count + a
    rounded-to-the-nearest-100 displayable count for vanity. Used by
    the landing page to show "Join 4,200+ founders waiting" copy.
    """
    total = await db.beta_waitlist.count_documents({})
    # Round down to nearest 50 for the displayed count so it always
    # looks "earned" (1,234 is more credible than 1,237 on a banner).
    display = max(0, (total // 50) * 50)
    return {
        "total": total,
        "display": display,
    }
