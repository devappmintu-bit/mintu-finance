# MintU — Track A Audit Report (Read-Only)
**Date**: Apr 23 2026
**Scope**: Full system discovery + ranked risk register, zero code changes.

---

## 1. SYSTEM MAP — AT A GLANCE

### Frontend (Expo Router)
| Layer | Count | Notes |
|---|---|---|
| Screens (`app/**/*.tsx`) | **34** | 4 bottom tabs + 30 stack screens |
| Components | **115** | Organised by domain (budget/home/leaderboard/premium/profile/rewards/split/transactions/ui) |
| Services (API wrappers) | **9** | `budgets / gmail / goals / premium / rewards / split / transactions / user / types` |
| Hooks | **6** | `useSwr, useAppLock, useFocusRefresh, useHaptic, usePhoneContacts, usePushNotifications` |
| Stores (Zustand) | **3** | `authStore, langStore, themeStore` |
| Util modules | **11** | `api, brand, haptics, i18n, lockManager, makeStyles, premium, share, swrGet, theme, version` |
| Total TS LOC (app+components+store+hooks+services+utils) | **~29 500** | |

**Navigation tree (top-level)**
```
/ (SplashIndex)
├── /onboarding
├── /auth
├── /unlock
├── /(tabs)/
│   ├── index  (home)
│   ├── transactions
│   ├── ai-coach   (href:null — opened via raised puck)
│   ├── budget
│   ├── split
│   ├── insights   (href:null)
│   ├── profile    (href:null)
│   └── rewards    (href:null)
├── /premium, /premium-hub, /premium-reports, /premium-activated
├── /money-school, /rewards-hub, /mystery-box, /goals
├── /leaderboard, /yearly, /about
├── /gmail, /gmail-connected
├── /split/add-expense, /split/add-member
├── /join/[id]       (deep link to join group)
├── /legal/[page]
└── /profile/delete-account
```

### Backend (FastAPI + Motor/MongoDB)
| Layer | Count | Notes |
|---|---|---|
| Routers | **44** | Biggest: split_settle (1080), rewards (918), analytics (853), server.py (769) |
| REST endpoints | **169** | Across all routers |
| DB collections (live) | **38** | users, transactions, split_*, settlements, coin_ledger, gmail_*, ai_*, etc. |
| Middleware | 3 | SecurityHeaders → RateLimit (IP) → AuditLog → FastAPI |
| Background workers | 2 | News refresher, Gmail sync (15-min) |

### Data flow (single request)
```
Mobile client
  └── axios (utils/api.ts)
        ├── request interceptor: attach Bearer token
        ├── response interceptor: 401→lock, 429/5xx→retry×2, dedup, TTL cache
  └──── /api/* → FastAPI
        ├── SecurityHeaders → RateLimit (IP+auth-scoped, 30/min auth, 1000/min else)
        ├── AuditLog (hashes IP, stores user_id/path/ms)
        ├── Router (e.g. routers/split_settle.py)
        │   ├── Depends(get_current_user)   ← core/auth.py (hardened)
        │   └── Motor → MongoDB
        └── Response → (retry/redrive) → React screen
```

---

## 2. TOP-20 RANKED RISK REGISTER

Severity key: **S0** = security exploit / data loss · **S1** = broken business logic ·
**S2** = perf / consistency · **S3** = code-health / debt.
Effort key: XS ≤1h · S 2-4h · M 1 day · L 2+ days.

