# What Was Built — MintU (Rounds 31 → 42)

A condensed shipping log for the rounds that took MintU from "feature-complete
beta" to **production-grade fintech app with adversarial invariants**.
Each round closes a specific category of risk; this doc is the receipt.

---

## Round 31 — Action-First UX Foundation
- Replaced static "View" cards with action-first quick-action bar on Home.
- Centralised theming (`utils/theme.ts`, `utils/makeStyles.ts`).
- Skeleton loaders for all primary tabs.

## Round 32 — Split (Splitwise replacement) v1
- Group create/edit/delete, member CRUD, expense split (equal/exact/shares).
- Settle-up flow: UPI deep-link, cash-marked, partial settle.
- Reminders banner + reminder dispatch endpoint.

## Round 33 — Premium Funnel & Coin Economy
- `CoinRedeemPanel` — context-aware coin redemption on Split / Premium / Rewards.
- Premium teaser cards, soft paywall, plan comparison.
- Mystery box, daily quests, pulse CTAs.

## Round 34 — Reliability Pass #1
- Home `loadError` state + retry banner (no more silent empty widgets).
- SWR-driven cache layer (`utils/swrGet.ts`) with TTL + stale-while-revalidate.
- AICoachOneTap quick action.

## Round 35 — Optimistic UI + Animation Polish
- Optimistic mutations across Goals, Rewards, Split (rollback on failure).
- Native Animated micro-interactions: coin tick, streak flame, confetti bursts.
- ScoreBoostModal, ShareWeeklyWinModal.

## Round 36 — Inline Validation + Discoverability
- Blur-validation on Budget amount, Goal target, Goal saved (per-field errors).
- Explicit "Refresh insights" button on AI Coach (replaces non-discoverable
  pull-to-refresh on a non-list screen).
- Toast unification, haptic strategy.

## Round 37 — Notifications + Search
- `notifications_feed` collection, in-app feed screen, bell badge with unread
  count, mark-read endpoint.
- Unified `/api/search` (transactions / budgets / goals / groups), debounced
  client with recent-searches AsyncStorage cache.

## Round 38 — Accessibility + Edge Cases
- Screen-reader labels on progress rings ("47 percent of goal completed").
- Over-limit warning banner on Edit Budget.
- Keyboard-shouldPersistTaps wired on every form-bearing ScrollView.

## Round 39 — Immutable Ledger
- Introduced `ledger_transactions` collection (append-only): `{user_id, amount,
  type, source, idempotency_key, balance_after, created_at}`.
- All coin movements (award / spend / refund) go through atomic ledger writes.
- Backfill script for legacy users.
- Hourly reconcile worker.

## Round 40 — Offline Detection + Boundaries
- `@react-native-community/netinfo` integration → `hooks/useIsOnline.ts`.
- Global `<OfflineBanner />` in root layout.
- Granular `<ErrorBoundary />` per tab via `withTabBoundary`; root boundary on
  `_layout.tsx`.

## Round 41 — Adversarial Invariants
- Affordability gating: reward cards dim + "Need X more coins" copy when user
  can't afford (instead of letting the tap fail loudly).
- Marketplace claim double-tap guard (`claimingMarket: Set<string>`).
- Backend `HTTPException` shape standardised (`detail` always string or list of
  `{msg}`).
- Round 41 exception-handler test suite (`round41_exception_handler_test.py`).

## Round 42 — Final App-Wide Audit Sweep
- **B1**: Offline form submit on every write surface — Add/Edit Transaction,
  Budget, Goal, Add/Edit Expense, Settle Up, Redeem Reward (toast guard +
  CTA disable + label flip).
- **B2**: AI Coach offline card (yellow) + Ask button disabled.
- **B3**: Search input non-editable offline; clear EmptyState messaging.
- **C**: Five flow traces audited inline:
  1. Foreground notification badge polling — added 60 s `setInterval` while
     `AppState === 'active'` (gap closed in Round 42).
  2. Exact-balance redeem — confirmed `current_coins < cost` on backend allows
     redemption at exactly `cost` (no off-by-one).
  3. Tx edit budget update — verified SWR revalidation hits both `/budgets/live`
     and `/stats/overview` after `updateTransaction`.
  4. Group member leave/rejoin — re-`addGroupMember` is idempotent; balances
     view filters by `members[]` array on every refetch.
  5. Streak freeze consume — `freezes_remaining` decrement is atomic with the
     streak bump in `gamification/status`.
- **D**: Dead-code & dedupe — `utils/time.ts` extracted; `services/coinLedger.ts`
  and `services/notifications.ts` now re-export instead of duplicating.
- **E**: Documentation — `KNOWN_ISSUES.md` (new), `WHAT_WAS_BUILT.md` (this
  file), `SYSTEM_MAP.md` updated.

---

## Tech Stack at Close of Round 42

- **Frontend**: Expo SDK (file-based routing, `app/`), React Native, SWR
  (custom), Zustand stores, React Navigation tabs+stack, `react-native-svg`,
  `react-native-reanimated`-free (intentional — Native Animated only),
  `expo-haptics`, `expo-linear-gradient`, `@react-native-community/netinfo`.
- **Backend**: FastAPI (Python 3.11), Motor (async MongoDB), Pydantic v2,
  Uvicorn + watchgod for dev. Hourly + 6-hour cron workers via lifecycle hooks.
- **DB**: MongoDB 7 — collections: `users`, `transactions`, `budgets`, `goals`,
  `split_groups`, `split_expenses`, `ledger_transactions`, `notifications_feed`,
  `gmail_messages`, `news_articles`, plus auth/idempotency caches.
- **3rd-party (live)**: OpenAI/Gemini via `EMERGENT_LLM_KEY`,
  `expo-notifications` (in-app delivery only), Razorpay (test mode), Gmail
  OAuth.
- **3rd-party (mocked)**: SMS OTP (stdout), Push delivery (in-app feed only),
  WhatsApp bot (not built).

---

## What "Done" Means

Round 42 closes the audit. No new features are required to ship the MVP.
Remaining work is enumerated in `KNOWN_ISSUES.md` Section F and is
**explicitly out of scope** for the audit close.

_Audit closed: Round 42, June 2025._
