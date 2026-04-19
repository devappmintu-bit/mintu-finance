from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import hmac
import time
import json as json_module
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Callable
from datetime import datetime, timedelta, timezone, date as date_cls
from functools import wraps
import jwt
import bcrypt
import re
import random
import string
import uuid as uuid_lib
from bson import ObjectId
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

# ============== IN-MEMORY TTL CACHE (lightweight — for hot AI endpoints) ==============
_CACHE: Dict[str, tuple] = {}  # key -> (value, expires_at)

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

# ============== SECURITY CONFIGURATION ==============
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 1000  # per window — very generous for SPA with many parallel calls
AUTH_RATE_LIMIT_MAX = 30  # auth endpoints per window
BRUTE_FORCE_LOCKOUT_MINUTES = 15
BRUTE_FORCE_MAX_FAILURES = 5
SENSITIVE_FIELDS = ["password", "otp_hash", "_id", "otp"]
DATA_RETENTION_DAYS = 365  # 1 year for transaction data
OTP_DATA_RETENTION_MINUTES = 10  # OTPs auto-deleted after 10 min

# ============== SECURITY MIDDLEWARE ==============
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses — OWASP recommended"""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # XSS protection
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Cache control for sensitive data
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        return response

class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP-based rate limiting to prevent DDoS and abuse"""
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for preflight CORS and health checks
        if request.method == "OPTIONS":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Skip rate limiting for static/non-API routes
        if not path.startswith("/api/"):
            return await call_next(request)

        now = time.time()

        # Only rate-limit auth endpoints strictly; be generous with data endpoints
        is_auth = "/auth/" in path
        max_req = AUTH_RATE_LIMIT_MAX if is_auth else RATE_LIMIT_MAX_REQUESTS

        # Check rate limit in MongoDB
        window_start = now - RATE_LIMIT_WINDOW
        key = f"rate:{client_ip}:{1 if is_auth else 0}"

        count_doc = await db.rate_limits.find_one({"key": key, "window": {"$gte": window_start}})
        if count_doc and count_doc.get("count", 0) >= max_req:
            return Response(
                content=json_module.dumps({"detail": "Rate limit exceeded. Please slow down."}),
                status_code=429,
                media_type="application/json"
            )

        # Increment counter
        await db.rate_limits.update_one(
            {"key": key},
            {"$set": {"window": now}, "$inc": {"count": 1}},
            upsert=True
        )

        response = await call_next(request)
        return response

class AuditLogMiddleware(BaseHTTPMiddleware):
    """Log all API access for compliance audit trail"""
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time

        # Only log API calls, not static assets
        if request.url.path.startswith("/api"):
            client_ip = request.client.host if request.client else "unknown"
            # Extract user from auth header (non-blocking)
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
                "client_ip": hashlib.sha256(client_ip.encode()).hexdigest()[:16],  # Hash IP for privacy
                "user_id": user_id,
                "duration_ms": round(duration * 1000, 2),
                "user_agent": request.headers.get("user-agent", "")[:100],
            })

        return response

# Create the main app
app = FastAPI(
    title="MintU API",
    description="AI-powered personal finance assistant",
    docs_url=None,  # Disable Swagger in production
    redoc_url=None,
)
api_router = APIRouter(prefix="/api")

# ============== INPUT SANITIZATION ==============
def sanitize_string(value: str, max_length: int = 500) -> str:
    """Remove potentially dangerous characters and limit length"""
    if not value:
        return value
    # Strip HTML tags
    value = re.sub(r'<[^>]+>', '', value)
    # Remove null bytes
    value = value.replace('\x00', '')
    # Limit length
    return value[:max_length].strip()

def sanitize_phone(phone: str) -> str:
    """Ensure phone is exactly 10 digits"""
    cleaned = re.sub(r'\D', '', phone)
    if len(cleaned) > 10:
        cleaned = cleaned[-10:]  # Take last 10 digits (remove country code)
    return cleaned

# ============== LANGUAGE SUPPORT FOR AI ==============
LANG_NAMES = {
    "en": "English", "hi": "Hindi (हिन्दी)", "ta": "Tamil (தமிழ்)", "te": "Telugu (తెలుగు)",
    "mr": "Marathi (मराठी)", "bn": "Bengali (বাংলা)", "kn": "Kannada (ಕನ್ನಡ)",
    "gu": "Gujarati (ગુજરાતી)", "ml": "Malayalam (മലയാളം)", "as": "Assamese (অসমীয়া)"
}

def get_lang_instruction(lang: str) -> str:
    """Returns AI instruction for responding in the user's language"""
    if lang == "en" or lang not in LANG_NAMES:
        return ""
    return f"\n\nIMPORTANT: Respond ENTIRELY in {LANG_NAMES[lang]}. Use the native script. Keep ₹ amounts in digits. Do NOT respond in English."

# ============== Models ==============
class UserCreate(BaseModel):
    phone: str
    name: str
    password: str

class UserLogin(BaseModel):
    phone: str
    password: str

class UserResponse(BaseModel):
    id: str
    phone: str
    name: str
    money_score: int = 50
    created_at: datetime

class TransactionCreate(BaseModel):
    amount: float
    category: str
    description: str
    type: str  # "debit" or "credit"
    date: Optional[datetime] = None

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
    sms_text: str

# BudgetCreate moved to routers/budgets.py — re-exported for back-compat.
from routers.budgets import BudgetCreate  # noqa: F401, E402

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

# OTP Models
class OTPSendRequest(BaseModel):
    phone: str

class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None  # Required for new users

# Cash Tracking Models
class RecurringExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    frequency: str  # "daily", "weekly", "monthly"

class QuickCashEntry(BaseModel):
    text: str  # e.g. "₹50 auto", "200 sabzi", "milk 50"

# ============== Helper Functions ==============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    expiration = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    return jwt.encode(
        {"user_id": user_id, "exp": expiration},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )

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

