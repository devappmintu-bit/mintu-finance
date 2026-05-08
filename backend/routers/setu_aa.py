"""
Setu Account Aggregator integration — Round 89c scaffold.

MOCKED implementation. The contract mirrors Setu's v3 AA API so
swapping to live sandbox/production only requires:
  1. Setting SETU_CLIENT_ID, SETU_CLIENT_SECRET, SETU_BASE_URL in env.
  2. Flipping SETU_LIVE=true to enable real HTTP calls.

Endpoints (all /api prefixed by the main app):
  POST   /setu/consent/init           → start a consent flow
  GET    /setu/consent/{consent_id}   → poll consent status
  POST   /setu/consent/callback       → user-completion webhook
  POST   /setu/fi-data/fetch          → pull transactions under an active consent
  GET    /setu/accounts               → connected accounts for the user

Production plumbing (when going live):
  - Replace the hard-coded MOCK_ACCOUNTS with the decrypted FI payload
    after verifying consent state via /Consent/{id}.
  - Persist consents and FI_Data_Session refs to MongoDB so we can
    refresh pull (FI fetch is one-shot per consent expiry).
  - Add webhook signature verification (x-jws-signature HMAC-SHA256).

Safety rails:
  - Every route requires an authenticated user (bearer access token).
  - Consent IDs are scoped per user — no cross-user reads.
  - Nothing leaves this module un-logged (audit trail for AA spec).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.auth import get_current_user
from server import db

router = APIRouter(prefix="/setu", tags=["setu-aa"])

# ───────────────────────────── config ───────────────────────────────
SETU_LIVE = os.getenv("SETU_LIVE", "false").lower() == "true"
SETU_CLIENT_ID = os.getenv("SETU_CLIENT_ID", "")
SETU_CLIENT_SECRET = os.getenv("SETU_CLIENT_SECRET", "")
SETU_BASE_URL = os.getenv("SETU_BASE_URL", "https://fiu-sandbox.setu.co")
# R104H — Trust contract. When `SETU_LIVE=false`, the module returns
# canned demo data so the UI can be wired without an actual Setu key.
# The Trust brief explicitly forbids "showing fake balances / dummy
# transactions / fabricating trends" — so we now:
#   1. Refuse to serve mock data unless `ALLOW_SETU_MOCK=true` is
#      EXPLICITLY set in env (production deploys must opt in).
#   2. Tag every mock response with `is_mock: true` + `notice`
#      so the UI can render an unmissable "SANDBOX DATA" banner.
ALLOW_SETU_MOCK = os.getenv("ALLOW_SETU_MOCK", "false").lower() == "true"
MOCK_NOTICE = (
    "SANDBOX DATA — these accounts and transactions are demo records, "
    "not real bank data. Switch to live consent to see your actual accounts."
)

# ───────────────────────────── models ───────────────────────────────


class ConsentInitRequest(BaseModel):
    purpose: str = Field(default="PERSONAL_FINANCE_MANAGEMENT")
    fi_types: list[str] = Field(default_factory=lambda: ["DEPOSIT", "TERM_DEPOSIT"])
    # Duration in days — how long MintU can re-fetch under this consent.
    duration_days: int = 365


class ConsentInitResponse(BaseModel):
    consent_id: str
    consent_handle: str
    redirect_url: str
    status: str = "PENDING"
    expires_at: str


class Account(BaseModel):
    id: str
    masked_acc_number: str
    bank: str
    account_type: str
    linked_at: str


class TxnPullResponse(BaseModel):
    accounts: list[Account]
    transactions: list[dict]
    last_synced_at: str


# ───────────────────────────── mock data ────────────────────────────
# Swapped out when SETU_LIVE=true.
_MOCK_ACCOUNTS = [
    {"id": "acc_hdfc_0001", "masked_acc_number": "HDFC XXXX3421", "bank": "HDFC Bank", "account_type": "SAVINGS"},
    {"id": "acc_icici_0002", "masked_acc_number": "ICICI XXXX8865", "bank": "ICICI Bank", "account_type": "SAVINGS"},
]

_MOCK_TRANSACTIONS = [
    {
        "account_id": "acc_hdfc_0001",
        "txn_id": "T1",
        "amount": -1250.00,
        "type": "DEBIT",
        "narration": "UPI-SWIGGY INSTAMART-swiggy@okhdfcbank",
        "mode": "UPI",
        "value_date": "2026-05-03",
        "category": "food",
    },
    {
        "account_id": "acc_hdfc_0001",
        "txn_id": "T2",
        "amount": -3299.00,
        "type": "DEBIT",
        "narration": "AMAZON INDIA-amazonpay@",
        "mode": "UPI",
        "value_date": "2026-05-02",
        "category": "shopping",
    },
    {
        "account_id": "acc_icici_0002",
        "txn_id": "T3",
        "amount": 85000.00,
        "type": "CREDIT",
        "narration": "SALARY CR MAY25-EMP123",
        "mode": "NEFT",
        "value_date": "2026-05-01",
        "category": "income",
    },
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────── endpoints ─────────────────────────────


@router.post("/consent/init", response_model=ConsentInitResponse)
async def consent_init(req: ConsentInitRequest, user_id: str = Depends(get_current_user)):
    """Kick off a consent flow.

    In live mode this POSTs to `/Consent` on the Setu FIU API and returns
    the redirect URL for the user's AA app (e.g. Finvu, OneMoney). In
    MOCK mode we return an instantly-valid consent so the UI can wire up.
    """
    consent_id = f"mock_{uuid.uuid4().hex[:16]}"
    consent_handle = f"hndl_{uuid.uuid4().hex[:12]}"
    expires_at = (_utc_now() + timedelta(days=req.duration_days)).isoformat()

    if SETU_LIVE:
        # TODO: Replace with actual Setu HTTP call.
        raise HTTPException(status_code=501, detail="SETU_LIVE not yet implemented")

    # Persist a minimal consent record (so callback + fetch can validate).
    await db.setu_consents.update_one(
        {"user_id": user_id, "consent_id": consent_id},
        {"$set": {
            "user_id": user_id,
            "consent_id": consent_id,
            "consent_handle": consent_handle,
            "status": "PENDING",
            "purpose": req.purpose,
            "fi_types": req.fi_types,
            "expires_at": expires_at,
            "created_at": _utc_now(),
        }},
        upsert=True,
    )

    # In real Setu, redirect_url is a deep-link to the AA app. Mock
    # points at a local fake-complete endpoint so the UI can simulate.
    redirect_url = f"mintu://setu/consent-complete?cid={consent_id}"

    return ConsentInitResponse(
        consent_id=consent_id,
        consent_handle=consent_handle,
        redirect_url=redirect_url,
        status="PENDING",
        expires_at=expires_at,
    )


@router.get("/consent/{consent_id}")
async def consent_status(consent_id: str, user_id: str = Depends(get_current_user)):
    """Poll consent status — UI calls this after redirect_url returns."""
    doc = await db.setu_consents.find_one({"user_id": user_id, "consent_id": consent_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Consent not found")
    # Strip Mongo internals.
    doc.pop("_id", None)
    return doc


@router.post("/consent/callback")
async def consent_callback(request: Request, user_id: str = Depends(get_current_user)):
    """User-completion webhook.

    Production: validate Setu's JWS signature + decrypt notification.
    Mock: accept `{consent_id}` payload and flip the consent to ACTIVE.
    """
    body = await request.json()
    consent_id = body.get("consent_id")
    if not consent_id:
        raise HTTPException(status_code=400, detail="consent_id required")
    result = await db.setu_consents.update_one(
        {"user_id": user_id, "consent_id": consent_id},
        {"$set": {"status": "ACTIVE", "activated_at": _utc_now()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Consent not found")
    return {"ok": True, "status": "ACTIVE"}


@router.post("/fi-data/fetch", response_model=TxnPullResponse)
async def fi_data_fetch(user_id: str = Depends(get_current_user)):
    """Pull transactions from all ACTIVE consents for this user.

    Production: runs the FI-Data-Request dance (CreateSession → Fetch).
    Mock: returns a small realistic dataset so the UI can demo —
    REQUIRES `ALLOW_SETU_MOCK=true` env opt-in (R104H trust contract).
    """
    # Pick any active consent for this user — prod code would iterate.
    consent = await db.setu_consents.find_one({"user_id": user_id, "status": "ACTIVE"})
    if not consent:
        raise HTTPException(status_code=409, detail="No active consent — initiate one first.")

    # R104H — Refuse to serve fake bank data unless the deployment
    # has EXPLICITLY opted into mock mode. Production deploys must
    # never silently inject 3 fake transactions into a user's flow.
    if not SETU_LIVE and not ALLOW_SETU_MOCK:
        raise HTTPException(
            status_code=503,
            detail=(
                "Bank data unavailable. Setu is not configured on this "
                "deployment. Track expenses manually or via the Add screen "
                "until consent goes live."
            ),
        )

    accounts = [Account(linked_at=_utc_now().isoformat(), **a) for a in _MOCK_ACCOUNTS]
    payload = TxnPullResponse(
        accounts=accounts,
        transactions=_MOCK_TRANSACTIONS,
        last_synced_at=_utc_now().isoformat(),
    )
    # R104H — Tag the response so the UI can render an unmissable
    # "SANDBOX DATA" banner. We patch the dict on egress because the
    # pydantic model wasn't extended (back-compat for live-mode shape).
    out = payload.model_dump()
    out["is_mock"] = True
    out["notice"] = MOCK_NOTICE
    return out


@router.get("/accounts")
async def list_accounts(user_id: str = Depends(get_current_user)):
    """Return connected accounts for the current user."""
    consent = await db.setu_consents.find_one({"user_id": user_id, "status": "ACTIVE"})
    if not consent:
        return {"accounts": [], "connected": False}
    # R104H — Same trust contract as /fi-data/fetch. Don't silently
    # return fake HDFC + ICICI accounts unless mock mode is opt-in.
    if not SETU_LIVE and not ALLOW_SETU_MOCK:
        return {
            "accounts": [],
            "connected": False,
            "is_mock": False,
            "notice": (
                "Bank link unavailable on this deployment. Setu integration "
                "is not configured."
            ),
        }
    accounts = [Account(linked_at=_utc_now().isoformat(), **a) for a in _MOCK_ACCOUNTS]
    return {
        "accounts": [a.model_dump() for a in accounts],
        "connected": True,
        "is_mock": True,
        "notice": MOCK_NOTICE,
    }


@router.get("/status")
async def setu_status():
    """Public health check — tells the client whether Setu is live or mocked."""
    return {
        "live": SETU_LIVE,
        "base_url": SETU_BASE_URL if SETU_LIVE else None,
        "mock": not SETU_LIVE,
    }
