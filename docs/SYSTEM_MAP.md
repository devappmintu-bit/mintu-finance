# MintU — Global System Map

_Last refreshed: Apr 24 2026 · Round 31c_

---

## 1. INTEGRATIONS (3rd-party services)

| Service | Purpose | Keys (backend/.env) | Mode |
|---|---|---|---|
| **MongoDB** | primary datastore | `MONGO_URL`, `DB_NAME` | LIVE |
| **Emergent LLM key** | GPT-5.2 + Gemini Nano Banana | `EMERGENT_LLM_KEY` | LIVE |
| **Google OAuth (Gmail)** | read receipts → SMS-parse transactions | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | LIVE |
| **Razorpay** | premium subscriptions | `RAZORPAY_KEY_ID/SECRET`, 3× `PLAN_ID_*`, `WEBHOOK_SECRET` | TEST keys — PLAN_ID = mocked |
| **JWT / bcrypt** | auth sessions | `JWT_SECRET` | LIVE |
| **FCM/APNs push** | notifications | ❌ missing — **MOCKED** |
| **MSG91 / Twilio SMS** | OTP delivery | ❌ missing — **MOCKED** (OTP=`123456`) |
| **WhatsApp Cloud API** | expense bot | ❌ missing — **MOCKED** |

Device permissions declared: Android `RECORD_AUDIO / READ_CONTACTS / CAMERA / READ_MEDIA_IMAGES`; iOS `NSMicrophoneUsageDescription / NSContactsUsageDescription / NSCameraUsageDescription / NSPhotoLibraryUsageDescription`.

---

## 2. FRONTEND SCREEN MAP (33 routes)

### 2.1 Tabs (under `(tabs)`)

| Tab | File | Purpose |
|---|---|---|
| 🏠 Home | `(tabs)/index.tsx` | Money score, balance hero, quick actions, today-chips, daily quest, news, weekly report, leaderboard teaser |
| 💳 Transactions | `(tabs)/transactions.tsx` | List + add-manual + SMS-parse + swipe-delete + filters |
| 🎯 Budget | `(tabs)/budget.tsx` | List + donut chart + create/edit/delete + smart suggestions + achievements |
| 🪩 Rewards | `(tabs)/rewards.tsx` | Mystery box, spin, missions, referral, coin history |
| 💬 AI Coach | `(tabs)/ai-coach.tsx` | GPT-5.2 chat + suggested chips + voice input |
| 📊 Insights | `(tabs)/insights.tsx` | AI insights feed + AI coach tab switcher |
| 🤝 Split | `(tabs)/split.tsx` | Groups, balances, add-expense, settle, reminders, pay |
| 👤 Profile | `(tabs)/profile.tsx` | Hero, Progress, Streak & Coins Health, Beat-last-week, Missions, Premium CTA, Settings |

### 2.2 Non-tab routes (25 screens)

| Route | Purpose |
|---|---|
| `/` (index) | Splash → route to onboarding/auth/unlock/tabs |
| `/onboarding` | Language picker, skip, continue |
| `/auth` | Phone OTP, new-user name, PIN setup |
| `/unlock` | PIN / biometric unlock |
| `/leaderboard` | 3-toggle (Friends / Global / 🔥 Streak) |
| `/goals` | List + CRUD + milestone confetti |
| `/money-school` | Daily financial lesson + gated premium content |
| `/mystery-box` | Daily / weekly / monthly treasure boxes |
| `/premium` | Plan cards (monthly/yearly/lifetime) |
| `/premium-hub` | Post-purchase hub |
| `/premium-activated` | Confetti after purchase |
| `/premium-reports` | Deep analytics (pro gate) |
| `/yearly` | Annual recap |
| `/rewards-hub` | Cumulative rewards overview |
| `/about` | About page |
| `/gmail` | OAuth entrypoint |
| `/gmail-connected` | OAuth return (sets token) |
| `/split/add-expense` | Deep-link from outside app |
| `/split/add-member` | Deep-link to add contact |
| `/join/[id]` | Invite preview + Join CTA |
| `/legal/[page]` | Terms / Privacy |
| `/profile/delete-account` | Account deletion flow |

---

## 3. BACKEND ROUTER MAP (49 routers)

Grouped by domain:

