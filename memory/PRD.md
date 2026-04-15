# MintU - Detailed Feature Breakdown & PRD

## App Overview
**MintU** is an AI-powered personal finance assistant for Indian users that automatically tracks expenses from SMS, categorizes spending, and provides smart daily insights.

---

## Module 1: User Onboarding (OTP Login)

### Description
Secure phone-based authentication using OTP verification. Users enter their phone number, receive a 6-digit OTP via SMS, and verify to create/access their account. First-time users complete a brief profile setup.

### User Flow
```
1. Welcome Screen → User sees app branding + "Get Started" CTA
2. Phone Entry → User enters 10-digit Indian mobile number
3. OTP Sent → Backend sends 6-digit OTP via SMS gateway
4. OTP Verification → User enters OTP (auto-read on Android)
5. First-Time Setup (new users only):
   a. Enter name
   b. Set monthly income (optional)
   c. Select top spending categories
6. Dashboard → User lands on home screen
```

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone number |
| POST | `/api/auth/verify-otp` | Verify OTP and return JWT token |
| POST | `/api/auth/resend-otp` | Resend OTP (rate limited) |
| PUT | `/api/user/onboarding` | Complete profile setup |
| GET | `/api/user/me` | Get current user profile |

### Data Model
```
User {
  _id: ObjectId
  phone: String (unique, indexed)
  name: String
  monthly_income: Float (optional)
  preferred_categories: [String]
  money_score: Int (default: 50)
  notification_enabled: Boolean (default: true)
  onboarding_completed: Boolean (default: false)
  created_at: DateTime
  updated_at: DateTime
}

OTPRecord {
  _id: ObjectId
  phone: String (indexed)
  otp_code: String (hashed)
  attempts: Int (max: 3)
  expires_at: DateTime (5 min TTL)
  verified: Boolean
  created_at: DateTime
}
```

### Current Status: ⚠️ Partially Built
- ✅ JWT-based phone+password auth exists
- ❌ OTP sending/verification not implemented (needs SMS gateway like Twilio/MSG91)
- ❌ Onboarding flow (income, category preferences) not built

---

## Module 2: SMS Parsing Engine (Expense Detection)

### Description
AI-powered engine that parses Indian bank and payment app SMS messages to extract transaction details. Supports HDFC, SBI, ICICI, Axis, Paytm, PhonePe, GPay, and other major providers. Uses OpenAI GPT-5.2 for intelligent extraction.

### User Flow
```
1. User taps "Add from SMS" button on Transactions screen
2. Option A: Paste SMS text manually
   a. User copies SMS from inbox
   b. Pastes into text area
   c. AI parses and shows extracted data
   d. User confirms/edits before saving
3. Option B (Future): Auto-read SMS permission (Android only)
   a. App reads SMS in background
   b. Filters bank/payment messages
   c. Shows notification: "₹500 spent at Swiggy - Add?"
   d. User confirms with one tap
```

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions/parse-sms` | Parse single SMS text with AI |
| POST | `/api/transactions/parse-bulk-sms` | Parse multiple SMS messages |
| GET | `/api/sms/supported-banks` | List of supported bank formats |

### Data Model
```
ParsedSMS {
  _id: ObjectId
  user_id: String (indexed)
  raw_sms: String
  parsed_data: {
    amount: Float
    type: "debit" | "credit"
    merchant: String
    category: String
    account_last4: String
    bank_name: String
  }
  confidence_score: Float (0-1)
  status: "auto_added" | "user_confirmed" | "rejected"
  created_at: DateTime
}
```

### SMS Pattern Examples
```
HDFC: "Your A/c XX1234 is debited for Rs.500.00 on 15-Apr-26. Info: UPI/Swiggy"
SBI: "Your SBI A/c X1234 debited Rs.200.00 on 15Apr UPI-PhonePe"
Paytm: "You paid Rs.150 to Uber via Paytm Wallet"
GPay: "Sent ₹300 to Zomato from HDFC XX1234 via UPI"
ICICI: "ICICI Bank Acct XX5678 debited with Rs 1,500.00 on 15-APR-26; Info:AMAZON"
```

### Current Status: ✅ Core Built
- ✅ AI SMS parsing via OpenAI GPT-5.2
- ✅ Manual SMS paste flow
- ❌ Bulk SMS parsing not implemented
- ❌ Auto-read SMS permission (Android) not implemented
- ❌ Confidence scoring not implemented

---

## Module 3: Expense Categorization System

### Description
Intelligent categorization engine that assigns spending categories to transactions. Uses a combination of merchant-keyword mapping (fast, offline) and AI fallback (accurate, online). Categories are optimized for Indian spending patterns.

### User Flow
```
1. Transaction enters system (via SMS parse or manual entry)
2. Rule Engine checks merchant against keyword map:
   - "Swiggy/Zomato/Restaurant" → Food
   - "Uber/Ola/Metro" → Transport
   - "Amazon/Flipkart/Myntra" → Shopping
