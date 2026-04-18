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
from typing import List, Optional, Dict
from datetime import datetime, timedelta, timezone
import jwt
import bcrypt
import re
import random
import string
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

class BudgetCreate(BaseModel):
    category: str
    amount: float
    period: str = "monthly"  # "daily", "weekly", "monthly"

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

async def calculate_money_score(user_id: str) -> int:
    """Calculate daily money score (0-100) based on spending patterns"""
    try:
        # Get transactions from last 7 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        transactions = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": seven_days_ago}
        }).to_list(1000)
        
        if not transactions:
            return 50  # Neutral score if no data
        
        # Calculate metrics
        total_debit = sum(t["amount"] for t in transactions if t["type"] == "debit")
        total_credit = sum(t["amount"] for t in transactions if t["type"] == "credit")
        
        # Get budgets
        budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
        
        score = 50  # Base score
        
        # Factor 1: Spending vs Income (+/- 20 points)
        if total_credit > 0:
            spending_ratio = total_debit / total_credit
            if spending_ratio < 0.5:
                score += 20
            elif spending_ratio < 0.7:
                score += 10
            elif spending_ratio > 1.0:
                score -= 20
            elif spending_ratio > 0.9:
                score -= 10
        
        # Factor 2: Budget adherence (+/- 20 points)
        if budgets:
            budget_violations = 0
            for budget in budgets:
                category_spending = sum(
                    t["amount"] for t in transactions 
                    if t["type"] == "debit" and t["category"] == budget["category"]
                )
                if category_spending > budget["amount"]:
                    budget_violations += 1
            
            budget_score = max(0, 20 - (budget_violations * 10))
            score += budget_score - 10
        
        # Factor 3: Transaction consistency (+/- 10 points)
        if len(transactions) < 3:
            score -= 10  # Too few transactions
        elif len(transactions) > 20:
            score -= 5  # Too many transactions (overspending?)
        else:
            score += 10  # Good transaction frequency
        
        return max(0, min(100, score))
    except Exception as e:
        logging.error(f"Money score calculation error: {str(e)}")
        return 50

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

@api_router.get("/user/me")
async def get_user_profile(user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": str(user["_id"]),
        "phone": user["phone"],
        "name": user["name"],
        "money_score": user.get("money_score", 50),
        "created_at": user["created_at"]
    }

@api_router.post("/transactions")
async def create_transaction(transaction: TransactionCreate, user_id: str = Depends(get_current_user)):
    trans_dict = transaction.dict()
    trans_dict["user_id"] = user_id
    trans_dict["date"] = transaction.date or datetime.utcnow()
    trans_dict["created_at"] = datetime.utcnow()
    
    result = await db.transactions.insert_one(trans_dict)
    
    # Update money score
    new_score = await calculate_money_score(user_id)
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"money_score": new_score}}
    )
    
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "amount": trans_dict["amount"],
        "category": trans_dict["category"],
        "description": trans_dict["description"],
        "type": trans_dict["type"],
        "date": trans_dict["date"],
        "created_at": trans_dict["created_at"]
    }

@api_router.get("/transactions")
async def get_transactions(user_id: str = Depends(get_current_user), limit: int = 100):
    transactions = await db.transactions.find(
        {"user_id": user_id}
    ).sort("date", -1).limit(limit).to_list(limit)
    
    for trans in transactions:
        trans["id"] = str(trans["_id"])
        del trans["_id"]
    
    return transactions

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    result = await db.transactions.delete_one({
        "_id": ObjectId(transaction_id),
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Recalculate money score
    new_score = await calculate_money_score(user_id)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"money_score": new_score}}
    )
    
    return {"message": "Transaction deleted"}

@api_router.post("/transactions/parse-sms")
async def parse_sms(sms_data: SMSParseRequest, user_id: str = Depends(get_current_user)):
    parsed = await parse_sms_with_ai(sms_data.sms_text)
    
    if not parsed:
        raise HTTPException(status_code=400, detail="Could not parse SMS. Please add manually.")
    
    # Create transaction
    trans_dict = {
        "user_id": user_id,
        "amount": parsed["amount"],
        "category": parsed["category"],
        "description": parsed.get("description", parsed.get("merchant", "Transaction")),
        "type": parsed["type"],
        "date": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    
    result = await db.transactions.insert_one(trans_dict)
    
    # Update money score
    new_score = await calculate_money_score(user_id)
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"money_score": new_score}}
    )
    
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "amount": trans_dict["amount"],
        "category": trans_dict["category"],
        "description": trans_dict["description"],
        "type": trans_dict["type"],
        "date": trans_dict["date"],
        "created_at": trans_dict["created_at"]
    }

@api_router.get("/insights/daily")
async def get_daily_insights(user_id: str = Depends(get_current_user), lang: str = "en"):
    # Calculate money score
    money_score = await calculate_money_score(user_id)
    
    # Get spending summary by category
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    transactions = await db.transactions.find({
        "user_id": user_id,
        "type": "debit",
        "date": {"$gte": seven_days_ago}
    }).to_list(1000)
    
    spending_summary = {}
    for trans in transactions:
        category = trans["category"]
        spending_summary[category] = spending_summary.get(category, 0) + trans["amount"]
    
    # Generate AI insights (enhanced v2) — pass lang for multilingual output
    ai_insights = await generate_insights_with_ai(user_id, money_score, spending_summary, lang=lang)
    
    return {
        "money_score": money_score,
        "insight_text": ai_insights["insight_text"],
        "weekly_summary": ai_insights.get("weekly_summary", ""),
        "spending_summary": spending_summary,
        "recommendations": ai_insights["recommendations"],
        "savings_tip": ai_insights.get("savings_tip", ""),
        "mood": ai_insights.get("mood", "good"),
        "alerts": ai_insights.get("alerts", []),
        "trends": ai_insights.get("trends", {}),
        "generated_at": datetime.utcnow()
    }

@api_router.get("/insights/weekly")
async def get_weekly_insights(user_id: str = Depends(get_current_user)):
    """Full weekly spending report with AI analysis"""
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    fourteen_days_ago = now - timedelta(days=14)
    
    # This week
    this_week = await db.transactions.find({
        "user_id": user_id, "date": {"$gte": seven_days_ago}
    }).to_list(1000)
    
    # Last week
    last_week = await db.transactions.find({
        "user_id": user_id, "date": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}
    }).to_list(1000)
    
    # Calculate metrics
    tw_income = sum(t["amount"] for t in this_week if t["type"] == "credit")
    tw_expense = sum(t["amount"] for t in this_week if t["type"] == "debit")
    lw_income = sum(t["amount"] for t in last_week if t["type"] == "credit")
    lw_expense = sum(t["amount"] for t in last_week if t["type"] == "debit")
    
    # Day-by-day spending for chart
    daily_spending = {}
    for t in this_week:
        if t["type"] == "debit":
            day_key = t["date"].strftime("%a")
            daily_spending[day_key] = daily_spending.get(day_key, 0) + t["amount"]
    
    # Category comparison
    tw_cats = {}
    lw_cats = {}
    for t in this_week:
        if t["type"] == "debit":
            tw_cats[t["category"]] = tw_cats.get(t["category"], 0) + t["amount"]
    for t in last_week:
        if t["type"] == "debit":
            lw_cats[t["category"]] = lw_cats.get(t["category"], 0) + t["amount"]
    
    all_cats = set(list(tw_cats.keys()) + list(lw_cats.keys()))
    category_comparison = {}
    for cat in all_cats:
        tw_amt = tw_cats.get(cat, 0)
        lw_amt = lw_cats.get(cat, 0)
        change = ((tw_amt - lw_amt) / lw_amt * 100) if lw_amt > 0 else (100 if tw_amt > 0 else 0)
        category_comparison[cat] = {
            "this_week": tw_amt,
            "last_week": lw_amt,
            "change_pct": round(change, 1),
            "trend": "up" if change > 10 else ("down" if change < -10 else "stable")
        }
    
    money_score = await calculate_money_score(user_id)
    
    return {
        "money_score": money_score,
        "this_week": {
            "income": tw_income,
            "expense": tw_expense,
            "savings": tw_income - tw_expense,
            "transaction_count": len(this_week)
        },
        "last_week": {
            "income": lw_income,
            "expense": lw_expense,
            "savings": lw_income - lw_expense,
            "transaction_count": len(last_week)
        },
        "expense_change_pct": round(((tw_expense - lw_expense) / lw_expense * 100), 1) if lw_expense > 0 else 0,
        "daily_spending": daily_spending,
        "category_comparison": category_comparison,
        "generated_at": now
    }

@api_router.post("/budgets")
async def create_budget(budget: BudgetCreate, user_id: str = Depends(get_current_user)):
    # Check if budget exists for category
    existing = await db.budgets.find_one({
        "user_id": user_id,
        "category": budget.category
    })
    
    if existing:
        # Update existing
        from bson import ObjectId
        await db.budgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"amount": budget.amount, "period": budget.period}}
        )
        return {
            "id": str(existing["_id"]),
            "user_id": user_id,
            "category": budget.category,
            "amount": budget.amount,
            "period": budget.period,
            "spent": existing.get("spent", 0),
            "created_at": existing.get("created_at", datetime.utcnow())
        }
    
    # Create new
    budget_dict = budget.dict()
    budget_dict["user_id"] = user_id
    budget_dict["spent"] = 0
    budget_dict["created_at"] = datetime.utcnow()
    
    result = await db.budgets.insert_one(budget_dict)
    
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "category": budget_dict["category"],
        "amount": budget_dict["amount"],
        "period": budget_dict["period"],
        "spent": 0,
        "created_at": budget_dict["created_at"]
    }

@api_router.get("/budgets")
async def get_budgets(user_id: str = Depends(get_current_user)):
    budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
    
    # Calculate spent for each budget
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    for budget in budgets:
        # Determine date range based on period
        if budget["period"] == "daily":
            start_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        elif budget["period"] == "weekly":
            start_date = seven_days_ago
        else:  # monthly
            start_date = thirty_days_ago
        
        # Calculate spent
        transactions = await db.transactions.find({
            "user_id": user_id,
            "category": budget["category"],
            "type": "debit",
            "date": {"$gte": start_date}
        }).to_list(1000)
        
        spent = sum(t["amount"] for t in transactions)
        budget["spent"] = spent
        budget["id"] = str(budget["_id"])
        del budget["_id"]
    
    return budgets

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    result = await db.budgets.delete_one({
        "_id": ObjectId(budget_id),
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    return {"message": "Budget deleted"}

@api_router.get("/stats/overview")
async def get_stats_overview(user_id: str = Depends(get_current_user)):
    # Get transactions from last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    transactions = await db.transactions.find({
        "user_id": user_id,
        "date": {"$gte": thirty_days_ago}
    }).to_list(1000)
    
    total_income = sum(t["amount"] for t in transactions if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in transactions if t["type"] == "debit")
    
    # Category breakdown
    category_breakdown = {}
    for trans in transactions:
        if trans["type"] == "debit":
            cat = trans["category"]
            category_breakdown[cat] = category_breakdown.get(cat, 0) + trans["amount"]
    
    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "transaction_count": len(transactions),
        "category_breakdown": category_breakdown
    }

# ============== VOICE INPUT (Whisper STT) ==============
from fastapi import UploadFile, File

@api_router.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Transcribe voice audio to text using OpenAI Whisper, then parse as cash entry"""
    import tempfile
    import io

    # Read audio data
    audio_data = await file.read()
    if len(audio_data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

    # Save to temp file
    suffix = "." + (file.filename.split(".")[-1] if file.filename and "." in file.filename else "m4a")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name

    try:
        stt = OpenAISpeechToText(api_key=os.environ['EMERGENT_LLM_KEY'])
        with open(tmp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                prompt="Indian currency amounts, Hindi and English mixed. Examples: 50 rupaye auto, 200 sabzi, chai 30, doodh 50, maid 3000"
            )
        transcribed_text = response.text.strip()
    except Exception as e:
        logging.error(f"Whisper transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail="Voice transcription failed")
    finally:
        import os as _os
        try:
            _os.unlink(tmp_path)
        except Exception:
            pass

    if not transcribed_text:
        raise HTTPException(status_code=400, detail="Could not understand audio. Please try again.")

    return {"transcribed_text": transcribed_text}

# ============== CASH TRACKING ROUTES ==============
@api_router.post("/cash/quick-entry")
async def quick_cash_entry(entry: QuickCashEntry, user_id: str = Depends(get_current_user)):
    """Parse natural language cash entry like '50 auto' or '200 sabzi'"""
    text = entry.text.strip()

    # Simple parser: extract amount and description
    amount_match = re.search(r'[\u20B9]?\s*(\d+(?:\.\d+)?)', text)
    if not amount_match:
        raise HTTPException(status_code=400, detail="Could not find amount. Try: '50 auto' or '₹200 groceries'")

    amount = float(amount_match.group(1))
    desc = re.sub(r'[\u20B9]?\s*\d+(?:\.\d+)?', '', text).strip()
    if not desc:
        desc = "Cash expense"

    # Simple keyword-based categorization for cash
    cat_map = {
        "auto": "Transport", "ola": "Transport", "uber": "Transport", "taxi": "Transport",
        "petrol": "Transport", "diesel": "Transport", "bus": "Transport", "metro": "Transport",
        "sabzi": "Groceries", "grocery": "Groceries", "vegetables": "Groceries", "fruits": "Groceries",
        "dmart": "Groceries", "kirana": "Groceries",
        "chai": "Food", "tea": "Food", "coffee": "Food", "lunch": "Food", "dinner": "Food",
        "breakfast": "Food", "snack": "Food", "biryani": "Food", "thali": "Food",
        "maid": "Bills", "bai": "Bills", "dhobi": "Bills", "cook": "Bills",
        "milk": "Groceries", "doodh": "Groceries", "bread": "Groceries",
        "newspaper": "Bills", "akhbar": "Bills",
        "medicine": "Healthcare", "doctor": "Healthcare", "pharmacy": "Healthcare",
        "temple": "Other", "mandir": "Other", "donation": "Other",
    }
    category = "Other"
    desc_lower = desc.lower()
    for keyword, cat in cat_map.items():
        if keyword in desc_lower:
            category = cat
            break

    trans_dict = {
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": desc,
        "type": "debit",
        "source": "cash",
        "date": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    result = await db.transactions.insert_one(trans_dict)

    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": desc,
        "type": "debit",
        "source": "cash",
        "date": trans_dict["date"],
        "created_at": trans_dict["created_at"]
    }

@api_router.post("/cash/recurring")
async def create_recurring_expense(expense: RecurringExpenseCreate, user_id: str = Depends(get_current_user)):
    """Create a recurring cash expense (maid, milk, newspaper etc.)"""
    rec = {
        "user_id": user_id,
        "description": expense.description,
        "amount": expense.amount,
        "category": expense.category,
        "frequency": expense.frequency,
        "active": True,
        "last_applied": None,
        "created_at": datetime.utcnow()
    }
    result = await db.recurring_expenses.insert_one(rec)
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "description": rec["description"],
        "amount": rec["amount"],
        "category": rec["category"],
        "frequency": rec["frequency"],
        "active": True,
        "created_at": rec["created_at"]
    }

@api_router.get("/cash/recurring")
async def get_recurring_expenses(user_id: str = Depends(get_current_user)):
    """Get all recurring expenses for user"""
    expenses = await db.recurring_expenses.find({"user_id": user_id, "active": True}).to_list(100)
    for e in expenses:
        e["id"] = str(e["_id"])
        del e["_id"]
    return expenses

@api_router.delete("/cash/recurring/{expense_id}")
async def delete_recurring_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    result = await db.recurring_expenses.delete_one({"_id": ObjectId(expense_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    return {"message": "Recurring expense deleted"}

@api_router.post("/cash/apply-recurring")
async def apply_recurring_expenses(user_id: str = Depends(get_current_user)):
    """Apply all due recurring expenses as transactions"""
    expenses = await db.recurring_expenses.find({"user_id": user_id, "active": True}).to_list(100)
    now = datetime.utcnow()
    added = 0

    for exp in expenses:
        last = exp.get("last_applied")
        should_apply = False

        if last is None:
            should_apply = True
        elif exp["frequency"] == "daily" and (now - last).days >= 1:
            should_apply = True
        elif exp["frequency"] == "weekly" and (now - last).days >= 7:
            should_apply = True
        elif exp["frequency"] == "monthly" and (now - last).days >= 28:
            should_apply = True

        if should_apply:
            await db.transactions.insert_one({
                "user_id": user_id,
                "amount": exp["amount"],
                "category": exp["category"],
                "description": exp["description"] + " (recurring)",
                "type": "debit",
                "source": "cash_recurring",
                "date": now,
                "created_at": now,
            })
            await db.recurring_expenses.update_one(
                {"_id": exp["_id"]},
                {"$set": {"last_applied": now}}
            )
            added += 1

    return {"applied": added, "total_recurring": len(expenses)}

# ============== FAMILY GROUP ROUTES ==============
class FamilyGroupCreate(BaseModel):
    name: str
    
class FamilyMemberAdd(BaseModel):
    phone: str

class FamilyBudgetCreate(BaseModel):
    category: str
    amount: float
    period: str = "monthly"

@api_router.post("/family/create")
async def create_family_group(group: FamilyGroupCreate, user_id: str = Depends(get_current_user)):
    """Create a family group"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    family = {
        "name": group.name,
        "owner_id": user_id,
        "members": [{"user_id": user_id, "name": user["name"], "phone": user["phone"], "role": "owner"}],
        "created_at": datetime.utcnow()
    }
    result = await db.family_groups.insert_one(family)
    return {
        "id": str(result.inserted_id),
        "name": family["name"],
        "owner_id": user_id,
        "members": family["members"],
        "created_at": family["created_at"]
    }