| Domain | Routers | Representative endpoints |
|---|---|---|
| **Auth** | `auth` | `POST /auth/send-otp`, `POST /auth/verify-otp`, `POST /auth/refresh` |
| **User** | `user`, `profile_identity`, `profile_engine`, `privacy` | `GET /user/me`, `PUT /user/profile`, `POST /user/delete` |
| **Streak & Coins (canonical)** | `streak`, `premium_coins` | `POST /streak/check-in`, `GET /streak/status`, `GET /streak/leaderboard`, `GET /streak/health`, `GET /coins/balance`, `GET /coins/history`, `POST /coins/award` |
| **Transactions** | `transactions`, `sms`, `cash` | `POST /transactions` (with `idempotency_key`), CRUD, `POST /transactions/parse-sms` |
| **Budgets** | `budgets`, `budgets_ext`, `alerts` | CRUD + breach alerts |
| **Goals** | `goals` | CRUD + progress + milestones |
| **Split** | `split_groups`, `split_expenses`, `split_settle`, `split_reminders`, `split_activity`, `split_insights`, `split_razorpay`, `splits` | Groups, expenses, settle, pay via UPI/Razorpay, reminders |
| **Rewards** | `rewards`, `referral`, `gamification`, `share` | Spin wheel, mystery box, missions, referral, share |
| **Premium** | `premium`, `premium_subscriptions`, `premium_invest`, `premium_reports`, `premium_tax`, `premium_common` | Plan listing, subscribe (Razorpay), feature gates |
| **AI** | `ai`, `ai_agent`, `ai_coach`, `ai_common`, `ai_insights`, `ai_money_school`, `ai_voice`, `ai_waste` | GPT-5.2 chat, insights, lessons |
| **Home aggregation** | `home_bundle`, `insights_ext`, `content` | `/home/bundle` composite endpoint (cut frontend latency from 2.3s → 50ms) |
| **News** | `news` | 6-hour-cached India finance news |
| **Gmail** | `gmail_oauth`, `gmail_parser` | OAuth flow + transaction extraction |
| **Notifications** | `notifications` | Local notifications scheduling |
| **Misc** | `ab`, `family`, `upi` | A/B experiments, family groups, UPI handles |

---

## 4. DATA MODEL (MongoDB collections)

Current row counts (_snapshot Apr 24 2026_):

| Collection | Rows | Purpose |
|---|---|---|
| `users` | 2018 | Canonical user profile |
| `audit_logs` | 36 268 | 90-day retention of every sensitive action |
| `transactions` | 519 | User spending records |
| `split_groups` | 440 | Split expense groups |
| `split_expenses` | 261 | Individual split expense entries |
| `split_messages` | 376 | In-group chat/reminders |
| `ledger_transactions` | 639 | **CANONICAL coin ledger** (immutable, unique idempotency_key) |
| `settlements` | 141 | Split settle records (Razorpay + manual) |
| `coin_ledger_archived_v1` | 114 | **DEPRECATED** legacy coin ledger (Round 31c migration) |
| `budgets` | 62 | Monthly per-category budgets |
| `split_reminders` | 55 | Scheduled nudges |
| `goals` | 51 | Savings/expense goals |
| `budget_alerts` | 38 | Breach notifications |
| `score_history` | 10 | Money score trail |
| `news_cache` | 6 | Cached finance news |
| `user_badges` | 6 | Earned achievements |
| `recurring_splits` | 7 | Monthly auto-splits |
| `agent_memory` | 4 | AI conversation context |
| `family_budgets` | 3 | Shared family budgets |
| `family_groups` | 3 | Family units |
| `subscriptions` | 3 | Razorpay subscription state |
| `payment_orders` | 2 | Pending Razorpay orders |
| `rate_limits` | 2 | Sliding-window rate limits |
| `mission_claims` | 1 | Quest completion receipts |
| `otps` | 1 | Active OTP codes |
| `referrals` | 1 | Referral tracking |
| `school_progress` | 1 | Money-school progress per user |
| `streak_freeze_events` | 1 | Premium streak-save events |
| `ab_events`, `cash_entries`, `coin_ledger`, `gmail_tokens`, `oauth_states`, `otp_audit`, `recurring_expenses`, `reward_spins`, `rewards_wallet`, `settle_locks` | 0 | Transient / lazily-populated |

Key unique indexes:
- `ledger_transactions`: `(user_id, idempotency_key)` partial unique
- `transactions`: `(user_id, idempotency_key)` partial unique (Round 31b), `(user_id, source_msg_id)` for Gmail dedupe
- `settlements`: `razorpay_order_id` unique
- `users`: `phone` unique
- `settle_locks`: TTL 10s
- `oauth_states`: TTL on `expires_at`
- `otps`: TTL on `expires_at`
- `audit_logs`: TTL 90 days

---

## 5. BACKGROUND JOBS (async tasks)

