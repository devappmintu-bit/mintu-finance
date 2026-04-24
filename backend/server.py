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
#  SECURITY CONFIGURATION + MIDDLEWARE (extracted to core/middleware.py)
# ══════════════════════════════════════════════════════════════════════
from core.middleware import (  # noqa: E402,F401
    SecurityHeadersMiddleware,
    RateLimitMiddleware,
    AuditLogMiddleware,
    RATE_LIMIT_WINDOW,
    RATE_LIMIT_MAX_REQUESTS,
    AUTH_RATE_LIMIT_MAX,
    BRUTE_FORCE_LOCKOUT_MINUTES,
    BRUTE_FORCE_MAX_FAILURES,
    SENSITIVE_FIELDS,
    DATA_RETENTION_DAYS,
    OTP_DATA_RETENTION_MINUTES,
)


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


# ── Validation error handler ────────────────────────────────────────────
# FastAPI's default 422 response echoes the invalid `input` back to the
# client. When that input is a non-finite float (NaN / ±Infinity / etc.),
# Starlette's default JSONResponse renders with `allow_nan=False` and
# crashes → client sees 500 instead of 422. We fix this by:
#   1. Scrubbing non-finite floats in the error/body we build
#   2. Using a custom response class that tolerates NaN/Inf just in case
#      any nested object escapes the scrub.
from fastapi.exceptions import RequestValidationError
from starlette.responses import Response as _StarletteResponse
import math as _math
import json as _json


def _scrub_nonfinite(obj):
    if isinstance(obj, float) and not _math.isfinite(obj):
        return f"<non-finite:{obj}>"
    if isinstance(obj, list):
        return [_scrub_nonfinite(x) for x in obj]
    if isinstance(obj, tuple):
        return [_scrub_nonfinite(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _scrub_nonfinite(v) for k, v in obj.items()}
    if isinstance(obj, bytes):
        try: return _scrub_nonfinite(_json.loads(obj))
        except Exception: return obj.decode("utf-8", errors="replace")
    if isinstance(obj, BaseException):
        # Pydantic may stash the raw ValueError in the errors ctx dict.
        return str(obj)
    # Any remaining non-JSON-native type → coerce to str (last resort).
    if not isinstance(obj, (str, int, bool, type(None))):
        try:
            _json.dumps(obj)     # probe: is it serialisable?
            return obj
        except Exception:
            return repr(obj)
    return obj


class _SafeJSONResponse(_StarletteResponse):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return _json.dumps(
            _scrub_nonfinite(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = _scrub_nonfinite(exc.errors())
    body = _scrub_nonfinite(getattr(exc, "body", None))
    return _SafeJSONResponse(status_code=422, content={"detail": errors, "body": body})


# ── Invalid ObjectId handler (e.g. malformed path params) ───────────────
from bson.errors import InvalidId as _InvalidId


@app.exception_handler(_InvalidId)
async def _invalid_objectid_handler(request: Request, exc: _InvalidId):
    """Catches every bare `ObjectId("not-a-hex")` across all routers → 400.
    Defense-in-depth so downstream handlers don't have to wrap every ObjectId call."""
    return _SafeJSONResponse(status_code=400, content={"detail": "Invalid ID format"})
# ────────────────────────────────────────────────────────────────────────


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
    """Back-compat shim — delegates to the single hardened implementation in
    core/auth.py. Previously this file had a duplicate that skipped the
    dead-token DB check (Round 29 landmine). Keeping only the delegation
    so any residual `from server import get_current_user` call site
    still gets the correct, hardened behaviour."""
    from core.auth import get_current_user as _gcu
    return await _gcu(authorization)


# ══════════════════════════════════════════════════════════════════════
#  AI HELPERS (extracted to core/ai_helpers.py — re-exports for back-compat)
# ══════════════════════════════════════════════════════════════════════
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai import OpenAISpeechToText  # noqa: F401
except Exception:  # pragma: no cover
    LlmChat = UserMessage = OpenAISpeechToText = None  # type: ignore

from core.ai_helpers import (  # noqa: E402,F401
    parse_sms_with_ai,
    generate_insights_with_ai,
    send_expo_push,
)


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
# ══════════════════════════════════════════════════════════════════════
#  LEGACY AUTH SHIMS — actual endpoints relocated to routers/auth.py
#  on Apr 21 2026. Only these module-level helpers remain for
#  back-compat with a handful of callers in other routers.
# ══════════════════════════════════════════════════════════════════════
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 3
MOCK_OTP_MODE = True

def generate_otp() -> str:
    from routers.auth import generate_otp as _g
    return _g()


async def send_otp_sms(phone: str, otp: str) -> bool:
    from routers.auth import send_otp_sms as _s
    return await _s(phone, otp)


# ══════════════════════════════════════════════════════════════════════
#  MOUNT DOMAIN ROUTERS (all share the /api prefix)
# ══════════════════════════════════════════════════════════════════════
from routers import auth as auth_router  # noqa: E402
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
    premium_subscriptions as premium_subscriptions_router,
    ab as ab_router,
    share as share_router,
    privacy as privacy_router,
    budgets_ext as budgets_ext_router,
    alerts as alerts_router,
    upi as upi_router,
    insights_ext as insights_ext_router,
    gmail_oauth as gmail_oauth_router,
    home_bundle as home_bundle_router,
    rewards as rewards_router,
    split_insights as split_insights_router,
    goals as goals_router,
    profile_identity as profile_identity_router,
    profile_engine as profile_engine_router,
)

for r in (
    auth_router,
    news_router, referral_router, gamification_router, content_router,
    transactions_router, budgets_router, family_router, analytics_router,
    user_router, splits_router, ai_router, cash_router, notifications_router,
    sms_router, premium_router, premium_reports_router, premium_subscriptions_router,
    ab_router, share_router, privacy_router,
    budgets_ext_router, alerts_router, upi_router, insights_ext_router, gmail_oauth_router,
    home_bundle_router, rewards_router, split_insights_router, goals_router,
    profile_identity_router, profile_engine_router,
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
#  STARTUP / SHUTDOWN (extracted to core/lifecycle.py)
# ══════════════════════════════════════════════════════════════════════
from core.lifecycle import register_lifecycle  # noqa: E402
register_lifecycle(app, db, client)