async def parse_sms_with_ai(sms_text: str) -> Dict:
    """Parse SMS text using AI to extract transaction details"""
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
            """
        ).with_model("openai", "gpt-5.2")
        
        message = UserMessage(text=f"Parse this SMS and return JSON: {sms_text}")
        response = await chat.send_message(message)
        
        # Clean the response and parse JSON
        response_text = response.strip()
        # Remove markdown code blocks if present
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

# calculate_money_score moved to core/scoring.py — re-exported for back-compat.
from core.scoring import calculate_money_score  # noqa: F401

async def generate_insights_with_ai(user_id: str, money_score: int, spending_summary: Dict[str, float], lang: str = "en") -> Dict:
    """Generate personalized spending insights using AI — Enhanced Engine v2"""
    try:
        # ── DATA PIPELINE: Gather all analysis data ──
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)
        fourteen_days_ago = now - timedelta(days=14)
        thirty_days_ago = now - timedelta(days=30)

        # Current week transactions
        this_week_txns = await db.transactions.find({
            "user_id": user_id, "type": "debit", "date": {"$gte": seven_days_ago}
        }).to_list(1000)

        # Previous week transactions (for trend comparison)
        prev_week_txns = await db.transactions.find({
            "user_id": user_id, "type": "debit",
            "date": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}
        }).to_list(1000)

        # Monthly transactions
        month_txns = await db.transactions.find({
            "user_id": user_id, "date": {"$gte": thirty_days_ago}
        }).to_list(1000)

        # Budgets
        budgets = await db.budgets.find({"user_id": user_id}).to_list(100)

        # ── ANALYSIS: Compute metrics ──
        this_week_total = sum(t["amount"] for t in this_week_txns)
        prev_week_total = sum(t["amount"] for t in prev_week_txns)
        month_income = sum(t["amount"] for t in month_txns if t["type"] == "credit")
        month_expense = sum(t["amount"] for t in month_txns if t["type"] == "debit")

        # Category spending: this week vs last week
        this_week_cats = {}
        for t in this_week_txns:
            this_week_cats[t["category"]] = this_week_cats.get(t["category"], 0) + t["amount"]

        prev_week_cats = {}
        for t in prev_week_txns:
            prev_week_cats[t["category"]] = prev_week_cats.get(t["category"], 0) + t["amount"]

        # ── OVERSPENDING DETECTION ──
        alerts = []
        overspend_categories = []

        # 1. Week-over-week spike detection (>25% increase)
        for cat, amount in this_week_cats.items():
            prev_amount = prev_week_cats.get(cat, 0)
            if prev_amount > 0:
                pct_change = ((amount - prev_amount) / prev_amount) * 100
                if pct_change > 25:
                    alerts.append({
                        "type": "overspend",
                        "severity": "high" if pct_change > 50 else "medium",
                        "category": cat,
                        "message": f"You spent {pct_change:.0f}% more on {cat} this week (₹{amount:.0f} vs ₹{prev_amount:.0f} last week)",
                        "amount_diff": amount - prev_amount
                    })
                    overspend_categories.append(cat)

        # 2. Budget breach detection
        for budget in budgets:
            cat_spent = this_week_cats.get(budget["category"], 0)
            if budget["period"] == "monthly":
                cat_spent = sum(t["amount"] for t in month_txns if t["type"] == "debit" and t["category"] == budget["category"])
            pct_used = (cat_spent / budget["amount"] * 100) if budget["amount"] > 0 else 0
            if pct_used >= 100:
                alerts.append({
                    "type": "budget_breach",
                    "severity": "high",
                    "category": budget["category"],
                    "message": f"{budget['category']} budget exceeded! ₹{cat_spent:.0f} spent of ₹{budget['amount']:.0f} limit",
                    "amount_diff": cat_spent - budget["amount"]
                })
            elif pct_used >= 80:
                alerts.append({
                    "type": "budget_warning",
                    "severity": "medium",
                    "category": budget["category"],
                    "message": f"{budget['category']} budget is {pct_used:.0f}% used (₹{cat_spent:.0f} of ₹{budget['amount']:.0f})",
                    "amount_diff": 0
                })

        # 3. Unusual transaction detection (single txn > 3x daily average)
        if this_week_txns:
            daily_avg = this_week_total / 7
            for t in this_week_txns:
                if t["amount"] > daily_avg * 3 and t["amount"] > 500:
                    alerts.append({
                        "type": "anomaly",
                        "severity": "low",
                        "category": t["category"],
                        "message": f"Unusual spend: ₹{t['amount']:.0f} on {t['description']} ({t['category']}). Your daily average is ₹{daily_avg:.0f}",
                        "amount_diff": t["amount"]
                    })

        # ── TREND DATA for AI ──
        week_trend = "flat"
        if prev_week_total > 0:
            change_pct = ((this_week_total - prev_week_total) / prev_week_total) * 100
            week_trend = f"{'up' if change_pct > 0 else 'down'} {abs(change_pct):.0f}%"

        top_category = max(this_week_cats, key=this_week_cats.get) if this_week_cats else "None"
        savings_rate = ((month_income - month_expense) / month_income * 100) if month_income > 0 else 0

        # ── AI PROMPT ENGINEERING ──
        spending_text = ", ".join([f"{cat}: ₹{amt:.0f}" for cat, amt in sorted(spending_summary.items(), key=lambda x: -x[1])])
        alerts_text = "\n".join([f"- [{a['severity'].upper()}] {a['message']}" for a in alerts[:5]]) if alerts else "No alerts."
        budget_text = ", ".join([f"{b['category']}: ₹{b['amount']:.0f}" for b in budgets]) if budgets else "No budgets set."

        system_prompt = """You are MintU AI — a warm, witty Indian personal finance buddy.
You analyze spending data and provide ACTIONABLE insights. Your tone is friendly, like a smart friend — NOT a bank manager.

RULES:
1. Always use ₹ (Indian Rupee), refer to Indian services (Swiggy, Zomato, Ola, Uber, Paytm, PhonePe, Blinkit, D-Mart)
2. Be specific with numbers — say "₹2,400 on food" not "a lot on food"
3. Give ACTIONABLE advice — "Switch 2 Swiggy orders to home cooking" not "reduce food spending"
4. If spending is healthy, celebrate it! Be encouraging
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
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")

        response = await chat.send_message(UserMessage(text=user_prompt))

        # Clean and parse response
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
                        "change_pct": ((this_week_cats.get(cat, 0) - prev_week_cats.get(cat, 0)) / prev_week_cats.get(cat, 1) * 100) if prev_week_cats.get(cat, 0) > 0 else 0
                    }
                    for cat in set(list(this_week_cats.keys()) + list(prev_week_cats.keys()))
                }
            }
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
            "trends": {}
        }

# ============== Routes ==============
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"phone": user_data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone already registered")
    
    # Create user
    user = {
        "phone": user_data.phone,
        "name": user_data.name,
        "password": hash_password(user_data.password),
        "money_score": 50,
        "created_at": datetime.utcnow()
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
            "money_score": user["money_score"]
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
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
            "money_score": user.get("money_score", 50)
        }
    }

