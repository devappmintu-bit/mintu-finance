# MintU — Unified Data + Interaction Graph
**Date**: Apr 23 2026 · **Scope**: R1 entity + event + cache map. Read-only reference.

This document is the **single source of truth** for how data flows across MintU.
Use it to answer:
- "What are the relationships between my entities?"
- "Which caches need to invalidate when I add a transaction?"
- "What side-effects fire on a settle?"

If you change the DB schema or add a write endpoint, update this doc.

---

## 1. ENTITY CATALOG (39 collections live)

Legend: **PK** = primary-key, **FK** = foreign-key, **∅** = none (root entity).

| # | Entity | PK | FKs | Owner | Notes |
|---|---|---|---|---|---|
| 1 | **users** | `_id` (ObjectId) | ∅ | root | Root of all user-scoped data. Fields: `phone, name, money_score, reward_coins, streak_days, deleted_at, scheduled_purge_at, pin_hash, avatar_base64` |
| 2 | **otps** | phone + code (composite) | `users.phone` (soft) | auth | 30s-window OTP record |
| 3 | **otp_audit** | phone + at | `users.phone` (soft) | auth | Per-phone brute-force counter (15/hr) |
| 4 | **rate_limits** | IP + window | ∅ | middleware | Per-IP request counter (30/min auth, 1000/min other) |
| 5 | **audit_logs** | `_id` | `users._id` | middleware | Every `/api/*` hit (path, status, ms, hashed IP) |
| 6 | **transactions** | `_id` | `user_id` | users | Income/expense. `{type, amount, category, description, date, source}` |
| 7 | **cash_entries** | `_id` | `user_id` | users | Offline cash add/spend log |
| 8 | **recurring_expenses** | `_id` | `user_id` | users | Templates for repeating txns |
| 9 | **budgets** | `_id` | `user_id` | users | Per-category monthly cap |
| 10 | **budget_alerts** | `_id` | `user_id`, `budget_id` | users | 80% / 100% triggered alerts |
| 11 | **goals** | `_id` | `user_id` | users | Savings goals |
| 12 | **split_groups** | `_id` | `created_by`, embeds `members[].user_id`, `pending_invites[].phone` | users | Group doc. Members as objects, not strings |
| 13 | **split_expenses** | `_id` | `group_id`, `created_by`, `paid_by`, `splits` (map) | split_groups | Expense inside a group |
| 14 | **split_messages** | `_id` | `group_id`, `sender_id` | split_groups | Chat thread per group |
| 15 | **split_reminders** | `_id` | `sender_id`, `recipient_id`, `group_id?` | users | "X reminds you ₹Y" nudge. Status: pending\|settled\|dismissed |
| 16 | **settlements** | `_id` | `payer_id`, `payee_id`, `group_id?`, `razorpay_order_id?` (unique) | users | Single record per settle. Partial/offline/rewards flags |
| 17 | **settle_locks** | `_id=settle:{u1}:{u2}:{gid}` | ∅ | split | MongoDB advisory lock (10s TTL) — prevents TOCTOU race on concurrent settle |
| 18 | **split_balances_cache** | `user_id` | `user_id` | users | [DEAD — no writers in code] |
| 19 | **coin_ledger** | `_id` | `user_id`, unique `(user_id, action, dedupe_key)` partial | users | Every coin earn/spend. Source of truth for `users.reward_coins` |
| 20 | **coins_wallet** | `_id` | `user_id` | users | Cached balance (rebuilt from ledger) |
| 21 | **rewards_wallet** | `_id` | `user_id` | users | Voucher/reward codes claimed |
| 22 | **reward_spins** | `_id` | `user_id` | users | Spin-wheel claim log |
| 23 | **mission_claims** | `_id` | `user_id`, `mission_id` | users | Mission completion ledger |
| 24 | **user_badges** | `_id` | `user_id` | users | Unlocked badges |
| 25 | **score_history** | `_id` | `user_id` | users | Daily money-score snapshot |
| 26 | **gmail_tokens** | `_id` | `user_id` | users | OAuth refresh tokens (encrypted) |
| 27 | **subscriptions** | `_id` | `user_id` | users | Premium plan state |
| 28 | **payment_orders** | `_id` | `user_id`, `order_id` | users | Razorpay order shelf (kind: `premium`, `split_settle`) |
| 29 | **referrals** | `_id` | `user_id` (referrer), `referred_user_id?` | users | Invite ledger |
| 30 | **sent_notifications** | `_id` | `user_id` | users | In-app + push delivery log |
| 31 | **agent_memory** | `_id` | `user_id`, `context_hash` | users | LLM persistent memory per user |
| 32 | **ab_events** | `_id` | `user_id`, `experiment`, `variant` | users | A/B test impressions + conversions |
| 33 | **school_progress** | `_id` | `user_id`, `lesson_id` | users | Money-school lesson state |
| 34 | **family_budgets** | `_id` | `owner_user_id`, `member_phones[]` | users | Shared household budget |
| 35 | **news** | `_id` | ∅ | system | Global news feed cache |
| 36 | **things** | `_id` | ∅ | system | FastAPI template leftover (not used) |
| 37 | **oauth_states** | `_id` | ∅ | system | Short-lived OAuth nonce (5min TTL) |
| 38 | **leaderboard_cache** | scope+key | ∅ | system | Precomputed global / contacts leaderboard |
| 39 | **goals_progress** | `_id` | `user_id`, `goal_id` | users | Goal deposits log |

