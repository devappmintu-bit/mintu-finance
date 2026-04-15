from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import jwt
import bcrypt
import re
import random
import string
from emergentintegrations.llm.chat import LlmChat, UserMessage

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

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

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
async def get_daily_insights(user_id: str = Depends(get_current_user)):
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
    
    # Generate AI insights (enhanced v2)
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

# Include router
app.include_router(api_router)

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