| Worker | Interval | Location | Job |
|---|---|---|---|
| 📧 Gmail sync | 15 min | `routers/gmail_oauth.py:391` | Fetch new transaction SMS from Gmail |
| 📰 News refresher | 6 hours | `routers/news.py:223` | Re-fetch India finance headlines |
| 🧹 Soft-delete purge | 1 hour | `core/lifecycle.py:190` | Hard-delete records soft-deleted > 30 days |
| 🔄 Ledger reconcile | 6 hours | `core/lifecycle.py:223` | Recompute `users.coins_balance` from `ledger_transactions` sum (self-heals drift) |
| 🗃️ Coin-ledger archival | Once on startup | `core/lifecycle.py:_archive_legacy_coin_ledger` | Idempotent rename of deprecated collection |

Event bus: 12 event kinds (`core/events.py`) — e.g. `TRANSACTION_CREATED` fans out to budget-breach checker, AI cache invalidation.

---

## 6. CRITICAL DATA-FLOW: Screen → Components → Actions → API → DB → Response → UI

### 6.1 Auth flow
```
/auth → PhoneInput + OTPBoxes + NameInput → [Send OTP] → POST /api/auth/send-otp
  → db.otps.insert (+mock SMS log) → response {ok}
  → [Verify OTP] → POST /api/auth/verify-otp → db.otps.findOne + delete
  → db.users.upsert → response {token, user}
  → authStore.saveToken → AsyncStorage
  → router.replace('/(tabs)')
```

### 6.2 Add Transaction (with idempotency — Round 31b/c)
```
/(tabs)/transactions → Modal form → onSubmit
  → services/transactions.ts::addTransaction(payload) ← auto-UUIDv4
  → POST /api/transactions { ...payload, idempotency_key: uuid }
  → Pydantic validation (amount>0, finite, type in debit|credit)
  → db.transactions.insertOne (unique on user_id + idempotency_key)
     • DuplicateKey → return existing doc with {deduped: true}
  → emit TRANSACTION_CREATED event
  → cascading cache invalidation (stats, analytics, budgets)
  → /api/coins/award action=add_transaction → atomic daily-cap reserve
     → core.ledger.award_coins(idempotency_key) → ledger_transactions.insert
  → UI: list re-fetch via SWR, toast "+5 coins"
```

### 6.3 Daily Streak (auto-fired on app cold-start)
```
_layout.tsx → useDailyCheckIn → POST /api/streak/check-in
  → core.streak.check_in() atomic find_one_and_update CAS
  → if missed 1 day & premium → consume streak_freezes_available (atomic)
  → core.ledger.award_coins(streak_daily idempotency_key = UTC_date)
  → if day % 7 == 0 → milestone_bonus +50
  → if day % 30 == 0 → milestone_bonus +200
  → UI: 🔥 toast with coins + optional ❄️ freeze-saved toast
  → Animated streak counter on Profile + Home ProgressInline
```

### 6.4 Split Expense + Settle + Coin-redemption
```
/split.tsx → ExpenseSheet → POST /api/split/expenses
  → schema validation (amount>0, group_id, paid_by, splits)
  → db.split_expenses.insertOne
  → emit SPLIT_EXPENSE_CREATED → reminders scheduled
  → UI: group balance re-computed, participant chips updated

/split.tsx → SettleSheet → POST /api/split/settle { target_user_id, amount, coins }
  → rate-limit 1/sec per (from, to, group)
  → _apply_split_coin_redemption:
     core.ledger.spend_coins(atomic find_one_and_update guard)
     → refuses if coins_balance < amount (no negative balance possible)
  → razorpay order OR mock payment
  → db.settlements.insertOne (unique razorpay_order_id)
  → UI: new balance, "Paid" badge
```

### 6.5 Home `/home/bundle` (reduced 2.3s → 50ms)
```
(tabs)/index.tsx → SWR { ttl: 5min } → GET /api/home/bundle
  → parallel fetch:
     db.users, db.transactions (latest 10), db.goals (active),
     db.budgets (month), db.ledger_transactions (7d), news_cache
  → composite response (single roundtrip)
  → UI: BalanceHero + QuickActionBar + TodayChips + DailyQuest
      + NewsCarousel + WeeklyReport + LeaderboardTeaser
```

---

## 7. PERMISSIONS / ROLES

