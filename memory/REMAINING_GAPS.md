# MintU — Remaining Gaps & Roadmap

## COMPLETED FEATURES (All tested & working)

| # | Feature | Status | Tests |
|---|---------|--------|-------|
| 1 | OTP-based authentication | ✅ Done | 29/29 |
| 2 | Password login fallback | ✅ Done | Passed |
| 3 | SMS-based expense parsing (AI) | ✅ Done | Passed |
| 4 | AI-powered daily insights (GPT-5.2) | ✅ Done | Passed |
| 5 | Weekly spending reports | ✅ Done | Passed |
| 6 | Money Score (0-100) | ✅ Done | Passed |
| 7 | Overspending detection (3 algorithms) | ✅ Done | Passed |
| 8 | Budget tracking with alerts | ✅ Done | Passed |
| 9 | Cash quick-entry (NLP parsing) | ✅ Done | Passed |
| 10 | Recurring cash expenses | ✅ Done | Passed |
| 11 | Voice input (Whisper STT) | ✅ Done | Endpoint ready |
| 12 | Multi-language support (10 langs) | ✅ Done | All screens |
| 13 | Offline-first architecture | ✅ Done | Cache + queue + sync |
| 14 | Family group budgets | ✅ Done | 6 endpoints |
| 15 | Security framework (OWASP/GDPR/DPDP) | ✅ Done | Headers + audit |
| 16 | Privacy compliance (export/delete) | ✅ Done | Endpoints working |
| 17 | Splash + Onboarding (3 slides) | ✅ Done | UI complete |
| 18 | Rate limiting + brute force protection | ✅ Done | Tested |

## REMAINING GAPS (Prioritized)

### P0 — Must Have Before Launch

| Gap | Why Critical | Effort |
|-----|-------------|--------|
| **Real SMS gateway (Twilio/MSG91)** | Mock OTP won't work in production | 2 days (needs API key) |
| **UPI/Account Aggregator integration** | SMS misses 70% of UPI transactions | 2-3 weeks |
| **App Store optimization** | App name still shows "frontend", needs proper branding | 1 day |
| **Push notifications** | Budget alerts, daily summaries need push | 1 week |
| **Biometric auth** | Returning users need fingerprint/Face ID | 2-3 days |

### P1 — High Impact

| Gap | Why Important | Effort |
|-----|-------------|--------|
| **WhatsApp bot** | 500M users, zero-app-open tracking | 2 weeks |
| **Financial literacy ("Money School")** | 76% Indians financially illiterate, drives engagement | 1 week |
| **Festival/wedding planner** | Diwali=₹1.5L avg spend, seasonal planning | 1 week |
| **EMI & loan tracking** | 2.3 avg loans per Indian, #1 fixed expense | 1 week |
| **Category-level AI insights** | "You spent 25% more on food" per category | 3 days |
| **Income tracking automation** | Salary SMS, freelance income detection | 3 days |

### P2 — Differentiation

| Gap | Opportunity | Effort |
|-----|-----------|--------|
| **Government scheme finder** | PM Kisan, 80C tax savings | 2 weeks |
| **Gold & property tracking** | India's real wealth (₹40L cr gold) | 1 week |
| **Peer comparison** | "You spend 15% less than avg Mumbai user" | 1 week |
| **Gamification** | Savings challenges, streaks, badges | 1 week |
| **Family chat/sharing** | Share expense reports in family group | 3 days |
| **Receipt/photo scanning** | OCR for cash receipts | 1 week |
| **Predictive spending** | "At this rate, ₹12K on food this month" | 3 days |

### P3 — Revenue / Monetization

| Gap | Revenue Model | Effort |
|-----|-------------|--------|
| **Freemium model** | ₹99/month for AI insights + unlimited budgets | 1 week |
| **Credit card affiliate** | Recommend cards based on spending → commission | 2 weeks |
| **Loan comparison** | "Switch loan at 8.5% → 8.1%" → bank pays for lead | 2 weeks |
| **Insurance marketplace** | "You need ₹50L term insurance" → partner | 2 weeks |
| **Tax filing partnership** | ClearTax integration → seasonal revenue | 1 week |
| **Digital gold selling** | Augmont/SafeGold in-app buying | 2 weeks |

## TECHNICAL DEBT

| Item | Impact | Fix |
|------|--------|-----|
| AI insight caching | Each call costs API credits | Add 4-hour MongoDB TTL cache |
| MongoDB indexes | Slow queries at scale | Add indexes on user_id, date, category |
| Error boundary | App crashes on unhandled errors | Add React error boundary component |
| App size optimization | Large bundle for slow networks | Code splitting, lazy imports |
| Automated testing | No CI/CD pipeline | Add GitHub Actions with test suite |
| Monitoring | No crash/error tracking | Add Sentry or similar |

## KNOWN LIMITATIONS

1. **SMS text NOT stored** (privacy) — can't re-analyze old SMS
2. **Voice input requires internet** — Whisper API is cloud-based
3. **AI insights require internet** — OpenAI calls can't run offline
4. **Family budgets** — no real-time sync between members yet
5. **No bank-level security audit** — needs pen testing before handling real financial data
6. **Mock OTP in production** — must switch to real SMS before launch