# ============== OTP Auth Routes ==============
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 3
MOCK_OTP_MODE = True  # Set to False when integrating real SMS (Twilio/MSG91)

def generate_otp() -> str:
    """Generate a 6-digit OTP. In mock mode, always returns 123456."""
    if MOCK_OTP_MODE:
        return "123456"
    return ''.join(random.choices(string.digits, k=6))

async def send_otp_sms(phone: str, otp: str) -> bool:
    """Send OTP via SMS. Mock mode just logs it."""
    if MOCK_OTP_MODE:
        logger.info(f"[MOCK SMS] OTP for {phone}: {otp}")
        return True
    # TODO: Integrate real SMS gateway (Twilio/MSG91)
    # Example for MSG91:
    # response = requests.post("https://api.msg91.com/api/v5/otp", json={
    #     "template_id": "YOUR_TEMPLATE_ID",
    #     "mobile": f"91{phone}",
    #     "otp": otp
    # }, headers={"authkey": os.environ.get("MSG91_AUTH_KEY", "")})
    # return response.status_code == 200
    return False

@api_router.post("/auth/send-otp")
async def send_otp(request: OTPSendRequest):
    phone = request.phone.strip()
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(status_code=400, detail="Invalid phone number. Must be 10 digits.")
    
    # Rate limit: max 1 OTP per 30 seconds
    recent_otp = await db.otps.find_one({
        "phone": phone,
        "created_at": {"$gte": datetime.utcnow() - timedelta(seconds=30)}
    })
    if recent_otp:
        raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting another OTP")
    
    # Generate and store OTP
    otp_code = generate_otp()
    otp_hash = hash_password(otp_code)
    
    # Remove old OTPs for this phone
    await db.otps.delete_many({"phone": phone})
    
    # Store new OTP
    await db.otps.insert_one({
        "phone": phone,
        "otp_hash": otp_hash,
        "attempts": 0,
        "verified": False,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        "created_at": datetime.utcnow()
    })
    
    # Send SMS
    sent = await send_otp_sms(phone, otp_code)
    
    # Check if user already exists
    existing_user = await db.users.find_one({"phone": phone})
    
    return {
        "message": "OTP sent successfully" if sent else "OTP generated (mock mode)",
        "is_new_user": existing_user is None,
        "mock_mode": MOCK_OTP_MODE,
        "expires_in": OTP_EXPIRY_MINUTES * 60
    }

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):
    phone = request.phone.strip()
    otp = request.otp.strip()
    
    # Find OTP record
    otp_record = await db.otps.find_one({
        "phone": phone,
        "verified": False,
        "expires_at": {"$gte": datetime.utcnow()}
    })
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Please request a new one.")
    
    # Check max attempts
    if otp_record["attempts"] >= MAX_OTP_ATTEMPTS:
        await db.otps.delete_one({"_id": otp_record["_id"]})
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new OTP.")
    
    # Increment attempts
    await db.otps.update_one(
        {"_id": otp_record["_id"]},
        {"$inc": {"attempts": 1}}
    )
    
    # Verify OTP
    if not verify_password(otp, otp_record["otp_hash"]):
        remaining = MAX_OTP_ATTEMPTS - otp_record["attempts"] - 1
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")
    
    # Mark OTP as verified
    await db.otps.update_one(
        {"_id": otp_record["_id"]},
        {"$set": {"verified": True}}
    )
    
    # Find or create user
    user = await db.users.find_one({"phone": phone})
    
    if user:
        # Existing user - login
        user_id = str(user["_id"])
        token = create_token(user_id)
        return {
            "token": token,
            "is_new_user": False,
            "user": {
                "id": user_id,
                "phone": user["phone"],
                "name": user["name"],
                "money_score": user.get("money_score", 50)
            }
        }
    else:
        # New user - need name
        if not request.name or not request.name.strip():
            raise HTTPException(status_code=400, detail="Name is required for new users")
        
        new_user = {
            "phone": phone,
            "name": request.name.strip(),
            "password": hash_password(''.join(random.choices(string.ascii_letters + string.digits, k=16))),
            "money_score": 50,
            "created_at": datetime.utcnow()
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
                "money_score": new_user["money_score"]
            }
        }

@api_router.post("/auth/resend-otp")
async def resend_otp(request: OTPSendRequest):
    """Alias for send-otp with same rate limiting"""
    return await send_otp(request)

# /user/me moved to routers/user.py
# (see api_router.include_router(user_router.router) below)

# ============== TRANSACTIONS ==============
# Moved to routers/transactions.py (see app.include_router below).
# Endpoints: POST /transactions, GET /transactions, DELETE /transactions/{id}, POST /transactions/parse-sms
# Pydantic models (TransactionCreate, SMSParseRequest) now live in routers/transactions.py

# [extracted to routers/ai.py - server.py:773..805]

# [extracted to routers/ - was /insights/weekly at lines 775..848]

# ============== BUDGETS ==============
# Core CRUD moved to routers/budgets.py:
#   POST /budgets, GET /budgets, DELETE /budgets/{id}
# Advanced/AI/family-budget endpoints remain in server.py (see below).

# /stats/overview moved to routers/analytics.py

# ============== VOICE INPUT (Whisper STT) ==============
from fastapi import UploadFile, File

# [extracted to routers/ai.py - server.py:892..932]

# ============== CASH TRACKING ROUTES ==============
# [extracted to routers/ - was /cash/quick-entry at lines 863..921]

# [extracted to routers/ - was /cash/recurring at lines 923..946]

# [extracted to routers/ - was /cash/recurring at lines 948..955]

# [extracted to routers/ - was /cash/recurring/{expense_id} at lines 957..963]

# [extracted to routers/ - was /cash/apply-recurring at lines 965..1002]

# ============== FAMILY GROUP ROUTES ==============
# ============== FAMILY GROUPS ==============
# Moved to routers/family.py (see app.include_router below).
# Endpoints: POST /family/create, POST /family/{id}/add-member, GET /family/my-groups,
#            POST /family/{id}/budget, GET /family/{id}/budgets, GET /family/{id}/summary
# Models (FamilyGroupCreate, FamilyMemberAdd, FamilyBudgetCreate) now live in routers/family.py

