# Backend Module Architecture (Post Round-30g Refactor)

**Last updated:** June 2025 after the 6-phase `server.py` + `split_settle.py` modular split.

This document captures the current backend structure so future agents don't have
to spelunk through 800-line files to understand the shape of the app.

---

## 📂 Directory Layout

```
backend/
├── server.py                       (311 L) — FastAPI bootstrap & router mount
├── schemas.py                      — Pydantic request/response schemas
│
├── core/                           — Shared infrastructure
│   ├── __init__.py                 — Re-exports: db, get_current_user, safe_oid, try_oid
│   ├── db.py                       — Motor client + database singleton
│   ├── auth.py                     — Hardened get_current_user (JWT + dead-token check)
│   ├── ids.py                      — safe_oid / try_oid helpers (400 on bad ObjectId)
│   ├── constants.py                — Static data (categories, pricing, badges, lessons)
│   ├── scoring.py                  — Money-score calculator
│   ├── upi.py                      — validate_upi_id / mask_upi_id
│   ├── content.py                  — DAILY_CARDS, APP_DOWNLOAD_LINK
│   ├── events.py                   — Pub/Sub Event Bus (12 event kinds)
│   ├── event_handlers.py           — Subscribers (budget alerts, settlement side-effects)
│   │
│   ├── ai_helpers.py      ⭐NEW    (272 L) — LLM glue
│   │   • parse_sms_with_ai
│   │   • generate_insights_with_ai (weekly + trends)
│   │   • send_expo_push
│   │
│   ├── lifecycle.py       ⭐NEW    (155 L) — register_lifecycle(app, db, client)
│   │   • _ensure_indexes                — 20+ MongoDB indexes
│   │   • _start_background_workers      — News + Gmail + Event bus + Soft-delete purge
│   │
│   ├── middleware.py      ⭐NEW    (185 L)
│   │   • SecurityHeadersMiddleware      — OWASP headers
│   │   • RateLimitMiddleware            — Per-IP sliding window (60s, 1000 req/auth 30 req)
│   │   • AuditLogMiddleware             — 90-day retention audit trail
│   │
│   └── responses.py       ⭐NEW    (117 L)
│       • SafeJSONResponse               — NaN/Inf-tolerant JSON encoder
│       • register_exception_handlers(app) — 422 & 400 for validation + bad ObjectId
│
├── routers/                        — Domain endpoint groups (all prefixed /api)
│   ├── auth.py                     — OTP flow, register, login, resend
│   ├── user.py                     — /user/me, profile identity, delete-account
│   ├── transactions.py             — CRUD + SMS bulk-parse
│   ├── budgets.py                  — CRUD + smart-setup
│   ├── budgets_ext.py              — Suggestions, reminders, live live stats
│   ├── analytics.py                — Spending breakdowns
│   ├── cash.py                     — Manual cash tracking
│   ├── goals.py                    — Savings goals CRUD
│   ├── rewards.py                  — Coin ledger + badges + XP
│   ├── gamification.py             — Streaks, daily cards
│   ├── premium.py                  — Pricing, mock-activate, paywall triggers
│   ├── premium_subscriptions.py    — Razorpay recurring subs
│   ├── premium_reports.py          — Weekly/monthly PDF exports
│   ├── premium_coins.py            — Coin redemption for premium plans
│   ├── premium_common.py           — Shared Razorpay proxy
│   ├── profile_identity.py         — Avatar/bio/stats hub
│   ├── profile_engine.py           — Personality-based content
│   ├── ab.py                       — A/B test bucketing
│   ├── share.py                    — Social-share text builders
│   ├── privacy.py                  — Data export, delete-account
│   ├── alerts.py                   — Price alerts
│   ├── upi.py                      — UPI validator endpoint
│   ├── insights_ext.py             — Trend cards, what-if calc
│   ├── gmail_oauth.py              — OAuth + 15-min background sync
│   ├── home_bundle.py              — Aggregated home-screen payload
│   ├── notifications.py            — /notifications/* (expo push + smart triggers)
│   ├── sms.py                      — /sms/bulk-parse
│   ├── news.py                     — Finance news refresher
│   ├── referral.py                 — Invite codes, viral loop
│   ├── content.py                  — MintU magazine articles
│   ├── family.py                   — Family group finances
│   │
│   ├── ai.py                       — /ai/chat, /ai/weekly-report
│   ├── ai_agent.py                 — Agent profile routing
│   ├── ai_common.py                — Shared LLM helpers
│   ├── ai_insights.py              — /insights endpoints
│   ├── ai_money_school.py          — Money-school cards + XP
│   ├── ai_waste.py                 — Waste-detector equivalences
│   │
│   ├── splits.py                   — Aggregator — imports all split_* modules
│   ├── split_common.py             — Shared APIRouter + schemas + SETTLEMENT_BADGES
│   ├── split_groups.py             — Group CRUD, members, chat, preview, join
│   ├── split_expenses.py           — Expense CRUD, summary, split math
│   ├── split_settle.py    ⭐SHRUNK (759 L) — Settle / lock / partial / mark-paid / rewards
│   ├── split_reminders.py ⭐NEW    (264 L) — /remind /reminders /dismiss /invite-to-settle
│   ├── split_activity.py  ⭐NEW    (225 L) — /activity feed + /settlement-leaderboard
│   └── split_razorpay.py           — Razorpay-backed settlement flow
│
└── tests/
    ├── conftest.py                 — Rate-limit fixture (clears between tests)
    └── test_adversarial.py         — 24 IDOR/idempotency/rate-limit/data-integrity tests
```