| # | Sev | Area | Finding | Exploit / Impact | Fix effort | File(s) |
|---|---|---|---|---|---|---|
| 1 | **S0** | Backend · Split expenses | `DELETE /api/split/expenses/{id}` and `PUT /api/split/expenses/{id}` have **no membership or creator check**. Any logged-in MintU user can permanently edit or delete ANY expense in ANY group by guessing/knowing the ObjectId. | Full IDOR — rewrite someone's bill, drop evidence, poison debts, set `paid_by=victim` to fabricate owing. | **S** | `routers/split_expenses.py` L236–282 |
| 2 | **S0** | Backend · Razorpay settle | `POST /api/split/verify-settle-payment` is not idempotent. Replaying the same `(order_id, payment_id, signature)` inserts a **duplicate settlement** each time, reducing the payer's debt multiple times and minting extra reward coins per replay. Also skips `compute_outstanding_debt`, so after-the-fact Razorpay races can over-credit. | Replay → free debt clearance + coin farming; race → negative balance. | **S** | `routers/split_razorpay.py` L259–326 |
| 3 | **S0** | Backend · Auth duplicate | `server.py` L348 defines a second `get_current_user` **without** the dead-token DB existence check. Currently dead code (no router imports it), but a landmine: any future `from server import get_current_user` regresses Round 29 fix. | Silent regression risk of the account-deletion 401 guarantee. | **XS** (delete) | `server.py` L348–364 |
| 4 | **S0** | Backend · Group members | `POST /api/split/groups/{id}/members` **auto-creates placeholder user docs** for unregistered phones (L134–145) — older behaviour inconsistent with `POST /split/groups` which correctly uses `pending_invites`. Attacker can spam-create millions of phantom users under any phone they control. | User-table pollution, denial of sign-up ("phone already registered"), score-leaderboard noise. | **S** | `routers/split_groups.py` L110–155 |
| 5 | **S0** | Backend · Account delete | `delete-account` hard mode's `$pull {members: user_id}` targets `split_groups` **incorrectly** — members are stored as objects `{user_id, name, phone}`, not strings, so the deleted user **stays embedded as a group member** after account purge. Also several collections in the list (`push_tokens`, `ai_coach_messages`, …) don't match live collection names — orphaned data remains. | GDPR/privacy: "right-to-erasure" incomplete; deleted users visible in others' group rosters forever. | **S** | `routers/user.py` L498–523 |
| 6 | **S0** | Backend · Soft-delete bypass | `soft` delete sets `deleted_at` on user doc but **no hard-purge worker runs**, AND `get_current_user` only checks existence, not `deleted_at`. User "deletes" account → token still works → feels like deletion was undone. | Product promise broken — soft-delete is effectively inert. | **S** | `routers/user.py` L470–479; `core/auth.py` L43 |
| 7 | **S1** | Backend · Coin dedupe race | `/coins/award` dedupe does `find_one` → `insert_one` without a unique index on `(user_id, action, dedupe_key)`. Two concurrent requests with the same key can both pass the find-check and both insert → both award. | Small-window double-award of coins. | **XS** (add unique index) | `routers/analytics.py` L311–338 + startup index creation in `server.py` L730 |
| 8 | **S1** | Backend · Reminder pair key | `POST /split/remind` throttle key is `(sender, recipient, group_id)`. When `group_id=None` (1-on-1 debt) the key collapses to `(sender, recipient, None)` — still OK, but the reminder **isn't auto-dismissed** when the recipient settles; only `mark-paid-offline` dismisses reminders from the debt direction. UPI/Razorpay settlements leave stale pending reminders forever. | Spam banners after payment; false "X reminded you" notifications. | **XS** | `routers/split_settle.py` L700–733; Razorpay+UPI settle paths |
| 9 | **S1** | API contract | `services/transactions.ts` calls `/sms/parse` — **endpoint does not exist** on the backend (real ones are `/sms/bulk-parse` or `/transactions/parse-sms`). Silent 404 at runtime. Demonstrates service-layer drift. | Feature unusable; silent breakage. | **XS** | `services/transactions.ts` L32 |
| 10 | **S1** | State / SWR migration | `useSwr` migration is **partial** — home tab (`app/(tabs)/index.tsx`) still does manual `api.get` fan-out of 5+ endpoints (home/snapshot, alerts/smart, reports/weekly, ai/predict, coins/status, news/india-finance). 22 files call `api.get` directly, bypassing SWR cache → refetch storms on focus. | Performance: 2–5× redundant network; also cache-invalidation holes after deletes. | **M** | `app/(tabs)/index.tsx` L100–155 and 21 others |
| 11 | **S1** | Frontend polling | `components/GroupChat.tsx` polls `/messages` every 5s while mounted — aggressive on battery/data. Should use long-poll / WebSocket, or at minimum backoff when tab blurred. `SocialFeedTicker`, `EventsBanner`, `MissionsEngine` all use `setInterval` timers that keep running after unmount in edge cases (need strict cleanup audit). | Battery drain, 1 req/5s × 100 users = 20 req/s baseline from chats alone. | **S** | `components/GroupChat.tsx` L87, `components/rewards/*`, `components/profile/MissionsEngine.tsx` |
| 12 | **S2** | Backend · N+1 | `/api/split/balances` (split_settle.py L106) loads **all groups → for each group loads expenses → then all settlements separately**. For a user in 20 groups with 100 expenses each it's 40+ round-trips. Similar N+1 in `/split/activity` (L870). | O(groups) DB round-trips per call; poor scale beyond 100 users. | **M** | `routers/split_settle.py` L114–170, L870–1013 |
| 13 | **S2** | Backend · Cache miss | `split_balances_cache` collection exists (created in indexes) but **no code writes to it**. Dead cache — balances recomputed from scratch every call. | Leaves a clear perf optimisation unshipped. | **S** | (search: no producers for `split_balances_cache`) |
| 14 | **S2** | Frontend · Theme re-mount | `app/_layout.tsx` L125 uses `key={resolvedTheme}` to remount the entire Stack on theme toggle. Works, but **every screen loses its scroll position and in-flight network state** on theme switch. | Jarring UX for a cosmetic toggle; easy to fix with a theme context + no-remount. | **M** | `app/_layout.tsx` L125 |
| 15 | **S2** | Frontend · Duplicate caches | 3 caching layers coexist: (a) in-memory `cache`/`deduplicatedGet` in `utils/api.ts`, (b) SWR cache in `utils/swrGet.ts`, (c) server-side `db.rate_limits`/`_CACHE` in `server.py`. Some endpoints pass through 2, some through 1, some through 0 → inconsistent staleness and hard-to-reason invalidations. | Stale UI after mutations (esp. after settle/delete). | **M** | `utils/api.ts`, `utils/swrGet.ts` |
| 16 | **S2** | Error handling | No global error boundary for **API** errors — axios errors bubble up per-screen; many screens swallow with `.catch(() => null)` silently. User never sees "something went wrong". `components/ErrorBoundary.tsx` exists but only covers render errors. | Silent failures are widespread. | **M** | All screens using `.catch(() => ...)` |
| 17 | **S2** | Backend · Middleware persistence | `RateLimit` middleware writes to MongoDB (`db.rate_limits`) on every request → **DB write per API call**. Under load, hot-path writes to Mongo are unnecessary; an in-process LRU with periodic Mongo flush (or Redis) is an order of magnitude cheaper. | DB write pressure scales linearly with RPS. | **M** | `server.py` L98–140 |
| 18 | **S3** | Backend · server.py bloat | `server.py` is 770 LOC and still owns auth helpers (`hash_password`, `create_token`, `get_current_user` dupe), validation scrubber, duplicate pydantic re-exports, AI helpers. Should be a pure bootstrap file. | Code-health; easy circular-import traps (seen in `routers/auth.py` lazy imports). | **M** | `server.py` entire |
| 19 | **S3** | Services drift | `services/*.ts` is the declared "typed API layer" but components/screens still call `api.get` directly in 22 files. Half-migration creates "which path is canonical?" ambiguity for future contributors. | Onboarding friction + duplicate bug surface. | **M** | All screens/components using `api.*` directly |
| 20 | **S3** | Data model · splits dual-write | Settlements are stored in both `db.settlements` and `db.split_settlements` in different code paths (see delete-account targeting both); expenses stored in `db.split_expenses` (active) but `db.splits` collection also exists and is targeted by delete-account — evidence of **stale dual collections**. | Confusing data model, risk of partial reads. | **S** (investigate + consolidate) | Multiple |