# ============== MONEY SCHOOL (Financial Literacy) ==============
MONEY_SCHOOL_LESSONS = [
    {"id": "sip_101", "title": "SIP: Your Wealth Machine", "category": "Investment", "content": "A Systematic Investment Plan (SIP) lets you invest ₹500-₹5,000/month into mutual funds automatically. At 12% annual returns, ₹5,000/month for 10 years becomes ₹11.6 lakhs! Start with any amount — even ₹500 works.", "tip": "Start a SIP today on Groww or Zerodha. Even ₹500/month makes a difference over 10 years."},
    {"id": "fd_basics", "title": "Fixed Deposits: Safe & Steady", "category": "Savings", "content": "FDs offer guaranteed 7-8% returns with zero risk. Best for emergency funds and short-term goals. Senior citizens get 0.5% extra. Pro tip: Ladder your FDs (split across 1yr, 2yr, 3yr) for better liquidity.", "tip": "Keep 3-6 months expenses in FD as emergency fund. Don't break it for shopping!"},
    {"id": "tax_80c", "title": "Save Tax with Section 80C", "category": "Tax", "content": "You can save up to ₹1.5 lakh/year in taxes under 80C. Options: ELSS mutual funds (best returns, 3yr lock-in), PPF (15yr, tax-free), NPS (extra ₹50K under 80CCD). Most salaried people overpay by ₹15,000-30,000!", "tip": "If you haven't invested in 80C yet, start an ELSS SIP. It saves tax AND grows your money."},
    {"id": "emergency_fund", "title": "The Emergency Fund Rule", "category": "Savings", "content": "Keep 3-6 months of expenses in a savings account or liquid fund. This protects you from job loss, medical emergencies, or car repairs without borrowing. Average Indian household needs ₹1-3 lakhs as emergency buffer.", "tip": "Calculate your monthly expenses × 6. That's your emergency fund target. Start saving towards it today."},
    {"id": "insurance_101", "title": "Term Insurance: ₹500/month for ₹1 Crore Cover", "category": "Insurance", "content": "Term insurance gives ₹50L-1Cr life cover for just ₹500-800/month if you're 25-35. It's the cheapest way to protect your family. Never mix insurance with investment (avoid ULIPs/endowment plans). Pure term = best value.", "tip": "If you have dependents, get a term insurance plan TODAY. Compare on PolicyBazaar."},
    {"id": "compound_interest", "title": "The Magic of Compounding", "category": "Investment", "content": "₹10,000/month at 12% returns: After 5 years = ₹8.2L, After 10 years = ₹23.2L, After 20 years = ₹99.9L! The secret? Start early. Someone who starts at 25 will have 3x more than someone starting at 35 with the same investment.", "tip": "The best time to start investing was yesterday. The second best time is today."},
    {"id": "credit_card_trap", "title": "Credit Card: Friend or Foe?", "category": "Budgeting", "content": "Credit cards charge 36-42% annual interest if you don't pay full amount. Minimum payment is a TRAP — a ₹50,000 balance takes 8+ years to clear with minimum payments! Always pay full balance. Use cards only for rewards, never for borrowing.", "tip": "Set up auto-pay for full credit card balance. Never carry forward a balance."},
    {"id": "50_30_20", "title": "The 50-30-20 Budget Rule", "category": "Budgeting", "content": "Allocate your income: 50% for Needs (rent, food, bills), 30% for Wants (dining, shopping, entertainment), 20% for Savings (SIP, FD, emergency). If earning ₹50,000/month: ₹25K needs, ₹15K wants, ₹10K savings.", "tip": "Open MintU budgets for each category and track against the 50-30-20 rule."},
    {"id": "health_insurance", "title": "Health Insurance Before Wealth", "category": "Insurance", "content": "One hospital stay can wipe out years of savings. A ₹5-10 lakh health cover costs ₹5,000-8,000/year for a family. Buy before 35 for lower premiums. Always take a family floater plan, not individual.", "tip": "If you don't have health insurance, get a ₹10L family floater this month. Compare on PolicyBazaar."},
    {"id": "gold_investing", "title": "Gold: Digital vs Physical", "category": "Investment", "content": "Indians love gold but physical gold has making charges (10-25%) and locker costs. Digital gold (Sovereign Gold Bonds, Gold ETFs) has zero making charges, gives 2.5% annual interest, and is tax-free after 8 years!", "tip": "Switch from buying physical gold to Sovereign Gold Bonds (SGB). Same gold, better returns, zero hassle."},
    {"id": "nps_retirement", "title": "NPS: Retire Like a King", "category": "Investment", "content": "National Pension System gives extra ₹50,000 tax deduction (above 80C). At 10% returns, ₹5,000/month from age 30 gives you ₹1.12 Crore at 60! Government employees get even better benefits.", "tip": "Open an NPS account on eNPS.nsdl.com. The extra ₹50K tax saving alone is worth it."},
    {"id": "emi_management", "title": "EMI Management: The 40% Rule", "category": "Budgeting", "content": "Total EMIs should never exceed 40% of take-home salary. If you earn ₹60,000/month, max EMI = ₹24,000. This includes home loan, car loan, personal loan, and BNPL. Beyond 40% = financial stress zone.", "tip": "Add up ALL your EMIs right now. If it's more than 40% of salary, focus on paying off the highest-interest loan first."},
    {"id": "ppf_power", "title": "PPF: Tax-Free Wealth Builder", "category": "Investment", "content": "Public Provident Fund gives 7.1% tax-free returns with ₹1.5L/year limit. After 15 years, ₹1.5L/year becomes ₹40+ lakhs — completely tax-free! It's the safest long-term investment in India after FD.", "tip": "Open a PPF account at your bank or post office. Max out ₹1.5L/year for tax-free compounding."},
    {"id": "avoid_lifestyle", "title": "Lifestyle Inflation: The Silent Killer", "category": "Budgeting", "content": "Got a raise? Don't upgrade everything. If salary goes from ₹50K to ₹70K, save the ₹20K difference instead of upgrading car/house. This is how millionaires are made — they invest raises, not spend them.", "tip": "Next time you get a raise, increase your SIP by the same amount. Your future self will thank you."},
    {"id": "upi_safety", "title": "UPI Safety: Protect Your Money", "category": "Security", "content": "Never share UPI PIN, OTP, or scan QR codes sent by strangers. Fraudsters pose as bank officials or buyers. Remember: you NEVER need to scan QR or enter PIN to RECEIVE money. If someone asks you to, it's a scam.", "tip": "Enable UPI transaction limits in your bank app. Set daily limit to what you actually need."},
]

# [extracted to routers/ai.py - server.py:1102..1105]

# [extracted to routers/ai.py - server.py:1107..1144]

# ============== PUSH NOTIFICATIONS ==============
class PushTokenRegister(BaseModel):
    push_token: str

