# MintU AI Engine — Architecture & Design Document

## 1. Overview

The MintU AI Engine is a multi-layer intelligence system that analyzes user expenses, detects spending anomalies, and generates personalized financial insights using OpenAI GPT-5.2.

```
┌─────────────────────────────────────────────┐
│              USER TRANSACTIONS               │
│  (Manual entry, SMS parsing, bank imports)   │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│         LAYER 1: DATA PIPELINE               │
│  Aggregation · Categorization · Normalization│
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│       LAYER 2: ANALYTICS ENGINE              │
│  Trends · Overspending · Budget Tracking     │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│       LAYER 3: AI INSIGHT GENERATOR          │
│  GPT-5.2 Prompt Engineering · Personalization│
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│       LAYER 4: DELIVERY & ENGAGEMENT         │
│  Daily Insights · Weekly Reports · Alerts    │
└─────────────────────────────────────────────┘
```

---

## 2. Layer 1: Data Pipeline

### 2.1 Data Collection Sources
| Source | Method | Frequency |
|--------|--------|-----------|
| Manual Entry | User input via form | Real-time |
| SMS Parsing | AI extraction (GPT-5.2) | On-demand |
| Bank Imports | Future: Account aggregator | Periodic |

### 2.2 Data Normalization
```python
# Every transaction is normalized to:
{
    "user_id": str,
    "amount": float,        # Always positive
    "type": "debit|credit",
    "category": str,        # From 11 standard categories
    "description": str,     # Merchant or description
    "date": datetime,       # UTC timestamp
    "source": str           # "manual", "sms", "import"
}
```

### 2.3 Aggregation Queries
```python
# Time windows used for analysis:
WINDOWS = {
    "today":      now - 24h,
    "this_week":  now - 7d,
    "last_week":  now - 14d to now - 7d,
    "this_month": now - 30d,
    "last_month": now - 60d to now - 30d,
}

# Core aggregations:
- Category spending per window
- Week-over-week category comparison
- Daily spending distribution
- Income vs expense ratio
- Transaction frequency
```

---

## 3. Layer 2: Analytics Engine

### 3.1 Expense Analysis Pipeline
```python
async def analyze_expenses(user_id):
    # Step 1: Fetch transactions for all windows
    this_week  = fetch(user_id, 7_days)
    last_week  = fetch(user_id, 14_days, 7_days)
    this_month = fetch(user_id, 30_days)
    
    # Step 2: Aggregate by category
    tw_cats = group_by_category(this_week)   # {Food: 2250, Transport: 150}
    lw_cats = group_by_category(last_week)   # {Food: 1800, Transport: 200}
    
    # Step 3: Compute trends
    for category in all_categories:
        change = (tw_cats[cat] - lw_cats[cat]) / lw_cats[cat] * 100
        # → "Food: +25%", "Transport: -25%"
    
    # Step 4: Compute metrics
    savings_rate = (income - expense) / income * 100
    daily_average = total_expense / 7
    
    return AnalysisResult(...)
```

### 3.2 Overspending Detection Logic

**Three detection algorithms run in parallel:**

#### Algorithm 1: Week-over-Week Spike Detection
```
FOR each category:
  IF this_week_spend > last_week_spend * 1.25:
    severity = "high"  if change > 50%
    severity = "medium" if change > 25%
    
    ALERT: "You spent {change}% more on {category} this week 
           (₹{this_week} vs ₹{last_week} last week)"
```

**Example Output:**
> "You spent 25% more on food this week (₹2,250 vs ₹1,800 last week)"

#### Algorithm 2: Budget Breach Detection
```
FOR each budget:
  spent = SUM(transactions WHERE category = budget.category 
              AND date >= budget.period_start)
  pct = spent / budget.limit * 100
  
  IF pct >= 100: ALERT(severity="high", "Budget exceeded!")
  IF pct >= 80:  ALERT(severity="medium", "Nearing limit")
```

**Example Output:**
> "Shopping budget exceeded! ₹5,500 spent of ₹5,000 limit"

#### Algorithm 3: Anomaly Detection (Unusual Transactions)
```
daily_average = this_week_total / 7

FOR each transaction this week:
  IF transaction.amount > daily_average * 3 AND amount > 500:
    ALERT(severity="low", 
          "Unusual spend: ₹{amount} on {description}. 
           Daily average is ₹{daily_avg}")
```

**Example Output:**
> "Unusual spend: ₹3,500 at Amazon (Shopping). Your daily average is ₹750"