@api_router.post("/family/{group_id}/add-member")
async def add_family_member(group_id: str, member: FamilyMemberAdd, user_id: str = Depends(get_current_user)):
    """Add a member to family group by phone number"""
    from bson import ObjectId
    group = await db.family_groups.find_one({"_id": ObjectId(group_id), "owner_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Family group not found or not owner")
    
    # Find member user
    member_user = await db.users.find_one({"phone": member.phone})
    if not member_user:
        raise HTTPException(status_code=404, detail="User not found with this phone number")
    
    member_id = str(member_user["_id"])
    # Check if already member
    if any(m["user_id"] == member_id for m in group["members"]):
        raise HTTPException(status_code=400, detail="Already a member")
    
    new_member = {"user_id": member_id, "name": member_user["name"], "phone": member_user["phone"], "role": "member"}
    await db.family_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$push": {"members": new_member}}
    )
    return {"message": "Member added", "member": new_member}

@api_router.get("/family/my-groups")
async def get_my_family_groups(user_id: str = Depends(get_current_user)):
    """Get all family groups user belongs to"""
    groups = await db.family_groups.find({"members.user_id": user_id}).to_list(20)
    for g in groups:
        g["id"] = str(g["_id"])
        del g["_id"]
    return groups

@api_router.post("/family/{group_id}/budget")
async def create_family_budget(group_id: str, budget: FamilyBudgetCreate, user_id: str = Depends(get_current_user)):
    """Create a shared family budget"""
    from bson import ObjectId
    group = await db.family_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Family group not found")
    
    # Check existing
    existing = await db.family_budgets.find_one({"group_id": group_id, "category": budget.category})
    if existing:
        await db.family_budgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"amount": budget.amount, "period": budget.period}}
        )
        return {"id": str(existing["_id"]), "category": budget.category, "amount": budget.amount, "period": budget.period}
    
    fb = {
        "group_id": group_id,
        "category": budget.category,
        "amount": budget.amount,
        "period": budget.period,
        "created_by": user_id,
        "created_at": datetime.utcnow()
    }
    result = await db.family_budgets.insert_one(fb)
    return {"id": str(result.inserted_id), **budget.dict()}

@api_router.get("/family/{group_id}/budgets")
async def get_family_budgets(group_id: str, user_id: str = Depends(get_current_user)):
    """Get all budgets for a family group with combined spending"""
    from bson import ObjectId
    group = await db.family_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Family group not found")
    
    budgets = await db.family_budgets.find({"group_id": group_id}).to_list(100)
    member_ids = [m["user_id"] for m in group["members"]]
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    # Fetch ALL transactions once (avoid N+1 query)
    all_txns = await db.transactions.find({
        "user_id": {"$in": member_ids},
        "type": "debit",
        "date": {"$gte": thirty_days_ago}
    }).to_list(5000)
    
    for b in budgets:
        # Filter in memory instead of querying per budget
        cat_txns = [t for t in all_txns if t["category"] == b["category"]]
        
        b["spent"] = sum(t["amount"] for t in cat_txns)
        b["member_spending"] = {}
        for m in group["members"]:
            m_spent = sum(t["amount"] for t in cat_txns if t["user_id"] == m["user_id"])
            if m_spent > 0:
                b["member_spending"][m["name"]] = m_spent
        
        b["id"] = str(b["_id"])
        del b["_id"]
    
    return {"group_name": group["name"], "members": group["members"], "budgets": budgets}

@api_router.get("/family/{group_id}/summary")
async def get_family_summary(group_id: str, user_id: str = Depends(get_current_user)):
    """Get combined family spending summary"""
    from bson import ObjectId
    group = await db.family_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Family group not found")
    
    member_ids = [m["user_id"] for m in group["members"]]
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    all_txns = await db.transactions.find({
        "user_id": {"$in": member_ids},
        "date": {"$gte": thirty_days_ago}
    }).to_list(5000)
    
    total_income = sum(t["amount"] for t in all_txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in all_txns if t["type"] == "debit")
    
    # Per-member breakdown
    member_stats = []
    for m in group["members"]:
        m_txns = [t for t in all_txns if t["user_id"] == m["user_id"]]
        member_stats.append({
            "name": m["name"],
            "income": sum(t["amount"] for t in m_txns if t["type"] == "credit"),
            "expense": sum(t["amount"] for t in m_txns if t["type"] == "debit"),
            "transaction_count": len(m_txns)
        })
    
    return {
        "group_name": group["name"],
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "member_count": len(group["members"]),
        "member_stats": member_stats
    }

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

@api_router.get("/money-school/lessons")
async def get_money_school_lessons():
    """Get all financial literacy lessons"""
    return {"lessons": MONEY_SCHOOL_LESSONS, "total": len(MONEY_SCHOOL_LESSONS)}

@api_router.get("/money-school/daily")
async def get_daily_lesson(user_id: str = Depends(get_current_user), lang: str = "en"):
    """Get today's lesson + AI-personalized tip based on user's spending"""
    from datetime import date
    # Rotate daily lesson based on date
    day_index = date.today().toordinal() % len(MONEY_SCHOOL_LESSONS)
    lesson = MONEY_SCHOOL_LESSONS[day_index]
    
    # Get user's spending context for AI personalization
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
        total_spent = sum(t["amount"] for t in txns)
        top_cat = {}
        for t in txns:
            top_cat[t["category"]] = top_cat.get(t["category"], 0) + t["amount"]
        top_category = max(top_cat, key=top_cat.get) if top_cat else "Food"
        
        lang_instr = get_lang_instruction(lang)
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"school_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="You are MintU's financial literacy buddy. Give ONE short personalized tip (1-2 sentences) connecting the lesson topic to user's actual spending. Be warm and specific with numbers. Use ₹." + lang_instr
        ).with_model("openai", "gpt-5.2")
        
        msg = f"Lesson: {lesson['title']}. User spent ₹{total_spent:.0f} this month, top category: {top_category}."
        response = await chat.send_message(UserMessage(text=msg))
        personal_tip = response.strip()
    except Exception as e:
        logging.error(f"Money school AI error: {e}")
        personal_tip = lesson["tip"]
    
    return {
        "lesson": lesson,
        "personal_tip": personal_tip,
        "lesson_number": day_index + 1,
        "total_lessons": len(MONEY_SCHOOL_LESSONS)
    }

# ============== PUSH NOTIFICATIONS ==============
class PushTokenRegister(BaseModel):
    push_token: str

@api_router.post("/notifications/register-token")
async def register_push_token(data: PushTokenRegister, user_id: str = Depends(get_current_user)):
    """Register Expo push token for a user"""
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"push_token": data.push_token}}
    )
    return {"message": "Push token registered"}

@api_router.get("/notifications/check-budget-alerts")
async def check_budget_alerts(user_id: str = Depends(get_current_user)):
    """Check budgets and return any that need alerts"""
    budgets = await db.budgets.find({"user_id": user_id}).to_list(100)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    alerts = []
    for budget in budgets:
        txns = await db.transactions.find({
            "user_id": user_id,
            "category": budget["category"],
            "type": "debit",
            "date": {"$gte": thirty_days_ago}
        }).to_list(1000)
        spent = sum(t["amount"] for t in txns)
        pct = (spent / budget["amount"] * 100) if budget["amount"] > 0 else 0
        
        if pct >= 80:
            alerts.append({
                "category": budget["category"],
                "spent": spent,
                "limit": budget["amount"],
                "percentage": round(pct, 1),
                "severity": "exceeded" if pct >= 100 else "warning",
                "message": f"{'Budget exceeded' if pct >= 100 else 'Nearing limit'}: {budget['category']} at {pct:.0f}% (₹{spent:.0f}/₹{budget['amount']:.0f})"
            })
    
    return {"alerts": alerts, "total": len(alerts)}

# ============== BIOMETRIC AUTH ==============
class BiometricToggle(BaseModel):
    enabled: bool

@api_router.put("/user/biometric")
async def toggle_biometric(data: BiometricToggle, user_id: str = Depends(get_current_user)):
    """Enable/disable biometric auth for user"""
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"biometric_enabled": data.enabled}}
    )
    return {"biometric_enabled": data.enabled}

@api_router.get("/user/biometric")
async def get_biometric_status(user_id: str = Depends(get_current_user)):
    """Check if biometric is enabled"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"biometric_enabled": 1})
    return {"biometric_enabled": user.get("biometric_enabled", False) if user else False}

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

@api_router.get("/sms/sample-inbox")
async def get_sample_sms_inbox():
    """Return sample Indian bank SMS for demo auto-import"""
    return {"messages": SAMPLE_INDIAN_SMS, "count": len(SAMPLE_INDIAN_SMS)}

@api_router.post("/sms/bulk-parse")
async def bulk_parse_sms(data: dict, user_id: str = Depends(get_current_user)):
    """Parse multiple SMS messages and create transactions"""
    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    parsed_count = 0
    failed_count = 0
    
    for sms_text in messages[:50]:  # Limit to 50
        try:
            parsed = await parse_sms_with_ai(sms_text)
            if parsed:
                await db.transactions.insert_one({
                    "user_id": user_id,
                    "amount": parsed["amount"],
                    "category": parsed["category"],
                    "description": parsed.get("description", parsed.get("merchant", "Transaction")),
                    "type": parsed["type"],
                    "source": "sms_import",
                    "date": datetime.utcnow(),
                    "created_at": datetime.utcnow()
                })
                parsed_count += 1
            else:
                failed_count += 1
        except Exception:
            failed_count += 1
    
    # Recalculate money score
    new_score = await calculate_money_score(user_id)
    from bson import ObjectId
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"money_score": new_score}})
    
    return {"parsed": parsed_count, "failed": failed_count, "total": len(messages)}

# ============== SPLITWISE-LIKE SPLIT EXPENSES ==============
class SplitGroupCreate(BaseModel):
    name: str
    members: List[str]  # List of phone numbers

class SplitExpenseCreate(BaseModel):
    group_id: str
    description: str
    amount: float
    paid_by: str  # user_id of payer
    split_type: str = "equal"  # "equal", "custom", "shares"
    splits: Optional[Dict[str, float]] = None  # user_id -> amount (for custom) or user_id -> share_ratio (for shares)

@api_router.post("/split/groups")
async def create_split_group(group: SplitGroupCreate, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    members = [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}]
    
    for phone in group.members:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) != 10 or not p.isdigit():
            continue
        # Check if already added
        if any(m["phone"] == p for m in members):
            continue
        
        m = await db.users.find_one({"phone": p})
        if not m:
            # Auto-create placeholder user
            result = await db.users.insert_one({
                "phone": p, "name": f"User {p[-4:]}", "money_score": 50,
                "streak_days": 0, "created_at": datetime.utcnow(),
                "reward_coins": 0, "settlement_count": 0,
            })
            m = {"_id": result.inserted_id, "name": f"User {p[-4:]}", "phone": p}
        
        mid = str(m["_id"])
        if mid != user_id:
            members.append({"user_id": mid, "name": m.get("name", f"User {p[-4:]}"), "phone": p})
    
    g = {"name": group.name, "members": members, "created_by": user_id, "created_at": datetime.utcnow()}
    result = await db.split_groups.insert_one(g)
    return {"id": str(result.inserted_id), "name": g["name"], "members": members}

@api_router.get("/split/groups")
async def get_split_groups(user_id: str = Depends(get_current_user)):
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    for g in groups:
        g["id"] = str(g["_id"]); del g["_id"]
        # Calculate balances
        expenses = await db.split_expenses.find({"group_id": g["id"]}).to_list(500)
        balances = {}
        for m in g["members"]:
            balances[m["user_id"]] = 0
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid != payer:
                    balances[payer] = balances.get(payer, 0) + amt
                    balances[uid] = balances.get(uid, 0) - amt
        g["balances"] = {m["name"]: round(balances.get(m["user_id"], 0), 2) for m in g["members"]}
        g["total_expenses"] = sum(e["amount"] for e in expenses)
    return groups

@api_router.post("/split/expenses")
async def add_split_expense(expense: SplitExpenseCreate, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(expense.group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    member_ids = [m["user_id"] for m in group["members"]]
    if expense.split_type == "equal":
        per_person = round(expense.amount / len(member_ids), 2)
        splits = {mid: per_person for mid in member_ids}
    elif expense.split_type == "shares":
        # Splits by ratio: e.g. {"user1": 2, "user2": 1} → user1 pays 2/3, user2 pays 1/3
        share_ratios = expense.splits or {mid: 1 for mid in member_ids}
        total_shares = sum(share_ratios.values()) or 1
        splits = {uid: round(expense.amount * (share / total_shares), 2) for uid, share in share_ratios.items()}
    else:
        # Custom: exact amounts
        splits = expense.splits or {}
    
    exp_doc = {
        "group_id": expense.group_id,
        "description": expense.description,
        "amount": expense.amount,
        "paid_by": expense.paid_by,
        "split_type": expense.split_type,
        "splits": splits,
        "created_by": user_id,
        "created_at": datetime.utcnow()
    }
    result = await db.split_expenses.insert_one(exp_doc)
    # Auto-insert chat message for the expense
    payer_name = next((m["name"] for m in group["members"] if m["user_id"] == user_id), "Someone")
    member_count = len(splits)
    await db.split_messages.insert_one({
        "group_id": expense.group_id, "type": "expense", "sender_id": user_id, "sender_name": payer_name,
        "content": expense.description, "expense_data": {"amount": expense.amount, "paid_by": payer_name, "split_count": member_count, "expense_id": str(result.inserted_id)},
        "created_at": datetime.utcnow()
    })
    return {"id": str(result.inserted_id), **{k: v for k, v in exp_doc.items() if k != "_id"}, "created_at": exp_doc["created_at"]}

@api_router.get("/split/groups/{group_id}/expenses")
async def get_group_expenses(group_id: str, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(500)
    for e in expenses:
        e["id"] = str(e["_id"]); del e["_id"]
        payer = next((m["name"] for m in group["members"] if m["user_id"] == e["paid_by"]), "Unknown")
        e["paid_by_name"] = payer
    return {"group": {"name": group["name"], "members": group["members"]}, "expenses": expenses}

@api_router.get("/split/balances")
async def get_overall_balances(user_id: str = Depends(get_current_user)):
    """Get overall who owes you / you owe across all groups"""
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(50)
    people = {}  # name -> net amount (positive = they owe you)
    
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(500)
        name_map = {m["user_id"]: m["name"] for m in g["members"]}
        for exp in expenses:
            payer = exp["paid_by"]
            for uid, amt in exp.get("splits", {}).items():
                if uid == payer: continue
                other_name = name_map.get(uid if payer == user_id else payer, "Unknown")
                if payer == user_id:
                    people[other_name] = people.get(other_name, 0) + amt
                elif uid == user_id:
                    people[other_name] = people.get(other_name, 0) - amt
    
    owe_you = {n: v for n, v in people.items() if v > 0}
    you_owe = {n: abs(v) for n, v in people.items() if v < 0}
    
    return {
        "total_owed_to_you": sum(owe_you.values()),
        "total_you_owe": sum(you_owe.values()),
        "owe_you": owe_you,
        "you_owe": you_owe
    }

@api_router.post("/split/groups/{group_id}/members")
async def add_members_to_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Add new members to an existing split group — auto-creates users if not registered"""
    from bson import ObjectId
    phones = data.get("phones", [])
    if not phones:
        raise HTTPException(status_code=400, detail="Provide phone numbers to add")
    
    group = await db.split_groups.find_one({"_id": ObjectId(group_id), "members.user_id": user_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    existing_phones = {m.get("phone", "") for m in group["members"]}
    added = []
    
    for phone in phones:
        p = phone.strip().replace("+91", "").replace(" ", "")[-10:]
        if len(p) != 10 or not p.isdigit():
            continue
        if p in existing_phones:
            continue
            
        member = await db.users.find_one({"phone": p})
        if not member:
            # Create placeholder user for unregistered phone
            result = await db.users.insert_one({
                "phone": p,
                "name": f"User {p[-4:]}",
                "money_score": 50,
                "streak_days": 0,
                "created_at": datetime.utcnow(),
                "reward_coins": 0,
                "settlement_count": 0,
            })
            member = {"_id": result.inserted_id, "name": f"User {p[-4:]}", "phone": p}
        
        new_member = {"user_id": str(member["_id"]), "name": member.get("name", f"User {p[-4:]}"), "phone": p}
        await db.split_groups.update_one({"_id": ObjectId(group_id)}, {"$push": {"members": new_member}})
        existing_phones.add(p)
        added.append(new_member["name"])
    
    if not added:
        return {"added": [], "message": "No new members to add (already in group or invalid numbers)"}
    
    return {"added": added, "message": f"Added {len(added)} member(s): {', '.join(added)}"}

# ============== 1. REFERRAL SYSTEM ==============
import uuid as uuid_lib

@api_router.get("/referral/my-code")
async def get_referral_code(user_id: str = Depends(get_current_user)):
    """Get or generate user's unique referral code"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    code = user.get("referral_code")
    if not code:
        code = f"MINTU{user['phone'][-4:]}{uuid_lib.uuid4().hex[:4].upper()}"
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"referral_code": code}})
    
    # Count referrals
    referral_count = await db.referrals.count_documents({"referrer_id": user_id})
    
    tier = "none"
    if referral_count >= 10: tier = "legend"
    elif referral_count >= 3: tier = "premium"
    elif referral_count >= 1: tier = "starter"
    
    return {
        "referral_code": code,
        "referral_count": referral_count,
        "tier": tier,
        "rewards": {
            "starter": {"needed": 1, "reward": "Advanced insights (1 week)"},
            "premium": {"needed": 3, "reward": "Premium features (1 month)"},
            "legend": {"needed": 10, "reward": "Lifetime badge + perks"},
        },
        "share_text": f"I saved money with MintU! Join me and start tracking your expenses smartly. Use my code: {code}\nDownload: https://mintu.app/invite/{code}"
    }

@api_router.post("/referral/apply")
async def apply_referral_code(code: dict, user_id: str = Depends(get_current_user)):
    """Apply a referral code (for new users)"""
    referral_code = code.get("code", "").strip().upper()
    if not referral_code:
        raise HTTPException(status_code=400, detail="Referral code required")
    
    # Check if already used
    existing = await db.referrals.find_one({"referred_id": user_id})
    if existing:
        raise HTTPException(status_code=400, detail="You've already used a referral code")
    
    # Find referrer
    referrer = await db.users.find_one({"referral_code": referral_code})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    
    referrer_id = str(referrer["_id"])
    if referrer_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot use your own code")
    
    # Record referral
    await db.referrals.insert_one({
        "referrer_id": referrer_id,
        "referred_id": user_id,
        "code": referral_code,
        "created_at": datetime.utcnow()
    })
    
    # Check if referrer hit new tier
    count = await db.referrals.count_documents({"referrer_id": referrer_id})
    from bson import ObjectId
    if count >= 10:
        await db.users.update_one({"_id": ObjectId(referrer_id)}, {"$set": {"premium_tier": "legend", "premium_until": None}})
    elif count >= 3:
        await db.users.update_one({"_id": ObjectId(referrer_id)}, {"$set": {"premium_tier": "premium", "premium_until": datetime.utcnow() + timedelta(days=30)}})
    elif count >= 1:
        await db.users.update_one({"_id": ObjectId(referrer_id)}, {"$set": {"premium_tier": "starter", "premium_until": datetime.utcnow() + timedelta(days=7)}})
    
    return {"message": "Referral applied! Welcome to MintU!", "referrer_name": referrer["name"]}

@api_router.get("/referral/leaderboard")
async def referral_leaderboard():
    """Top referrers"""
    pipeline = [
        {"$group": {"_id": "$referrer_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    results = await db.referrals.aggregate(pipeline).to_list(10)
    from bson import ObjectId
    leaderboard = []
    for r in results:
        user = await db.users.find_one({"_id": ObjectId(r["_id"])}, {"name": 1})
        if user:
            leaderboard.append({"name": user["name"], "referrals": r["count"]})
    return {"leaderboard": leaderboard}

# ============== 2. GAMIFICATION ENGINE ==============
BADGES = {
    "first_track": {"name": "First Step", "desc": "Tracked your first expense", "icon": "footsteps"},
    "week_streak": {"name": "Week Warrior", "desc": "7-day tracking streak", "icon": "flame"},
    "month_streak": {"name": "Streak Master", "desc": "30-day tracking streak", "icon": "trophy"},
    "budget_master": {"name": "Budget Master", "desc": "Stayed within all budgets for a month", "icon": "shield-checkmark"},
    "saver_pro": {"name": "Saver Pro", "desc": "Saved 20%+ of income", "icon": "cash"},
    "impulse_killer": {"name": "Impulse Killer", "desc": "Completed a no-Swiggy challenge", "icon": "flash-off"},
    "money_school": {"name": "Money Scholar", "desc": "Read 10 Money School lessons", "icon": "school"},
    "family_leader": {"name": "Family CFO", "desc": "Created a family group", "icon": "people"},
    "voice_tracker": {"name": "Voice Pro", "desc": "Added 10 expenses by voice", "icon": "mic"},
    "score_80": {"name": "Elite Scorer", "desc": "Reached Money Score 80+", "icon": "star"},
}

WEEKLY_CHALLENGES = [
    {"id": "no_swiggy_3", "title": "No Swiggy for 3 days", "desc": "Skip food delivery for 3 days", "category": "Food", "target_days": 3},
    {"id": "save_500", "title": "Save ₹500 this week", "desc": "Reduce spending by ₹500 vs last week", "category": None, "target_amount": 500},
    {"id": "cook_5", "title": "Cook 5 meals at home", "desc": "Track 5 home-cooked meals", "category": "Food", "target_count": 5},
    {"id": "no_shopping", "title": "No Shopping Spree", "desc": "Zero shopping expenses for 5 days", "category": "Shopping", "target_days": 5},
    {"id": "budget_all", "title": "Budget Everything", "desc": "Set budgets for all your spending categories", "category": None, "target_count": 5},
    {"id": "cash_tracker", "title": "Cash Detective", "desc": "Track 10 cash expenses this week", "category": None, "target_count": 10},
]

@api_router.get("/gamification/status")
async def get_gamification_status(user_id: str = Depends(get_current_user)):
    """Get user's streak, badges, and active challenge"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    # Calculate streak
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    streak = 0
    for i in range(365):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        has_txn = await db.transactions.find_one({"user_id": user_id, "date": {"$gte": day_start, "$lt": day_end}})
        if has_txn:
            streak += 1
        else:
            if i > 0: break  # Allow today to not have txn yet
    
    # Get badges
    user_badges = user.get("badges", [])
    
    # Auto-award badges
    new_badges = []
    txn_count = await db.transactions.count_documents({"user_id": user_id})
    if txn_count >= 1 and "first_track" not in user_badges:
        new_badges.append("first_track")
    if streak >= 7 and "week_streak" not in user_badges:
        new_badges.append("week_streak")
    if streak >= 30 and "month_streak" not in user_badges:
        new_badges.append("month_streak")
    score = user.get("money_score", 0)
    if score >= 80 and "score_80" not in user_badges:
        new_badges.append("score_80")
    
    if new_badges:
        user_badges.extend(new_badges)
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"badges": user_badges}})
    
    # Get active challenge
    from datetime import date
    week_num = date.today().isocalendar()[1]
    active_challenge = WEEKLY_CHALLENGES[week_num % len(WEEKLY_CHALLENGES)]
    
    return {
        "streak": streak,
        "badges_earned": [{"id": b, **BADGES.get(b, {})} for b in user_badges],
        "badges_available": [{"id": k, **v} for k, v in BADGES.items() if k not in user_badges],
        "total_badges": len(user_badges),
        "weekly_challenge": active_challenge,
        "new_badges": [{"id": b, **BADGES.get(b, {})} for b in new_badges],
    }

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