# [extracted to routers/ - was /notifications/register-token at lines 1038..1046]

# [extracted to routers/ - was /notifications/check-budget-alerts at lines 1048..1075]

# ============== BIOMETRIC AUTH ==============
class BiometricToggle(BaseModel):
    enabled: bool

# /user/biometric (PUT+GET) moved to routers/user.py

# ============== BULK SMS IMPORT ==============
SAMPLE_INDIAN_SMS = [
    "Your A/c XX1234 is debited for Rs.450.00 on 15-Apr-26. Info: UPI/SWIGGY/Payment",
    "Rs.2500.00 credited to your A/c XX1234 on 15-Apr-26 by NEFT-SALARY-COMPANY",
    "Your SBI A/c X5678 debited Rs.150.00 on 14Apr UPI-Ola Cabs",
    "ICICI Bank Acct XX9012 debited with Rs 1,200.00 on 14-APR-26; Info:AMAZON",
    "You paid Rs.80 to Tea Junction via Paytm Wallet",
    "Sent Rs.300 to Zomato from HDFC XX1234 via UPI",
    "Rs.35000.00 credited to your A/c XX1234 by NEFT from ACME CORP SALARY APR26",
    "Your A/c XX1234 debited Rs.500.00 ATM Cash Withdrawal",
    "Rs.199 debited from your Axis Bank A/c for NETFLIX subscription",
    "Your HDFC A/c XX1234 debited Rs.3500.00 for Electricity Bill TATA POWER",
    "Paid Rs.250 to PhonePe for BigBasket order",
    "Your A/c XX1234 debited Rs.1800.00 on 12-Apr-26. Info: UPI/MYNTRA/Shopping",
]

# [extracted to routers/ - was /sms/sample-inbox at lines 1099..1102]

# [extracted to routers/ - was /sms/bulk-parse at lines 1104..1139]

# ============== SPLITWISE-LIKE SPLIT EXPENSES ==============
# [extracted to routers/splits.py - server.py:1254..1256]

# [extracted to routers/splits.py - server.py:1258..1264]

# [extracted to routers/splits.py - server.py:1266..1296]

# [extracted to routers/splits.py - server.py:1298..1316]

# [extracted to routers/splits.py - server.py:1318..1357]

# [extracted to routers/splits.py - server.py:1359..1370]

# [extracted to routers/splits.py - server.py:1372..1399]

# [extracted to routers/splits.py - server.py:1401..1445]

# ============== 1. REFERRAL SYSTEM ==============

# ============== 1. REFERRAL SYSTEM ==============
# Moved to routers/referral.py (see app.include_router below).
# Endpoints: GET /referral/my-code, POST /referral/apply, GET /referral/leaderboard, GET /referral/enhanced-status

# ============== 2. GAMIFICATION ENGINE ==============
# Moved to routers/gamification.py (see app.include_router below).
# Endpoints: GET /gamification/status (streak, badges, weekly challenge).
# BADGES + WEEKLY_CHALLENGES constants now live in routers/gamification.py
# (importable via `from routers.gamification import BADGES, WEEKLY_CHALLENGES` if needed elsewhere).

# ============== 3. PREMIUM/FREEMIUM SYSTEM ==============
PREMIUM_FEATURES = {
    "ai_smart_coach": {"name": "AI Smart Coach", "desc": "Personalized weekly money advice"},
    "waste_analysis": {"name": "Waste Analysis", "desc": "Find hidden spending leaks"},
    "goal_planning": {"name": "Goal Planning", "desc": "Save ₹1L in 6 months with a step-by-step plan"},
    "advanced_insights": {"name": "Advanced Insights", "desc": "Category trends, peer comparison"},
    "unlimited_budgets": {"name": "Unlimited Budgets", "desc": "Set budgets for every category"},
    "family_budgets": {"name": "Family Budgets", "desc": "Shared household budget tracking"},
    "ad_free": {"name": "Ad-Free", "desc": "Clean, distraction-free experience"},
}

PRICING = {
    "monthly": {"price": 99, "label": "₹99/month"},
    "yearly": {"price": 499, "label": "₹499/year", "savings": "58% off", "best_seller": True},
    "intro": {"price": 29, "label": "₹29 first month", "trial": True},
}

# Razorpay client
import razorpay
razorpay_client = razorpay.Client(auth=(os.environ.get('RAZORPAY_KEY_ID', ''), os.environ.get('RAZORPAY_KEY_SECRET', '')))

class CreateOrderRequest(BaseModel):
    plan: str  # "monthly", "yearly", "intro"

# [extracted to routers/ - was /premium/status at lines 1194..1210]

# [extracted to routers/ - was /premium/paywall-trigger at lines 1212..1234]

# [extracted to routers/ - was /premium/create-order at lines 1236..1270]

# [extracted to routers/ - was /premium/verify-payment at lines 1272..1310]

# [extracted to routers/ - was /premium/ai-coach at lines 1312..1361]

# ============== 4. SMART NOTIFICATIONS ==============
# [extracted to routers/ - was /notifications/smart-triggers at lines 1364..1438]

# ============== A/B TEST SYSTEM ==============
import hashlib as _hashlib

# [extracted to routers/ - was /ab/paywall-group at lines 1443..1460]

# [extracted to routers/ - was /ab/track-event at lines 1462..1472]

# [extracted to routers/ - was /ab/results at lines 1474..1491]

# ============== STORY CARD DATA ==============
# [extracted to routers/ - was /share/score-card at lines 1494..1522]

# ============== PUSH NOTIFICATION CRON ==============
import httpx

async def send_expo_push(token: str, title: str, body: str, data: dict = None):
    """Send push notification via Expo Push API"""
    if not token or not token.startswith("ExponentPushToken"):
        return False
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "data": data or {}, "sound": "default"},
                headers={"Content-Type": "application/json"}
            )
            return resp.status_code == 200
    except Exception as e:
        logging.error(f"Push send error: {e}")
        return False

# [extracted to routers/ - was /notifications/cron-check at lines 1543..1605]

# ============== DATA PROTECTION & COMPLIANCE ROUTES ==============
# GDPR Art. 15/20 + India DPDP Act 2023 Sec. 11 — Right to Access & Portability
# [extracted to routers/ - was /privacy/data-export at lines 1609..1651]

# GDPR Art. 17 + India DPDP Act 2023 Sec. 12 — Right to Erasure
# [extracted to routers/ - was /privacy/delete-account at lines 1654..1677]

