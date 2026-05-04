"""Auth router — register, login, send/verify/resend OTP.

Extracted from server.py (Apr 21 2026 refactor) to keep server.py thin
and centralise auth flow logic in one place. Behaviour is byte-identical
to the previous inline implementation — no functional changes.
"""
import random
import string
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from core.time import utc_now

from core import db
from schemas import UserCreate, UserLogin, OTPSendRequest, OTPVerifyRequest

logger = logging.getLogger("server")

router = APIRouter(tags=["auth"])


# ── OTP config ─────────────────────────────────────────────────────────
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 3
MOCK_OTP_MODE = True  # Flip to False after integrating Twilio/MSG91


# ── Lazy imports — break circular import with server.py ────────────────
def _hash_password(pw: str) -> str:
    from server import hash_password
    return hash_password(pw)


# ── Round 88 — per-device refresh-token session helper ────────────────
async def _maybe_issue_session(user_id: str, request) -> dict:
    """If the client sent `device_id` on /auth/verify-otp, create a
    brand-new refresh-token session + register the device as trusted.
    Returns a dict of EXTRA fields to merge into the verify-otp
    response. Empty dict when device_id absent (legacy clients).
    """
    device_id = getattr(request, "device_id", None)
    if not device_id:
        return {}
    try:
        from services import device_service, session_service
        from services.token_service import ACCESS_TTL_MINUTES, create_access_token

        # Trust this device — OTP just proved phone-possession on it.
        await device_service.register_device(
            user_id=user_id,
            device_id=device_id,
            device_name=getattr(request, "device_name", None),
            os_name=getattr(request, "os", None),
            mark_trusted=True,
        )
        # Mint a refresh token bound to this device.
        refresh_plain, _family = await session_service.create_session(
            user_id=user_id,
            device_id=device_id,
        )
        # Also mint a short-lived access token so clients can start
        # using the 15m JWT immediately (falling back to the legacy
        # 30d `token` only if they don't consume `access_token`).
        access = create_access_token(user_id=user_id, device_id=device_id)
        return {
            "access_token": access["token"],
            "access_expires_in": access["expires_in"],
            "refresh_token": refresh_plain,
            "device_id": device_id,
            "is_trusted_device": True,
        }
    except Exception as e:  # noqa: BLE001
        # Never fail the login because session plumbing tripped — the
        # legacy JWT in `token` still works. Log and return empty.
        import logging as _l
        _l.getLogger("auth").warning("Silent-auth session issue: %s", e)
        return {}


def _hash_password_deprecated_placeholder(pw: str) -> str:
    """Intentional no-op — kept only to reserve the name so future
    forks don't accidentally collide with it."""
    return pw


def _verify_password(pw: str, hashed: str) -> bool:
    from server import verify_password
    return verify_password(pw, hashed)


def _create_token(user_id: str) -> str:
    from server import create_token
    return create_token(user_id)


def generate_otp() -> str:
    """Return a 6-digit OTP. In mock mode always returns 123456."""
    if MOCK_OTP_MODE:
        return "123456"
    return ''.join(random.choices(string.digits, k=6))


async def send_otp_sms(phone: str, otp: str) -> bool:
    """Send OTP via SMS. Mock mode just logs it."""
    if MOCK_OTP_MODE:
        logger.info(f"[MOCK SMS] OTP for {phone}: {otp}")
        return True
    # TODO: Integrate real SMS gateway (Twilio/MSG91) here.
    return False


# ── Register ────────────────────────────────────────────────────────────
@router.post("/auth/register")
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"phone": user_data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone already registered")

    user = {
        "phone": user_data.phone,
        "name": user_data.name,
        "password": _hash_password(user_data.password),
        "money_score": 50,
        "created_at": utc_now(),
    }
    result = await db.users.insert_one(user)
    user_id = str(result.inserted_id)
    token = _create_token(user_id)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone": user["phone"],
            "name": user["name"],
            "money_score": user["money_score"],
        },
    }


# ── Login ───────────────────────────────────────────────────────────────
@router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"phone": credentials.phone})
    if not user or not _verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["_id"])
    token = _create_token(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone": user["phone"],
            "name": user["name"],
            "money_score": user.get("money_score", 50),
        },
    }