@api_router.get("/premium/status")
async def get_premium_status(user_id: str = Depends(get_current_user)):
    """Check user's premium status"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    tier = user.get("premium_tier", "free")
    until = user.get("premium_until")
    is_premium = tier in ["premium", "legend"] and (until is None or until > datetime.utcnow())
    
    return {
        "is_premium": is_premium,
        "tier": tier,
        "premium_until": until,
        "features": PREMIUM_FEATURES,
        "pricing": PRICING,
    }

@api_router.get("/premium/paywall-trigger")
async def get_paywall_trigger(user_id: str = Depends(get_current_user)):
    """Generate personalized paywall data with emotional triggers"""
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_spent = sum(t["amount"] for t in txns)
    # Estimate "waste" as top discretionary category overspend
    cats = {}
    for t in txns:
        cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    
    discretionary = ["Food", "Entertainment", "Shopping"]
    waste_estimate = sum(cats.get(c, 0) for c in discretionary) * 0.25  # 25% of discretionary = potential savings
    
    return {
        "total_spent": total_spent,
        "waste_estimate": round(waste_estimate),
        "hook_text": f"You could have saved ₹{waste_estimate:.0f} this month",
        "sub_text": "MintU Premium finds your hidden money leaks",
        "pricing": PRICING,
        "features": list(PREMIUM_FEATURES.values()),
    }

@api_router.post("/premium/create-order")
async def create_razorpay_order(req: CreateOrderRequest, user_id: str = Depends(get_current_user)):
    """Create Razorpay order for premium subscription"""
    if req.plan not in PRICING:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    amount_paise = PRICING[req.plan]["price"] * 100
    
    try:
        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {"user_id": user_id, "plan": req.plan}
        })
        
        await db.payment_orders.insert_one({
            "user_id": user_id,
            "order_id": order["id"],
            "plan": req.plan,
            "amount": PRICING[req.plan]["price"],
            "status": "created",
            "created_at": datetime.utcnow()
        })
        
        return {
            "order_id": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "key_id": os.environ.get('RAZORPAY_KEY_ID', ''),
            "plan": req.plan
        }
    except Exception as e:
        logging.error(f"Razorpay order error: {e}")
        raise HTTPException(status_code=500, detail="Payment service unavailable. Please try later.")

@api_router.post("/premium/verify-payment")
async def verify_razorpay_payment(payment_data: dict, user_id: str = Depends(get_current_user)):
    """Verify Razorpay payment and activate premium"""
    order_id = payment_data.get("order_id", "")
    payment_id = payment_data.get("payment_id", "")
    signature = payment_data.get("signature", "")
    
    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")
    
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    
    # Get order details
    order = await db.payment_orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Activate premium
    plan = order["plan"]
    days = 30 if plan in ["monthly", "intro"] else 365
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"premium_tier": "premium", "premium_until": datetime.utcnow() + timedelta(days=days)}}
    )
    
    await db.payment_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": datetime.utcnow()}}
    )
    
    return {"message": "Premium activated!", "premium_until": (datetime.utcnow() + timedelta(days=days)).isoformat(), "plan": plan}

@api_router.post("/premium/ai-coach")
async def ai_smart_coach(user_id: str = Depends(get_current_user)):
    """AI Smart Coach — premium feature: personalized weekly advice"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    tier = user.get("premium_tier", "free")
    if tier not in ["premium", "legend", "starter"]:
        raise HTTPException(status_code=403, detail="Premium feature. Upgrade to access AI Smart Coach.")
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_income = sum(t["amount"] for t in txns if t["type"] == "credit")
    total_expense = sum(t["amount"] for t in txns if t["type"] == "debit")
    cats = {}
    for t in txns:
        if t["type"] == "debit":
            cats[t["category"]] = cats.get(t["category"], 0) + t["amount"]
    
    cat_text = ", ".join([f"{c}: ₹{a:.0f}" for c, a in sorted(cats.items(), key=lambda x: -x[1])])
    
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"coach_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="""You are MintU AI Smart Coach — a personal financial advisor for Indian users.
Give a detailed, actionable weekly plan. Be specific with ₹ amounts. Reference Indian services.
Return JSON: {"advice": "2-3 paragraph plan", "action_items": ["item1", "item2", "item3"], "potential_savings": number}"""
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(
            text=f"Income: ₹{total_income:.0f}, Expenses: ₹{total_expense:.0f}. Categories: {cat_text}. Score: {user.get('money_score', 50)}. What should I do with my money this week?"
        ))
        
        resp_text = response.strip()
        if resp_text.startswith("```"):
            parts = resp_text.split("```")
            resp_text = parts[1] if len(parts) > 1 else parts[0]
            if resp_text.startswith("json"): resp_text = resp_text[4:]
        
        import json as json_mod
        parsed = json_mod.loads(resp_text.strip())
        return parsed
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        return {
            "advice": "Focus on reducing your top spending category this week. Try the 50-30-20 rule.",
            "action_items": ["Review last week's spending", "Set a daily limit", "Cook 3 meals at home"],
            "potential_savings": 500
        }

# ============== 4. SMART NOTIFICATIONS ==============
@api_router.get("/notifications/smart-triggers")
async def get_smart_notification_triggers(user_id: str = Depends(get_current_user)):
    """Generate all pending smart notifications for user"""
    from bson import ObjectId
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    notifications = []
    
    # 1. Overspend alert (today's spending > daily average)
    seven_days_ago = now - timedelta(days=7)
    week_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": seven_days_ago}}).to_list(500)
    today_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": today_start}}).to_list(100)
    
    daily_avg = sum(t["amount"] for t in week_txns) / 7 if week_txns else 0
    today_total = sum(t["amount"] for t in today_txns)
    
    if today_total > daily_avg * 1.5 and today_total > 200:
        notifications.append({
            "type": "overspend",
            "title": "Spending Alert",
            "body": f"You've spent ₹{today_total:.0f} today — {((today_total/daily_avg - 1)*100):.0f}% above your daily average",
            "priority": "high"
        })
    
    # 2. Savings celebration
    if today_total < daily_avg * 0.5 and daily_avg > 100:
        saved = daily_avg - today_total
        notifications.append({
            "type": "savings",
            "title": "Great Job!",
            "body": f"You saved ₹{saved:.0f} today compared to your average. Keep it up!",
            "priority": "low"
        })
    
    # 3. Streak reminder (no txn today by evening)
    if not today_txns and now.hour >= 18:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        notifications.append({
            "type": "streak",
            "title": "Don't break your streak!",
            "body": "You haven't tracked any expenses today. Add one to keep your streak going!",
            "priority": "medium"
        })
    
    # 4. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
    thirty_days_ago = now - timedelta(days=30)
    for b in budgets:
        spent = sum(t["amount"] for t in week_txns if t["category"] == b["category"]) if b["period"] == "weekly" else 0
        if b["period"] == "monthly":
            month_txns = await db.transactions.find({"user_id": user_id, "category": b["category"], "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
            spent = sum(t["amount"] for t in month_txns)
        pct = (spent / b["amount"] * 100) if b["amount"] > 0 else 0
        if pct >= 100:
            notifications.append({"type": "budget_exceeded", "title": f"{b['category']} Budget Exceeded!", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} — time to slow down", "priority": "high"})
        elif pct >= 80:
            notifications.append({"type": "budget_warning", "title": f"{b['category']} Budget at {pct:.0f}%", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} — be careful this week", "priority": "medium"})
    
    # 5. Payday detection (large credit today)
    today_credits = [t for t in today_txns if t.get("type") == "credit"]
    if not today_credits:
        all_today = await db.transactions.find({"user_id": user_id, "type": "credit", "date": {"$gte": today_start}}).to_list(10)
        today_credits = all_today
    for c in today_credits:
        if c["amount"] >= 10000:
            notifications.append({
                "type": "payday",
                "title": "Payday Detected!",
                "body": f"₹{c['amount']:.0f} credited. Let's plan your money for this month!",
                "priority": "medium"
            })
            break
    
    return {"notifications": notifications, "count": len(notifications)}

# ============== A/B TEST SYSTEM ==============
import hashlib as _hashlib

@api_router.get("/ab/paywall-group")
async def get_ab_group(user_id: str = Depends(get_current_user)):
    """Assign user to A/B test group for paywall placement"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    group = user.get("ab_paywall_group")
    if not group:
        # Deterministic 50/50 split based on user_id hash
        h = int(_hashlib.md5(user_id.encode()).hexdigest(), 16)
        group = "A" if h % 2 == 0 else "B"
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"ab_paywall_group": group}})
    
    return {
        "group": group,
        "placement": "after_overspend" if group == "A" else "profile_tab",
        "description": "Group A: Paywall shown after overspend insight. Group B: Paywall in profile tab."
    }

@api_router.post("/ab/track-event")
async def track_ab_event(event: dict, user_id: str = Depends(get_current_user)):
    """Track A/B test conversion events"""
    await db.ab_events.insert_one({
        "user_id": user_id,
        "event": event.get("event", "view"),  # "view", "click", "convert"
        "group": event.get("group", ""),
        "placement": event.get("placement", ""),
        "created_at": datetime.utcnow()
    })
    return {"tracked": True}

@api_router.get("/ab/results")
async def get_ab_results():
    """Get A/B test results (admin)"""
    pipeline_a = [
        {"$match": {"group": "A"}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}}
    ]
    pipeline_b = [
        {"$match": {"group": "B"}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}}
    ]
    a_results = {r["_id"]: r["count"] for r in await db.ab_events.aggregate(pipeline_a).to_list(10)}
    b_results = {r["_id"]: r["count"] for r in await db.ab_events.aggregate(pipeline_b).to_list(10)}
    
    return {
        "group_A": {"placement": "after_overspend", "events": a_results, "conversion_rate": (a_results.get("convert", 0) / max(a_results.get("view", 1), 1)) * 100},
        "group_B": {"placement": "profile_tab", "events": b_results, "conversion_rate": (b_results.get("convert", 0) / max(b_results.get("view", 1), 1)) * 100},
    }

