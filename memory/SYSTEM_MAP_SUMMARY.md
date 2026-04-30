# MintU System Map — Phase 1 Architecture Audit
# Generated: Round 60b (Main Agent, automated extraction)
# Source: real static analysis of every .ts/.tsx/.py file in /app

================================================================
EXECUTIVE SUMMARY
================================================================

  FRONTEND
    37 routes (8 tabs)
    225 source files, ~62K LOC
    14 component domains, ~150 components
    4 zustand stores
    151 unique API call sites
    758 internal import edges
    ✓ ZERO circular dependencies

  BACKEND
    24 routers / 105 endpoints
    45 Mongo collections
    1 WebSocket endpoint (/ws/split/{group_id})
    6 middleware in stack
    6 external SDKs (Razorpay, Sentry, Google APIs, emergentintegrations)
    ~80 .py files, ~40K LOC

================================================================
TIGHTLY COUPLED MODULES (load-bearing — handle with care)
================================================================

  utils/theme.ts          158× depended on    ← global design tokens
  utils/makeStyles.ts     136× depended on    ← styling factory
  utils/api.ts            56×  depended on    ← axios singleton
  store/authStore.ts      22×  depended on    ← user/token global
  store/langStore.ts      14×  depended on    ← i18n
  utils/i18n.ts           14×  depended on    ← translation strings
  components/split/theme  14×  depended on    ← split-specific palette

  ⚠️ Any breaking change to these modules ripples to dozens of
     screens. Treat as a stability layer; refactor with extreme care.

================================================================
HIGH-FAN-OUT FILES (heavy "glue" pages)
================================================================

  app/(tabs)/profile.tsx       38 internal deps   ← Profile tab orchestrator
  app/(tabs)/split.tsx         31                 ← Split tab orchestrator
  app/(tabs)/index.tsx         31                 ← Home tab orchestrator
  app/(tabs)/budget.tsx        22
  app/(tabs)/transactions.tsx  20

  These tab files are doing a lot. Refactor opportunity if any of
  them grows past ~1K LOC (none have, currently).

================================================================
NO REAL CIRCULAR DEPENDENCIES (verified twice)
================================================================
  Initial scan flagged 2 cycles (utils/cacheGraph.ts, utils/share.ts)
  but both were false positives — `import` statements quoted inside
  JSDoc @example comments. Re-scanned with comments stripped:
  ZERO real cycles across 225 nodes / 725 edges. Codebase is acyclic.

================================================================
SECTION INDEX (full data in SYSTEM_MAP.txt)
================================================================
  1. Frontend Routes                  (37 routes, 8 tabs)
  2. Frontend Components by Domain    (14 domains, ~150 components)
  3. State Management                 (4 zustand stores)
  4. Frontend Utilities               (~30 utility modules)
  5. Frontend Services                (~12 service-layer modules)
  6. Backend Routers — All Endpoints  (24 routers, 105 endpoints)
  7. Database Collections             (45 Mongo collections)
  8. External API Integrations        (Razorpay, Google, news APIs)
  9. Core / Middleware / Services     (29 core modules)
 10. Third-Party Libraries            (frontend deps + 136 backend)
 11. Frontend Dependency Graph        (758 edges, fan-in ranked)
 12. Circular Dependencies            (verified ZERO)
 13. High-Fan-Out Files               (top 10 ranked)
 14. Background Jobs / Schedulers     (lifespan, periodic, WS)
 15. WebSocket Endpoints              (1 endpoint)
 16. Frontend Persistent Storage      (3 AsyncStorage + 1 SecureStore)
 17. API Call Site Inventory          (151 sites)
 18. Backend Middleware Stack         (6 middleware in order)

================================================================
KEY DATA FLOWS (UI → API → DB)
================================================================

  USER ACTION              UI COMPONENT       →   API ENDPOINT          →   COLLECTION(S)
  ──────────────────────────────────────────────────────────────────────────────────
  Login                    auth.tsx           →   /auth/send-otp        →   otps, otp_audit
                                              →   /auth/verify-otp      →   users, otps
  Add expense              transactions.tsx   →   POST /transactions    →   transactions, ledger_transactions
  Create split group       split.tsx          →   POST /split/groups    →   split_groups
  Add split expense        split/add-expense  →   POST /split/.../exp.. →   split_expenses, idempotency_keys
  Settle balance           SmartSettleSheet   →   POST /split/settle    →   split_settlements, settle_locks
  View Profile             profile.tsx (×9)   →   /profile/identity     →   users, score_history
                                                  /profile/score-break  →   score_history, transactions
                                                  /profile/missions     →   mission_claims, gamification_*
                                                  /profile/weekly-comp  →   transactions, score_history
  Spending Insights        spending-insights  →   /home/snapshot        →   transactions, budgets
                                                  /leaderboard/friends  →   users, ledger_transactions
                                                  /analytics/yearly     →   transactions, budgets
  AI Quick Sheet           AIQuickSheet       →   /ai/agent-chat        →   transactions (ctx pull)

================================================================
EVENT & TRIGGER MAP
================================================================

  STARTUP (lifespan):
    server.py                  → Sentry + DB connect + index ensure
    core/lifecycle.py          → asyncio task: scheduled cleanup
    core/observability.py      → metrics flusher
    core/events.py             → event bus init
    routers/news.py            → periodic news cache refresh
    routers/notifications.py   → periodic nudge dispatcher
    routers/gmail_oauth.py     → asyncio task: token refresh
    routers/privacy.py         → periodic data retention sweep

  REAL-TIME:
    routers/split_ws.py        → /ws/split/{group_id} broadcast on
                                  expense/settle/message events

  CLIENT-SIDE BACKGROUND:
    services/syncEngine.ts     → NetInfo listener: drain offline
                                  expense queue when online
    services/offlineQueue.ts   → AsyncStorage queue for offline
                                  expense submissions