---

## 2. PRIMARY RELATIONSHIPS (ER DIAGRAM)

```
                    ┌──────────┐
                    │  users   │──── 1:1 ──── subscriptions, gmail_tokens
                    └──┬─┬─┬─┬─┘
                       │ │ │ │
         ┌─────────────┘ │ │ └─────────────┐
         │               │ │               │
   1:N   ▼         1:N   ▼ ▼  1:N          ▼ 1:N
 ┌─────────────┐  ┌─────────────┐  ┌───────────────┐
 │ transactions│  │    goals    │  │   budgets     │
 └──────┬──────┘  └─────────────┘  └───────┬───────┘
        │                                   │ 1:N
        │ (derives)                         ▼
        │                         ┌────────────────┐
        │                         │ budget_alerts  │
        │                         └────────────────┘
        │
        └─> analytics.summary, /ai/predict (READ-MODELS)


   User ─1:N─ split_groups.created_by
   User ─N:M─ split_groups.members[]
                    │
                    ▼ 1:N
           ┌────────────────┐     ┌──────────────────┐
           │ split_expenses │─1:N─│ split_messages   │
           └──────┬─────────┘     └──────────────────┘
                  │
                  │ drives
                  ▼
           ┌─────────────┐       ┌───────────────┐
           │ settlements │◄──────┤ settle_locks  │ (advisory, 10s TTL)
           └──────┬──────┘       └───────────────┘
                  │ 1:N on action
                  ▼
           ┌─────────────┐     ┌──────────────┐
           │ coin_ledger │──►  │ user_badges  │
           └──────┬──────┘     └──────────────┘
                  │ aggregate
                  ▼
           users.reward_coins (materialized)
```

Cross-cutting read-models (no own collection):
- **`/split/balances`** — reducing `split_expenses` + `settlements` → live debt map
- **`/analytics/summary`** — reducing `transactions` → category/month breakdown
- **`/home/bundle`** — fan-in: wallet + recent txns + budgets + alerts + coins
- **`/stats/overview`** — monthly roll-up

---

## 3. EVENT FLOWS — "WHAT HAPPENS WHEN…"

### 3.1 Add Transaction (`POST /api/transactions`)
```
create txn
   │
   ├─► transactions.insert()                    [authoritative]
   ├─► [implicit] /analytics/summary stale      (time-bucket aggregation)
   ├─► [implicit] /budgets.get stale            (category usage recalc)
   ├─► [implicit] /home/bundle stale            (recent-txn list)
   ├─► [implicit] /home/snapshot stale          (this-month total)
   ├─► [implicit] /ai/predict stale             (behavioural model input)
   ├─► [explicit] /coins/award({action: "log_expense"})
   │      dedupe_key = txn_id  → idempotent
   ├─► [explicit] budget alert check (if category > 80% or 100%)
   │      insert budget_alerts + send_notifications
   └─► [implicit] gamification streak counter   (users.streak_days++)
```