# ============== STORY CARD DATA ==============
@api_router.get("/share/score-card")
async def get_score_card_data(user_id: str = Depends(get_current_user)):
    """Get data for generating shareable score card"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    txns = await db.transactions.find({"user_id": user_id, "date": {"$gte": thirty_days_ago}}).to_list(1000)
    
    total_saved = sum(t["amount"] for t in txns if t["type"] == "credit") - sum(t["amount"] for t in txns if t["type"] == "debit")
    score = user.get("money_score", 50)
    
    # Calculate streak
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    streak = 0
    for i in range(365):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        has = await db.transactions.find_one({"user_id": user_id, "date": {"$gte": day_start, "$lt": day_end}})
        if has: streak += 1
        elif i > 0: break
    
    return {
        "name": user.get("name", "User"),
        "score": score,
        "streak": streak,
        "total_saved": max(total_saved, 0),
        "transaction_count": len(txns),
        "month": datetime.utcnow().strftime("%B %Y"),
    }

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

@api_router.post("/notifications/cron-check")
async def cron_check_notifications():
    """Cron endpoint: check all users for pending notifications and send pushes"""
    users = await db.users.find({"push_token": {"$exists": True, "$ne": None}}).to_list(10000)
    sent_count = 0
    
    for user in users:
        user_id = str(user["_id"])
        token = user.get("push_token", "")
        if not token: continue
        
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)
        
        # Check: already sent today?
        already_sent = await db.sent_notifications.find_one({"user_id": user_id, "date": {"$gte": today_start}})
        if already_sent: continue
        
        # Gather data
        today_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": today_start}}).to_list(100)
        week_txns = await db.transactions.find({"user_id": user_id, "type": "debit", "date": {"$gte": seven_days_ago}}).to_list(500)
        
        today_total = sum(t["amount"] for t in today_txns)
        daily_avg = sum(t["amount"] for t in week_txns) / 7 if week_txns else 0
        
        notification = None
        
        # 1. Overspend
        if today_total > daily_avg * 1.5 and today_total > 200:
            notification = {"title": "Spending Alert ⚠️", "body": f"₹{today_total:.0f} spent today — above your daily average. Watch out!"}
        
        # 2. Budget breach
        if not notification:
            budgets = await db.budgets.find({"user_id": user_id}).to_list(50)
            for b in budgets:
                m_txns = await db.transactions.find({"user_id": user_id, "category": b["category"], "type": "debit", "date": {"$gte": thirty_days_ago}}).to_list(500)
                spent = sum(t["amount"] for t in m_txns)
                pct = (spent / b["amount"] * 100) if b["amount"] > 0 else 0
                if pct >= 100:
                    notification = {"title": f"{b['category']} Budget Exceeded! 🚨", "body": f"₹{spent:.0f} of ₹{b['amount']:.0f} limit. Time to cut back."}
                    break
                elif pct >= 80:
                    notification = {"title": f"{b['category']} Budget Warning ⚠️", "body": f"{pct:.0f}% used (₹{spent:.0f}/₹{b['amount']:.0f}). Slow down!"}
                    break
        
        # 3. Streak reminder (evening)
        if not notification and not today_txns and now.hour >= 18:
            notification = {"title": "Track your expenses! 📝", "body": "Don't break your streak — add today's expenses now."}
        
        # 4. Savings celebration
        if not notification and today_total < daily_avg * 0.5 and daily_avg > 100 and today_txns:
            saved = daily_avg - today_total
            notification = {"title": "Great saving today! 🎉", "body": f"You saved ₹{saved:.0f} compared to your average. Keep it up!"}
        
        if notification:
            success = await send_expo_push(token, notification["title"], notification["body"])
            if success:
                await db.sent_notifications.insert_one({"user_id": user_id, "date": now, **notification})
                sent_count += 1
    
    return {"users_checked": len(users), "notifications_sent": sent_count}

# ============== DATA PROTECTION & COMPLIANCE ROUTES ==============
# GDPR Art. 15/20 + India DPDP Act 2023 Sec. 11 — Right to Access & Portability
@api_router.get("/privacy/data-export")
async def export_user_data(user_id: str = Depends(get_current_user)):
    """Export all user data in portable JSON format (GDPR Art. 20 / DPDP Sec. 11)"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password": 0, "_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    transactions = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    budgets = await db.budgets.find({"user_id": user_id}, {"_id": 0}).to_list(100)

    # Convert datetime objects for JSON serialization
    def serialize(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj

    export_data = {
        "export_info": {
            "app": "MintU",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "format_version": "1.0",
            "legal_basis": "GDPR Art. 20 / India DPDP Act 2023 Sec. 11"
        },
        "user_profile": {k: serialize(v) for k, v in user.items()},
        "transactions": [{k: serialize(v) for k, v in t.items()} for t in transactions],
        "budgets": [{k: serialize(v) for k, v in b.items()} for b in budgets],
        "data_summary": {
            "total_transactions": len(transactions),
            "total_budgets": len(budgets),
            "account_created": serialize(user.get("created_at", ""))
        }
    }

    # Audit log
    await db.audit_logs.insert_one({
        "timestamp": datetime.now(timezone.utc),
        "action": "DATA_EXPORT",
        "user_id": user_id,
        "details": "User requested full data export"
    })

    return export_data

# GDPR Art. 17 + India DPDP Act 2023 Sec. 12 — Right to Erasure
@api_router.delete("/privacy/delete-account")
async def delete_user_account(user_id: str = Depends(get_current_user)):
    """Permanently delete all user data (GDPR Art. 17 / DPDP Sec. 12)"""
    from bson import ObjectId

    # Audit BEFORE deletion
    await db.audit_logs.insert_one({
        "timestamp": datetime.now(timezone.utc),
        "action": "ACCOUNT_DELETION",
        "user_id": user_id,
        "details": "User requested account deletion — all data erased"
    })

    # Delete all user data
    await db.transactions.delete_many({"user_id": user_id})
    await db.budgets.delete_many({"user_id": user_id})
    await db.otps.delete_many({"phone": (await db.users.find_one({"_id": ObjectId(user_id)}, {"phone": 1}))["phone"]})
    await db.users.delete_one({"_id": ObjectId(user_id)})

    return {
        "message": "Account and all associated data permanently deleted",
        "legal_basis": "GDPR Art. 17 / India DPDP Act 2023 Sec. 12",
        "deleted_at": datetime.now(timezone.utc).isoformat()
    }

# GDPR Art. 13-14 + DPDP Sec. 5 — Privacy Notice
@api_router.get("/privacy/policy")
async def get_privacy_policy():
    """Return privacy policy and data processing details"""
    return {
        "app": "MintU",
        "version": "1.0",
        "last_updated": "2026-04-15",
        "data_controller": "MintU Finance Technologies",
        "legal_frameworks": [
            "India Digital Personal Data Protection Act (DPDP) 2023",
            "EU General Data Protection Regulation (GDPR) 2018",
            "India Information Technology Act 2000 (IT Act)",
            "RBI Master Direction on Digital Payment Security Controls 2021",
            "PCI-DSS v4.0 (Payment Card Industry Data Security Standard)"
        ],
        "data_collected": {
            "phone_number": {"purpose": "Authentication", "retention": "Until account deletion", "legal_basis": "Consent + Contract"},
            "name": {"purpose": "Personalization", "retention": "Until account deletion", "legal_basis": "Consent"},
            "transactions": {"purpose": "Expense tracking & insights", "retention": f"{DATA_RETENTION_DAYS} days", "legal_basis": "Consent + Legitimate Interest"},
            "sms_text": {"purpose": "Expense extraction", "retention": "NOT STORED — processed and discarded", "legal_basis": "Consent"},
            "budgets": {"purpose": "Budget tracking", "retention": "Until account deletion", "legal_basis": "Consent"},
        },
        "data_not_collected": [
            "Bank account numbers",
            "Card details",
            "Aadhaar/PAN numbers",
            "Location data",
            "Contact list",
            "Full SMS inbox"
        ],
        "third_party_sharing": {
            "openai": {"purpose": "AI insights generation", "data_shared": "Anonymized spending summaries only", "no_PII": True}
        },
        "user_rights": {
            "access": "GET /api/privacy/data-export",
            "deletion": "DELETE /api/privacy/delete-account",
            "portability": "GET /api/privacy/data-export (JSON format)",
            "rectification": "Contact support to correct data",
            "objection": "Disable AI insights in settings"
        },
        "security_measures": [
            "Passwords hashed with bcrypt (cost factor 12)",
            "OTPs hashed before storage, auto-deleted after expiry",
            "JWT tokens with expiration",
            "Rate limiting on all endpoints",
            "IP-based brute force protection",
            "Audit logging of all API access",
            "Security headers (X-Frame-Options, CSP, HSTS)",
            "Input sanitization against XSS/injection",
            "No sensitive data in API responses",
            "SMS text processed and immediately discarded"
        ],
        "data_breach_notification": "Within 72 hours as per GDPR Art. 33 and DPDP Sec. 8",
        "dpo_contact": "privacy@mintu.app"
    }

# Data retention cleanup endpoint
@api_router.post("/privacy/cleanup-expired")
async def cleanup_expired_data():
    """Remove expired OTPs and rate limit entries — called by cron"""
    now = datetime.now(timezone.utc)

    # Clean expired OTPs
    otp_result = await db.otps.delete_many({"expires_at": {"$lt": now}})

    # Clean old rate limit entries (older than 2 minutes)
    rl_result = await db.rate_limits.delete_many({"window": {"$lt": time.time() - 120}})

    # Clean audit logs older than 90 days (configurable)
    ninety_days_ago = now - timedelta(days=90)
    audit_result = await db.audit_logs.delete_many({"timestamp": {"$lt": ninety_days_ago}})

    return {
        "expired_otps_removed": otp_result.deleted_count,
        "rate_limits_cleaned": rl_result.deleted_count,
        "old_audit_logs_removed": audit_result.deleted_count
    }

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

@api_router.post("/ai/chat")
async def ai_financial_coach(msg: ChatMessage, user_id: str = Depends(get_current_user)):
    """AI Financial Coach — personalized advice based on real spending data"""
    from bson import ObjectId
    
    # Gather user's financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Aggregate spending data
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {doc["_id"]: doc["total"] async for doc in db.transactions.aggregate(pipeline)}
    total_expense = sum(v for v in category_spend.values())
    
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    budget_info = {b["category"]: b["amount"] for b in budgets}
    
    # Build rich context for AI
    context = f"""User: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100
Monthly Income: ₹{total_income:,.0f} | Monthly Expenses: ₹{total_expense:,.0f} | Savings: ₹{max(0, total_income - total_expense):,.0f}
Category-wise spending this month: {', '.join(f'{k}: ₹{v:,.0f}' for k, v in category_spend.items()) or 'No data yet'}
Budgets set: {', '.join(f'{k}: ₹{v:,.0f}' for k, v in budget_info.items()) or 'None'}
Streak: {user.get('streak_days', 0)} days
India context: Average Indian household spends ~₹15,000-25,000/month. User is in India."""

    system_prompt = f"""You are MintU AI Coach — a witty, friendly Indian financial advisor like a smart friend who's great with money.

PERSONALITY:
- Speak like a relatable Indian friend (use "yaar", "bhai", casual Hindi-English mix naturally)
- Be encouraging but honest — don't sugarcoat
- Use emojis sparingly but effectively 💪
- Keep responses SHORT (max 3-4 sentences) and actionable
- Reference specific numbers from their data
- Think like you're advising for 1.46 billion Indians — practical, India-specific tips
- Reference Indian products, services, and costs (Swiggy, Zomato, FD rates, SIP, UPI)

USER FINANCIAL CONTEXT:
{context}

RULES:
- Always reference their actual numbers
- Give ONE specific actionable tip
- If they ask about savings, suggest specific Indian instruments (SIP, PPF, FD, NPS)
- If they ask about budgeting, reference their actual category spending
- NEVER give generic advice — personalize everything""" + get_lang_instruction(msg.lang or "en")

    try:
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"coach_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=msg.message))
        
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        return {
            "reply": response_text,
            "context_used": {
                "money_score": user.get("money_score", 50),
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "top_category": max(category_spend, key=category_spend.get) if category_spend else None,
            }
        }
    except Exception as e:
        logging.error(f"AI Coach error: {e}")
        # Fallback: rule-based advice
        savings_rate = ((total_income - total_expense) / max(total_income, 1)) * 100 if total_income > 0 else 0
        if savings_rate > 30:
            reply = f"You're saving {savings_rate:.0f}% — that's solid, yaar! 💪 Consider putting ₹{int((total_income-total_expense)*0.5):,} into a SIP for long-term wealth."
        elif savings_rate > 10:
            reply = f"Saving {savings_rate:.0f}% is decent, but let's push to 30%. Your top spend is {max(category_spend, key=category_spend.get) if category_spend else 'unknown'} — can we cut ₹500 there?"
        else:
            reply = f"Your savings rate is {savings_rate:.0f}% — let's fix this! Start with cutting ₹200/week from discretionary spending. Small steps = big results. 🚀"
        return {"reply": reply, "context_used": {"money_score": user.get("money_score", 50), "monthly_expense": total_expense}}

# 2. WASTE DETECTOR
@api_router.get("/waste-detector")
async def waste_detector(user_id: str = Depends(get_current_user)):
    """AI-powered Waste Detector — dynamic analysis with peer comparisons & trend insights"""
    from bson import ObjectId
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    
    # Category spending this month
    pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    categories = {}
    async for doc in db.transactions.aggregate(pipeline):
        categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    # Last month spending for trend comparison
    prev_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": prev_month_start, "$lt": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    prev_categories = {}
    async for doc in db.transactions.aggregate(prev_pipeline):
        prev_categories[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    total_expense = sum(c["total"] for c in categories.values())
    prev_total = sum(c["total"] for c in prev_categories.values())
    
    # Peer average spending (aggregate from all users this month)
    peer_pipeline = [
        {"$match": {"type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "user_count": {"$addToSet": "$user_id"}}},
        {"$project": {"_id": 1, "total": 1, "user_count": {"$size": "$user_count"}}}
    ]
    peer_data = {}
    async for doc in db.transactions.aggregate(peer_pipeline):
        if doc["user_count"] > 0:
            peer_data[doc["_id"]] = {"avg": doc["total"] / doc["user_count"]}
    
    # Build enhanced waste insights for each category
    waste_insights = []
    for cat, data in sorted(categories.items(), key=lambda x: x[1]["total"], reverse=True):
        equivs = build_equivalences(data["total"])
        prev_amt = prev_categories.get(cat, {}).get("total", 0)
        peer_avg = peer_data.get(cat, {}).get("avg", 0)
        
        # Trend vs last month
        trend_pct = ((data["total"] - prev_amt) / max(prev_amt, 1)) * 100 if prev_amt > 0 else 0
        trend_text = f"{'📈' if trend_pct > 0 else '📉'} {abs(trend_pct):.0f}% {'more' if trend_pct > 0 else 'less'} than last month" if prev_amt > 0 else ""
        
        # Peer comparison
        peer_diff = ((data["total"] - peer_avg) / max(peer_avg, 1)) * 100 if peer_avg > 0 else 0
        peer_text = f"You spend {abs(peer_diff):.0f}% {'more' if peer_diff > 0 else 'less'} than average MintU users" if peer_avg > 0 else ""
        
        insight = {
            "category": cat,
            "amount": data["total"],
            "count": data["count"],
            "equivalences": equivs[:3] if equivs else [],
            "shock_text": f"₹{data['total']:,.0f} on {cat} — {data['count']} transactions 😳",
            "trend": {"pct": round(trend_pct, 1), "text": trend_text, "prev_amount": prev_amt},
            "peer_comparison": {"diff_pct": round(peer_diff, 1), "text": peer_text, "peer_avg": round(peer_avg)},
        }
        waste_insights.append(insight)
    
    # Overall equivalence
    overall_equivs = build_equivalences(total_expense)
    
    # Overall trend
    overall_trend_pct = ((total_expense - prev_total) / max(prev_total, 1)) * 100 if prev_total > 0 else 0
    
    # Percentile comparison
    user_count = await db.users.count_documents({})
    users_with_less = await db.users.count_documents({"money_score": {"$lt": 50}})
    percentile = min(95, max(5, int((1 - (users_with_less / max(user_count, 1))) * 100)))
    
    # Generate AI recommendation using GPT
    ai_recommendation = ""
    try:
        top_3_cats = "\n".join([f"- {w['category']}: ₹{w['amount']:,.0f} ({w['count']} txns){' — ' + w['trend']['text'] if w['trend']['text'] else ''}" for w in waste_insights[:3]])
        ai_prompt = f"""Based on this Indian user's spending, give ONE short punchy recommendation (2-3 sentences max):
Total: ₹{total_expense:,.0f} | Last month: ₹{prev_total:,.0f} | Change: {overall_trend_pct:+.0f}%
Top categories:
{top_3_cats}
Be specific, actionable, use Indian context. Sound like a smart friend, not a bot."""
        
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"waste_{user_id}_{now.timestamp()}",
            system_message="You are a witty Indian personal finance advisor. Keep it short and punchy."
        ).with_model("openai", "gpt-5.2")
        
        ai_resp = await chat.send_message(UserMessage(text=ai_prompt))
        ai_recommendation = ai_resp.strip() if isinstance(ai_resp, str) else str(ai_resp)
    except Exception as e:
        logging.warning(f"Waste AI recommendation failed: {e}")
        ai_recommendation = ""
    
    return {
        "total_monthly_expense": total_expense,
        "prev_month_total": prev_total,
        "overall_trend_pct": round(overall_trend_pct, 1),
        "category_waste": waste_insights[:5],
        "overall_equivalences": overall_equivs,
        "ai_recommendation": ai_recommendation,
        "comparison": {
            "percentile": percentile,
            "text": f"You spend {'less' if percentile > 50 else 'more'} than {percentile}% of MintU users 👀",
            "population_context": f"Out of 1.46 billion Indians, only ~{int(INDIA_POPULATION_2025 * percentile / 100 / 1_000_000)}M people save as well as you"
        },
        "shareable_text": f"I spent ₹{total_expense:,.0f} this month... that's {overall_equivs[0]['emoji']} {overall_equivs[0]['text']}! 😱 Check yours on MintU" if overall_equivs else f"I tracked ₹{total_expense:,.0f} this month with MintU 💸"
    }

# 3. WEEKLY REPORT
@api_router.get("/reports/weekly")
async def weekly_report(user_id: str = Depends(get_current_user)):
    """Weekly Report — emotional + actionable summary"""
    from bson import ObjectId
    now = datetime.utcnow()
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = week_start - timedelta(days=7)
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    # This week's spending
    this_week_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": week_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    this_week = {}
    async for doc in db.transactions.aggregate(this_week_pipeline):
        this_week[doc["_id"]] = doc["total"]
    
    # Last week's spending
    last_week_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": prev_week_start, "$lt": week_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
    ]
    last_week = {}
    async for doc in db.transactions.aggregate(last_week_pipeline):
        last_week[doc["_id"]] = doc["total"]
    
    this_total = sum(this_week.values())
    last_total = sum(last_week.values())
    change_pct = ((this_total - last_total) / max(last_total, 1) * 100) if last_total > 0 else 0
    
    # Top waste category
    top_category = max(this_week, key=this_week.get) if this_week else "Nothing tracked"
    top_amount = this_week.get(top_category, 0)
    
    # Mood determination
    if change_pct < -10:
        mood = "🎉"
        mood_text = "Great week! You spent less than last week"
    elif change_pct < 5:
        mood = "😊"
        mood_text = "Steady week — spending is stable"
    elif change_pct < 20:
        mood = "👀"
        mood_text = "Watch out! Spending crept up a bit"
    else:
        mood = "🔥"
        mood_text = "Big spending week! Let's course-correct"
    
    # Savings suggestion
    potential_save = int(this_total * 0.15)  # Suggest saving 15% more
    
    report = {
        "period": f"{week_start.strftime('%b %d')} - {now.strftime('%b %d, %Y')}",
        "total_spent": this_total,
        "last_week_spent": last_total,
        "change_pct": round(change_pct, 1),
        "mood": mood,
        "mood_text": mood_text,
        "top_category": {"name": top_category, "amount": top_amount},
        "category_breakdown": {k: v for k, v in sorted(this_week.items(), key=lambda x: x[1], reverse=True)},
        "savings_suggestion": f"Cut ₹{potential_save:,} next week by reducing {top_category} spending",
        "streak": user.get("streak_days", 0) if user else 0,
        "money_score": user.get("money_score", 50) if user else 50,
        "headline": f"You {'wasted' if change_pct > 10 else 'spent'} ₹{this_total:,.0f} this week {mood}",
        "shareable_text": f"My week: ₹{this_total:,.0f} spent | Top: {top_category} ₹{top_amount:,.0f} | Score: {user.get('money_score', 50) if user else 50}/100 💸 #MintU"
    }
    return report

# 4. SMART BUDGET AUTO-CREATION
@api_router.get("/budgets/smart-suggest")
async def smart_budget_suggestions(user_id: str = Depends(get_current_user)):
    """AI-powered budget suggestions based on spending habits"""
    from bson import ObjectId
    now = datetime.utcnow()
    
    # Analyze last 60 days of spending
    sixty_days_ago = now - timedelta(days=60)
    pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": sixty_days_ago}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}, "avg": {"$avg": "$amount"}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(pipeline):
        spending[doc["_id"]] = {"total": doc["total"], "count": doc["count"], "avg": doc["avg"]}
    
    if not spending:
        return {"suggestions": [], "message": "Track expenses for a week and I'll suggest smart budgets for you! 📊"}
    
    # Calculate monthly projections (scale 60 days → 30 days)
    total_monthly = sum(s["total"] for s in spending.values()) / 2
    
    # Indian benchmark budgets (% of income)
    INDIAN_BENCHMARKS = {
        "Food": 0.25, "Transport": 0.10, "Entertainment": 0.08,
        "Shopping": 0.10, "Bills": 0.20, "Health": 0.05,
        "Education": 0.08, "Groceries": 0.15, "Other": 0.10,
    }
    
    # Existing budgets
    existing = await db.budgets.find({"user_id": user_id}).to_list(20)
    existing_cats = {b["category"] for b in existing}
    
    suggestions = []
    for cat, data in sorted(spending.items(), key=lambda x: x[1]["total"], reverse=True):
        monthly_avg = data["total"] / 2  # 60 days → monthly
        benchmark_pct = INDIAN_BENCHMARKS.get(cat, 0.10)
        
        # Suggest 10-15% less than current spending (achievable)
        suggested = int(monthly_avg * 0.88 / 100) * 100  # Round to nearest 100
        suggested = max(suggested, 500)  # Minimum ₹500
        
        is_new = cat not in existing_cats
        status = "over" if monthly_avg > suggested else "under"
        
        suggestions.append({
            "category": cat,
            "current_monthly_avg": round(monthly_avg),
            "suggested_budget": suggested,
            "is_new": is_new,
            "message": f"You spend ~₹{monthly_avg:,.0f}/mo on {cat}. I'd cap it at ₹{suggested:,.0f}",
            "savings_potential": max(0, int(monthly_avg - suggested)),
            "confidence": "high" if data["count"] >= 5 else "medium" if data["count"] >= 2 else "low",
        })
    
    total_potential_savings = sum(s["savings_potential"] for s in suggestions)
    
    return {
        "suggestions": suggestions[:8],
        "total_potential_savings": total_potential_savings,
        "message": f"Following these budgets could save you ₹{total_potential_savings:,.0f}/month! 🎯",
        "auto_apply_available": True
    }

@api_router.post("/budgets/auto-apply")
async def auto_apply_budgets(user_id: str = Depends(get_current_user)):
    """Auto-apply AI-suggested budgets"""
    suggestions = await smart_budget_suggestions(user_id)
    applied = 0
    for s in suggestions.get("suggestions", []):
        if s["is_new"] and s["confidence"] != "low":
            await db.budgets.insert_one({
                "user_id": user_id,
                "category": s["category"],
                "amount": s["suggested_budget"],
                "period": "monthly",
                "auto_created": True,
                "created_at": datetime.utcnow()
            })
            applied += 1
    return {"applied_count": applied, "message": f"Auto-created {applied} smart budgets! 🎯"}

# 5. AI SMART ALERTS
@api_router.get("/alerts/smart")
async def smart_alerts(user_id: str = Depends(get_current_user)):
    """AI Smart Alerts — intelligent, non-annoying nudges"""
    from bson import ObjectId
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    alerts = []
    
    # 1. Daily spending alert
    today_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    today_docs = await db.transactions.aggregate(today_pipeline).to_list(1)
    today_total = today_docs[0]["total"] if today_docs else 0
    
    # Compare with daily average
    month_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    month_docs = await db.transactions.aggregate(month_pipeline).to_list(1)
    month_total = month_docs[0]["total"] if month_docs else 0
    days_elapsed = max(1, (now - month_start).days)
    daily_avg = month_total / days_elapsed
    
    if today_total > daily_avg * 1.5 and today_total > 200:
        alerts.append({
            "type": "overspend_today",
            "severity": "warning",
            "emoji": "👀",
            "title": f"You spent ₹{today_total:,.0f} today",
            "message": f"That's {today_total/max(daily_avg,1):.1f}x your daily average of ₹{daily_avg:,.0f}. Worth it?",
            "action": "review_transactions"
        })
    
    # 2. Weekend spike detection (Fri-Sun)
    if now.weekday() >= 4:  # Friday onwards
        weekend_pipeline = [
            {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start - timedelta(days=now.weekday()-4) if now.weekday() >= 4 else today_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        weekend_docs = await db.transactions.aggregate(weekend_pipeline).to_list(1)
        weekend_total = weekend_docs[0]["total"] if weekend_docs else 0
        if weekend_total > daily_avg * 2:
            alerts.append({
                "type": "weekend_spike",
                "severity": "info",
                "emoji": "🍻",
                "title": "Weekend spending spike detected",
                "message": f"₹{weekend_total:,.0f} since Friday. That's your weekend tax! 😅",
                "action": "view_insights"
            })
    
    # 3. Streak alerts
    streak = user.get("streak_days", 0) if user else 0
    if streak >= 5:
        alerts.append({
            "type": "streak_strong",
            "severity": "success",
            "emoji": "🔥",
            "title": f"{streak}-day streak! Keep going!",
            "message": f"You're in the top 10% of consistent trackers. Don't break it!",
            "action": "log_expense"
        })
    elif streak >= 2:
        alerts.append({
            "type": "streak_building",
            "severity": "info",
            "emoji": "⚡",
            "title": f"{streak}-day streak building!",
            "message": f"Just {7 - streak} more days for a weekly badge! 🏅",
            "action": "log_expense"
        })
    
    # 4. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    for b in budgets:
        cat = b["category"]
        spent_pipeline = [
            {"$match": {"user_id": user_id, "category": cat, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        spent_docs = await db.transactions.aggregate(spent_pipeline).to_list(1)
        spent = spent_docs[0]["total"] if spent_docs else 0
        pct = (spent / max(b["amount"], 1)) * 100
        
        if pct >= 100:
            alerts.append({
                "type": "budget_exceeded",
                "severity": "danger",
                "emoji": "🚨",
                "title": f"{cat} budget exceeded!",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} ({pct:.0f}%). Time to slow down!",
                "action": "view_budget"
            })
        elif pct >= 80:
            alerts.append({
                "type": "budget_warning",
                "severity": "warning",
                "emoji": "⚠️",
                "title": f"{cat} budget almost done",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} used ({pct:.0f}%). Only ₹{b['amount']-spent:,.0f} left!",
                "action": "view_budget"
            })
    
    # 5. Savings rate alert
    income_pipeline = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipeline).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    
    if total_income > 0:
        savings_rate = ((total_income - month_total) / total_income) * 100
        if savings_rate > 30:
            alerts.append({
                "type": "savings_star",
                "severity": "success",
                "emoji": "🌟",
                "title": f"Savings rate: {savings_rate:.0f}%!",
                "message": f"You're saving ₹{total_income-month_total:,.0f} this month. That's better than most Indians! 🇮🇳",
                "action": "view_insights"
            })
    
    # 6. Money score milestone
    score = user.get("money_score", 50) if user else 50
    if score >= 90:
        alerts.append({
            "type": "score_elite",
            "severity": "success", 
            "emoji": "👑",
            "title": "Elite Money Score: " + str(score),
            "message": "Top 5% of all users! You're a financial rockstar! 🎸",
            "action": "share_score"
        })
    
    return {"alerts": alerts[:6], "count": len(alerts)}  # Max 6 alerts

# 6. SHAREABLE STATS CARD
@api_router.get("/share/stats-card")
async def shareable_stats_card(user_id: str = Depends(get_current_user)):
    """Generate shareable stats for WhatsApp/Instagram"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Monthly stats
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {
            "_id": "$type",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    stats = {}
    async for doc in db.transactions.aggregate(pipeline):
        stats[doc["_id"]] = doc["total"]
    
    income = stats.get("income", 0)
    expense = stats.get("expense", 0)
    saved = max(0, income - expense)
    score = user.get("money_score", 50) if user else 50
    streak = user.get("streak_days", 0) if user else 0
    name = user.get("name", "MintU User") if user else "MintU User"
    
    # Build shareable texts
    whatsapp_text = f"💸 {name}'s Money Report — {now.strftime('%B %Y')}\n\n"
    whatsapp_text += f"💰 Saved: ₹{saved:,.0f}\n"
    whatsapp_text += f"📊 Money Score: {score}/100\n"
    whatsapp_text += f"🔥 Streak: {streak} days\n\n"
    whatsapp_text += f"Track your money smartly with MintU! 🚀\n📲 Download: {APP_DOWNLOAD_LINK}"
    
    instagram_caption = f"I saved ₹{saved:,.0f} this month using MintU 💸\n\nMoney Score: {score}/100 ⭐\n🔥 {streak}-day tracking streak\n\n📲 Download MintU: {APP_DOWNLOAD_LINK}\n\n#MintU #MoneyManagement #Savings #FinancialFreedom #India"
    
    return {
        "name": name,
        "month": now.strftime("%B %Y"),
        "income": income,
        "expense": expense,
        "saved": saved,
        "money_score": score,
        "streak": streak,
        "whatsapp_text": whatsapp_text,
        "instagram_caption": instagram_caption,
        "card_data": {
            "headline": f"I saved ₹{saved:,.0f} this month! 💸",
            "subtitle": f"Money Score: {score}/100",
            "stats": [
                {"label": "Income", "value": f"₹{income:,.0f}", "color": "green"},
                {"label": "Expenses", "value": f"₹{expense:,.0f}", "color": "red"},
                {"label": "Saved", "value": f"₹{saved:,.0f}", "color": "blue"},
            ],
            "badge": f"🔥 {streak}-day streak" if streak > 0 else "📊 Start tracking!",
        }
    }

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

# ============== PHASE 2: LEADERBOARD & ENHANCED REFERRAL ==============

# App download link for shareable content
APP_DOWNLOAD_LINK = "https://mintu.app/download"

# Daily rotating cards for engagement
DAILY_CARDS = [
    {"type": "fact", "emoji": "💡", "title": "Did you know?", "text": "Indians who track expenses save 23% more than those who don't!", "color": "#3B82F6"},
    {"type": "challenge", "emoji": "🎯", "title": "Today's Challenge", "text": "No unnecessary spending today! Can you do it? 💪", "color": "#8B5CF6"},
    {"type": "quote", "emoji": "🧠", "title": "Money Wisdom", "text": "\"The habit of saving is itself an education\" — T. T. Munger", "color": "#059669"},
    {"type": "tip", "emoji": "🔥", "title": "Pro Tip", "text": "Set up a SIP of just ₹500/month. In 10 years, it could be ₹1.1 lakh!", "color": "#F59E0B"},
    {"type": "fact", "emoji": "📊", "title": "India Stat", "text": "Only 27% of Indians have a monthly budget. You're already ahead!", "color": "#EC4899"},
    {"type": "challenge", "emoji": "⚡", "title": "Quick Win", "text": "Review your subscriptions today. Cancel one you don't use!", "color": "#10B981"},
    {"type": "quote", "emoji": "💰", "title": "Wealth Quote", "text": "\"Don't save what's left after spending. Spend what's left after saving.\" — Warren Buffett", "color": "#6366F1"},
    {"type": "tip", "emoji": "🏦", "title": "Smart Move", "text": "Keep 3 months expenses in a liquid fund. Better than savings account!", "color": "#0EA5E9"},
    {"type": "fact", "emoji": "🇮🇳", "title": "Indian Finance", "text": "UPI processed 14 billion transactions last month. Track yours with MintU!", "color": "#EF4444"},
    {"type": "challenge", "emoji": "🌟", "title": "Streak Builder", "text": "Log every expense today, no matter how small. Build that habit!", "color": "#F97316"},
]

# Profile photo upload
@api_router.post("/user/avatar")
async def upload_avatar(data: dict, user_id: str = Depends(get_current_user)):
    """Upload profile photo as base64"""
    from bson import ObjectId
    avatar_b64 = data.get("avatar", "")
    if not avatar_b64:
        raise HTTPException(status_code=400, detail="No avatar data")
    # Limit size to ~500KB base64
    if len(avatar_b64) > 700_000:
        raise HTTPException(status_code=400, detail="Image too large. Max 500KB")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"avatar": avatar_b64}})
    return {"message": "Avatar updated!"}

@api_router.get("/user/avatar")
async def get_avatar(user_id: str = Depends(get_current_user)):
    """Get profile photo"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"avatar": 1, "name": 1})
    return {"avatar": user.get("avatar", "") if user else "", "name": user.get("name", "") if user else ""}

# Card of the Day — rotates daily + random refresh
@api_router.get("/card-of-the-day")
async def card_of_the_day(refresh: bool = False, user_id: str = Depends(get_current_user)):
    """Get daily rotating motivational/financial card"""
    import random
    from datetime import date
    if refresh:
        card = random.choice(DAILY_CARDS)
    else:
        day_index = date.today().toordinal() % len(DAILY_CARDS)
        card = DAILY_CARDS[day_index]
    return {**card, "app_link": APP_DOWNLOAD_LINK}

# 1. SAVINGS LEADERBOARD
@api_router.get("/leaderboard/savings")
async def savings_leaderboard(user_id: str = Depends(get_current_user)):
    """Global savings leaderboard with user's rank and percentile"""
    from bson import ObjectId
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Get all users with their money scores
    all_users = await db.users.find(
        {"money_score": {"$exists": True}},
        {"name": 1, "money_score": 1, "phone": 1, "streak_days": 1}
    ).sort("money_score", -1).to_list(100)
    
    # Find current user's position
    user_rank = 0
    user_score = 0
    total_users = len(all_users)
    
    for i, u in enumerate(all_users):
        if str(u["_id"]) == user_id:
            user_rank = i + 1
            user_score = u.get("money_score", 0)
            break
    
    # Percentile (higher is better)
    percentile = max(1, min(99, int(((total_users - user_rank) / max(total_users, 1)) * 100))) if user_rank > 0 else 50
    
    # Build top 10 leaderboard (anonymize phone numbers)
    top_10 = []
    for i, u in enumerate(all_users[:10]):
        is_me = str(u["_id"]) == user_id
        phone = u.get("phone", "")
        masked_phone = f"***{phone[-4:]}" if len(phone) >= 4 else "****"
        top_10.append({
            "rank": i + 1,
            "name": u.get("name", "MintU User"),
            "score": u.get("money_score", 0),
            "streak": u.get("streak_days", 0),
            "is_me": is_me,
            "phone_masked": masked_phone,
        })
    
    # Get user's monthly savings for comparison text
    user_txn_pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]
    user_stats = {}
    async for doc in db.transactions.aggregate(user_txn_pipeline):
        user_stats[doc["_id"]] = doc["total"]
    
    income = user_stats.get("credit", 0)
    expense = user_stats.get("debit", 0)
    saved = max(0, income - expense)
    
    # Motivational comparison text
    if percentile >= 80:
        comparison_text = f"🏆 You're in the top {100-percentile}% of savers! Financial rockstar!"
    elif percentile >= 60:
        comparison_text = f"💪 You save better than {percentile}% of users. Push for top 20%!"
    elif percentile >= 40:
        comparison_text = f"👀 You're in the middle — {percentile}% of users save less than you. Room to grow!"
    else:
        comparison_text = f"🚀 {percentile}% of users save less than you. Small changes = big results!"
    
    return {
        "user_rank": user_rank,
        "total_users": total_users,
        "percentile": percentile,
        "user_score": user_score,
        "monthly_saved": saved,
        "comparison_text": comparison_text,
        "top_10": top_10,
        "motivations": [
            f"You saved more than {percentile}% of users this week 👀",
            f"Your Money Score: {user_score}/100 — {'Top tier!' if user_score >= 75 else 'Getting there!'}",
            f"{'🔥 ' + str(all_users[user_rank-1].get('streak_days', 0)) + '-day streak!' if user_rank > 0 and user_rank <= len(all_users) else ''}",
        ]
    }

# 2. FRIEND COMPARISON
@api_router.get("/leaderboard/friends")
async def friend_comparison(user_id: str = Depends(get_current_user)):
    """Compare savings with friends from split groups"""
    from bson import ObjectId
    
    # Get friends from split groups
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(20)
    friend_ids = set()
    for g in groups:
        for m in g.get("members", []):
            if m["user_id"] != user_id:
                friend_ids.add(m["user_id"])
    
    if not friend_ids:
        return {"friends": [], "message": "Add friends in Split groups to compare savings! 👥"}
    
    # Get friend data
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    user_score = user.get("money_score", 50) if user else 50
    user_name = user.get("name", "You") if user else "You"
    
    friends = []
    for fid in friend_ids:
        try:
            friend = await db.users.find_one({"_id": ObjectId(fid)})
            if friend:
                f_score = friend.get("money_score", 50)
                diff = user_score - f_score
                if diff > 10:
                    taunt = f"You're crushing it vs {friend['name']}! 😎"
                elif diff > 0:
                    taunt = f"Slightly ahead of {friend['name']} — keep it up!"
                elif diff > -10:
                    taunt = f"{friend['name']} is just ahead — catch up! 💪"
                else:
                    taunt = f"{friend['name']} is killing it! Time to step up 😏"
                
                friends.append({
                    "name": friend.get("name", "Friend"),
                    "score": f_score,
                    "streak": friend.get("streak_days", 0),
                    "diff": diff,
                    "taunt": taunt,
                    "ahead": diff > 0,
                })
        except Exception:
            continue
    
    # Sort: friends beating you first (to motivate)
    friends.sort(key=lambda x: x["diff"])
    
    winning_count = sum(1 for f in friends if f["ahead"])
    total = len(friends)
    
    return {
        "you": {"name": user_name, "score": user_score},
        "friends": friends,
        "summary": f"You're beating {winning_count}/{total} friends 🏆" if total > 0 else "No friends to compare yet",
        "challenge_text": f"Hey! My MintU score is {user_score}. Can you beat me? 😏 Download MintU!"
    }

# 3. ENHANCED REFERRAL WITH PRO REWARDS
@api_router.get("/referral/enhanced-status")
async def enhanced_referral_status(user_id: str = Depends(get_current_user)):
    """Enhanced referral status with Pro day rewards"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    code = user.get("referral_code")
    if not code:
        code = f"MINTU{user['phone'][-4:]}{uuid_lib.uuid4().hex[:4].upper()}"
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"referral_code": code}})
    
    # Get referral details
    referrals = await db.referrals.find({"referrer_id": user_id}).sort("created_at", -1).to_list(50)
    referral_count = len(referrals)
    
    # Enhanced reward tiers
    reward_tiers = [
        {"friends": 1, "reward": "+3 days Pro", "pro_days": 3, "icon": "star", "unlocked": referral_count >= 1},
        {"friends": 3, "reward": "+7 days Pro", "pro_days": 7, "icon": "diamond", "unlocked": referral_count >= 3},
        {"friends": 5, "reward": "1 month Pro", "pro_days": 30, "icon": "trophy", "unlocked": referral_count >= 5},
        {"friends": 10, "reward": "Lifetime Pro", "pro_days": 365, "icon": "crown", "unlocked": referral_count >= 10},
    ]
    
    # Calculate total earned Pro days
    total_pro_days = 0
    for tier in reward_tiers:
        if tier["unlocked"]:
            total_pro_days = tier["pro_days"]  # Highest unlocked tier
    
    # Next milestone
    next_tier = None
    for tier in reward_tiers:
        if not tier["unlocked"]:
            next_tier = tier
            break
    
    # Recent referral activity
    recent = []
    for ref in referrals[:5]:
        referred = await db.users.find_one({"_id": ObjectId(ref["referred_id"])}, {"name": 1})
        recent.append({
            "name": referred.get("name", "Friend") if referred else "Friend",
            "date": ref["created_at"],
        })
    
    return {
        "referral_code": code,
        "referral_count": referral_count,
        "total_pro_days_earned": total_pro_days,
        "reward_tiers": reward_tiers,
        "next_milestone": {
            "friends_needed": next_tier["friends"] - referral_count if next_tier else 0,
            "reward": next_tier["reward"] if next_tier else "All unlocked! 🎉",
        } if next_tier else {"friends_needed": 0, "reward": "All unlocked! 🎉"},
        "recent_referrals": recent,
        "share_text": f"🔥 I'm using MintU to track my money smartly! Use my code {code} and we both get Pro features. Download: https://mintu.app/invite/{code}",
        "whatsapp_text": f"Hey! 👋 I found this amazing finance app called MintU. It tells you exactly where your money goes 💸\n\nUse my code: {code}\nDownload: https://mintu.app/invite/{code}\n\nWe both get Pro features for free! 🎁",
    }

# ============== FEATURE: UPI PAYMENT INTEGRATION ==============

import re as regex_module
import uuid as uuid_lib

UPI_REGEX = r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$'

def validate_upi_id(upi_id: str) -> bool:
    """Validate UPI ID format (e.g., name@okicici, phone@ybl)"""
    return bool(regex_module.match(UPI_REGEX, upi_id)) and len(upi_id) <= 50

def mask_upi_id(upi_id: str) -> str:
    """Mask UPI ID for privacy (show ****@bank)"""
    if not upi_id or '@' not in upi_id:
        return '****'
    parts = upi_id.split('@')
    name = parts[0]
    bank = parts[1]
    masked = name[:2] + '****' if len(name) > 2 else '****'
    return f"{masked}@{bank}"

@api_router.post("/user/upi")
async def save_upi_id(data: dict, user_id: str = Depends(get_current_user)):
    """Save or update user's UPI ID"""
    from bson import ObjectId
    upi_id = data.get("upi_id", "").strip()
    if not upi_id:
        raise HTTPException(status_code=400, detail="UPI ID is required")
    if not validate_upi_id(upi_id):
        raise HTTPException(status_code=400, detail="Invalid UPI ID format. Use format: name@bank")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"upi_id": upi_id}})
    return {"message": "UPI ID saved", "upi_id": mask_upi_id(upi_id)}