# GDPR Art. 13-14 + DPDP Sec. 5 — Privacy Notice
# [extracted to routers/ - was /privacy/policy at lines 1680..1734]

# Data retention cleanup endpoint
# [extracted to routers/ - was /privacy/cleanup-expired at lines 1737..1756]

# ============== PHASE 1: RETENTION ENGINE — Built for 1.46B Indians ==============

# --- India population context for comparisons ---
INDIA_POPULATION_2025 = 1_460_000_000

# --- Fun equivalences for Waste Detector (INR) ---
WASTE_EQUIVALENCES = [
    {"threshold": 500, "emoji": "☕", "text": "{count} Starbucks coffees"},
    {"threshold": 1000, "emoji": "🍕", "text": "{count} Domino's pizza nights"},
    {"threshold": 2000, "emoji": "🎬", "text": "{count} movie dates with popcorn"},
    {"threshold": 3000, "emoji": "👟", "text": "{count} pairs of Nike shoes in a year"},
    {"threshold": 5000, "emoji": "✈️", "text": "{count} weekend trips to Goa"},
    {"threshold": 8000, "emoji": "📱", "text": "1 iPhone in {months} months"},
    {"threshold": 10000, "emoji": "🏍️", "text": "1 Royal Enfield in {months} months"},
    {"threshold": 15000, "emoji": "💻", "text": "1 MacBook in {months} months"},
    {"threshold": 25000, "emoji": "🚗", "text": "1 car down-payment in {months} months"},
    {"threshold": 50000, "emoji": "🏠", "text": "Towards a flat down-payment in {months} months"},
]

def build_equivalences(monthly_amount: float) -> list:
    """Build fun spending equivalences for waste detector"""
    results = []
    yearly = monthly_amount * 12
    for eq in WASTE_EQUIVALENCES:
        if monthly_amount >= eq["threshold"] * 0.3:
            if "{count}" in eq["text"]:
                count = int(yearly / eq["threshold"])
                if count > 0:
                    results.append({"emoji": eq["emoji"], "text": eq["text"].format(count=count)})
            elif "{months}" in eq["text"]:
                months = max(1, int(eq["threshold"] / max(monthly_amount, 1)))
                results.append({"emoji": eq["emoji"], "text": eq["text"].format(months=months)})
    return results[:4]  # Top 4 most impactful

# 1. AI FINANCIAL COACH (CHAT)
class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None
    lang: Optional[str] = "en"

# [extracted to routers/ai.py - server.py:1910..2000]

# 2. WASTE DETECTOR
# [extracted to routers/ai.py - server.py:2003..2121]

# 3. WEEKLY REPORT
# /reports/weekly moved to routers/analytics.py

# 4. SMART BUDGET AUTO-CREATION
# [extracted to routers/ - was /budgets/smart-suggest at lines 1807..1869]

# [extracted to routers/ - was /budgets/auto-apply at lines 1871..1887]

# 5. AI SMART ALERTS
# [extracted to routers/ - was /alerts/smart at lines 1890..2032]

# 6. SHAREABLE STATS CARD
# [extracted to routers/ - was /share/stats-card at lines 2035..2092]

# 7. DATABASE INDEXES for 1.46B scale
@app.on_event("startup")
async def create_indexes():
    """Create MongoDB indexes for performance at India-scale (1.46B users)"""
    try:
        # User indexes
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("money_score")
        await db.users.create_index("referral_code")
        
        # Transaction indexes (most queried collection)
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("category", 1), ("date", -1)])
        
        # Budget indexes
        await db.budgets.create_index([("user_id", 1), ("category", 1)])
        
        # Split indexes
        await db.split_groups.create_index("members.user_id")
        await db.split_expenses.create_index([("group_id", 1), ("created_at", -1)])
        
        # Rate limit / OTP cleanup indexes
        await db.rate_limits.create_index("key")
        await db.rate_limits.create_index("window", expireAfterSeconds=120)
        await db.otps.create_index("expires_at", expireAfterSeconds=0)
        
        # Audit log TTL
        await db.audit_logs.create_index("timestamp", expireAfterSeconds=90*24*60*60)
        
        # Cash entries
        await db.cash_entries.create_index([("user_id", 1), ("date", -1)])
        
        logging.info("✅ MongoDB indexes created for 1.46B-scale performance")
    except Exception as e:
        logging.error(f"Index creation error: {e}")

    # Start background news refresher (fire-and-forget — no blocking of any request)
    try:
        from routers.news import start_news_worker
        start_news_worker()
    except Exception as e:
        logging.warning(f"Could not start news worker: {e}")

# ============== PHASE 2: LEADERBOARD & ENHANCED REFERRAL ==============

# App download link for shareable content
# APP_DOWNLOAD_LINK + DAILY_CARDS moved to core/content.py.
# Import for back-compat (other endpoints still use APP_DOWNLOAD_LINK).
from core.content import APP_DOWNLOAD_LINK, DAILY_CARDS  # noqa: F401

# Profile photo upload
# /user/avatar (POST+GET) moved to routers/user.py

# Card of the Day — moved to routers/content.py
# Endpoint: GET /card-of-the-day (mounted via api_router.include_router(content_router.router))


# INDIA FINANCIAL NEWS endpoint has been moved to routers/news.py
# (Mounted via `api_router.include_router(news_router.router)` below.)

# AI EXPENSE REPORT CARD
# [extracted to routers/ai.py - server.py:2469..2520]

# 1. SAVINGS LEADERBOARD
# /leaderboard/savings and /leaderboard/friends moved to routers/analytics.py

# 3. ENHANCED REFERRAL WITH PRO REWARDS
# /referral/enhanced-status moved to routers/referral.py

# ============== FEATURE: UPI PAYMENT INTEGRATION ==============
# UPI helpers moved to core/upi.py — re-exported for back-compat.
from core.upi import validate_upi_id, mask_upi_id  # noqa: F401

# /user/upi, /user/profile moved to routers/user.py
# The split-related /split/pay-intent endpoint below still lives in server.py.

# [extracted to routers/splits.py - server.py:2712..2736]

# [extracted to routers/splits.py - server.py:2738..2743]

# [extracted to routers/splits.py - server.py:2745..2784]

# [extracted to routers/splits.py - server.py:2786..2820]

# ============== FEATURE: AGENTIC AI FINANCE SYSTEM ==============