### 3.2 Settle Split (`POST /api/split/settle`)
```
settle_lock(payer, payee, group) acquire  (or 429)
   │
   ├─► compute_outstanding_debt()               [debt-guard]
   ├─► settlements.insert()                     [authoritative]
   ├─► split_reminders.update_many({pending}→settled)
   ├─► lock release
   │
   ├─► [implicit] /split/balances stale
   ├─► [implicit] /split/activity stale
   ├─► [implicit] /split/groups/{id}/summary stale
   ├─► [explicit] /coins/award({action: "settle", dedupe_key: settlement_id})
   ├─► [explicit] check mission claim (e.g. "first settle")
   └─► [explicit] badge check (e.g. "5 on-time settles")
```

### 3.3 Complete Mission (`POST /api/missions/{id}/claim`)
```
claim mission
   ├─► mission_claims.insert()
   ├─► coin_ledger.insert(reward)  (unique dedupe)
   ├─► users.reward_coins += reward
   │
   ├─► [implicit] /rewards/wallet stale
   ├─► [implicit] /gamification/status stale
   └─► [implicit] /leaderboard/contacts stale
```

### 3.4 Razorpay Verify (`POST /api/split/verify-settle-payment`)
```
verify signature
   │ (idempotency: settlements.find({razorpay_order_id})
   │  → return prior if found)
   ├─► compute_outstanding_debt()
   ├─► settlements.insert({razorpay_order_id})
   ├─► split_reminders dismissed
   ├─► coin award (if any)
   └─► [implicit] same stale set as 3.2
```

### 3.5 Delete Account (`POST /api/user/delete-account`)
```
soft mode:
   └─► users.update({deleted_at, scheduled_purge_at +30d})
       → core.auth rejects token on next hit
       → worker purges after 30d

hard mode (or worker-triggered):
   └─► _hard_purge_user(user_id):
       • 23 collections scanned by `user_id` (transactions, budgets,
         coin_ledger, …, school_progress, ab_events)
       • 2 phone-keyed (otps, otp_audit)
       • settlements (payer OR payee)
       • split_reminders (sender OR recipient)
       • split_messages by sender
       • split_groups.created_by → delete + cascade expenses/messages
       • split_groups.members: $pull {user_id: uid}  [correct syntax]
       • split_groups.pending_invites by phone
       • users doc
```

---

## 4. CACHE DEPENDENCY MATRIX

Read-endpoints listed left. Each write-endpoint on top MUST invalidate the
intersecting "✓" caches. This matrix is machine-readable as `cacheGraph.ts`.

| READ ENDPOINT \ WRITE | `txn` | `budget` | `goal` | `split.expense` | `split.settle` | `split.group` | `split.member` | `coin/reward` | `profile` |
|---|---|---|---|---|---|---|---|---|---|
| `/transactions` | ✓ | | | | | | | | |
| `/analytics/summary` | ✓ | ✓ | | | | | | | |
| `/stats/overview` | ✓ | ✓ | | | | | | | |
| `/home/bundle` | ✓ | ✓ | ✓ | | ✓ | | | ✓ | ✓ |
| `/home/snapshot` | ✓ | ✓ | | | | | | | |
| `/ai/predict` | ✓ | | | | | | | | |
| `/ai/insights` | ✓ | ✓ | ✓ | | ✓ | | | | |
| `/alerts/smart` | ✓ | ✓ | | | | | | | |
| `/reports/weekly` | ✓ | ✓ | | | | | | | |
| `/budgets` | | ✓ | | | | | | | |
| `/budgets/overview` | ✓ | ✓ | | | | | | | |
| `/goals` | | | ✓ | | | | | | |
| `/split/balances` | | | | ✓ | ✓ | ✓ | ✓ | | |
| `/split/activity` | | | | ✓ | ✓ | ✓ | ✓ | | |
| `/split/groups` | | | | | | ✓ | ✓ | | |
| `/split/groups/{id}/summary` | | | | ✓ | ✓ | ✓ | ✓ | | |
| `/split/groups/{id}/expenses` | | | | ✓ | | | | | |
| `/split/reminders` | | | | | ✓ | | | | |
| `/rewards/wallet` | ✓ | | | | ✓ | | | ✓ | |
| `/rewards/marketplace` | | | | | | | | ✓ | |
| `/gamification/status` | ✓ | | | | ✓ | | | ✓ | |
| `/leaderboard/{scope}` | | | | | ✓ | | | ✓ | |
| `/user/me` | | | | | | | | | ✓ |
| `/user/payment-methods` | | | | | | | | | ✓ |
| `/missions/available` | | | | | ✓ | | | ✓ | |
| `/news/india-finance` | | | | | | | | | |

