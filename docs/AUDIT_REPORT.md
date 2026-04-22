# MintU — Round 1 Audit Report

**Date:** Apr 22, 2026
**Scope:** Full codebase inventory, dead code removal, architecture documentation.
**Risk profile:** Zero-regression — all deletions verified against import graph; backend untouched.

---

## 1. System Architecture (logical)

```
┌─────────────────────────────────────────────────────────────┐
│                     Expo Router (file-based)                 │
│  /app/(tabs)/*  · /app/profile/*  · /app/auth/* · /app/... │
└───────────────┬──────────────────────────────────┬──────────┘
                │                                  │
          ┌─────▼──────┐                    ┌──────▼───────┐
          │  React UI  │◄───zustand state──►│ AsyncStorage │
          │ components │                    │ + SecureStore│
          └─────┬──────┘                    └──────────────┘
                │ axios (utils/api.ts, Bearer JWT)
                ▼
     ┌───────────────────────────────────────┐
     │        FastAPI (port 8001)            │
     │  /api/auth · /api/user · /api/txn    │
     │  /api/profile · /api/goals · /api/ai │
     │  /api/split · /api/gamification ...  │
     └──────┬────────────────────────┬───────┘
            │                        │
      ┌─────▼─────┐           ┌──────▼──────┐
      │  MongoDB   │           │ 3rd-party   │
      │ (mongo-motor)         │ · Gmail API │
      │            │           │ · Razorpay  │
      │            │           │ · OpenAI    │
      │            │           │   (Emergent)│
      └────────────┘           └─────────────┘
```

### Frontend modules
- **`/app/(tabs)/`** — 5 primary tabs: Home (`index.tsx`), Transactions, MintU-AI (ai-coach), Budgets, Split, Profile.
- **`/app/*.tsx`** — Deep routes: `goals`, `yearly`, `rewards`, `mystery-box`, `premium`, `gmail`, `money-school`, etc.
- **`/components/`** — Organized by domain: `home/`, `profile/`, `premium/`, `ui/`, `budget/`, `split/`, `auth/`.
- **`/store/`** — zustand stores: `authStore`, `langStore`.
- **`/utils/`** — Shared utilities: `theme.ts` (design tokens), `api.ts` (axios instance), `share.ts` (viral share helper), `makeStyles.ts`, `i18n.ts`.
- **`/services/`** — API wrappers: `user.ts`, `types.ts`.
- **`/hooks/`** — Custom hooks including `usePushNotifications`.

### Backend modules
- **`/routers/`** — 25+ routers. Key: `auth`, `user`, `profile_identity`, `profile_engine`, `goals`, `splits`, `transactions`, `budgets`, `rewards`, `ai_coach`, `gmail_oauth`, `home_bundle`, `analytics`, `premium`.
- **`server.py`** — FastAPI app, MongoDB indexes, workers (news cache, Gmail sync).

### State flow
- **Auth** — token persisted in AsyncStorage → injected by `utils/api.ts` axios interceptor.
- **Avatar** — Zustand `useAuthStore.avatar` (base64 string) + server-side persistence via `/api/user/avatar` POST/DELETE. Global reactivity: Home + Profile both subscribe to the same store.
- **Theme** — mutable `COLORS` object + `useSyncExternalStore` for reactive components. Flips `light|dark|amoled` via `applyTheme()`.

---

## 2. Dead Code Purge (Round 1B) — ✅ Complete

20 orphan components moved to `/tmp/dead_components_bak/` (safe rollback if needed).
`/app/frontend/components/profile/`: **39 → 19 files**.