### Positive findings (keep)
- ✅ IP-based rate limiter + separate auth bucket (30/min).
- ✅ `core/auth.get_current_user` is correctly hardened (dead-token DB check + ObjectId regex).
- ✅ `split/settle`, `split/partial-settle`, `split/mark-paid-offline`, `split/settle-with-rewards` all guard phantom settle + over-amount.
- ✅ `transactions` PUT/DELETE correctly scope to `user_id`.
- ✅ `payment_methods` PUT/DELETE are scoped to `_id: user_id` — no IDOR.
- ✅ Phone validation uses Pydantic `field_validator(mode=before)` — rejects dict/list/int/null.
- ✅ OTP brute-force has both per-OTP attempt cap AND per-phone 15-per-hour cap.
- ✅ `db.audit_logs` populated for every `/api/*` hit with hashed IP and user_id.
- ✅ Adversarial regression pytest suite (14 tests) passing.
- ✅ `utils/swrGet.ts` is solid — in-memory + AsyncStorage two-tier, clearSwrCache used on delete.

---

## 3. SUGGESTED FIX ORDER (RISK-WEIGHTED)

### Phase H0 — Security plug (≤ 4 hours, zero user-visible change, HIGH priority)
Close the 3 S0 IDORs and the landmine:
1. **#1** Add `group.members.user_id == caller` check on both PUT & DELETE of `/split/expenses/{id}`. Also verify `existing.created_by == caller` OR admin for DELETE (match group rules).
2. **#2** Make `/split/verify-settle-payment` idempotent — add unique index on `payment_orders.razorpay_order_id`, check `db.settlements.find_one({razorpay_order_id})` before insert; also call `compute_outstanding_debt` before recording.
3. **#3** Delete the duplicate `get_current_user` in `server.py` L348; leave the hardened copy in `core/auth.py` as the single source of truth.
4. **#4** Change `POST /split/groups/{id}/members` to use `pending_invites` for unregistered phones (mirror the `POST /split/groups` contract).
5. Add 4 adversarial pytest tests locking each fix.

