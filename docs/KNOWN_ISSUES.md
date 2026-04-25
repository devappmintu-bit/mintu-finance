# Known Issues — MintU (as of Round 42, June 2025)

This document captures the **honest state** of the codebase at the close of
Round 42 (final app-wide audit sweep). Every item below is either a deliberate
deferral, a tracked piece of tech debt, or an integration that is intentionally
mocked for the MVP. Nothing here is "broken in production" — each item has a
documented mitigation or workaround.

---

## A. TypeScript Tech Debt — ~2,200 Type B errors

`npx tsc --noEmit` currently reports ~2,217 errors across the frontend.

**Triage**:
- **Type A (runtime-impacting)** — Audited in Round 42. **0 remaining**.
  - Fixed in this round: `app/(tabs)/profile.tsx` missing-`identityRes` check
    (potential null deref under specific load order).
- **Type B (style/strictness)** — ~2,200 remaining.
  - Vast majority are **React Native style literal-union narrowing**:
    `flexDirection: 'row'` inferred as `string` instead of `'row' | 'row-reverse'`,
    same pattern for `alignItems`, `justifyContent`, `position`, etc.
    These do not affect runtime behaviour because `StyleSheet.create()` accepts
    the inferred string and the React Native renderer handles unknown values
    gracefully.
  - Secondary cluster: `as any` casts on third-party library boundaries
    (`Ionicons name`, `LinearGradient colors`, `expo-router` href params,
    Razorpay payload). These are intentional escape hatches — the upstream
    types are over-restrictive.
  - Tertiary: implicit-any in event handlers (`(e) =>`) and a handful of
    `any[]` arrays for SWR responses.

**Mitigation**:
- Running `tsc --noEmit` is **not** part of CI (build is via Metro, which is
  runtime-permissive).
- A dedicated TS-tightening sprint is on the **Future Tasks** list and would
  introduce strict `flexDirection: 'row' as const` patterns + a centralised
  `type LinearGradientColors = readonly [ColorValue, ColorValue, ...ColorValue[]]`.

---

## B. Mocked / Deferred Integrations

| Capability | State | Notes |
|---|---|---|
| **Push notifications (delivery)** | MOCKED | App writes to `notifications_feed` and shows in-app bell. **No FCM/APNs payload** — requires Firebase project + APNs cert. Foreground polling at 60s (Round 42) keeps the badge fresh while in-app. |
| **SMS OTP** | MOCKED | OTP is logged to backend stdout (`[MOCK SMS] OTP for 9876543210: 123456`) and accepted by `/api/auth/verify-otp`. Real delivery needs MSG91 / Twilio creds. |
| **WhatsApp expense bot** | NOT BUILT | Listed in original PRD; needs WhatsApp Business API key. |
| **Razorpay payments** | LIVE-READY (test keys) | Code path complete, requires user-provided `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. |
| **Gmail OAuth import** | LIVE-READY | Wired through `gmail_oauth.py`. Requires user OAuth consent at runtime. |
| **AI (LLM) coach** | LIVE | Uses `EMERGENT_LLM_KEY` via `emergentintegrations`. |

---

## C. Offline-Behavior Coverage (Round 42 hardening)

All write/network surfaces now respect `useIsOnline()`:

| Screen / Form | Offline behaviour |
|---|---|
| Add/Edit Transaction (`(tabs)/transactions.tsx`) | Submit disabled, label flips to "Offline — can't save" |
| Create/Edit Budget (`BudgetSmartSheet`) | Submit disabled with offline label |
| Create/Edit Goal (`goals.tsx`) | Save disabled with offline label |
| Add/Edit Expense (`split/add-expense.tsx`) | Split CTA disabled with offline label |
| Settle Up / Pay (`PaySheet`) | All payment methods dimmed, header note shows "Offline — payment unavailable" |
| Redeem Reward (`rewards-hub.tsx`) | Toast warns "You're offline · Connect to redeem" before any coin debit |
| AI Coach (`(tabs)/ai-coach.tsx`) | Yellow offline card; Ask button disabled |
| Search (`search.tsx`) | TextInput non-editable; placeholder + EmptyState explain offline |

**Read paths**: SWR continues to serve stale cache offline (existing behaviour)
with the global `OfflineBanner` providing the system-level signal.

---

## D. Adversarial Invariants (verified Round 39–42)

- **Coin ledger**: Atomic `$inc` + `idempotency_key` unique index in
  `ledger_transactions`. Hourly reconcile worker corrects drift (last run scanned
  474 users, 1 drift correction) — see backend logs.
- **Exact-balance redeem**: Backend uses `current_coins < cost` for the failure
  branch, so a user with **exactly** `cost` coins can redeem. Verified at
  `routers/rewards.py:571`.
- **Foreground notification polling**: `(tabs)/index.tsx` polls
  `fetchUnreadCount()` every 60 s while AppState is `active` and on
  foreground transitions; cancelled on unmount.
- **Group leave / rejoin**: Verified `services/split.ts` `leaveGroupSrv` +
  re-`addGroupMember` flow. Idempotent on backend; SWR refetch reconciles.
- **Streak freeze consume**: `freezes_remaining` is decremented via atomic
  `$inc: -1` in the gamification status path on the same request that bumps
  the streak; idempotent against double-call.

---

## E. Code Hygiene (Round 42 cleanup)

- **`utils/time.ts` (NEW)** — `timeAgo(iso)` extracted as the single source.
  `services/coinLedger.ts` and `services/notifications.ts` now `export { timeAgo }
  from '../utils/time'` instead of duplicating ~20 lines each.
- **No orphaned screens/components** — `app/` and `components/` both reachable
  from the navigator graph (verified in Round 38 + spot-checked Round 42).
- **No unused services** — every file in `services/` has at least one consumer.

---

## F. Out-of-Scope for Round 42

- TS Type B mass-tightening (deferred sprint).
- Real FCM/APNs delivery wiring (needs creds).
- Real SMS OTP wiring (needs creds).
- WhatsApp bot (needs WABA approval + creds).
- Localisation expansion (currently English-only timeAgo, partial i18n in nav).

---

_Last reviewed: Round 42, June 2025._