### 3.3 Money Score Calculation (0-100)
```
Base Score: 50

Factor 1: Spending-to-Income Ratio (±20 pts)
  < 50%  → +20  (Excellent saver)
  50-70% → +10  (Good)
  70-90% →  0   (Average)
  > 90%  → -10  (High spender)
  > 100% → -20  (Overspending!)

Factor 2: Budget Adherence (±20 pts)
  All budgets met    → +20
  1 budget exceeded  → +10
  2+ exceeded        → -10
  No budgets set     →  0

Factor 3: Tracking Consistency (±10 pts)
  3-20 txns/week     → +10 (Active tracker)
  < 3 txns/week      → -10 (Not tracking)
  > 20 txns/week     → -5  (Possible overspending)

Final = clamp(Base + F1 + F2 + F3, 0, 100)
```

---

## 4. Layer 3: AI Insight Generator (Prompt Engineering)

### 4.1 System Prompt Design

```
ROLE: "MintU AI — a warm, witty Indian personal finance buddy"

PERSONALITY:
- Friendly, like a smart friend — NOT a bank manager
- Uses casual Indian English (sprinkle "yaar", "solid", "chill")
- Always specific with numbers (₹2,400 not "a lot")
- Celebrates good habits
- References Indian context (Swiggy, Zomato, D-Mart, SIP, FD)

OUTPUT FORMAT: Structured JSON with:
- daily_insight:    2-3 sentence personalized analysis
- weekly_summary:   3-4 sentence week comparison
- recommendations:  3 ACTIONABLE tips
- savings_tip:      1 specific savings hack
- mood:             great | good | okay | concerning | alert
```

### 4.2 User Prompt Template

```
FINANCIAL SNAPSHOT:
- Money Score: {score}/100
- This week: ₹{tw_total} | Last week: ₹{lw_total} | Trend: {up/down X%}
- Top category: {top_cat}
- Monthly income: ₹{income} | Expenses: ₹{expense}
- Savings rate: {savings_rate}%
- {txn_count} transactions this week

CATEGORY BREAKDOWN (this week):
{Food: ₹2,250, Transport: ₹150, ...}

BUDGETS SET:
{Food: ₹5,000/month, Shopping: ₹3,000/month, ...}

ALERTS DETECTED:
- [HIGH] Food spending up 25% vs last week
- [MEDIUM] Shopping budget at 85%

Generate personalized insights.
```

### 4.3 Example AI Outputs

**Scenario 1: Overspending on Food**
```json
{
  "daily_insight": "Your Food spending jumped 25% this week to ₹2,250 — 
    mostly Swiggy and Zomato orders. Your overall score of 72 is still 
    decent but could use a boost! 🍕",
  "weekly_summary": "This week you spent ₹3,400 vs ₹2,800 last week 
    (up 21%). Food is the main driver — ₹2,250 vs ₹1,800 last week. 
    Transport stayed flat at ₹150. Good news: you're still saving 65% 
    of your income.",
  "recommendations": [
    "Switch 2 Swiggy orders to home cooking — save ~₹400-600 this week",
    "Set a weekly Food cap of ₹1,800 and track it in the app",
    "Try meal prepping on Sunday — one pot dal-rice + sabzi lasts 3 meals"
  ],
  "savings_tip": "You can save ₹2,000/month by reducing dining out from 
    15 to 8 orders. Put that ₹2,000 into a SIP!",
  "mood": "okay"
}
```

**Scenario 2: Great Financial Health**
```json
{
  "daily_insight": "Money Score 85 — you're killing it! 🔥 Spending is 
    down 12% from last week and you're saving 78% of your income. 
    Keep this up and you'll have an extra ₹15,000 by month end.",
  "weekly_summary": "Solid week! ₹2,100 spent vs ₹2,400 last week. 
    Food dropped to ₹1,500 (nice!), Transport flat at ₹200. 
    Your savings rate of 78% is better than 90% of Indian millennials.",
  "recommendations": [
    "Great momentum! Consider putting ₹5,000 extra into your SIP",
    "You've earned a small treat — set aside ₹500 for guilt-free fun",
    "Review your FD rates — some banks offering 7.5% for 1-year deposits"
  ],
  "savings_tip": "At your current rate, you'll save ₹1.2L in 6 months. 
    A Nifty50 SIP would grow that to ₹1.35L with market returns!",
  "mood": "great"
}
```

