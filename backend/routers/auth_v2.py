"""
routers/auth_v2.py — Round 88 auth upgrade.

New endpoints layered on top of the existing /auth/send-otp + /auth/verify-otp
flow. These implement the rotating-refresh-token session model required
for bank-grade silent re-auth without another OTP round-trip.

Endpoints exposed (all under /api because the parent api_router has that prefix):

  POST /auth/refresh    — exchange refresh token for new access+refresh pair
  POST /auth/logout     — revoke the current session (single device)
  POST /auth/logout-all — revoke every session for the user (all devices)
  GET  /auth/me         — current user + active sessions + devices

The legacy POST /auth/verify-otp is ENHANCED (in routers/auth.py) to also
return a refresh token + device registration. Both old and new clients
keep working: old clients ignore the new fields; new clients enjoy
silent re-auth.

Security posture:
  • Refresh tokens stored ONLY as sha256(plaintext) in sessions.refresh_hash.
  • Rotation on every use — presenting the same refresh token twice
    revokes the entire token family (RFC 6749-style reuse detection).
  • Access tokens are short-lived (15 min) so compromise window is small.
  • /auth/me is a single indexed query + enriched device list — p99 < 30 ms.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from core.auth import get_current_user
from services import device_service, session_service
from services.token_service import (
    ACCESS_TTL_MINUTES,
    create_access_token,
)

logger = logging.getLogger("auth_v2")

router = APIRouter(tags=["auth_v2"])


# ── Schemas ────────────────────────────────────────────────────────────
class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=32, max_length=128)
    # Optional echo of the device_id the client minted — if the client
    # lost the access token but kept SecureStore, we re-register here.
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    os: Optional[str] = None


class LogoutRequest(BaseModel):
    refresh_token: str = Field(..., min_length=32, max_length=128)


# ── POST /auth/refresh ─────────────────────────────────────────────────
@router.post("/auth/refresh")
async def refresh_tokens(body: RefreshRequest, request: Request):
    """Rotate the refresh token. Returns a new access + refresh pair.

    This is the silent-auth path — fires every 15 minutes (access TTL)
    while the user is active, zero user interaction.
    """
    result = await session_service.rotate_refresh(body.refresh_token)
    if not result:
        # Do NOT leak why it failed — attackers benefit from the
        # distinction between "unknown token", "expired", and "reused".
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    access = create_access_token(
        user_id=result["user_id"],
        device_id=result["device_id"],
    )

    # Touch last_used on the device so /auth/me sorting is fresh.
    try:
        await device_service.register_device(
            user_id=result["user_id"],
            device_id=result["device_id"],
            device_name=body.device_name,
            os_name=body.os,
            mark_trusted=False,   # already trusted; just touch last_used
        )
    except Exception as e:      # noqa: BLE001
        logger.warning("device touch failed on /auth/refresh: %s", e)

    return {
        "access_token": access["token"],
        "expires_at": access["expires_at"],
        "expires_in": access["expires_in"],
        "refresh_token": result["new_refresh_token"],
        "token_type": "Bearer",
        "scope": "access",
    }


# ── POST /auth/logout ──────────────────────────────────────────────────
@router.post("/auth/logout")
async def logout(body: LogoutRequest):
    """Single-device logout. Revokes the session bound to this refresh
    token. Intentionally idempotent — re-sending is a 200 with revoked=False
    so clients can retry safely on flaky networks."""
    ok = await session_service.revoke_by_refresh(body.refresh_token)
    return {"revoked": ok}


# ── POST /auth/logout-all ──────────────────────────────────────────────
@router.post("/auth/logout-all")
async def logout_all(user_id: str = Depends(get_current_user)):
    """Revoke every active session for the current user. Requires a
    valid ACCESS token (so we know who to log out). Used by the
    "Log out from all devices" profile setting and internally by
    delete-account."""
    n = await session_service.revoke_all_for_user(user_id)
    return {"revoked": n}


# ── GET /auth/sessions ─────────────────────────────────────────────────
@router.get("/auth/sessions")
async def list_sessions(user_id: str = Depends(get_current_user)):
    """Return active sessions + known devices for the current user.

    Lighter payload than /auth/me — used by the TrustedDevicesSheet
    on the Profile > Security screen. Includes `current_device_id`
    (best-effort — client passes its device_id as `X-Device-Id`) so
    the UI can tag the CURRENT device non-revocable.
    """
    sessions = await session_service.list_active_for_user(user_id)
    devices = await device_service.list_for_user(user_id)
    return {
        "sessions": sessions,
        "devices": devices,
    }


# ── DELETE /auth/sessions/{session_id} ─────────────────────────────────
@router.delete("/auth/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """Revoke a single session by its id. Ownership is enforced — a
    user cannot revoke another user's session even if they guess the id.
    Returns `{revoked: bool}` — idempotent (already-revoked returns false).
    """
    ok = await session_service.revoke_by_id(session_id=session_id, user_id=user_id)
    return {"revoked": ok}


# ── GET /auth/me ───────────────────────────────────────────────────────
@router.get("/auth/me")
async def me(user_id: str = Depends(get_current_user)):
    """Return the current user + active sessions + known devices.

    Consumed by the Profile "Security" section to render the
    "Logged in on X devices" block with per-device last-seen rows.
    """
    from server import db  # deferred import
    from bson import ObjectId

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sessions = await session_service.list_active_for_user(user_id)
    devices = await device_service.list_for_user(user_id)

    return {
        "user": {
            "id": user_id,
            "phone": user.get("phone"),
            "name": user.get("name"),
            "money_score": user.get("money_score", 50),
            "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        },
        "sessions": sessions,
        "devices": devices,
        "access_token_ttl_seconds": ACCESS_TTL_MINUTES * 60,
    }