3. If no keyword match → AI categorization (GPT-5.2)
4. User can override category on any transaction
5. Overrides train the system (stored as user preferences)
```

### Categories (Indian-optimized)
| Category | Icon | Keywords |
|----------|------|----------|
| Food | 🍽️ | Swiggy, Zomato, restaurant, cafe, dhaba |
| Transport | 🚗 | Uber, Ola, metro, petrol, diesel, toll |
| Shopping | 🛍️ | Amazon, Flipkart, Myntra, mall |
| Bills | 📱 | Airtel, Jio, electricity, water, gas, broadband |
| Entertainment | 🎬 | Netflix, Hotstar, PVR, BookMyShow |
| Healthcare | 🏥 | Apollo, pharmacy, hospital, doctor |
| Education | 📚 | Coursera, Udemy, tuition, books |
| Investment | 📈 | Zerodha, Groww, MF, SIP, insurance |
| Rent | 🏠 | Rent, housing, maintenance, society |
| Groceries | 🥬 | BigBasket, Blinkit, D-Mart, grocery |
| Other | 📋 | Uncategorized |

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories with icons |
| POST | `/api/categories/classify` | Classify a transaction description |
| PUT | `/api/transactions/{id}/category` | Override transaction category |
| GET | `/api/categories/spending` | Get spending by category |

### Data Model
```
Category {
  _id: ObjectId
  name: String (unique)
  icon: String
  color: String (hex)
  keywords: [String]
  is_system: Boolean (default: true)
}

CategoryOverride {
  _id: ObjectId
  user_id: String (indexed)
  merchant_pattern: String
  assigned_category: String
  created_at: DateTime
}
```

### Current Status: ⚠️ Partially Built
- ✅ Basic category list (9 categories) in frontend
- ✅ AI categorization during SMS parsing
- ❌ Keyword-based fast categorization not built
- ❌ Category override/learning not implemented
- ❌ Custom user categories not supported

---

## Module 4: AI Insights Engine

### Description
Generates personalized, actionable financial insights using OpenAI GPT-5.2. Analyzes spending patterns, detects anomalies, and provides friendly recommendations in Indian context (₹, local services, cultural references).

### User Flow
```
1. User opens Home Dashboard
2. App fetches daily insights from backend
3. Backend analyzes last 7-30 days of transactions:
   a. Category-wise spending breakdown
   b. Spending trends (increasing/decreasing)
   c. Budget adherence status
   d. Unusual transactions detection
4. AI generates:
   a. 2-3 sentence insight summary (friendly tone)
   b. 3 actionable recommendations
   c. Spending alerts if applicable
5. User sees insight card on dashboard
6. Pull-to-refresh regenerates insights
```

### Insight Types
| Type | Example |
|------|---------|
| Spending Alert | "You've spent ₹3,200 on food this week — 40% more than last week!" |
| Savings Nudge | "If you cook at home 2 more days/week, you could save ₹2,000/month 🎯" |
| Budget Warning | "Your Shopping budget is 85% used with 10 days left this month" |
| Positive Reinforcement | "Great job! You spent 15% less on transport this month 🌟" |
| Anomaly Detection | "₹5,000 at Amazon seems unusual. Was this planned?" |

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/insights/daily` | Get today's AI insights |
| GET | `/api/insights/weekly` | Get weekly summary insights |
| GET | `/api/insights/history` | Get past insights |
| POST | `/api/insights/refresh` | Force regenerate insights |

### Data Model
```
DailyInsight {
  _id: ObjectId
  user_id: String (indexed)
  date: Date (indexed)
  money_score: Int (0-100)
  insight_text: String
  recommendations: [String]
  spending_summary: {
    category: Float  // category → amount map
  }
  alerts: [{
    type: "warning" | "positive" | "anomaly"
    message: String
    category: String (optional)
  }]
  generated_at: DateTime
  ai_model: String
}
```

### Current Status: ✅ Core Built
- ✅ AI insights generation via GPT-5.2
- ✅ Spending summary by category
- ✅ Recommendations generation
- ❌ Weekly insights not implemented
- ❌ Insights history/caching not built
- ❌ Anomaly detection not implemented
- ❌ Spending trend analysis not built