@api_router.get("/user/upi")
async def get_upi_id(user_id: str = Depends(get_current_user)):
    """Get user's UPI ID"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"upi_id": 1, "name": 1})
    upi = user.get("upi_id", "") if user else ""
    return {"upi_id": upi, "masked": mask_upi_id(upi), "name": user.get("name", "") if user else ""}

@api_router.get("/split/pay-intent/{target_user_id}")
async def generate_upi_pay_intent(target_user_id: str, amount: float, user_id: str = Depends(get_current_user)):
    """Generate UPI deep link for payment"""
    from bson import ObjectId
    from urllib.parse import quote
    
    target = await db.users.find_one({"_id": ObjectId(target_user_id)}, {"upi_id": 1, "name": 1})
    if not target or not target.get("upi_id"):
        raise HTTPException(status_code=400, detail="Payee hasn't set up UPI ID")
    
    payee_name = target.get("name", "MintU User")
    upi_id = target["upi_id"]
    txn_ref = f"MINTU{uuid_lib.uuid4().hex[:8].upper()}"
    
    # UPI intent deep link (works with GPay, PhonePe, Paytm, BHIM)
    upi_link = f"upi://pay?pa={quote(upi_id)}&pn={quote(payee_name)}&am={amount:.2f}&cu=INR&tn={quote(f'MintU Split Settlement')}&tr={txn_ref}"
    
    return {
        "upi_link": upi_link,
        "payee_name": payee_name,
        "payee_upi": mask_upi_id(upi_id),
        "amount": amount,
        "txn_ref": txn_ref,
        "currency": "INR"
    }

class SettlePayment(BaseModel):
    target_user_id: str
    amount: float
    txn_ref: Optional[str] = None
    method: str = "upi"  # "upi", "cash", "bank_transfer"
    group_id: Optional[str] = None

@api_router.post("/split/settle")
async def settle_payment(data: SettlePayment, user_id: str = Depends(get_current_user)):
    """Mark a split payment as settled"""
    from bson import ObjectId
    
    settlement = {
        "payer_id": user_id,
        "payee_id": data.target_user_id,
        "amount": data.amount,
        "method": data.method,
        "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
        "group_id": data.group_id,
        "status": "completed",
        "settled_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    
    result = await db.settlements.insert_one(settlement)
    settlement["id"] = str(result.inserted_id)
    
    # Get names safely
    payer_name = "You"
    payee_name = "User"
    try:
        payer = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if payer: payer_name = payer.get("name", "You")
    except Exception:
        pass
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except Exception:
        pass
    
    return {
        "id": settlement["id"],
        "message": f"Payment of ₹{data.amount:,.0f} to {payee_name} marked as settled!",
        "txn_ref": settlement["txn_ref"],
        "status": "completed"
    }

@api_router.get("/split/settlements")
async def get_settlements(user_id: str = Depends(get_current_user)):
    """Get payment settlement history"""
    from bson import ObjectId
    
    settlements = await db.settlements.find({
        "$or": [{"payer_id": user_id}, {"payee_id": user_id}]
    }).sort("settled_at", -1).to_list(50)
    
    result = []
    for s in settlements:
        payer_name = "User"
        payee_name = "User"
        try:
            payer = await db.users.find_one({"_id": ObjectId(s["payer_id"])}, {"name": 1})
            if payer: payer_name = payer.get("name", "User")
        except Exception:
            pass
        try:
            payee = await db.users.find_one({"_id": ObjectId(s["payee_id"])}, {"name": 1})
            if payee: payee_name = payee.get("name", "User")
        except Exception:
            pass
        result.append({
            "id": str(s["_id"]),
            "payer_name": payer_name,
            "payee_name": payee_name,
            "amount": s["amount"],
            "method": s["method"],
            "txn_ref": s.get("txn_ref", ""),
            "status": s["status"],
            "is_payer": s["payer_id"] == user_id,
            "settled_at": s["settled_at"].isoformat() if s.get("settled_at") else None
        })
    return result

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
}

def route_to_agent(message: str) -> str:
    """Route user message to the most appropriate AI agent"""
    msg_lower = message.lower()
    scores = {}
    for agent_id, profile in AGENT_PROFILES.items():
        score = sum(1 for trigger in profile["triggers"] if trigger in msg_lower)
        scores[agent_id] = score
    
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "insights_agent"  # Default to insights for general queries
    return best

@api_router.post("/ai/agent-chat")
async def agentic_ai_chat(data: dict, user_id: str = Depends(get_current_user)):
    """Multi-agent AI finance assistant with memory and proactive behavior"""
    from bson import ObjectId
    
    message = data.get("message", "")
    lang = data.get("lang", "en")
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message required")
    
    # Route to appropriate agent
    agent_id = route_to_agent(message)
    agent = AGENT_PROFILES[agent_id]
    
    # Gather comprehensive financial context
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    
    # Spending data
    cat_pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    category_spend = {}
    async for doc in db.transactions.aggregate(cat_pipeline):
        category_spend[doc["_id"]] = {"total": doc["total"], "count": doc["count"]}
    
    total_expense = sum(c["total"] for c in category_spend.values())
    
    # Income
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    total_income = income_docs[0]["total"] if income_docs else 0
    
    # Budgets
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    budget_info = []
    for b in budgets:
        spent = category_spend.get(b["category"], {}).get("total", 0)
        pct = (spent / max(b["amount"], 1)) * 100
        budget_info.append(f"{b['category']}: ₹{spent:,.0f}/₹{b['amount']:,.0f} ({pct:.0f}%)")
    
    # Split balances
    balances = await db.split_expenses.find({"splits.user_id": user_id}).to_list(50)
    
    # Recent transactions (last 10)
    recent_txns = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(10)
    recent_str = "\n".join([f"  - {t.get('description','?')}: ₹{t['amount']:,.0f} ({t.get('category','?')}) on {t['date'].strftime('%b %d') if t.get('date') else '?'}" for t in recent_txns[:7]])
    
    # Load agent memory
    memory = await db.agent_memory.find_one({"user_id": user_id})
    memory_context = ""
    if memory:
        prefs = memory.get("preferences", {})
        habits = memory.get("habits", [])
        memory_context = f"\nUser Preferences: {prefs}\nKnown Habits: {', '.join(habits[:5])}"
    
    # Build agent-specific system prompt
    financial_context = f"""USER FINANCIAL PROFILE:
