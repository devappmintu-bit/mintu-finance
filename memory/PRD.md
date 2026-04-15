# MintU - Product Requirements Document (PRD)

## App Overview
**MintU** is an AI-powered personal finance assistant for Indian users that tracks expenses from SMS, categorizes spending, and provides smart daily insights.

## Architecture

### Frontend
- **Framework**: React Native (Expo SDK 54) with Expo Router
- **State**: Zustand + AsyncStorage
- **Charts**: react-native-gifted-charts (Bar + Pie)
- **Icons**: @expo/vector-icons (Ionicons)
- **HTTP**: Axios with JWT interceptor

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB (Motor async driver)
- **AI**: OpenAI GPT-5.2 via Emergent LLM key
- **Auth**: JWT + bcrypt

### Design System
- **Theme**: Dark (#0A0F1C) with mint green (#10B981) accents
- **Cards**: Rounded 28px, subtle borders, glassmorphism
- **Typography**: System font with 800/700/600/400 weights
- **Spacing**: 8pt grid (8, 12, 16, 20, 24, 32px)

## Screens & Navigation Flow

```
Splash → Onboarding (3 slides) → Auth (Login/Register)
                                      ↓
                              Tab Navigator
                    ┌────────┬────────┬────────┬────────┐
                   Home   Expenses  Insights  Budget  Profile
```

### 1. Splash Screen (`index.tsx`)
- Animated logo with ₹ symbol
- Auto-redirects: logged in → tabs, new → onboarding

### 2. Onboarding (`onboarding.tsx`) - 3 slides
- Track Automatically (SMS parsing)
- Smart Insights Daily (AI analysis)
- Budget Like a Pro (budget tracking)

### 3. Auth (`auth.tsx`)
- Phone + password login/register
- JWT token stored in AsyncStorage

### 4. Home Dashboard (`(tabs)/index.tsx`)
- Money Score gauge (0-100)
- Quick stats (income/expense/balance)
- AI Insight card
- Spending bar chart (7 days)
- Smart recommendations
- Recent transactions

### 5. Transactions (`(tabs)/transactions.tsx`)
- Transaction list with category icons
- Add Transaction modal (amount, category, description)
- SMS Parse modal (paste bank SMS → AI extraction)
- Long-press to delete

### 6. Insights (`(tabs)/insights.tsx`)
- Money Score detail with factor breakdown
- AI Insight badge with generated text
- Expense Breakdown donut chart
- Category legend
- Recommendations list

### 7. Budget (`(tabs)/budget.tsx`)
- Budget cards with progress bars
- Color-coded alerts (green/yellow/red)
- Add Budget modal (category, period, amount)
- Over-budget warnings

### 8. Profile (`(tabs)/profile.tsx`)
- User avatar, name, phone
- Money Score pill
- Stats grid (income, expenses, balance, transactions)
- Settings menu
- Logout

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with phone+password |
| GET | `/api/user/me` | Get user profile |
| POST | `/api/transactions` | Create transaction |
| GET | `/api/transactions` | List transactions |
| DELETE | `/api/transactions/{id}` | Delete transaction |
| POST | `/api/transactions/parse-sms` | AI parse SMS |
| GET | `/api/insights/daily` | Get AI insights |
| POST | `/api/budgets` | Create/update budget |
| GET | `/api/budgets` | List budgets |
| DELETE | `/api/budgets/{id}` | Delete budget |
| GET | `/api/stats/overview` | Get stats overview |

## Test Credentials
- Phone: 9876543210
- Password: test123
- Name: Test User

## Status
- ✅ All 12 backend APIs working (tested)
- ✅ AI integration with OpenAI GPT-5.2
- ✅ Complete UI with 8 screens
- ✅ Dark fintech theme implemented
- ✅ Bottom tab navigation (5 tabs)