| Role | Check | Granted by |
|---|---|---|
| **Anonymous** | no JWT | send-otp only |
| **Authenticated user** | valid JWT (`Depends(get_current_user)`) | verify-otp |
| **Premium (Pro)** | `user.premium_tier in ['premium','legend']` AND `premium_until > now` | Razorpay subscription OR mock activation |
| **Legend** | `user.premium_tier == 'legend'` | Highest-tier subscription |
| **Group member** | `user_id in split_groups.members` | Created or invited |
| **Group creator** | `split_groups.created_by == user_id` | Group creation |
| **Self (IDOR guard)** | resource `user_id == current_user_id` | Resource ownership — enforced on every goals/transactions/budgets/splits query |

No admin role exists in this build — there is NO backend admin UI; operations are performed via pytest adversarial suites + DB-direct Python scripts.

---

## 8. RATE LIMITS & IDEMPOTENCY

| Endpoint | Limit / Mechanism |
|---|---|
| `POST /auth/send-otp` | 3/min per phone (sliding window in `db.rate_limits`) |
| `POST /auth/verify-otp` | 5/min per phone |
| `POST /split/settle` | 1/sec per `(from, to, group)` via `db.settle_locks` (10s TTL) |
| `POST /coins/award` | atomic daily-cap counter + per-action idempotency key |
| `POST /transactions` | per-user `idempotency_key` unique partial index |
| `POST /streak/check-in` | CAS on `streak_last_active_date` + UTC-day idempotency |
| `POST /split/expenses` | group-member membership check (403 for non-members) |
| AI coach chat | in-memory token bucket per-user |

---

## 9. TESTING

| Suite | Tests | What it guards |
|---|---|---|
| `test_streak_coins_audit.py` | 13 | Streak & coin ledger correctness |
| `test_adversarial.py` | 24 | General adversarial (IDOR, injection, overflow) |
| `test_principal_audit.py` | 31 | PII redaction, IDOR on all entities, audit-log completeness, schema validation |
| `test_paranoid_audit.py` | 29 | Race conditions, timezone arbitrage, cap bypass, spend-race, transaction idempotency, cross-user injection |
| TOTAL | **95 pass / 3 skip / 0 fail** | ~100% coverage of financial invariants |

---

## 10. KNOWN RISKS / MOCKED SURFACES

| Area | Status |
|---|---|
| FCM/APNs push delivery | Scheduling works; real delivery is **MOCKED** (needs keys) |
| SMS OTP delivery | **MOCKED** (OTP = `123456`) |
| WhatsApp expense bot | **MOCKED** |
| Razorpay Plan IDs | **MOCKED** (subscribe flow returns synthetic order) |
| `coin_ledger` (legacy) | **ARCHIVED** Round 31c — 114 rows preserved in `coin_ledger_archived_v1` |
| Offline-sync queue | No server-side conflict resolution yet (client best-effort replay) |

---

_This map is a living document. Update when adding new screens, routers, collections, or workers._

---

## 11. ROUND 42 CLOSE — FINAL AUDIT SWEEP

Round 42 closed the audit with no new product features. Changes since the
last revision of this map:

### Frontend

- **NEW** `utils/time.ts` — single home for `timeAgo()`. `services/coinLedger.ts`
  and `services/notifications.ts` now re-export instead of duplicating ~20
  lines each.
- **NEW** Offline-aware submit gating across every write surface — see
  `KNOWN_ISSUES.md` Section C for the full table. Single hook
  (`hooks/useIsOnline.ts`, Round 40) is consumed by:
  - `(tabs)/transactions.tsx` (Add/Edit Transaction)
  - `components/budget/BudgetSmartSheet.tsx`
  - `app/goals.tsx`
  - `app/split/add-expense.tsx`
  - `components/split/PaySheet.tsx`
  - `app/rewards-hub.tsx` (redeem path)
  - `(tabs)/ai-coach.tsx` (offline card + Ask disable)
  - `app/search.tsx` (input non-editable + EmptyState)
- **NEW** Foreground notification badge polling (60 s) in `(tabs)/index.tsx`,
  paired with the existing AppState-active refresh. Bridges the gap until
  real FCM/APNs delivery is wired.

### Backend

- No schema or endpoint changes in Round 42. Adversarial invariants from
  Rounds 39–41 audited inline and confirmed correct (see
  `KNOWN_ISSUES.md` Section D).

### Documentation (NEW)

- `docs/KNOWN_ISSUES.md` — honest enumeration of TS tech debt, mocked
  integrations, offline coverage matrix, adversarial invariants verified.
- `docs/WHAT_WAS_BUILT.md` — shipping log Rounds 31 → 42.
- This section in `docs/SYSTEM_MAP.md`.

### Out of scope for Round 42

See `KNOWN_ISSUES.md` Section F.