Legend of write-keys used by `cacheGraph.ts`:
- **`txn`** — POST/PUT/DELETE `/transactions`, `/cash-entries`, `/transactions/parse-sms`
- **`budget`** — POST/PUT/DELETE `/budgets`, `/budgets/{id}`
- **`goal`** — POST/PUT/DELETE `/goals`, `/goals/{id}`
- **`split.expense`** — POST/PUT/DELETE `/split/expenses`
- **`split.settle`** — POST `/split/settle`, `/partial-settle`, `/settle-with-rewards`, `/mark-paid-offline`, `/verify-settle-payment`
- **`split.group`** — POST/PUT/DELETE `/split/groups`, `/leave`
- **`split.member`** — POST `/split/groups/{id}/members`
- **`coin/reward`** — POST `/coins/award`, `/rewards/claim`, `/missions/{id}/claim`, `/rewards/spin`
- **`profile`** — PUT `/user/profile`, avatar update, PIN change

---

## 5. DERIVED / MATERIALISED FIELDS

These are denormalisations — the authoritative source is the event log, the
field on the user doc is a cached read model. On rebuild / re-computation these
are the pairs to rebuild:

| Field on `users` | Rebuilt from | Re-compute trigger |
|---|---|---|
| `reward_coins` | `coin_ledger` SUM | on every `coin/award` write |
| `streak_days` | `transactions` latest date run | daily cron or on-txn-add |
| `money_score` | heuristic from spend/budget/settle history | nightly |
| `settlement_count` | `settlements` COUNT where user is payer/payee | on-settle |
| `reward_coins_redeemed` | `coin_ledger` SUM where type=redeem | on-redeem |

---

## 6. INVARIANTS (THINGS THAT MUST ALWAYS BE TRUE)

1. **Idempotency**: `coin_ledger` unique on `(user_id, action, dedupe_key)` —
   replaying a coin-award request awards nothing the second time.
2. **Atomic settle**: `settle_locks._id` unique → concurrent settles for the
   same pair fail-fast with 429.
3. **No orphan members**: when a user is hard-deleted, every group they were in
   has them `$pull`-ed from `members[]` via corrected `{user_id: uid}` filter.
4. **Soft-delete enforcement**: `core.auth.get_current_user` 401s on any doc
   with `deleted_at` set — so soft-deleted tokens die immediately without
   waiting for the 30-day purge.
5. **Razorpay idempotency**: `settlements.razorpay_order_id` is unique; replaying
   a signature returns the existing settlement doc.
6. **Debt never over-settles**: every settle endpoint calls
   `compute_outstanding_debt()` inside the lock; amount > outstanding + ₹0.50 → 400.
7. **Group IDOR shield**: every mutation on `split_expenses` / `split_groups`
   verifies caller is a group member; edit/delete further requires
   creator OR payer OR group-admin.

These invariants are locked by the 22-test adversarial pytest suite at
`/app/backend/tests/test_adversarial.py`. Any change to the schema or
mutation code must re-run that suite before merge.

---

## 7. HOW TO USE THIS DOC WHEN ADDING A FEATURE

1. Identify the entities you touch. Are they in §1? If not, add a row with PK/FK.
2. Does your feature create a new mutation? Define its "write-key" in §4 and
   check/cross each read-endpoint that should invalidate.
3. Does your feature add a derived field? Add it to §5 with its re-compute rule.
4. Does your feature introduce a concurrency or uniqueness constraint? Lock it
   with an invariant in §6 + a pytest in `test_adversarial.py`.
5. If your feature changes any of the 7 invariants, STOP and discuss first.

---

## 8. WHAT IS INTENTIONALLY **NOT** BUILT

- Server → client realtime push (websockets/SSE). Clients still poll or
  refetch-on-focus. If we need live multi-device sync in future, Socket.IO
  sitting beside the existing FastAPI is the recommended path.
- Client-side entity normalisation (Redux-style `byId/allIds`).
  Current SWR cache by URL key is the single source of truth client-side.
  Adding normalisation is a 2+ week refactor and the current app doesn't
  have the data complexity to need it yet.