Name: {user.get('name', 'User')} | Money Score: {user.get('money_score', 50)}/100 | Streak: {user.get('streak_days', 0)} days
Monthly Income: ₹{total_income:,.0f} | Monthly Expenses: ₹{total_expense:,.0f} | Savings: ₹{max(0, total_income - total_expense):,.0f}
Savings Rate: {((total_income - total_expense) / max(total_income, 1) * 100):.0f}%

CATEGORY SPENDING (This Month):
{chr(10).join(f'  {cat}: ₹{data["total"]:,.0f} ({data["count"]} txns)' for cat, data in sorted(category_spend.items(), key=lambda x: x[1]["total"], reverse=True)) or '  No data yet'}

BUDGETS:
{chr(10).join(f'  {b}' for b in budget_info) or '  No budgets set'}

RECENT TRANSACTIONS:
{recent_str or '  None yet'}
{memory_context}"""

    agent_system_prompts = {
        "expense_tracker": f"""You are MintU's {agent['emoji']} Expense Tracker Agent — an expert at categorizing and analyzing expenses.

CAPABILITIES:
- Automatically categorize expenses into: Food, Transport, Entertainment, Shopping, Bills, Health, Education, Groceries, Other
- Detect spending anomalies (unusual amounts, new merchants, spikes)
- Identify recurring expenses
- Flag potential duplicate charges

PERSONALITY: Precise, detail-oriented, helpful. Use specific numbers.

{financial_context}

RULES:
- Reference ACTUAL transaction data — never make up numbers
- If you spot an anomaly, explain why it's unusual
- Suggest better categories if you see miscategorization
- Be concise (max 4 sentences per insight)""",

        "budget_manager": f"""You are MintU's {agent['emoji']} Budget Manager Agent — proactive budget optimizer for Indian users.

CAPABILITIES:
- Set and adjust dynamic budgets based on spending patterns
- Alert when approaching/exceeding thresholds
- Suggest realistic budget targets (based on Indian cost of living)
- Recommend budget reallocation between categories

PERSONALITY: Firm but encouraging. Like a friendly financial advisor.

{financial_context}

RULES:
- Use Indian benchmarks (25% food, 10% transport, 20% bills, 30% savings)
- Suggest specific ₹ amounts, not vague advice
- If budget exceeded, suggest specific cuts
- Reference SIP, FD, PPF for savings recommendations""",

        "split_manager": f"""You are MintU's {agent['emoji']} Split Manager Agent — fair split calculator and payment reminder.

CAPABILITIES:
- Calculate fair splits (equal, by income, by consumption)
- Track who owes whom
- Generate payment reminders (friendly, not pushy)
- Suggest settlement strategies (netting, UPI)

PERSONALITY: Diplomatic, fair, organized.

{financial_context}

RULES:
- Always suggest the simplest settlement path
- Recommend UPI for instant payments
- Be sensitive about money between friends
- Use casual Indian English""",

        "insights_agent": f"""You are MintU's {agent['emoji']} Insights & Trends Agent — data storyteller who makes numbers interesting.

CAPABILITIES:
- Generate weekly/monthly spending summaries
- Identify trends and patterns (rising/falling categories)
- Compare current vs previous periods
- Provide percentile comparisons with other users
- Create digestible financial snapshots

PERSONALITY: Insightful, encouraging, data-driven but relatable.

{financial_context}

RULES:
- Make insights ACTIONABLE — don't just report, suggest
- Use comparisons ("30% more than last week")
- Reference Indian context (festivals, seasons affecting spending)
- Keep it punchy — max 3-4 key insights""",

        "market_intel": f"""You are MintU's {agent['emoji']} Market Intelligence Agent — India's smartest money-saving advisor.