---

## 🔄 Back-Compat Contract

`server.py` re-exports every legacy name that live routers still `lazy-import`.
These access patterns **all still work**:

```python
from server import parse_sms_with_ai         # → core.ai_helpers
from server import send_expo_push            # → core.ai_helpers
from server import generate_insights_with_ai # → core.ai_helpers
from server import RateLimitMiddleware       # → core.middleware
from server import SecurityHeadersMiddleware # → core.middleware
from server import _SafeJSONResponse         # → core.responses
from server import _scrub_nonfinite          # → core.responses
from server import razorpay_client           # → top-level in server.py
from server import db, get_current_user      # → core
from server import hash_password, verify_password, create_token
from server import cache_get, cache_set, cache_clear_prefix
from server import RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS, AUTH_RATE_LIMIT_MAX
from server import SENSITIVE_FIELDS, DATA_RETENTION_DAYS
# …and all the `from core.constants import X` names re-exported for back-compat
```

Attribute access also works: `server.razorpay_client`, `server.parse_sms_with_ai`, etc.

---

## 📊 Refactor Scorecard

| File | Before | After | Δ |
|---|---|---|---|
| `server.py` | 817 | **311** | **-62%** |
| `split_settle.py` | 1160 | **759** | **-35%** |

**Total test coverage unchanged:** 24/24 adversarial pytest suite green after every
phase. Zero 5xx errors during backend smoke tests.

---

## 🧭 Where to Put New Code

| Adding… | Put it in… |
|---|---|
| New API endpoint | A router under `backend/routers/` |
| New LLM helper | `core/ai_helpers.py` |
| New MongoDB index | `core/lifecycle.py` → `_ensure_indexes()` |
| New background worker | `core/lifecycle.py` → `_start_background_workers()` |
| New middleware | `core/middleware.py` + register in `server.py` |
| New static constant | `core/constants.py` |
| New shared helper | `core/` (new module if > 30 L) |
| Event-driven side-effect | `core/event_handlers.py` |

Keep `server.py` thin — it should only contain:
- App creation
- Router mounting
- Middleware registration
- Back-compat re-exports (re-exports only, no new logic)