| Deleted                    | Replaced by (live)                    |
|---------------------------|---------------------------------------|
| `ProfileHero.tsx`, `V2`, `V3` | `ProfileHeroV4.tsx`                |
| `WeeklyChallenge[Calm].tsx`  | `BeatLastWeek.tsx`                  |
| `AccordionSection`, `SettingsGroup` | `SettingsList` + `SettingsListItem` |
| `TodayCard`                 | `MissionsEngine`                     |
| `Premium[Upsell\|Calm].tsx` | `PremiumConversionFunnel`            |
| `ShareScoreCard`            | `WeeklyWinCard` + `ShareWeeklyWinModal` |
| `FinancialSnapshot`, `ProgressionStrip`, `BadgesSection` | merged into hero / progress inline |
| `RewardsHub`, `CompactLeaderboard`, `ReferralDashboard`, `InviteEarnStrip` | moved to `/rewards` route / premium surface |
| `InsightMinimal`, `InsightsCard` (profile dupe) | `home/InsightsCard.tsx` (live) |
| `AIOrb`, `AIOrbSheet`       | Removed per user feedback             |

**Also cleaned:** unused imports in `profile.tsx` (`useRef`, `ActivityIndicator`, `Platform`, `fetchUpi`).

---

## 3. Known Issues & Roadmap

### 🔴 Critical (none open)
All identified Critical bugs from previous rounds are fixed:
- Avatar CUD endpoints (27/27 tests ✅)
- Profile Identity / Goals CRUD (52/52 tests ✅)
- Stray "0" render bug on AI Coach (fixed in last round)

### 🟠 High-value refactors (recommended)
1. **Split `profile.tsx`** — 540 LOC, 5+ inline modals. Extract `AchievementsModal`, `PaymentMethodsModal`, `PreferencesModal`, `NotificationsModal`, `EditNameSheet`, `LanguageSheet`.
2. **Unify button/card primitives** — `<Button variant=>`, `<Card variant=>` replacing NeonButton / InsightCard / gradient-card hand-rolls.
3. **Unified `<Sheet>` primitive** — 4 bottom-sheet implementations today (auth, photo, share, logout). Single abstraction would save ~200 LOC.

### 🟡 UX polish
- Skeleton states on Home + Profile first render (currently blank until API responds).
- Error boundary at `_layout.tsx` root — silent `.catch(() => {})` pattern hides real failures.
- Auth-expired toast (silent 422 spam when JWT expires on web).

### 🟢 Performance
- `React.memo` audit — MissionsEngine, BeatLastWeek, InsightCard, NeonButton.
- SWR / React Query migration — especially for `/api/home/bundle`, `/api/profile/identity` (frequent refetches).
- Bundle analysis: current ~2500 modules via Metro → target <2200 after dead-code purge (already ~200 modules lighter post-Round-1).

### 🔵 Security / Observability
- Sentry integration at `_layout.tsx` + backend middleware.
- Backend rate-limit audit for `/auth/send-otp` (seen 400 Bad Request after 3 OTP requests — good, but undocumented).
- Avatar size guard: 700KB base64 — consider server-side JPEG recompress for aggressive users.

### ⚪ 3rd-party (blocked on user keys)
- Push notifications (FCM / APNs)
- Real SMS OTP (MSG91 / Twilio)
- WhatsApp expense bot

---

## 4. Deliverables produced this round

- ✅ `/app/docs/DESIGN_SYSTEM.md` — canonical token + brand reference.
- ✅ `/app/docs/AUDIT_REPORT.md` — this file.
- ✅ 20 dead files removed (rollback stash at `/tmp/dead_components_bak/`).
- ✅ `profile.tsx` import cleanup (4 unused imports).
- ✅ `profile.tsx` JSDoc updated to reflect current structure.

---

## 5. Recommended next rounds

| Round | Scope                              | Time  | Risk   | ROI  |
|-------|------------------------------------|-------|--------|------|
| **2A** | Split `profile.tsx` into 6 sheets | ~1h   | Low    | Med  |
| **2B** | `<Button>` + `<Card>` primitives  | ~2h   | Med    | High |
| **2C** | `<Sheet>` primitive + migrate     | ~2h   | Med    | High |
| **3**  | UX Brutal on Home tab             | ~3h   | Med    | High |
| **4**  | Premium funnel conversion A/B     | ~2h   | Low    | High |
| **5**  | React Query migration             | ~4h   | Higher | High |

Maintain the rule: **1 round = 1 reviewable change = 1 user sign-off.**