CAPABILITIES:
- Identify subscription savings (Netflix annual vs monthly, etc.)
- Suggest cheaper alternatives for services
- Inflation-aware spending advice
- Investment tips (SIP, FD, gold, NPS, PPF)
- Tax-saving recommendations (80C, 80D, HRA)
- Insurance optimization

PERSONALITY: Sharp, knowledgeable, like a fintech-savvy friend.

{financial_context}

RULES:
- Reference REAL Indian products/services (Zerodha, Groww, HDFC, SBI)
- Calculate actual savings ("Switching to annual Netflix = ₹600/year saved")
- Consider user's income level for investment advice
- Tax tips relevant to Indian tax slabs
- Be specific — name products, amounts, percentages"""
    }

    # Global conversational instruction for ALL agents
    CONVERSATIONAL_TONE = """

MANDATORY STYLE RULES (for ALL responses):
- Talk like a FRIEND, not a robot. Be warm, natural, sometimes funny.
- Use casual Indian English (yaar, bro, etc. when appropriate).
- Start with a reaction or acknowledgment: "Oh nice!", "Hmm interesting...", "Okay so..."
- Use 1-2 emojis per paragraph (not more). Place them naturally.
- Format with short paragraphs, bullet points with emojis, and bold numbers.
- Always highlight ₹ amounts in context: "that's ₹2,500 — almost a week's groceries!"
- Ask a follow-up question at the end to keep conversation going.
- Keep responses 3-5 short paragraphs max. No walls of text.
- If giving advice, make it SPECIFIC to their data — never generic.
- Reference Indian context: festivals, cricket, chai, local brands, UPI.

BAD example: "Your food expenses are ₹8,000. Consider reducing."
GOOD example: "₹8,000 on food this month — that's like ordering Swiggy every single day 😅 Want me to suggest a weekly meal budget that could save you ₹3,000?"
"""

    system_prompt = agent_system_prompts.get(agent_id, agent_system_prompts["insights_agent"])
    system_prompt += CONVERSATIONAL_TONE
    system_prompt += get_lang_instruction(lang)
    
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"agent_{agent_id}_{user_id}_{now.timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=message))
        reply = response.strip() if isinstance(response, str) else str(response)
        
        # Store interaction in agent memory
        await db.agent_memory.update_one(
            {"user_id": user_id},
            {
                "$set": {"user_id": user_id, "last_interaction": now},
                "$push": {
                    "interactions": {
                        "$each": [{"agent": agent_id, "query": message[:200], "timestamp": now}],
                        "$slice": -50  # Keep last 50 interactions
                    }
                }
            },
            upsert=True
        )
        
        return {
            "reply": reply,
            "agent": {
                "id": agent_id,
                "name": agent["name"],
                "emoji": agent["emoji"],
            },
            "context": {
                "money_score": user.get("money_score", 50) if user else 50,
                "monthly_expense": total_expense,
                "monthly_income": total_income,
                "savings_rate": round(((total_income - total_expense) / max(total_income, 1)) * 100, 1) if total_income > 0 else 0,
            }
        }
    except Exception as e:
        logging.error(f"Agent chat error: {e}")
        return {
            "reply": f"I'm having trouble right now. Here's a quick insight: Your monthly expenses are ₹{total_expense:,.0f} across {len(category_spend)} categories. {'Your top spend is ' + max(category_spend, key=lambda k: category_spend[k]['total']) + '.' if category_spend else 'Start tracking to get personalized insights!'}",
            "agent": {"id": agent_id, "name": agent["name"], "emoji": agent["emoji"]},
            "context": {"money_score": user.get("money_score", 50) if user else 50}
        }

@api_router.get("/ai/proactive-nudges")
async def get_proactive_nudges(user_id: str = Depends(get_current_user)):
    """Generate proactive AI nudges based on user's financial behavior"""
    from bson import ObjectId
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    nudges = []
    
    # 1. Check for unpaid splits
    groups = await db.split_groups.find({"members.user_id": user_id}).to_list(20)
    for g in groups:
        expenses = await db.split_expenses.find({"group_id": str(g["_id"])}).to_list(100)
        for exp in expenses:
            splits_data = exp.get("splits", {})
            # splits can be dict {user_id: amount} or list [{user_id, amount}]
            if isinstance(splits_data, dict):
                my_share = splits_data.get(user_id, 0)
                if my_share > 0 and exp.get("paid_by") != user_id:
                    settled = await db.settlements.find_one({
                        "payer_id": user_id, "payee_id": exp["paid_by"],
                        "group_id": str(g["_id"])
                    })
                    if not settled:
                        payer_name = "someone"
                        try:
                            payer = await db.users.find_one({"_id": ObjectId(exp["paid_by"])}, {"name": 1})
                            if payer: payer_name = payer.get("name", "someone")
                        except Exception:
                            payer_name = exp.get("paid_by", "someone")
                        nudges.append({
                            "type": "split_reminder",
                            "agent": "split_manager",
                            "emoji": "🤝",
                            "title": f"You owe {payer_name}",
                            "message": f"₹{my_share:,.0f} for '{exp.get('description', 'expense')}'. Settle via UPI?",
                            "action": "settle_split",
                            "priority": "high",
                            "data": {"payee_id": exp["paid_by"], "amount": my_share, "group_id": str(g["_id"])}
                        })
    
    # 2. Budget alerts
    budgets = await db.budgets.find({"user_id": user_id}).to_list(20)
    for b in budgets:
        spent_pipe = [
            {"$match": {"user_id": user_id, "category": b["category"], "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        spent_docs = await db.transactions.aggregate(spent_pipe).to_list(1)
        spent = spent_docs[0]["total"] if spent_docs else 0
        pct = (spent / max(b["amount"], 1)) * 100
        
        if pct >= 90 and pct < 100:
            nudges.append({
                "type": "budget_warning",
                "agent": "budget_manager",
                "emoji": "⚠️",
                "title": f"{b['category']} budget at {pct:.0f}%",
                "message": f"Only ₹{b['amount'] - spent:,.0f} left. Slow down for the rest of the month!",
                "action": "view_budget",
                "priority": "medium"
            })
        elif pct >= 100:
            nudges.append({
                "type": "budget_exceeded",
                "agent": "budget_manager",
                "emoji": "🚨",
                "title": f"{b['category']} budget blown!",
                "message": f"₹{spent:,.0f} of ₹{b['amount']:,.0f} ({pct:.0f}%). Want me to adjust the budget?",
                "action": "adjust_budget",
                "priority": "high"
            })
    
    # 3. Spending anomaly
    today_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    today_docs = await db.transactions.aggregate(today_pipe).to_list(1)
    today_total = today_docs[0]["total"] if today_docs else 0
    
    month_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    month_docs = await db.transactions.aggregate(month_pipe).to_list(1)
    month_total = month_docs[0]["total"] if month_docs else 0
    days = max(1, (now - month_start).days)
    daily_avg = month_total / days
    
    if today_total > daily_avg * 2 and today_total > 500:
        nudges.append({
            "type": "spending_spike",
            "agent": "expense_tracker",
            "emoji": "📊",
            "title": f"High spending today: ₹{today_total:,.0f}",
            "message": f"That's {today_total / max(daily_avg, 1):.1f}x your daily average. Review transactions?",
            "action": "review_today",
            "priority": "medium"
        })
    
    # 4. Streak nudge
    streak = user.get("streak_days", 0) if user else 0
    if streak >= 3 and streak < 7:
        nudges.append({
            "type": "streak_builder",
            "agent": "insights_agent",
            "emoji": "🔥",
            "title": f"{streak}-day streak!",
            "message": f"Just {7 - streak} more days for a weekly badge! Log today's expenses.",
            "action": "add_expense",
            "priority": "low"
        })
    
    # 5. Savings suggestion
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = income_docs[0]["total"] if income_docs else 0
    
    if income > 0:
        savings_rate = ((income - month_total) / income) * 100
        if savings_rate < 20:
            nudges.append({
                "type": "savings_low",
                "agent": "market_intel",
                "emoji": "💡",
                "title": f"Savings rate: {savings_rate:.0f}%",
                "message": f"Indian financial advisors recommend 30%+. Want tips to boost savings?",
                "action": "get_savings_tips",
                "priority": "medium"
            })
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    nudges.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 3))
    
    return {"nudges": nudges[:8], "count": len(nudges)}

@api_router.post("/ai/memory")
async def save_agent_memory(data: dict, user_id: str = Depends(get_current_user)):
    """Store user preferences for AI agent memory"""
    prefs = data.get("preferences", {})
    habits = data.get("habits", [])
    
    await db.agent_memory.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "preferences": prefs,
                "habits": habits,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    return {"message": "Memory updated"}

@api_router.get("/ai/agents")
async def list_agents(user_id: str = Depends(get_current_user)):
    """List all available AI agents"""
    return {"agents": [
        {"id": k, "name": v["name"], "emoji": v["emoji"], "description": v["description"]}
        for k, v in AGENT_PROFILES.items()
    ]}

# ============== ENHANCED SPLITWISE PRO ==============

@api_router.get("/split/groups/{group_id}/summary")
async def group_expense_summary(group_id: str, user_id: str = Depends(get_current_user)):
    """Get comprehensive group summary with simplified debts"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    expenses = await db.split_expenses.find({"group_id": group_id}).sort("created_at", -1).to_list(200)
    settlements = await db.settlements.find({"group_id": group_id}).to_list(200)
    
    members = group.get("members", [])
    member_names = {m["user_id"]: m.get("name", "User") for m in members}
    
    # Calculate net balances
    balances = {m["user_id"]: 0.0 for m in members}
    total_spent = 0
    
    for exp in expenses:
        paid_by = exp["paid_by"]
        amount = exp["amount"]
        total_spent += amount
        splits = exp.get("splits", {})
        
        if isinstance(splits, dict):
            balances[paid_by] = balances.get(paid_by, 0) + amount
            for uid, share in splits.items():
                balances[uid] = balances.get(uid, 0) - share
    
    # Account for settlements
    for s in settlements:
        balances[s["payer_id"]] = balances.get(s["payer_id"], 0) + s["amount"]
        balances[s["payee_id"]] = balances.get(s["payee_id"], 0) - s["amount"]
    
    # Simplify debts (minimize transactions)
    debtors = []
    creditors = []
    for uid, bal in balances.items():
        if bal < -0.5:
            debtors.append({"id": uid, "name": member_names.get(uid, "User"), "amount": abs(bal)})
        elif bal > 0.5:
            creditors.append({"id": uid, "name": member_names.get(uid, "User"), "amount": bal})
    
    debtors.sort(key=lambda x: x["amount"], reverse=True)
    creditors.sort(key=lambda x: x["amount"], reverse=True)
    
    simplified = []
    di, ci = 0, 0
    while di < len(debtors) and ci < len(creditors):
        d, c = debtors[di], creditors[ci]
        settle_amt = min(d["amount"], c["amount"])
        if settle_amt > 0.5:
            simplified.append({
                "from_id": d["id"], "from_name": d["name"],
                "to_id": c["id"], "to_name": c["name"],
                "amount": round(settle_amt, 2)
            })
        d["amount"] -= settle_amt
        c["amount"] -= settle_amt
        if d["amount"] < 0.5: di += 1
        if c["amount"] < 0.5: ci += 1
    
    # Category breakdown
    cat_totals = {}
    for exp in expenses:
        cat = exp.get("category", "Other")
        cat_totals[cat] = cat_totals.get(cat, 0) + exp["amount"]
    
    return {
        "group_name": group.get("name", ""),
        "member_count": len(members),
        "total_expenses": len(expenses),
        "total_spent": round(total_spent, 2),
        "simplified_debts": simplified,
        "category_breakdown": dict(sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)),
        "recent_expenses": [{
            "description": e.get("description", ""),
            "amount": e["amount"],
            "paid_by_name": member_names.get(e["paid_by"], "User"),
            "date": e.get("created_at", "").isoformat() if hasattr(e.get("created_at", ""), 'isoformat') else str(e.get("created_at", "")),
        } for e in expenses[:10]],
        "settlements_count": len(settlements),
    }

@api_router.get("/split/groups/{group_id}/manage")
async def get_group_management(group_id: str, user_id: str = Depends(get_current_user)):
    """Get group management data (GPay-style)"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = []
    for m in group.get("members", []):
        is_admin = m["user_id"] == group.get("created_by", group["members"][0]["user_id"] if group["members"] else "")
        members.append({
            "user_id": m["user_id"],
            "name": m.get("name", "User"),
            "phone": m.get("phone", ""),
            "is_admin": is_admin,
            "initial": (m.get("name", "?")[0]).upper(),
        })
    
    return {
        "id": str(group["_id"]),
        "name": group.get("name", ""),
        "members": members,
        "member_count": len(members),
        "created_by": group.get("created_by", members[0]["user_id"] if members else ""),
        "is_admin": user_id == group.get("created_by", members[0]["user_id"] if members else ""),
        "invite_code": f"MINTU-{str(group['_id'])[-6:].upper()}",
    }

@api_router.put("/split/groups/{group_id}/name")
async def rename_group(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Rename a split group"""
    from bson import ObjectId
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    await db.split_groups.update_one({"_id": ObjectId(group_id)}, {"$set": {"name": name}})
    return {"message": "Group renamed", "name": name}

@api_router.delete("/split/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, user_id: str = Depends(get_current_user)):
    """Remove a member from group"""
    from bson import ObjectId
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$pull": {"members": {"user_id": member_id}}}
    )
    return {"message": "Member removed"}

@api_router.delete("/split/groups/{group_id}")
async def delete_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Delete a split group"""
    from bson import ObjectId
    group = await db.split_groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.split_groups.delete_one({"_id": ObjectId(group_id)})
    await db.split_expenses.delete_many({"group_id": group_id})
    return {"message": "Group deleted"}

@api_router.delete("/split/expenses/{expense_id}")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    """Delete a split expense"""
    from bson import ObjectId
    await db.split_expenses.delete_one({"_id": ObjectId(expense_id)})
    return {"message": "Expense deleted"}

@api_router.put("/split/expenses/{expense_id}")
async def edit_expense(expense_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Edit a split expense"""
    from bson import ObjectId
    updates = {}
    if "description" in data: updates["description"] = data["description"]
    if "amount" in data: updates["amount"] = data["amount"]
    if "category" in data: updates["category"] = data["category"]
    if updates:
        await db.split_expenses.update_one({"_id": ObjectId(expense_id)}, {"$set": updates})
    return {"message": "Expense updated"}

@api_router.delete("/split/groups/{group_id}/leave")
async def leave_group(group_id: str, user_id: str = Depends(get_current_user)):
    """Leave a split group"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "Someone") if user else "Someone"
    await db.split_groups.update_one(
        {"_id": ObjectId(group_id)},
        {"$pull": {"members": {"user_id": user_id}}}
    )
    # System message
    await db.split_messages.insert_one({"group_id": group_id, "type": "system", "content": f"{name} left the group", "created_at": datetime.utcnow()})
    return {"message": "Left group"}

# ============== GROUP CHAT ==============
@api_router.get("/split/groups/{group_id}/messages")
async def get_group_messages(group_id: str, limit: int = 50, user_id: str = Depends(get_current_user)):
    """Get chat messages for a group"""
    messages = await db.split_messages.find(
        {"group_id": group_id}
    ).sort("created_at", 1).limit(limit).to_list(limit)
    result = []
    for m in messages:
        result.append({
            "id": str(m["_id"]),
            "group_id": m["group_id"],
            "type": m.get("type", "text"),
            "content": m.get("content", ""),
            "sender_id": m.get("sender_id"),
            "sender_name": m.get("sender_name"),
            "emoji": m.get("emoji"),
            "expense_data": m.get("expense_data"),
            "created_at": m.get("created_at", datetime.utcnow()).isoformat(),
        })
    return result

@api_router.post("/split/groups/{group_id}/messages")
async def send_group_message(group_id: str, data: dict, user_id: str = Depends(get_current_user)):
    """Send a chat message to a group"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else await db.users.find_one({"phone": user_id})
    name = user.get("name", "User") if user else "User"
    msg_type = data.get("type", "text")
    msg = {
        "group_id": group_id,
        "sender_id": user_id,
        "sender_name": name,
        "type": msg_type,
        "content": data.get("content", ""),
        "emoji": data.get("emoji"),
        "created_at": datetime.utcnow(),
    }
    result = await db.split_messages.insert_one(msg)
    return {"id": str(result.inserted_id), "message": "Sent"}
    return {"message": "Left group"}

# ============== DYNAMIC MONEY SCHOOL (AI-POWERED DAILY) ==============

@api_router.get("/money-school/dynamic")
async def dynamic_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-generated daily finance school — trends, news, personalized teachings"""
    from bson import ObjectId
    import random
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # User spending context
    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(cat_pipe):
        spending[doc["_id"]] = doc["total"]
    
    total = sum(spending.values())
    top_cat = max(spending, key=spending.get) if spending else "Food"
    
    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    inc_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = inc_docs[0]["total"] if inc_docs else 0
    
    context = f"User: {user.get('name','User') if user else 'User'}, Income: ₹{income:,.0f}, Expenses: ₹{total:,.0f}, Top category: {top_cat} (₹{spending.get(top_cat,0):,.0f}), Score: {user.get('money_score',50) if user else 50}/100. Date: {now.strftime('%B %d, %Y')}."
    
    lang_instr = get_lang_instruction(lang)
    
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"school_dynamic_{user_id}_{now.timestamp()}",
            system_message=f"""You are MintU Money School — India's AI finance teacher. Generate 6 dynamic learning cards for TODAY.

CARD TYPES (generate 1 of each):
1. "trend" — Today's Indian financial trend/news (stock market, RBI policy, crypto, gold prices)
2. "teaching" — Finance concept explained simply (compound interest, SIP, term insurance, etc.)
3. "saving_hack" — Practical Indian money-saving tip using their ACTUAL spending data
4. "investment" — Investment education with real Indian instruments (Nifty, Sensible, ELSS, PPF)
5. "quiz" — Financial literacy question with answer
6. "challenge" — Daily money challenge personalized to their spending

Return ONLY valid JSON array:
[{{"type":"trend|teaching|saving_hack|investment|quiz|challenge", "emoji":"emoji", "title":"catchy title", "body":"2-3 sentences, specific ₹ amounts, Indian context", "xp":10-25, "color":"#hexcolor"}}]

RULES:
- Use REAL Indian context (RBI, Sensex, Nifty, HDFC, SBI, Groww, Zerodha)
- Reference user's ACTUAL numbers from context
- Make it feel like a daily newspaper finance column
- Each card should teach something NEW and actionable
- For quiz: include question AND answer in body
- For challenge: make it achievable today
{lang_instr}"""
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=context))
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        import json as json_mod
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        if start >= 0 and end > start:
            ai_cards = json_mod.loads(response_text[start:end])
        else:
            ai_cards = []
    except Exception as e:
        logging.error(f"Dynamic school error: {e}")
        ai_cards = []
    
    # Merge with static fallback
    all_cards = []
    for i, card in enumerate(ai_cards[:6]):
        all_cards.append({**card, "id": f"dynamic_{i}", "source": "ai"})
    
    # Add static fallbacks if AI didn't generate enough
    if len(all_cards) < 6:
        for i, card in enumerate(MONEY_SCHOOL_CARDS[:6-len(all_cards)]):
            all_cards.append({**card, "id": f"static_{i}", "source": "static"})
    
    # Progress
    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": []}
    xp = progress.get("xp", 0)
    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None
    
    return {
        "cards": all_cards,
        "date": now.strftime("%B %d, %Y"),
        "progress": {
            "xp": xp, "level": current_level, "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - xp) if next_level else 0,
        }
    }

# ============== AUTO-UPDATE BUDGET ON EXPENSE ==============

@api_router.get("/budgets/live")
async def live_budget_status(user_id: str = Depends(get_current_user)):
    """Get real-time budget status with actual spending from ALL sources (transactions + splits)"""
    from bson import ObjectId
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    budgets = await db.budgets.find({"user_id": user_id}).to_list(30)
    
    # Get spending from transactions
    txn_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["expense", "debit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    txn_spending = {}
    async for doc in db.transactions.aggregate(txn_pipe):
        txn_spending[doc["_id"]] = doc["total"]
    
    # Get spending from split expenses (user's share)
    split_expenses = await db.split_expenses.find({"created_at": {"$gte": month_start}}).to_list(500)
    split_spending = {}
    for exp in split_expenses:
        splits = exp.get("splits", {})
        if isinstance(splits, dict) and user_id in splits:
            cat = exp.get("category", "Other")
            split_spending[cat] = split_spending.get(cat, 0) + splits[user_id]
    
    # Combine spending
    all_spending = {}
    for cat in set(list(txn_spending.keys()) + list(split_spending.keys())):
        all_spending[cat] = txn_spending.get(cat, 0) + split_spending.get(cat, 0)
    
    result = []
    for b in budgets:
        cat = b["category"]
        spent = all_spending.get(cat, 0)
        pct = (spent / max(b["amount"], 1)) * 100
        remaining = max(0, b["amount"] - spent)
        
        if pct >= 100: status = "exceeded"
        elif pct >= 80: status = "warning"
        elif pct >= 50: status = "on_track"
        else: status = "healthy"
        
        result.append({
            "id": str(b["_id"]),
            "category": cat,
            "budget": b["amount"],
            "spent": round(spent, 2),
            "from_transactions": round(txn_spending.get(cat, 0), 2),
            "from_splits": round(split_spending.get(cat, 0), 2),
            "remaining": round(remaining, 2),
            "percentage": round(pct, 1),
            "status": status,
            "period": b.get("period", "monthly"),
        })
    
    result.sort(key=lambda x: x["percentage"], reverse=True)
    
    total_budgeted = sum(b["amount"] for b in budgets)
    total_spent = sum(r["spent"] for r in result)
    
    return {
        "budgets": result,
        "summary": {
            "total_budgeted": total_budgeted,
            "total_spent": round(total_spent, 2),
            "total_remaining": round(max(0, total_budgeted - total_spent), 2),
            "overall_pct": round((total_spent / max(total_budgeted, 1)) * 100, 1),
            "sources": {"transactions": round(sum(txn_spending.values()), 2), "splits": round(sum(split_spending.values()), 2)},
        }
    }
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

@api_router.get("/money-school/cards")
async def get_money_school_cards(user_id: str = Depends(get_current_user)):
    """Get personalized money school cards with gamification"""
    from bson import ObjectId
    import random
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": [], "streak": 0}
    
    current_xp = progress.get("xp", 0)
    completed_ids = set(progress.get("completed", []))
    
    # Determine user level
    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if current_xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None
    
    # Shuffle and personalize cards
    cards = []
    for i, card in enumerate(MONEY_SCHOOL_CARDS):
        card_id = f"card_{i}"
        cards.append({
            **card,
            "id": card_id,
            "completed": card_id in completed_ids,
        })
    
    random.shuffle(cards)
    
    return {
        "cards": cards,
        "progress": {
            "xp": current_xp,
            "level": current_level,
            "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - current_xp) if next_level else 0,
            "completed_count": len(completed_ids),
            "total_cards": len(MONEY_SCHOOL_CARDS),
            "streak": progress.get("streak", 0),
        }
    }

@api_router.post("/money-school/complete")
async def complete_card(data: dict, user_id: str = Depends(get_current_user)):
    """Mark a money school card as completed and earn XP"""
    card_id = data.get("card_id", "")
    xp_earned = data.get("xp", 10)
    
    result = await db.school_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {"user_id": user_id, "last_activity": datetime.utcnow()},
            "$inc": {"xp": xp_earned},
            "$addToSet": {"completed": card_id}
        },
        upsert=True
    )
    
    progress = await db.school_progress.find_one({"user_id": user_id})
    new_xp = progress.get("xp", 0)
    
    # Check for level up
    current_level = XP_LEVELS[0]
    for lvl in XP_LEVELS:
        if new_xp >= lvl["min_xp"]:
            current_level = lvl
    
    return {
        "xp_earned": xp_earned,
        "total_xp": new_xp,
        "level": current_level,
        "message": f"+{xp_earned} XP! {current_level['emoji']} Level: {current_level['name']}"
    }

