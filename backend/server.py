"""MintU FastAPI server — bootstrap, security middleware, auth routes.

All domain logic lives in routers/*.py. Shared static data lives in core/constants.py.
Pydantic schemas live in schemas.py. This file stays intentionally thin.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import time
import json as json_module
from pathlib import Path
from typing import Dict, Optional, Any
from datetime import datetime, timedelta, timezone
import jwt
import bcrypt
import re
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ══════════════════════════════════════════════════════════════════════
#  DATABASE + JWT CONFIG
# ══════════════════════════════════════════════════════════════════════
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30


# ══════════════════════════════════════════════════════════════════════
#  IN-MEMORY TTL CACHE (for hot AI endpoints) — back-compat re-exports
# ══════════════════════════════════════════════════════════════════════
_CACHE: Dict[str, tuple] = {}


def cache_get(key: str) -> Optional[Any]:
    v = _CACHE.get(key)
    if not v:
        return None
    value, expires = v
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    _CACHE[key] = (value, time.time() + ttl_seconds)


def cache_clear_prefix(prefix: str) -> None:
    for k in list(_CACHE.keys()):
        if k.startswith(prefix):
            _CACHE.pop(k, None)


# ══════════════════════════════════════════════════════════════════════
#  SECURITY CONFIGURATION
# ══════════════════════════════════════════════════════════════════════
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 1000  # per window — generous for SPA with parallel calls
AUTH_RATE_LIMIT_MAX = 30
BRUTE_FORCE_LOCKOUT_MINUTES = 15
BRUTE_FORCE_MAX_FAILURES = 5
SENSITIVE_FIELDS = ["password", "otp_hash", "_id", "otp"]
DATA_RETENTION_DAYS = 365
OTP_DATA_RETENTION_MINUTES = 10


# ══════════════════════════════════════════════════════════════════════
#  SECURITY MIDDLEWARE
# ══════════════════════════════════════════════════════════════════════
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP-based rate limiting to prevent DDoS and abuse."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        now = time.time()
        is_auth = "/auth/" in path
        max_req = AUTH_RATE_LIMIT_MAX if is_auth else RATE_LIMIT_MAX_REQUESTS
        window_start = now - RATE_LIMIT_WINDOW
        key = f"rate:{client_ip}:{1 if is_auth else 0}"

        # Read current counter for this key.
        doc = await db.rate_limits.find_one({"key": key})
        if doc and doc.get("window", 0) >= window_start:
            # Inside the current window — increment & check.
            new_count = (doc.get("count", 0) or 0) + 1
            if new_count > max_req:
                return Response(
                    content=json_module.dumps({"detail": "Rate limit exceeded. Please slow down."}),
                    status_code=429,
                    media_type="application/json",
                )
            await db.rate_limits.update_one(
                {"key": key},
                {"$set": {"window": doc.get("window", now)}, "$inc": {"count": 1}},
                upsert=True,
            )
        else:
            # Stale window — RESET count to 1 so we don't carry leftover counts
            # from the previous minute (this was the root cause of false 429s).
            await db.rate_limits.update_one(
                {"key": key},
                {"$set": {"window": now, "count": 1}},
                upsert=True,
            )

        return await call_next(request)


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Log all API access for compliance audit trail."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time

        if request.url.path.startswith("/api"):
            client_ip = request.client.host if request.client else "unknown"
            user_id = None
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                    user_id = payload.get("user_id")
                except Exception:
                    pass

            await db.audit_logs.insert_one({
                "timestamp": datetime.now(timezone.utc),
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "client_ip": hashlib.sha256(client_ip.encode()).hexdigest()[:16],
                "user_id": user_id,
                "duration_ms": round(duration * 1000, 2),
                "user_agent": request.headers.get("user-agent", "")[:100],
            })

        return response


# ══════════════════════════════════════════════════════════════════════
#  FASTAPI APP
# ══════════════════════════════════════════════════════════════════════
app = FastAPI(
    title="MintU API",
    description="AI-powered personal finance assistant",
    docs_url=None,
    redoc_url=None,
)
api_router = APIRouter(prefix="/api")


# ══════════════════════════════════════════════════════════════════════
#  INPUT SANITIZATION
# ══════════════════════════════════════════════════════════════════════
def sanitize_string(value: str, max_length: int = 500) -> str:
    """Remove HTML/null-bytes and cap length."""
    if not value:
        return value
    value = re.sub(r'<[^>]+>', '', value)
    value = value.replace('\x00', '')
    return value[:max_length].strip()


def sanitize_phone(phone: str) -> str:
    """Ensure phone is exactly 10 digits."""
    cleaned = re.sub(r'\D', '', phone)
    if len(cleaned) > 10:
        cleaned = cleaned[-10:]
    return cleaned


# ══════════════════════════════════════════════════════════════════════
#  CONSTANTS + PYDANTIC SCHEMAS (re-exports for back-compat)
# ══════════════════════════════════════════════════════════════════════
# Pydantic schemas — everything routers may still import from server
from schemas import *  # noqa: F401,F403,E402

# Static data + helpers — single source of truth in core/constants.py
from core.constants import (  # noqa: F401,E402
    INDIA_POPULATION_2025,
    MONEY_SCHOOL_LESSONS, MONEY_SCHOOL_CARDS, XP_LEVELS,
    AGENT_PROFILES, route_to_agent,
    WASTE_EQUIVALENCES, build_equivalences,
    PREMIUM_FEATURES, PRICING,
    UPI_APPS, SETTLEMENT_REWARDS,
    SAMPLE_INDIAN_SMS,
    LANG_NAMES, get_lang_instruction,
)

# Scoring helper re-exported from core/
from core.scoring import calculate_money_score  # noqa: F401,E402

# UPI helpers re-exported from core/
from core.upi import validate_upi_id, mask_upi_id  # noqa: F401,E402

# App download link + daily cards from core/content.py
from core.content import APP_DOWNLOAD_LINK, DAILY_CARDS  # noqa: F401,E402


# ══════════════════════════════════════════════════════════════════════
#  AUTH HELPERS
# ══════════════════════════════════════════════════════════════════════
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str) -> str:
    expiration = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    return jwt.encode({"user_id": user_id, "exp": expiration}, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(authorization: str = Header(...)) -> str:
    try:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization format")
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["user_id"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ══════════════════════════════════════════════════════════════════════
#  AI HELPERS (used by multiple routers via lazy import)
# ══════════════════════════════════════════════════════════════════════
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText  # noqa: F401
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore


async def parse_sms_with_ai(sms_text: str) -> Optional[Dict]:
    """Parse an Indian bank/UPI SMS into a transaction dict using LLM."""
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"sms_parse_{datetime.utcnow().timestamp()}",
            system_message="""You are an expert at parsing Indian bank and payment app SMS messages.
            Extract transaction details and return ONLY a valid JSON object with these exact keys:
            {"amount": float, "category": string, "description": string, "type": "debit" or "credit", "merchant": string}

            Categories must be one of: Food, Transport, Shopping, Bills, Entertainment, Healthcare, Education, Investment, Other
            Type must be either "debit" or "credit"
            If you cannot parse the SMS, return: {"error": "Could not parse SMS"}
            """,
        ).with_model("openai", "gpt-5.2")

        response = await chat.send_message(UserMessage(text=f"Parse this SMS and return JSON: {sms_text}"))

        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]

        import json
        parsed = json.loads(response_text)
        if "error" in parsed:
            return None
        return parsed
    except Exception as e:
        logging.error(f"AI SMS parsing error: {str(e)}")
        return None


async def generate_insights_with_ai(
    user_id: str,
    money_score: int,
    spending_summary: Dict[str, float],
    lang: str = "en",
) -> Dict:
    """Generate personalized weekly insights using LLM + user's transaction context."""
    try:
        now = datetime.utcnow()
        this_week_start = now - timedelta(days=now.weekday())
        last_week_start = this_week_start - timedelta(days=7)

        this_week_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": this_week_start},
        }).to_list(1000)
        prev_week_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": last_week_start, "$lt": this_week_start},
        }).to_list(1000)

        this_week_total = sum(t["amount"] for t in this_week_txns if t.get("type") == "debit")
        prev_week_total = sum(t["amount"] for t in prev_week_txns if t.get("type") == "debit")
        week_trend = "up" if this_week_total > prev_week_total else "down" if this_week_total < prev_week_total else "flat"

        this_week_cats: Dict[str, float] = {}
        prev_week_cats: Dict[str, float] = {}
        for t in this_week_txns:
            if t.get("type") == "debit":
                cat = t.get("category", "Other")
                this_week_cats[cat] = this_week_cats.get(cat, 0) + t["amount"]
        for t in prev_week_txns:
            if t.get("type") == "debit":
                cat = t.get("category", "Other")
                prev_week_cats[cat] = prev_week_cats.get(cat, 0) + t["amount"]

        top_category = max(this_week_cats, key=this_week_cats.get) if this_week_cats else "None"

        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_txns = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": month_start},
        }).to_list(2000)
        month_income = sum(t["amount"] for t in month_txns if t.get("type") == "credit")
        month_expense = sum(t["amount"] for t in month_txns if t.get("type") == "debit")
        savings_rate = ((month_income - month_expense) / month_income * 100) if month_income > 0 else 0

        budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
        budget_text = "\n".join(
            f"- {b['category']}: ₹{b.get('spent', 0):.0f}/₹{b['amount']:.0f}"
            for b in budgets
        ) or "No budgets set"

        alerts = []
        for b in budgets:
            spent = b.get("spent", 0)
            if spent >= b["amount"] * 0.8:
                pct = (spent / b["amount"]) * 100
                alerts.append(f"{b['category']} budget at {pct:.0f}%")

        spending_text = "\n".join(f"- {cat}: ₹{amt:.0f}" for cat, amt in sorted(this_week_cats.items(), key=lambda x: -x[1])[:5])
        alerts_text = "\n".join(f"- {a}" for a in alerts) or "None"

        system_prompt = """You are MintU AI — India's smartest money coach. Generate personalized insights:

1. Use the user's FULL context: money score, weekly trend, top categories, budgets, alerts
2. Compare this week vs last week with specific numbers
3. Call out overspending with empathy, not judgment
4. Suggest ONE clear action they can take this week
5. Reference Indian saving habits: SIP, FD, gold, EPF
6. Keep it concise — max 3 sentences per insight
7. Use casual Indian English — "yaar", "solid", "chill" are ok sparingly

Return ONLY valid JSON:
{
  "daily_insight": "2-3 sentence personalized insight about today/this week",
  "weekly_summary": "3-4 sentence summary comparing this week vs last week",
  "recommendations": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
  "savings_tip": "One specific way to save money this month",
  "mood": "great" | "good" | "okay" | "concerning" | "alert"
}""" + get_lang_instruction(lang)

        user_prompt = f"""FINANCIAL SNAPSHOT:
- Money Score: {money_score}/100
- This week total spent: ₹{this_week_total:.0f}
- Last week total spent: ₹{prev_week_total:.0f}
- Week trend: {week_trend}
- Top spending category: {top_category}
- Monthly income: ₹{month_income:.0f} | Monthly expenses: ₹{month_expense:.0f}
- Savings rate: {savings_rate:.0f}%
- {len(this_week_txns)} transactions this week

CATEGORY BREAKDOWN (this week):
{spending_text}

BUDGETS SET:
{budget_text}

ALERTS DETECTED:
{alerts_text}

Generate personalized insights based on this data."""

        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"insights_v2_{user_id}_{now.timestamp()}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=user_prompt))

        response_text = response.strip()
        if response_text.startswith("```"):
            parts = response_text.split("```")
            response_text = parts[1] if len(parts) > 1 else parts[0]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        import json
        parsed = json.loads(response_text)

        return {
            "insight_text": parsed.get("daily_insight", "Keep tracking your expenses!"),
            "weekly_summary": parsed.get("weekly_summary", ""),
            "recommendations": parsed.get("recommendations", ["Track all your expenses", "Set category budgets", "Review spending weekly"]),
            "savings_tip": parsed.get("savings_tip", ""),
            "mood": parsed.get("mood", "good"),
            "alerts": alerts,
            "trends": {
                "this_week_total": this_week_total,
                "prev_week_total": prev_week_total,
                "week_change_pct": ((this_week_total - prev_week_total) / prev_week_total * 100) if prev_week_total > 0 else 0,
                "top_category": top_category,
                "savings_rate": savings_rate,
                "category_trends": {
                    cat: {
                        "this_week": this_week_cats.get(cat, 0),
                        "last_week": prev_week_cats.get(cat, 0),
                        "change_pct": ((this_week_cats.get(cat, 0) - prev_week_cats.get(cat, 0)) / prev_week_cats.get(cat, 1) * 100) if prev_week_cats.get(cat, 0) > 0 else 0,
                    }
                    for cat in set(list(this_week_cats.keys()) + list(prev_week_cats.keys()))
                },
            },
        }
    except Exception as e:
        logging.error(f"AI insights v2 error: {str(e)}")
        return {
            "insight_text": "Keep up the good work tracking your finances!",
            "weekly_summary": "",
            "recommendations": ["Monitor your top spending categories", "Set budgets for better control", "Review your spending weekly"],
            "savings_tip": "Try setting up a SIP to automate savings",
            "mood": "good",
            "alerts": [],
            "trends": {},
        }