### Phase H1 — Data-integrity (1 day)
6. **#5** Fix `delete-account` — use `$pull {members: {user_id: uid}}` for `split_groups`; reconcile target collection list with the real 38 collections seen in code.
7. **#6** Either: make `get_current_user` reject docs with `deleted_at` (immediate soft-delete enforcement), OR run a scheduled worker that hard-purges after 30d; document whichever.
8. **#7** Add unique sparse index on `coin_ledger(user_id, action, dedupe_key)` + a try/except on duplicate-key insert → graceful "already_awarded".
9. **#8** Auto-dismiss reminders from both Razorpay + UPI settle paths (mirror `mark-paid-offline`).
10. **#9** Fix `services/transactions.ts` parse-sms endpoint (decide correct backend path, update one side).

### Phase H2 — State + performance (2–3 days)
11. **#10** Migrate home tab (`app/(tabs)/index.tsx`) to `useSwr` for its 5 endpoints; kill the parallel `api.get` fan-out. Then sweep the remaining 22 `api.get` sites.
12. **#11** `GroupChat` polling → switch to: (a) 10s baseline + 30s when app is in background, (b) visibilityChange listener; OR scope a simple long-poll endpoint.
13. **#12** Rewrite `/split/balances` as a single aggregation pipeline (and do the same for `/split/activity`). Populate `split_balances_cache` with invalidation on settle/expense-create.
14. **#15** Collapse the two axios caches (`cache` in `api.ts` + SWR) into one. Keep SWR as canonical; delete `cachedGet`/`deduplicatedGet` legacy helpers or layer them inside SWR.

### Phase H3 — Code-health & UX (1 day)
15. **#14** Theme change without Stack remount — move theme into React Context/Zustand subscription that re-runs `makeStyles` without unmount.
16. **#18** Split `server.py` into `bootstrap.py` (app + middleware + lifespan) and remove the AI helpers/password helpers into `core/`.
17. **#19** Complete service-layer migration — add lint rule / codemod so new screens never call `api.*` directly.
18. **#20** Audit + consolidate `db.splits` vs `db.split_expenses`, `db.split_settlements` vs `db.settlements`. Drop the stale one after a 1-release grace period.

### Phase H4 — Error + observability (0.5 day)
19. **#16** Add a global API-error interceptor that shows a single throttled toast for 5xx, distinguishes network-down vs server-error, and logs to a dedicated `error_logs` Mongo collection.
20. **#17** Replace Mongo-backed rate-limit with an in-process sliding window + periodic Mongo flush (or Redis if later). Keep the DB fallback for multi-pod deploys.

---

## 4. ARCHITECTURE DIAGRAM — DESIRED TARGET

```
                ┌───────────────────────────────────────────────┐
                │                Mobile (Expo)                  │
                │                                               │
                │   screens ──► services (typed) ──► axios      │
                │                    │                          │
                │                    ▼                          │
                │            useSwr (single cache)              │
                └───────────────────────┬───────────────────────┘
                                        │ HTTPS
                 ┌──────────────────────▼──────────────────────┐
                 │  FastAPI                                    │
                 │  ├── SecurityHeaders                        │
                 │  ├── RateLimit (in-proc LRU + Redis)        │
                 │  ├── AuditLog                               │
                 │  └── Routers (thin, 1 file per domain)      │
                 │         │                                   │
                 │         ▼                                   │
                 │  core/auth (1 get_current_user)             │
                 │  core/db   (motor client)                   │
                 │  core/*    (shared helpers only)            │
                 └──────────────────────┬──────────────────────┘
                                        ▼
                 ┌────────────┐  ┌──────────────┐  ┌────────────┐
                 │  MongoDB   │  │  Razorpay    │  │  Emergent  │
                 │  (38 col.) │  │  (payments)  │  │  LLM Key   │
                 └────────────┘  └──────────────┘  └────────────┘
```

---

## 5. KNOWN LIMITATIONS (OUT OF SCOPE FOR TRACK A)

- No per-screen UX audit (that was Round 28 for Split). Budget/Home/Rewards UX not re-walked.
- Perf profiling on real device not done (no Flipper/React DevTools session).
- No penetration test against Razorpay live webhook signature.
- Accessibility (VoiceOver / TalkBack) review not included.

---

## 6. WHAT THIS AUDIT PRODUCED (THIS DOCUMENT)

**Files touched**: 1 (this doc).
**Code changes**: 0.
**Tests added**: 0.
**Endpoints probed**: 169 mapped, ~15 read in depth.
**Time**: one focused session.

You now have a risk-weighted plan. Pick a phase (H0 recommended first) and I'll execute with tests.