# ============== UPI PAYMENT FLOW ENHANCEMENT ==============

UPI_APPS = [
    {"id": "gpay", "name": "Google Pay", "package": "com.google.android.apps.nbu.paisa.user", "color": "#4285F4", "icon": "logo-google"},
    {"id": "phonepe", "name": "PhonePe", "package": "com.phonepe.app", "color": "#5F259F", "icon": "phone-portrait"},
    {"id": "paytm", "name": "Paytm", "package": "net.one97.paytm", "color": "#00BAF2", "icon": "wallet"},
    {"id": "bhim", "name": "BHIM", "package": "in.org.npci.upiapp", "color": "#00695C", "icon": "shield-checkmark"},
]

@api_router.get("/upi/apps")
async def get_upi_apps(user_id: str = Depends(get_current_user)):
    """Get list of supported UPI apps"""
    return {"apps": UPI_APPS}

@api_router.post("/upi/generate-qr")
async def generate_upi_qr(data: dict, user_id: str = Depends(get_current_user)):
    """Generate UPI QR code data for receiving payments"""
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    upi_id = user.get("upi_id", "") if user else ""
    if not upi_id:
        raise HTTPException(status_code=400, detail="Set your UPI ID first in Profile")
    
    amount = data.get("amount", 0)
    name = user.get("name", "MintU User")
    
    qr_string = f"upi://pay?pa={upi_id}&pn={name}&am={amount:.2f}&cu=INR&tn=MintU%20Payment"
    
    return {
        "qr_data": qr_string,
        "upi_id": upi_id,
        "name": name,
        "amount": amount
    }

# ============== SETTLEMENT GAMIFICATION ==============

SETTLEMENT_REWARDS = {
    "instant": {"coins": 15, "label": "Lightning Settler ⚡", "hours": 1},
    "same_day": {"coins": 10, "label": "Quick Payer 🏃", "hours": 24},
    "on_time": {"coins": 5, "label": "Reliable 👍", "hours": 72},
    "late": {"coins": 1, "label": "Better Late 🐢", "hours": 999999},
}

SETTLEMENT_BADGES = [
    {"id": "lightning", "name": "Lightning Settler", "emoji": "⚡", "desc": "Settle within 1 hour", "threshold": 3},
    {"id": "streak_5", "name": "5-Settle Streak", "emoji": "🔥", "desc": "5 consecutive on-time settlements", "threshold": 5},
    {"id": "generous", "name": "Generous Soul", "emoji": "💝", "desc": "Settled 10+ times", "threshold": 10},
    {"id": "zero_debt", "name": "Debt Free", "emoji": "🏆", "desc": "Zero outstanding balance", "threshold": 1},
]

@api_router.post("/split/settle-with-rewards")
async def settle_with_rewards(data: SettlePayment, user_id: str = Depends(get_current_user)):
    """Settle payment and earn reward coins"""
    from bson import ObjectId

    # Calculate reward tier
    reward = SETTLEMENT_REWARDS["on_time"]
    for tier_key, tier in SETTLEMENT_REWARDS.items():
        reward = tier
        break  # Give best available reward for now

    settlement = {
        "payer_id": user_id,
        "payee_id": data.target_user_id,
        "amount": data.amount,
        "method": data.method,
        "txn_ref": data.txn_ref or f"MINTU{uuid_lib.uuid4().hex[:8].upper()}",
        "group_id": data.group_id,
        "status": "completed",
        "coins_earned": reward["coins"],
        "reward_label": reward["label"],
        "settled_at": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }

    result = await db.settlements.insert_one(settlement)

    # Update user's reward coins
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"reward_coins": reward["coins"], "settlement_count": 1}}
    )

    # Check for new badges
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    settle_count = user.get("settlement_count", 0) if user else 0
    total_coins = user.get("reward_coins", 0) if user else 0
    new_badges = []
    for badge in SETTLEMENT_BADGES:
        if settle_count >= badge["threshold"]:
            existing = await db.user_badges.find_one({"user_id": user_id, "badge_id": badge["id"]})
            if not existing:
                await db.user_badges.insert_one({"user_id": user_id, "badge_id": badge["id"], "earned_at": datetime.utcnow()})
                new_badges.append(badge)

    # Calculate cashback (coins reduce future payments)
    cashback_value = min(total_coins * 0.5, data.amount * 0.05)  # Max 5% cashback

    payee_name = "User"
    try:
        payee = await db.users.find_one({"_id": ObjectId(data.target_user_id)}, {"name": 1})
        if payee: payee_name = payee.get("name", "User")
    except: pass

    return {
        "id": str(result.inserted_id),
        "message": f"₹{data.amount:,.0f} paid to {payee_name}! 🎉",
        "txn_ref": settlement["txn_ref"],
        "reward": {
            "coins_earned": reward["coins"],
            "label": reward["label"],
            "total_coins": total_coins,
            "cashback_available": round(cashback_value, 2),
            "new_badges": new_badges,
        }
    }

@api_router.get("/split/settlement-leaderboard")
async def settlement_leaderboard(user_id: str = Depends(get_current_user)):
    """Settlement speed leaderboard with rewards"""
    from bson import ObjectId

    # Get all users with settlement data
    users = await db.users.find(
        {"settlement_count": {"$gt": 0}},
        {"name": 1, "settlement_count": 1, "reward_coins": 1}
    ).sort("reward_coins", -1).to_list(20)

    user_data = await db.users.find_one({"_id": ObjectId(user_id)})
    my_coins = user_data.get("reward_coins", 0) if user_data else 0
    my_count = user_data.get("settlement_count", 0) if user_data else 0
    my_badges = await db.user_badges.find({"user_id": user_id}).to_list(20)

    leaderboard = []
    my_rank = 0
    for i, u in enumerate(users):
        is_me = str(u["_id"]) == user_id
        if is_me: my_rank = i + 1
        leaderboard.append({
            "rank": i + 1,
            "name": u.get("name", "User"),
            "coins": u.get("reward_coins", 0),
            "settlements": u.get("settlement_count", 0),
            "is_me": is_me,
        })

    return {
        "leaderboard": leaderboard[:10],
        "my_stats": {
            "rank": my_rank or len(leaderboard) + 1,
            "coins": my_coins,
            "settlements": my_count,
            "cashback_available": round(my_coins * 0.5, 2),
            "badges": [{"id": b["badge_id"], **next((bd for bd in SETTLEMENT_BADGES if bd["id"] == b["badge_id"]), {})} for b in my_badges],
        }
    }

@api_router.post("/split/redeem-coins")
async def redeem_coins(data: dict, user_id: str = Depends(get_current_user)):
    """Redeem reward coins as cashback on next settlement"""
    from bson import ObjectId
    coins_to_redeem = data.get("coins", 0)
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    available = user.get("reward_coins", 0) if user else 0

    if coins_to_redeem > available:
        raise HTTPException(status_code=400, detail=f"Only {available} coins available")

    cashback = round(coins_to_redeem * 0.5, 2)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"reward_coins": -coins_to_redeem}})

    return {"redeemed": coins_to_redeem, "cashback": cashback, "remaining_coins": available - coins_to_redeem}

# ============== PERSONALIZED MONEY SCHOOL (AI-POWERED) ==============

@api_router.get("/money-school/personalized")
async def personalized_money_school(user_id: str = Depends(get_current_user), lang: str = "en"):
    """AI-personalized money school cards based on user's actual spending"""
    from bson import ObjectId
    import random

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Get spending data
    cat_pipe = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    spending = {}
    async for doc in db.transactions.aggregate(cat_pipe):
        spending[doc["_id"]] = doc["total"]

    total_expense = sum(spending.values())
    top_cat = max(spending, key=spending.get) if spending else "Food"
    top_amount = spending.get(top_cat, 0)

    income_pipe = [
        {"$match": {"user_id": user_id, "type": {"$in": ["income", "credit"]}, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    income_docs = await db.transactions.aggregate(income_pipe).to_list(1)
    income = income_docs[0]["total"] if income_docs else 0
    savings_rate = ((income - total_expense) / max(income, 1) * 100) if income > 0 else 0

    # Generate personalized cards using AI
    context = f"User spends ₹{total_expense:,.0f}/month. Top: {top_cat} ₹{top_amount:,.0f}. Income: ₹{income:,.0f}. Savings rate: {savings_rate:.0f}%."

    try:
        lang_instr = get_lang_instruction(lang)
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
            session_id=f"school_{user_id}_{now.timestamp()}",
            system_message=f"""Generate 5 personalized financial learning cards for an Indian user. Return ONLY valid JSON array.
Each card: {{"type": "saving_hack"|"investment"|"daily_tip"|"market_trend"|"risk_alert", "emoji": "emoji", "title": "short title", "body": "2-3 sentence actionable advice with specific ₹ amounts", "xp": 10-25, "color": "hex_color"}}
Use REAL numbers from their data. Reference Indian products (Zerodha, SBI, HDFC, Swiggy, Zomato, D-Mart).
Make it FUN, specific, and actionable. Not generic boring advice.{lang_instr}"""
        ).with_model("openai", "gpt-5.2")

        response = await chat.send_message(UserMessage(text=context))
        response_text = response.strip() if isinstance(response, str) else str(response)

        import json as json_mod
        # Extract JSON from response
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        if start >= 0 and end > start:
            ai_cards = json_mod.loads(response_text[start:end])
        else:
            ai_cards = []
    except Exception as e:
        logging.error(f"Money school AI error: {e}")
        ai_cards = []

    # Merge AI cards with static cards
    all_cards = []
    for i, card in enumerate(ai_cards[:5]):
        all_cards.append({**card, "id": f"ai_{i}", "completed": False, "source": "ai"})

    for i, card in enumerate(MONEY_SCHOOL_CARDS):
        all_cards.append({**card, "id": f"card_{i}", "completed": False, "source": "static"})

    random.shuffle(all_cards)

    progress = await db.school_progress.find_one({"user_id": user_id}) or {"xp": 0, "completed": [], "streak": 0}
    current_xp = progress.get("xp", 0)
    completed_ids = set(progress.get("completed", []))
    for card in all_cards:
        card["completed"] = card["id"] in completed_ids

    current_level = XP_LEVELS[0]
    next_level = XP_LEVELS[1] if len(XP_LEVELS) > 1 else None
    for i, lvl in enumerate(XP_LEVELS):
        if current_xp >= lvl["min_xp"]:
            current_level = lvl
            next_level = XP_LEVELS[i + 1] if i + 1 < len(XP_LEVELS) else None

    return {
        "cards": all_cards[:12],
        "progress": {
            "xp": current_xp,
            "level": current_level,
            "next_level": next_level,
            "xp_to_next": (next_level["min_xp"] - current_xp) if next_level else 0,
            "completed_count": len(completed_ids),
            "total_cards": len(all_cards),
        }
    }

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
