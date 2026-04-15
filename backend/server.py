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
    """Generate personalized spending insights using AI"""
    try:
        # Get recent transactions
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        transactions = await db.transactions.find({
            "user_id": user_id,
            "date": {"$gte": seven_days_ago}
        }).to_list(1000)
        
        total_spent = sum(spending_summary.values())
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"insights_{user_id}_{datetime.utcnow().timestamp()}",
            system_message="""You are a friendly Indian personal finance assistant. 
            Analyze spending data and provide: 
            1. A warm, encouraging insight (2-3 sentences)
            2. Three practical recommendations
            Return ONLY valid JSON: {"insight": "string", "recommendations": ["rec1", "rec2", "rec3"]}
            Use Indian context (rupees, local services). Be positive and actionable.
            """
        ).with_model("openai", "gpt-5.2")
        
        spending_text = ", ".join([f"{cat}: ₹{amt:.0f}" for cat, amt in spending_summary.items()])
        message = UserMessage(
            text=f"Money score: {money_score}/100. Last 7 days spending: {spending_text}. Total: ₹{total_spent:.0f}. {len(transactions)} transactions."
        )
        
        response = await chat.send_message(message)
        
        # Clean and parse response
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        
        import json
        parsed = json.loads(response_text)
        
        return {
            "insight_text": parsed.get("insight", "Keep tracking your expenses!"),
            "recommendations": parsed.get("recommendations", [
                "Set a daily spending limit",
                "Review your subscriptions",
                "Try cooking at home more often"
            ])
        }
    except Exception as e:
        logging.error(f"AI insights generation error: {str(e)}")
        return {
            "insight_text": "Keep up the good work tracking your finances!",
            "recommendations": [
                "Monitor your top spending categories",
                "Set budgets for better control",
                "Review your spending weekly"
            ]
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
    
    # Generate AI insights
    ai_insights = await generate_insights_with_ai(user_id, money_score, spending_summary)
    
    return {
        "money_score": money_score,
        "insight_text": ai_insights["insight_text"],
        "spending_summary": spending_summary,
        "recommendations": ai_insights["recommendations"],
        "generated_at": datetime.utcnow()
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