# Agent definitions
AGENT_PROFILES = {
    "expense_tracker": {
        "name": "Expense Tracker Agent",
        "emoji": "📊",
        "description": "Categorizes expenses, detects anomalies, tracks spending patterns",
        "triggers": ["spent", "expense", "purchase", "bought", "paid", "cost", "bill", "transaction", "category", "categorize"],
    },
    "budget_manager": {
        "name": "Budget Manager Agent",
        "emoji": "🎯",
        "description": "Sets dynamic budgets, alerts on thresholds, optimizes allocations",
        "triggers": ["budget", "limit", "cap", "allocat", "threshold", "overspend", "underspend", "saving target"],
    },
    "split_manager": {
        "name": "Split Manager Agent",
        "emoji": "🤝",
        "description": "Manages fair splits, payment reminders, group expenses",
        "triggers": ["split", "owe", "owes", "settle", "group", "share", "divide", "remind", "pending", "who owes"],
    },
    "insights_agent": {
        "name": "Insights & Trends Agent",
        "emoji": "📈",
        "description": "Weekly/monthly insights, spending patterns, category breakdowns, comparisons",
        "triggers": ["insight", "trend", "pattern", "week", "month", "compare", "analysis", "breakdown", "report", "summary", "how much"],
    },
    "market_intel": {
        "name": "Market Intelligence Agent",
        "emoji": "🧠",
        "description": "Subscription savings, cost alternatives, inflation-aware advice, investment tips",
        "triggers": ["subscription", "save money", "alternative", "cheaper", "invest", "sip", "fd", "mutual fund", "insurance", "tax", "market", "inflation", "switch", "plan"],
    },
    "money_school": {
        "name": "Money School",
        "emoji": "🎓",
        "description": "Financial education — explains concepts, strategies, and basics",
        "triggers": [
            "teach me", "explain", "what is", "what are", "how does", "how do", "learn",
            "basics", "beginner", "understand", "tell me about", "educate",
            "50/30/20", "credit score", "cibil", "emergency fund", "compound", "diversif",
            "elss", "nps", "ppf", "epf", "reit", "index fund", "stock", "equity", "debt fund",
            "hra", "80c", "80d", "old regime", "new regime", "tax regime",
        ],
    },
}

def route_to_agent(message: str) -> str:
    """Route user message to the most appropriate AI agent"""
    msg_lower = message.lower()
    scores = {}
    for agent_id, profile in AGENT_PROFILES.items():
        score = sum(1 for trigger in profile["triggers"] if trigger in msg_lower)
        scores[agent_id] = score

    # Educational-intent boost: if the message clearly looks like a learning question,
    # give Money School priority over other agents that may share keywords (e.g. "sip" → market_intel).
    edu_markers = ("teach me", "explain", "what is", "what are", "how does", "how do",
                    "basics", "beginner", "tell me about", "help me understand", "learn about")
    if any(m in msg_lower for m in edu_markers):
        scores["money_school"] = scores.get("money_school", 0) + 3

    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "insights_agent"  # Default to insights for general queries
    return best

# [extracted to routers/ai.py - server.py:2611..2880]

# [extracted to routers/ai.py - server.py:2882..3024]

# [extracted to routers/ai.py - server.py:3026..3044]

# [extracted to routers/ai.py - server.py:3046..3052]

# ============== ENHANCED SPLITWISE PRO ==============

# [extracted to routers/splits.py - server.py:3335..3417]

# [extracted to routers/splits.py - server.py:3419..3446]

# [extracted to routers/splits.py - server.py:3448..3456]

# [extracted to routers/splits.py - server.py:3458..3466]

# [extracted to routers/splits.py - server.py:3468..3477]

# [extracted to routers/splits.py - server.py:3479..3484]

# [extracted to routers/splits.py - server.py:3486..3496]

# [extracted to routers/splits.py - server.py:3498..3510]

# ============== GROUP CHAT ==============
# [extracted to routers/splits.py - server.py:3513..3532]

# [extracted to routers/splits.py - server.py:3534..3552]

# ============== DYNAMIC MONEY SCHOOL (AI-POWERED DAILY) ==============

# [extracted to routers/ai.py - server.py:3079..3180]

# ============== AUTO-UPDATE BUDGET ON EXPENSE ==============

# [extracted to routers/ - was /budgets/live at lines 2277..2348]
async def create_recurring_split(data: dict, user_id: str = Depends(get_current_user)):
    """Create a recurring split expense (monthly rent, subscriptions)"""
    from bson import ObjectId
    group_id = data.get("group_id")
    if not group_id:
        raise HTTPException(status_code=400, detail="group_id required")
    
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    recurring = {
        "group_id": group_id,
        "description": data.get("description", "Recurring expense"),
        "amount": data.get("amount", 0),
        "paid_by": user_id,
        "split_type": data.get("split_type", "equal"),
        "category": data.get("category", "Bills"),
        "frequency": data.get("frequency", "monthly"),
        "is_recurring": True,
        "next_due": datetime.utcnow() + timedelta(days=30),
        "created_at": datetime.utcnow()
    }
    
    # Also create the first expense
    member_ids = [m["user_id"] for m in group["members"]]
    per_person = round(recurring["amount"] / len(member_ids), 2)
    splits = {mid: per_person for mid in member_ids}
    
    expense = {**recurring, "splits": splits}
    result = await db.split_expenses.insert_one(expense)
    
    # Save recurring template
    await db.recurring_splits.insert_one(recurring)
    
    return {"id": str(result.inserted_id), "message": f"Recurring {recurring['frequency']} expense created!"}

# ============== MONEY SCHOOL GAMIFICATION ==============