- Cross-user visibility hooks (e.g. "B sees the expense A just added without
  refreshing"). Today this works via refetch-on-focus + invalidation on
  the writer's device; the viewer's device picks it up when the tab is
  re-focused or within the 30-s TTL window. Good-enough for MVP.


---

## 9. EVENT BUS (R3 — Round 30e)

In-process async event emitter at `backend/core/events.py`. Use this
for **background side-effects** that don't need to be in the primary
response path. Rules of engagement:

- Emitters fire-and-forget — `emit(name, **payload)` returns immediately.
- Handlers run concurrently on the asyncio loop (ordered by registration
  within a single event name only for concurrent fan-out).
- Handler exceptions are isolated — one bad subscriber can't poison the
  chain. Exceptions are logged with the handler name.
- NOT for user-facing response data — if the caller needs the result of
  a side-effect in the HTTP response, keep the logic inline.
- NOT for ordered workflows — if handler B must run after handler A,
  merge them; don't rely on registration order for correctness.

### Canonical events (from `core.events.Events`)

| Event name | Fired from | Payload |
|---|---|---|
| `transaction.created` | `POST /api/transactions` | `user_id, transaction_id, amount, category, type` |
| `transaction.updated` | _reserved_ | TBD |
| `transaction.deleted` | _reserved_ | TBD |
| `split.settlement_completed` | `POST /api/split/settle` | `payer_id, payee_id, amount, group_id, method, settlement_id` |
| `split.expense_created` | _reserved_ | TBD |
| `split.group_created` | _reserved_ | TBD |
| `coins.awarded` | _reserved_ | TBD |
| `budget.warning` | `_check_budget_breach` handler | `user_id, category, used, cap, pct, budget_id` |
| `budget.breached` | `_check_budget_breach` handler | same as above but `pct>=1.0` |
| `missions.claimed` | _reserved_ | TBD |
| `user.soft_deleted` | _reserved_ | TBD |
| `user.hard_deleted` | _reserved_ | TBD |

### Currently wired handlers (`backend/core/event_handlers.py`)

| Handler | Event | Side-effect |
|---|---|---|
| `_check_budget_breach` | `transaction.created` | Insert `budget_alerts` row at 80%/100% thresholds (idempotent per user × budget × threshold × month); also re-emits `budget.warning` / `budget.breached` |
| `_log_settlement` | `split.settlement_completed` | Observability log only |

### Adding a new handler

```python
# In core/event_handlers.py
from core.events import on, Events

@on(Events.SETTLEMENT_COMPLETED)
async def _push_notify_payee(event: dict) -> None:
    # Your new side-effect logic here
    ...
```

No other changes required — the import at server startup
(`from core import event_handlers`) auto-registers via decorator.

### Tests (F12, F13)

- `F12` — Verifies that `POST /transactions` with an 80%+ usage
  triggers a `budget_alerts` row via the event bus, and that
  repeating the same situation doesn't double-alert (idempotent).
- `F13` — Verifies that the primary write path `POST /transactions`
  returns 200 even when event handlers run (handler isolation).

---

## 10. WHAT IS STILL NOT BUILT (after R3)

- **R4 — Full client-side entity normalisation + realtime sync**
  (websockets, offline queue, conflict resolution).
  Decision: **declined** as of Round 30e. Reasoning:
    • 2-4 weeks of focused architecture work with regression risk
      across every screen.
    • Current reactive cache graph (R2) + refetch-on-focus gives
      **~95% of the "live UI" user experience** at a fraction of the risk.
    • MongoDB is not a realtime sync backbone — building true real-time
      requires either Mongo change-streams + Socket.IO OR a move to a
      purpose-built realtime store (Firestore, Supabase).
    • The 22 → 24 passing adversarial tests we just shipped would all need
      re-verification against a new state layer. Very likely to regress.
  If R4 ever becomes a priority, the recommended approach is:
    1. Introduce Socket.IO co-located with FastAPI (single process is fine).
    2. On each relevant mutation, backend emits a server event to the
       user's room (e.g. `user:{id}`, `group:{id}`).
    3. Frontend subscribes and forwards the event into
       `invalidateAfter(...)` from the existing cache graph.
    4. Only ~150 LOC of new code; no Redux/RTK rewrite needed.