---

## Module 5: Money Score Calculation Logic

### Description
A proprietary score (0-100) that quantifies a user's financial health. Updated in real-time as transactions are added. Uses weighted factors including spending ratio, budget adherence, consistency, and savings rate.

### User Flow
```
1. User adds transactions throughout the day
2. Money score recalculates after each transaction
3. Score displayed prominently on:
   a. Home dashboard (large circular indicator)
   b. Profile screen
4. Score changes with visual feedback:
   - Green animation for score increase
   - Red pulse for score decrease
5. Daily score history tracked for trends
```

### Score Calculation Algorithm
```
Base Score: 50

Factor 1: Spending-to-Income Ratio (±20 points)
  - < 50% spending = +20
  - 50-70% = +10
  - 70-90% = 0
  - > 90% = -10
  - > 100% (overspending) = -20

Factor 2: Budget Adherence (±20 points)
  - All budgets within limit = +20
  - 1 budget exceeded = +10
  - 2+ budgets exceeded = -10
  - No budgets set = 0

Factor 3: Transaction Consistency (±10 points)
  - Regular tracking (3-20 txns/week) = +10
  - Too few (< 3) = -10 (not tracking)
  - Too many (> 20) = -5 (overspending?)

Factor 4: Savings Rate (±10 points) [Future]
  - > 20% saved = +10
  - 10-20% saved = +5
  - < 10% saved = -5

Final Score = clamp(Base + F1 + F2 + F3 + F4, 0, 100)
```

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/score/current` | Get current money score |
| GET | `/api/score/history` | Get score history (daily) |
| GET | `/api/score/breakdown` | Get score factor breakdown |

### Data Model
```
MoneyScore {
  _id: ObjectId
  user_id: String (indexed)
  date: Date (indexed)
  score: Int (0-100)
  breakdown: {
    spending_ratio: Int
    budget_adherence: Int
    consistency: Int
    savings_rate: Int
  }
  factors: {
    total_income: Float
    total_expense: Float
    budgets_exceeded: Int
    transaction_count: Int
  }
  created_at: DateTime
}
```

### Current Status: ✅ Core Built
- ✅ Score calculation algorithm (3 factors)
- ✅ Real-time updates after transactions
- ✅ Score display on dashboard and profile
- ❌ Score history tracking not implemented
- ❌ Score breakdown API not built
- ❌ Savings rate factor not included
- ❌ Score change animations not implemented

---

## Module 6: Dashboard Screen

### Description
The primary screen users see after login. Shows a glanceable overview of financial health including Money Score, AI insights, spending chart, and quick action buttons. Designed for daily engagement.

### User Flow
```
1. User opens app → Dashboard loads
2. Pull-to-refresh updates all data
3. Screen sections (top to bottom):
   a. Greeting + date
   b. Money Score (large circular gauge)
   c. Quick Stats (income/expense/balance cards)
   d. AI Insight Card (today's tip)
   e. Spending Chart (bar chart by category, 7 days)
   f. Smart Recommendations (3 tips)
   g. Recent Transactions (last 5)
   h. Quick Actions (Add transaction, Parse SMS)
```

### Screen Components
| Component | Data Source | Interaction |
|-----------|------------|-------------|
| Money Score Gauge | `/api/score/current` | Tap → Score breakdown |
| Quick Stats | `/api/stats/overview` | Tap card → Transactions |
| AI Insight Card | `/api/insights/daily` | Swipe → Next insight |
| Spending Chart | `/api/insights/daily` | Tap bar → Category detail |
| Recommendations | `/api/insights/daily` | Tap → Actionable link |
| Recent Transactions | `/api/transactions?limit=5` | Tap → Full list |

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Aggregated dashboard data |
| GET | `/api/insights/daily` | AI insights + spending summary |
| GET | `/api/stats/overview` | Income/expense/balance stats |
| GET | `/api/transactions?limit=5` | Recent transactions |
| GET | `/api/user/me` | User profile + money score |

### Data Model
```
// No new model — Dashboard aggregates existing data:
// - User (money_score, name)
// - DailyInsight (insight_text, recommendations, spending_summary)
// - Transaction (recent list)
// - MoneyScore (score display)
```

### Current Status: ✅ Built
- ✅ Money Score display with color-coded gauge
- ✅ AI Insight card with recommendations
- ✅ Spending bar chart (react-native-gifted-charts)
- ✅ Pull-to-refresh functionality
- ❌ Quick Stats cards not on dashboard
- ❌ Recent transactions on dashboard not shown
- ❌ Quick action buttons not added

---

## Module 7: Notifications System

### Description
Smart push notifications and in-app nudges that drive daily engagement. Includes budget alerts, spending nudges, daily score updates, and AI-generated tips. Respects user preferences and quiet hours.

### User Flow
```
1. Background Processing:
   a. Budget threshold crossed → Instant alert
   b. Daily morning → Money Score summary
   c. Weekend → Weekly spending review
   d. Unusual spending detected → Anomaly alert

2. In-App Nudges:
   a. No transactions in 2 days → "Don't forget to track!"
   b. Budget 80% used → Warning badge on Budget tab
   c. Score improved → Celebration animation

3. User Controls:
   a. Toggle notifications on/off
   b. Set quiet hours (default: 10PM-8AM)
   c. Choose notification types
```

### Notification Types
| Type | Trigger | Priority | Example |
|------|---------|----------|---------|
| Budget Alert | Budget > 80% | High | "⚠️ Food budget is 85% used" |
| Budget Exceeded | Budget > 100% | Critical | "🚨 Shopping budget exceeded by ₹500" |
| Daily Summary | 8 PM daily | Medium | "Today: ₹1,200 spent. Score: 72 📊" |
| Weekly Review | Sunday 10 AM | Medium | "This week: ₹8,500. Down 12% 🎉" |
| Inactivity | No txns 48h | Low | "Hey! Track your expenses to keep score up" |
| Score Change | Score ±5 | Low | "Your score went up to 78! Keep going 💪" |
| Smart Tip | AI-generated | Low | "Try Swiggy Super to save on delivery 💡" |

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get user notifications |
| PUT | `/api/notifications/{id}/read` | Mark notification as read |
| GET | `/api/notifications/preferences` | Get notification preferences |
| PUT | `/api/notifications/preferences` | Update notification preferences |
| POST | `/api/notifications/register-token` | Register push notification token |

### Data Model
```
Notification {
  _id: ObjectId
  user_id: String (indexed)
  type: "budget_alert" | "daily_summary" | "weekly_review" | "inactivity" | "score_change" | "smart_tip"
  title: String
  message: String
  priority: "critical" | "high" | "medium" | "low"
  is_read: Boolean (default: false)
  action_url: String (optional, deep link)
  created_at: DateTime
}

NotificationPreference {
  _id: ObjectId
  user_id: String (unique, indexed)
  push_enabled: Boolean (default: true)
  quiet_hours: {
    enabled: Boolean (default: true)
    start: String ("22:00")
    end: String ("08:00")
  }
  types: {
    budget_alerts: Boolean (default: true)
    daily_summary: Boolean (default: true)
    weekly_review: Boolean (default: true)
    inactivity_reminders: Boolean (default: true)
    score_changes: Boolean (default: true)
    smart_tips: Boolean (default: true)
  }
  push_token: String (optional)
}
```

### Current Status: ❌ Not Built
- ❌ Push notifications not implemented
- ❌ In-app notification center not built
- ❌ Budget threshold alerts not implemented
- ❌ Notification preferences not built

---

## Module 8: Budget Tracking

### Description
Users set spending budgets per category with configurable periods (daily/weekly/monthly). Real-time progress tracking with visual indicators and proactive alerts when approaching or exceeding limits.

### User Flow
```
1. User taps "+" on Budget screen
2. Selects category (e.g., Food)
3. Enters budget amount (e.g., ₹5,000)
4. Selects period (Daily / Weekly / Monthly)
5. Budget created → appears in list
6. As transactions are added:
   a. Progress bar fills up
   b. Color changes: Green → Yellow (80%) → Red (100%)
   c. Alert shown when 80% threshold crossed
7. Budget exceeded → notification + visual alert
8. End of period → Budget resets, history preserved
```

### Budget Alert Thresholds
```
0-60%   → Green  (On track)
60-80%  → Yellow (Getting close)
80-100% → Orange (Nearing limit)
100%+   → Red    (Budget exceeded!)
```

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/budgets` | Create or update budget |
| GET | `/api/budgets` | Get all budgets with spent |
| DELETE | `/api/budgets/{id}` | Delete a budget |
| GET | `/api/budgets/{id}/history` | Get budget history |
| GET | `/api/budgets/summary` | Get overall budget health |

### Data Model
```
Budget {
  _id: ObjectId
  user_id: String (indexed)
  category: String
  amount: Float
  period: "daily" | "weekly" | "monthly"
  created_at: DateTime
  updated_at: DateTime
}

BudgetHistory {
  _id: ObjectId
  budget_id: String (indexed)
  user_id: String (indexed)
  period_start: Date
  period_end: Date
  budget_amount: Float
  spent_amount: Float
  status: "under" | "near" | "exceeded"
}
```

### Current Status: ✅ Core Built
- ✅ Budget CRUD (create, read, delete)
- ✅ Period selection (daily/weekly/monthly)
- ✅ Progress bar with color coding
- ✅ Over-budget alerts (visual)
- ❌ Budget history tracking not implemented
- ❌ Budget reset logic not built
- ❌ Push notification alerts not connected

---

## Module 9: Settings & Privacy Controls

### Description
User settings screen with privacy-first controls. Users can manage their data, notification preferences, export data, and control what information is stored. Emphasizes transparency about data usage.

### User Flow
```
1. User taps Profile tab → Settings section
2. Available settings:
   a. Profile Management
      - Edit name, phone
      - Set/update monthly income
   b. Notification Preferences
      - Toggle push notifications
      - Set quiet hours
      - Choose alert types
   c. Privacy Controls
      - View data stored
      - Export all data (CSV/PDF)
      - Delete SMS parsing history
      - Delete all data (account deletion)
   d. Security
      - Change password / PIN
      - Biometric lock (fingerprint/face)
      - Session management
   e. App Preferences
      - Currency format (₹)
      - Default transaction type
      - Category preferences
   f. About
      - App version
      - Terms of service
      - Privacy policy
      - Contact support
```

### Required APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/user/profile` | Update user profile |
| GET | `/api/user/data-export` | Export user data as JSON |
| DELETE | `/api/user/data` | Delete all user data |
| DELETE | `/api/user/account` | Delete account permanently |
| PUT | `/api/user/preferences` | Update app preferences |
| GET | `/api/privacy/data-summary` | Summary of stored data |

### Data Model
```
UserPreferences {
  _id: ObjectId
  user_id: String (unique, indexed)
  currency: String (default: "INR")
  default_transaction_type: "debit" | "credit"
  biometric_enabled: Boolean (default: false)
  pin_hash: String (optional)
  theme: "dark" | "light" (default: "dark")
  language: "en" | "hi" (default: "en")
  created_at: DateTime
  updated_at: DateTime
}

DataExportRequest {
  _id: ObjectId
  user_id: String (indexed)
  format: "json" | "csv"
  status: "pending" | "processing" | "ready" | "expired"
  download_url: String (optional)
  created_at: DateTime
  expires_at: DateTime
}
```

### Privacy Architecture
```
Data Storage Rules:
1. Raw SMS text → Parsed, then DELETED (not stored)
2. Transaction data → Stored (user-controlled)
3. AI insights → Cached 24 hours, then regenerated
4. OTP codes → TTL 5 minutes, auto-deleted
5. Passwords → bcrypt hashed, never stored plain
6. Phone numbers → Stored for auth only
7. No third-party data sharing
```

### Current Status: ⚠️ Partially Built
- ✅ Profile display (name, phone, score)
- ✅ Logout functionality
- ✅ Basic settings menu UI
- ❌ Profile editing not implemented
- ❌ Data export not built
- ❌ Account deletion not built
- ❌ Notification preferences not connected
- ❌ Privacy controls not implemented

---

## Implementation Priority Matrix

| Priority | Module | Status | Effort |
|----------|--------|--------|--------|
| P0 | User Onboarding | ⚠️ Partial | High (OTP needs SMS gateway) |
| P0 | SMS Parsing Engine | ✅ Core Done | Low (enhancements) |
| P0 | Dashboard Screen | ✅ Built | Low (polish) |
| P1 | Expense Categorization | ⚠️ Partial | Medium |
| P1 | AI Insights Engine | ✅ Core Done | Medium (enhancements) |
| P1 | Money Score | ✅ Core Done | Medium (history) |
| P1 | Budget Tracking | ✅ Core Done | Low (history) |
| P2 | Notifications System | ❌ Not Built | High |
| P2 | Settings & Privacy | ⚠️ Partial | Medium |

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React Native (Expo SDK 54) | Cross-platform mobile |
| Navigation | Expo Router | File-based routing |
| State | Zustand + AsyncStorage | Client state management |
| Backend | FastAPI (Python) | REST API server |
| Database | MongoDB (Motor async) | Data persistence |
| AI | OpenAI GPT-5.2 (Emergent LLM) | SMS parsing + insights |
| Auth | JWT + bcrypt | Authentication |
| Charts | react-native-gifted-charts | Data visualization |