MONEY_SCHOOL_CARDS = [
    {"type": "saving_hack", "emoji": "💡", "title": "Skip 1 Zomato order/week", "body": "Save ₹1,500/month → ₹18,000/year. That's a weekend trip to Goa! ✈️", "xp": 10, "level": "beginner", "color": "#10B981"},
    {"type": "investment", "emoji": "📈", "title": "FD vs Mutual Funds", "body": "Your FD gives 6.5%. A balanced mutual fund averages 12%. You're losing 5.5% returns every year!", "xp": 15, "level": "intermediate", "color": "#6366F1"},
    {"type": "daily_tip", "emoji": "🎯", "title": "The 50/30/20 Rule", "body": "50% Needs, 30% Wants, 20% Savings. Simple but powerful. Most Indians save only 8%.", "xp": 10, "level": "beginner", "color": "#F59E0B"},
    {"type": "market_trend", "emoji": "🔥", "title": "SIP Power", "body": "₹5,000/month SIP for 20 years at 12% = ₹49.9 lakhs. Start today, thank yourself later.", "xp": 20, "level": "intermediate", "color": "#EF4444"},
    {"type": "risk_alert", "emoji": "⚠️", "title": "Credit Card Trap", "body": "Minimum payment = maximum interest. Pay full bill always. 36% annual interest is a wealth destroyer.", "xp": 15, "level": "beginner", "color": "#DC2626"},
    {"type": "saving_hack", "emoji": "🏷️", "title": "Annual vs Monthly", "body": "Netflix annual = ₹600 saved. Spotify annual = ₹500 saved. Gym annual = ₹3,000 saved. Total: ₹4,100/year!", "xp": 10, "level": "beginner", "color": "#059669"},
    {"type": "investment", "emoji": "🏦", "title": "PPF: Tax-Free Magic", "body": "₹1.5L/year in PPF = tax saving + 7.1% guaranteed returns + zero risk. Best for beginners!", "xp": 20, "level": "intermediate", "color": "#7C3AED"},
    {"type": "daily_tip", "emoji": "📊", "title": "Track Before You Cut", "body": "Most people have no idea where 30% of their money goes. Track for 1 month, then optimize.", "xp": 10, "level": "beginner", "color": "#0EA5E9"},
    {"type": "market_trend", "emoji": "💰", "title": "Gold as Insurance", "body": "Keep 5-10% in Sovereign Gold Bonds. You get 2.5% interest + gold price appreciation. Win-win!", "xp": 15, "level": "advanced", "color": "#F59E0B"},
    {"type": "saving_hack", "emoji": "🛒", "title": "D-Mart vs Blinkit", "body": "Monthly groceries at D-Mart vs quick commerce saves ₹2,000-3,000/month. Plan your shopping!", "xp": 10, "level": "beginner", "color": "#10B981"},
    {"type": "investment", "emoji": "🎓", "title": "ELSS: Best Tax Saver", "body": "ELSS funds: 3-year lock-in, ~15% returns, ₹46,800 tax saved on ₹1.5L investment. Beat FD easily!", "xp": 25, "level": "advanced", "color": "#8B5CF6"},
    {"type": "risk_alert", "emoji": "🚨", "title": "EMI Overload Check", "body": "Total EMIs should be <40% of income. Above that? You're one emergency away from trouble.", "xp": 15, "level": "intermediate", "color": "#EF4444"},
]

XP_LEVELS = [
    {"level": 1, "name": "Beginner", "emoji": "🌱", "min_xp": 0},
    {"level": 2, "name": "Learner", "emoji": "📚", "min_xp": 50},
    {"level": 3, "name": "Saver", "emoji": "💰", "min_xp": 150},
    {"level": 4, "name": "Investor", "emoji": "📈", "min_xp": 300},
    {"level": 5, "name": "Pro", "emoji": "🏆", "min_xp": 500},
    {"level": 6, "name": "Expert", "emoji": "👑", "min_xp": 800},
]

# [extracted to routers/ai.py - server.py:3319..3362]

# [extracted to routers/ai.py - server.py:3364..3394]

# ============== UPI PAYMENT FLOW ENHANCEMENT ==============

UPI_APPS = [
    {"id": "gpay", "name": "Google Pay", "package": "com.google.android.apps.nbu.paisa.user", "color": "#4285F4", "icon": "logo-google"},
    {"id": "phonepe", "name": "PhonePe", "package": "com.phonepe.app", "color": "#5F259F", "icon": "phone-portrait"},
    {"id": "paytm", "name": "Paytm", "package": "net.one97.paytm", "color": "#00BAF2", "icon": "wallet"},
    {"id": "bhim", "name": "BHIM", "package": "in.org.npci.upiapp", "color": "#00695C", "icon": "shield-checkmark"},
]

# [extracted to routers/ - was /upi/apps at lines 2425..2428]

# [extracted to routers/ - was /upi/generate-qr at lines 2430..2449]

# ============== SETTLEMENT GAMIFICATION ==============

SETTLEMENT_REWARDS = {
    "instant": {"coins": 15, "label": "Lightning Settler ⚡", "hours": 1},
    "same_day": {"coins": 10, "label": "Quick Payer 🏃", "hours": 24},
    "on_time": {"coins": 5, "label": "Reliable 👍", "hours": 72},
    "late": {"coins": 1, "label": "Better Late 🐢", "hours": 999999},
}

# [extracted to routers/splits.py - server.py:3917..3922]

# [extracted to routers/splits.py - server.py:3924..3989]

# [extracted to routers/splits.py - server.py:3991..4029]

# [extracted to routers/splits.py - server.py:4031..4045]

# ============== PERSONALIZED MONEY SCHOOL (AI-POWERED) ==============

# [extracted to routers/ai.py - server.py:3450..3543]

# Include modular domain routers first (so they share the /api prefix)
from routers import (
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
    ab as ab_router,
    share as share_router,
    privacy as privacy_router,
    budgets_ext as budgets_ext_router,
    alerts as alerts_router,
    upi as upi_router,
    insights_ext as insights_ext_router,
)
for r in (news_router, referral_router, gamification_router, content_router,
          transactions_router, budgets_router, family_router, analytics_router,
          user_router, splits_router, ai_router, cash_router, notifications_router,
          sms_router, premium_router, ab_router, share_router, privacy_router,
          budgets_ext_router, alerts_router, upi_router, insights_ext_router):
    api_router.include_router(r.router)

# Include router
app.include_router(api_router)

# ============== MIDDLEWARE REGISTRATION (order matters) ==============
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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def create_indexes():
    """Create database indexes for performance on startup"""
    try:
        # Users
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("money_score")
        # Transactions
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("category", 1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("date", -1)])
        # Budgets
        await db.budgets.create_index([("user_id", 1), ("category", 1)])
        # OTPs
        await db.otps.create_index("phone")
        await db.otps.create_index("created_at", expireAfterSeconds=600)
        # Split groups
        await db.split_groups.create_index("created_by")
        await db.split_groups.create_index("members.user_id")
        # Split expenses
        await db.split_expenses.create_index("group_id")
        await db.split_expenses.create_index([("group_id", 1), ("created_at", -1)])
        # Rate limits (TTL auto-cleanup)
        await db.rate_limits.create_index("window", expireAfterSeconds=120)
        # Audit logs (TTL auto-cleanup)
        await db.audit_logs.create_index("timestamp", expireAfterSeconds=86400 * 7)
        logging.info("Database indexes created successfully")
    except Exception as e:
        logging.warning(f"Index creation warning: {e}")