# ══════════════════════════════════════════════════════════════════════
#  PUSH NOTIFICATION HELPER (Expo Push API)
# ══════════════════════════════════════════════════════════════════════
import httpx  # noqa: E402


async def send_expo_push(token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification via the Expo Push API."""
    if not token or not token.startswith("ExponentPushToken"):
        return False
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "data": data or {}, "sound": "default"},
                headers={"Content-Type": "application/json"},
            )
            return resp.status_code == 200
    except Exception as e:
        logging.error(f"Push send error: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════
#  RAZORPAY CLIENT (used by routers/premium.py via server module)
# ══════════════════════════════════════════════════════════════════════
import razorpay  # noqa: E402
razorpay_client = razorpay.Client(
    auth=(os.environ.get('RAZORPAY_KEY_ID', ''), os.environ.get('RAZORPAY_KEY_SECRET', ''))
)


# ══════════════════════════════════════════════════════════════════════
#  AUTH ROUTES — register, login, OTP send/verify/resend
# ══════════════════════════════════════════════════════════════════════
@api_router.post("/auth/register")
async def register(user_data: UserCreate):  # type: ignore[name-defined]  # noqa: F405
    existing = await db.users.find_one({"phone": user_data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone already registered")

    user = {
        "phone": user_data.phone,
        "name": user_data.name,
        "password": hash_password(user_data.password),
        "money_score": 50,
        "created_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user)
    user_id = str(result.inserted_id)
    token = create_token(user_id)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone": user["phone"],
            "name": user["name"],
            "money_score": user["money_score"],
        },
    }


@api_router.post("/auth/login")
async def login(credentials: UserLogin):  # type: ignore[name-defined]  # noqa: F405
    user = await db.users.find_one({"phone": credentials.phone})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["_id"])
    token = create_token(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "phone": user["phone"],
            "name": user["name"],
            "money_score": user.get("money_score", 50),
        },
    }


# ── OTP config ─────────────────────────────────────────────────────────
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 3
MOCK_OTP_MODE = True  # Flip to False after integrating Twilio/MSG91


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


@api_router.post("/auth/send-otp")
async def send_otp(request: OTPSendRequest):  # type: ignore[name-defined]  # noqa: F405
    phone = request.phone.strip()
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(status_code=400, detail="Invalid phone number. Must be 10 digits.")

    recent_otp = await db.otps.find_one({
        "phone": phone,
        "created_at": {"$gte": datetime.utcnow() - timedelta(seconds=30)},
    })
    if recent_otp:
        raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting another OTP")

    otp_code = generate_otp()
    otp_hash = hash_password(otp_code)

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


@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):  # type: ignore[name-defined]  # noqa: F405
    phone = request.phone.strip()
    otp = request.otp.strip()

    otp_record = await db.otps.find_one({
        "phone": phone,
        "verified": False,
        "expires_at": {"$gte": datetime.utcnow()},
    })
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Please request a new one.")

    if otp_record["attempts"] >= MAX_OTP_ATTEMPTS:
        await db.otps.delete_one({"_id": otp_record["_id"]})
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new OTP.")

    await db.otps.update_one({"_id": otp_record["_id"]}, {"$inc": {"attempts": 1}})

    if not verify_password(otp, otp_record["otp_hash"]):
        remaining = MAX_OTP_ATTEMPTS - otp_record["attempts"] - 1
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")

    await db.otps.update_one({"_id": otp_record["_id"]}, {"$set": {"verified": True}})

    user = await db.users.find_one({"phone": phone})
    if user:
        user_id = str(user["_id"])
        token = create_token(user_id)
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
        "password": hash_password(''.join(random.choices(string.ascii_letters + string.digits, k=16))),
        "money_score": 50,
        "created_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(new_user)
    user_id = str(result.inserted_id)
    token = create_token(user_id)

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


@api_router.post("/auth/resend-otp")
async def resend_otp(request: OTPSendRequest):  # type: ignore[name-defined]  # noqa: F405
    """Alias for send-otp with the same rate limiting."""
    return await send_otp(request)


# ══════════════════════════════════════════════════════════════════════
#  MOUNT DOMAIN ROUTERS (all share the /api prefix)
# ══════════════════════════════════════════════════════════════════════
from routers import (  # noqa: E402
    news as news_router,
    referral as referral_router,
    gamification as gamification_router,
    content as content_router,
    transactions as transactions_router,
    budgets as budgets_router,
    family as family_router,
    analytics as analytics_router,
    user as user_router,
    splits as splits_router,
    ai as ai_router,
    cash as cash_router,
    notifications as notifications_router,
    sms as sms_router,
    premium as premium_router,
    premium_reports as premium_reports_router,
    ab as ab_router,
    share as share_router,
    privacy as privacy_router,
    budgets_ext as budgets_ext_router,
    alerts as alerts_router,
    upi as upi_router,
    insights_ext as insights_ext_router,
    gmail_oauth as gmail_oauth_router,
)

for r in (
    news_router, referral_router, gamification_router, content_router,
    transactions_router, budgets_router, family_router, analytics_router,
    user_router, splits_router, ai_router, cash_router, notifications_router,
    sms_router, premium_router, premium_reports_router, ab_router, share_router, privacy_router,
    budgets_ext_router, alerts_router, upi_router, insights_ext_router, gmail_oauth_router,
):
    api_router.include_router(r.router)

app.include_router(api_router)


# ══════════════════════════════════════════════════════════════════════
#  MIDDLEWARE REGISTRATION (order matters — last added runs first)
# ══════════════════════════════════════════════════════════════════════
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
#  LOGGING
# ══════════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  STARTUP / SHUTDOWN (single consolidated handlers)
# ══════════════════════════════════════════════════════════════════════
@app.on_event("startup")
async def on_startup():
    """Create all MongoDB indexes + start the news background worker."""
    try:
        # User
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("money_score")
        await db.users.create_index("referral_code")

        # Transactions
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("category", 1), ("date", -1)])

        # Budgets
        await db.budgets.create_index([("user_id", 1), ("category", 1)])

        # Splits
        await db.split_groups.create_index("created_by")
        await db.split_groups.create_index("members.user_id")
        await db.split_expenses.create_index("group_id")
        await db.split_expenses.create_index([("group_id", 1), ("created_at", -1)])

        # Rate limits + OTPs (TTL auto-cleanup)
        await db.rate_limits.create_index("key")
        await db.rate_limits.create_index("window", expireAfterSeconds=120)
        await db.otps.create_index("phone")
        await db.otps.create_index("expires_at", expireAfterSeconds=0)

        # Audit logs (90-day retention)
        await db.audit_logs.create_index("timestamp", expireAfterSeconds=90 * 24 * 60 * 60)

        # Cash entries
        await db.cash_entries.create_index([("user_id", 1), ("date", -1)])

        # Gmail OAuth / sync (TTL auto-cleanup of pending state tokens)
        await db.oauth_states.create_index("expires_at", expireAfterSeconds=0)
        await db.gmail_tokens.create_index("user_id", unique=True)
        await db.transactions.create_index([("user_id", 1), ("source_msg_id", 1)], sparse=True)

        logger.info("✅ MongoDB indexes created for 1.46B-scale performance")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")

    # Start background news refresher (fire-and-forget — no request blocking)
    try:
        from routers.news import start_news_worker
        start_news_worker()
    except Exception as e:
        logger.warning(f"Could not start news worker: {e}")

    # Start Gmail sync worker (15-min interval)
    try:
        from routers.gmail_oauth import start_gmail_worker
        start_gmail_worker()
    except Exception as e:
        logger.warning(f"Could not start Gmail worker: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