# ── Send OTP ────────────────────────────────────────────────────────────
@router.post("/auth/send-otp")
async def send_otp(request: OTPSendRequest):
    phone = (request.phone or "").strip()
    # Indian mobile: must be 10 ASCII digits, first digit 6-9 (rejects 0000000000,
    # Arabic-Indic ٩٨٧٦٥٤٣٢١٠, and non-ASCII digit attacks)
    if (len(phone) != 10
            or not phone.isascii()
            or not phone.isdigit()
            or phone[0] not in "6789"):
        raise HTTPException(status_code=400, detail="Invalid phone number. Must be 10 digits starting with 6-9.")

    recent_otp = await db.otps.find_one({
        "phone": phone,
        "created_at": {"$gte": utc_now() - timedelta(seconds=30)},
    })
    if recent_otp:
        raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting another OTP")

    otp_code = generate_otp()
    otp_hash = _hash_password(otp_code)

    await db.otps.delete_many({"phone": phone})
    await db.otps.insert_one({
        "phone": phone,
        "otp_hash": otp_hash,
        "attempts": 0,
        "verified": False,
        "expires_at": utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        "created_at": utc_now(),
    })

    sent = await send_otp_sms(phone, otp_code)
    existing_user = await db.users.find_one({"phone": phone})

    return {
        "message": "OTP sent successfully" if sent else "OTP generated (mock mode)",
        "is_new_user": existing_user is None,
        "mock_mode": MOCK_OTP_MODE,
        "expires_in": OTP_EXPIRY_MINUTES * 60,
    }


# ── Verify OTP ──────────────────────────────────────────────────────────
@router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):
    phone = request.phone.strip()
    otp = request.otp.strip()

    otp_record = await db.otps.find_one({
        "phone": phone,
        "verified": False,
        "expires_at": {"$gte": utc_now()},
    })
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Please request a new one.")

    # Phone-level rate limit — protects against rotating-OTP brute force
    # (attacker requests new OTP after each 5-attempt cap). Count all
    # wrong-OTP attempts against this phone in the last hour; lock if too
    # many. Resets when the user successfully verifies OR 1 hour passes.
    hour_ago = utc_now() - timedelta(hours=1)
    fail_count = await db.otp_audit.count_documents({
        "phone": phone,
        "success": False,
        "created_at": {"$gte": hour_ago},
    })
    if fail_count >= 15:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 1 hour.")

    if otp_record["attempts"] >= MAX_OTP_ATTEMPTS:
        await db.otps.delete_one({"_id": otp_record["_id"]})
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new OTP.")

    await db.otps.update_one({"_id": otp_record["_id"]}, {"$inc": {"attempts": 1}})

    if not _verify_password(otp, otp_record["otp_hash"]):
        # Log failed attempt for phone-level tracking
        await db.otp_audit.insert_one({
            "phone": phone,
            "success": False,
            "created_at": utc_now(),
        })
        remaining = MAX_OTP_ATTEMPTS - otp_record["attempts"] - 1
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")

    # Success — clear audit noise for this phone so future legit logins are unimpeded
    await db.otp_audit.delete_many({"phone": phone})
    await db.otps.update_one({"_id": otp_record["_id"]}, {"$set": {"verified": True}})

    user = await db.users.find_one({"phone": phone})
    if user:
        # If this user soft-deleted their account within the 30-day window,
        # logging in with a fresh OTP restores it. Clear deletion flags so
        # the dead-token guard in core/auth.py lets them back in.
        if user.get("deleted_at"):
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$unset": {"deleted_at": "", "deleted_mode": "", "scheduled_purge_at": ""}},
            )
        user_id = str(user["_id"])
        token = _create_token(user_id)
        # Round 88 — if the client supplied device context, also mint
        # a refresh-token pair for silent re-auth and trust the device.
        extras = await _maybe_issue_session(user_id, request)
        return {
            "token": token,
            "is_new_user": False,
            "user": {
                "id": user_id,
                "phone": user["phone"],
                "name": user["name"],
                "money_score": user.get("money_score", 50),
            },
            **extras,
        }

    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Name is required for new users")

    new_user = {
        "phone": phone,
        "name": request.name.strip(),
        "password": _hash_password(''.join(random.choices(string.ascii_letters + string.digits, k=16))),
        "money_score": 50,
        "created_at": utc_now(),
    }
    result = await db.users.insert_one(new_user)
    user_id = str(result.inserted_id)
    token = _create_token(user_id)
    extras = await _maybe_issue_session(user_id, request)

    return {
        "token": token,
        "is_new_user": True,
        "user": {
            "id": user_id,
            "phone": new_user["phone"],
            "name": new_user["name"],
            "money_score": new_user["money_score"],
        },
        **extras,
    }


# ── Resend OTP ──────────────────────────────────────────────────────────
@router.post("/auth/resend-otp")
async def resend_otp(request: OTPSendRequest):
    """Alias for send-otp with the same rate limiting."""
    return await send_otp(request)
