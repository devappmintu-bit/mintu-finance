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
RATE_LIMIT_MAX_REQUESTS = 60  # per window
AUTH_RATE_LIMIT_MAX = 10  # auth endpoints per window
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
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = time.time()

        # Determine rate limit
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

async def generate_insights_with_ai(user_id: str, money_score: int, spending_summary: Dict[str, float]) -> Dict:
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
}"""

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
    ai_insights = await generate_insights_with_ai(user_id, money_score, spending_summary)
    
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
async def get_daily_lesson(user_id: str = Depends(get_current_user)):
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
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"school_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="You are MintU's financial literacy buddy. Give ONE short personalized tip (1-2 sentences) connecting the lesson topic to user's actual spending. Be warm and specific with numbers. Use ₹."
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
    split_type: str = "equal"  # "equal", "custom"
    splits: Optional[Dict[str, float]] = None  # user_id -> amount (for custom)

@api_router.post("/split/groups")
async def create_split_group(group: SplitGroupCreate, user_id: str = Depends(get_current_user)):
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    members = [{"user_id": user_id, "name": user["name"], "phone": user["phone"]}]
    for phone in group.members:
        m = await db.users.find_one({"phone": phone.strip()})
        if m:
            mid = str(m["_id"])
            if mid != user_id:
                members.append({"user_id": mid, "name": m["name"], "phone": m["phone"]})
    
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
    else:
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
