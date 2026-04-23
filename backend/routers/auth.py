"""Auth router — register, login, send/verify/resend OTP.

Extracted from server.py (Apr 21 2026 refactor) to keep server.py thin
and centralise auth flow logic in one place. Behaviour is byte-identical
to the previous inline implementation — no functional changes.
"""
import random
import string
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException

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
        "created_at": datetime.utcnow(),
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
        "created_at": {"$gte": datetime.utcnow() - timedelta(seconds=30)},
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
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        "created_at": datetime.utcnow(),
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
        "expires_at": {"$gte": datetime.utcnow()},
    })
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Please request a new one.")

    # Phone-level rate limit — protects against rotating-OTP brute force
    # (attacker requests new OTP after each 5-attempt cap). Count all
    # wrong-OTP attempts against this phone in the last hour; lock if too
    # many. Resets when the user successfully verifies OR 1 hour passes.
    hour_ago = datetime.utcnow() - timedelta(hours=1)
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
            "created_at": datetime.utcnow(),
        })
        remaining = MAX_OTP_ATTEMPTS - otp_record["attempts"] - 1
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")

    # Success — clear audit noise for this phone so future legit logins are unimpeded
    await db.otp_audit.delete_many({"phone": phone})
    await db.otps.update_one({"_id": otp_record["_id"]}, {"$set": {"verified": True}})

    user = await db.users.find_one({"phone": phone})
    if user:
        user_id = str(user["_id"])
        token = _create_token(user_id)
        return {
            "token": token,
            "is_new_user": False,
            "user": {
                "id": user_id,
                "phone": user["phone"],
                "name": user["name"],
                "money_score": user.get("money_score", 50),
            },
        }

    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Name is required for new users")

    new_user = {
        "phone": phone,
        "name": request.name.strip(),
        "password": _hash_password(''.join(random.choices(string.ascii_letters + string.digits, k=16))),
        "money_score": 50,
        "created_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(new_user)
    user_id = str(result.inserted_id)
    token = _create_token(user_id)

    return {
        "token": token,
        "is_new_user": True,
        "user": {
            "id": user_id,
            "phone": new_user["phone"],
            "name": new_user["name"],
            "money_score": new_user["money_score"],
        },
    }


# ── Resend OTP ──────────────────────────────────────────────────────────
@router.post("/auth/resend-otp")
async def resend_otp(request: OTPSendRequest):
    """Alias for send-otp with the same rate limiting."""
    return await send_otp(request)