**Scenario 3: Budget Exceeded**
```json
{
  "daily_insight": "⚠️ Heads up — your Shopping budget is busted at 
    ₹5,500 of ₹5,000 limit. That Amazon order of ₹3,500 pushed it 
    over. Your score dropped to 55 — let's get it back up!",
  "weekly_summary": "Tough week budget-wise: ₹8,200 spent, up 45% 
    from ₹5,600 last week. Shopping exploded (₹5,500 vs ₹1,200) 
    because of the Amazon haul. Food stayed controlled at ₹2,000. 
    Income can cover it, but 2 more weeks like this will hurt.",
  "recommendations": [
    "Freeze non-essential shopping for the next 2 weeks to recover",
    "Add items to Amazon wishlist and wait 48 hours before buying",
    "Enable PhonePe/Paytm spending alerts at ₹1,000 to catch big spends"
  ],
  "savings_tip": "Cancel unused subscriptions — average Indian has 
    ₹800-1,200/month in forgotten subscriptions (Netflix, Hotstar, 
    gym, magazines)",
  "mood": "concerning"
}
```

---

## 5. Layer 4: Delivery & Engagement

### 5.1 API Endpoints

| Endpoint | Purpose | AI Used? |
|----------|---------|----------|
| `GET /api/insights/daily` | Daily insight + alerts + trends + recommendations | ✅ GPT-5.2 |
| `GET /api/insights/weekly` | Weekly comparison report (no AI, pure analytics) | ❌ |
| `GET /api/stats/overview` | 30-day summary stats | ❌ |

### 5.2 Daily Insights Response Schema
```json
{
  "money_score": 72,
  "insight_text": "AI-generated daily insight...",
  "weekly_summary": "AI-generated week comparison...",
  "spending_summary": {"Food": 2250, "Transport": 150},
  "recommendations": ["tip 1", "tip 2", "tip 3"],
  "savings_tip": "Specific savings hack...",
  "mood": "good",
  "alerts": [
    {
      "type": "overspend|budget_breach|budget_warning|anomaly",
      "severity": "high|medium|low",
      "category": "Food",
      "message": "Human-readable alert text",
      "amount_diff": 450
    }
  ],
  "trends": {
    "this_week_total": 2400,
    "prev_week_total": 1900,
    "week_change_pct": 26.3,
    "top_category": "Food",
    "savings_rate": 88,
    "category_trends": {
      "Food": {"this_week": 2250, "last_week": 1800, "change_pct": 25}
    }
  },
  "generated_at": "2026-04-15T16:23:11Z"
}
```

### 5.3 Weekly Report Response Schema
```json
{
  "money_score": 72,
  "this_week": {"income": 20000, "expense": 2400, "savings": 17600, "transaction_count": 12},
  "last_week": {"income": 0, "expense": 1900, "savings": -1900, "transaction_count": 8},
  "expense_change_pct": 26.3,
  "daily_spending": {"Mon": 500, "Tue": 350, "Wed": 800, "Thu": 250, "Fri": 500},
  "category_comparison": {
    "Food": {"this_week": 2250, "last_week": 1800, "change_pct": 25, "trend": "up"},
    "Transport": {"this_week": 150, "last_week": 200, "change_pct": -25, "trend": "down"}
  }
}
```

---

## 6. SMS Parsing Engine (AI-Powered)

### 6.1 System Prompt for SMS Parsing
```
ROLE: Expert at parsing Indian bank and payment app SMS messages.

TASK: Extract transaction details from SMS text.

OUTPUT: Valid JSON with exact keys:
{
  "amount": float,
  "category": "Food|Transport|Shopping|Bills|Entertainment|Healthcare|Education|Investment|Other",
  "description": "merchant name or description",
  "type": "debit" or "credit",
  "merchant": "extracted merchant name"
}

RULES:
- Categories MUST be from the provided list
- Amount must be a positive float
- Type is "debit" for money spent, "credit" for money received
- If uncertain, use category "Other"
```

### 6.2 Supported SMS Formats
```
HDFC:  "Your A/c XX1234 is debited for Rs.500.00 on 15-Apr-26. Info: UPI/Swiggy"
SBI:   "Your SBI A/c X1234 debited Rs.200.00 on 15Apr UPI-PhonePe"  
Paytm: "You paid Rs.150 to Uber via Paytm Wallet"
GPay:  "Sent ₹300 to Zomato from HDFC XX1234 via UPI"
ICICI: "ICICI Bank Acct XX5678 debited with Rs 1,500.00 on 15-APR-26; Info:AMAZON"
```

---

## 7. Future Enhancements

1. **Insights Caching**: Cache AI responses for 4 hours to reduce API costs
2. **Batch Analysis**: Nightly job to pre-compute weekly/monthly reports  
3. **Goal Tracking**: AI recommendations tied to savings goals
4. **Predictive Spending**: "At this rate, you'll spend ₹12,000 on food this month"
5. **Peer Comparison**: "You spend 15% less on dining than similar users in Mumbai"
6. **Smart Notifications**: Push alerts when budget nears 80%, daily score drops
