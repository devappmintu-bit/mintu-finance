# MintU Navigation Blueprint v1

_Generated: 2026-05-08 · R114 navigation rebuild_

This document is the **single source of truth** for every route, entry
point, exit point, and state in the MintU app. Update it whenever a
route is added/removed/renamed.

---

## 1. Route Inventory (45 routes)

### Root level
| Route | Purpose | Auth | Entry from | Exit to |
|------|---------|------|-----------|--------|
| `/` | Splash + auth gate | none | cold start | `/onboarding`, `/auth`, `/(tabs)` |
| `/onboarding` | First-time user pitch + skip | none | cold start (no token) | `/auth`, `/onboarding/income` |
| `/onboarding/income` | Income capture (post-auth) | required | `/auth` after first signup | `/(tabs)` |
| `/auth` | Phone + OTP login | none | `/`, `/onboarding` skip | `/(tabs)`, `/onboarding/income` |
| `/unlock` | mPIN + biometric re-auth | locked | app-resume + 401 expiry | `/(tabs)` |
| `/+not-found` | 404 fallback | any | invalid deep-link | `/(tabs)` (auto-redirect 1.5s) |

### Primary tab navigator `/(tabs)`
| Route | Purpose | Tab order |
|------|---------|-----------|
| `/(tabs)/` (index) | Home dashboard | 1 |
| `/(tabs)/transactions` | Transaction list + add | 2 |
| `/(tabs)/budget` | Live budgets | 3 |
| `/(tabs)/split` | Split groups | 4 |
| `/(tabs)/ai-coach` | AI coach chat | 5 |
| `/(tabs)/rewards` | Streak + rewards | 6 |
| `/(tabs)/profile` | Profile + settings | 7 |

### Secondary screens (push from tabs)
| Route | Purpose | Entry from |
|------|---------|------------|
| `/notifications` | Persistent notif feed | profile, home bell |
| `/search` | Global search (txn/budget/goal/group) | home, profile |
| `/about` | App info + version | profile |
| `/legal/[page]` | Privacy / Terms / Data Protection | profile |
| `/news-view` | Pulse article detail | pulse-v2 swipe-tap |
| `/pulse-v2` | Money Pulse Inshorts feed | home `Money Pulse` card, profile |
| `/pulse` | Legacy pulse (redirects to v2) | deep-link backwards-compat |
| `/sms-import` | SMS auto-import wizard | profile, onboarding |
| `/yearly` | Yearly dashboard (premium) | profile, premium-hub |
| `/insights/[range]` | Spending insights monthly/yearly | home, transactions |
| `/spending-insights` | Spending story (LLM) | home `Spending Story` card |
| `/money-school` | Daily 60s lessons | premium-hub, profile |
| `/goals` | My goals list | profile, home |
| `/subscriptions` | Recurring subs | profile |
| `/notifications` | (see above) |

### Premium family
| Route | Purpose | Auth gate |
|------|---------|-----------|
| `/premium` | Plans + pricing | any |
| `/premium-hub` | All premium tools (locked grid) | any |
| `/premium-reports` | Deep reports + PDF | premium |
| `/premium-activated` | Razorpay success/cancel landing | any |
| `/premium/tax` | Tax planner | any (locked content) |
| `/premium/invest` | Investment planner | any (locked content) |

### Profile sub-screens
| Route | Purpose |
|------|---------|
| `/profile/delete-account` | Schedule / immediate delete |
| `/profile/export-data` | CSV / JSON export |

### Split sub-flows
| Route | Purpose |
|------|---------|
| `/split/new-group` | Create group flow |
| `/split/[id]` | Group detail (members + expenses + chat) |
| `/split/[id]/add` | Add expense in group |
| `/split/[id]/settings` | Group settings + leave/delete |
| `/join/[id]` | Deep-link group invite |

### Auth-aux flows
| Route | Purpose |
|------|---------|
| `/gmail` | Gmail auto-import settings |
| `/gmail-connected` | OAuth landing (auto-redirects) |

### Showcase (dev only)
| Route | Purpose |
|------|---------|
| `/brutal-showcase` | Brutal design system gallery (debug) |

---

## 2. Top 20 Friction Points (from R114 audit)

| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | 🔴 P0 | Multiple | Hardware-back on Android pops to system instead of falling back to `/(tabs)` when stack is empty (deep-link entry). | Ship `useSmartBack` hook (R114). |
| 2 | 🔴 P0 | `/spending-insights` | setState loop crashed for authenticated users. | FIXED (R113 wave5). |
| 3 | 🔴 P0 | `/(tabs)/ai-coach`, `/(tabs)/` | Metro/SDK52 TDZ on `useStyles` declared at bottom. | FIXED (R113 hotfix, 95 files). |
| 4 | 🟠 P1 | `/notifications` | Tapping a notification clears the unread state but doesn't deep-link to the source screen for some kinds. | Verify `deeplinkFor(kind)` covers all 6 kinds. |
| 5 | 🟠 P1 | `/search` | Recent searches persist across logout (privacy leak). | Wire into `clearSessionState` (already done R113 §4). |
| 6 | 🟠 P1 | `/pulse-v2` | Mode tab switch loses scroll position; reaction state cleared. | `useSmartBack` + zustand-persist mode preference. |
| 7 | 🟠 P1 | `/(tabs)/transactions` | Filters don't survive tab switch + return. | Persist via `useFinContext` last-filter snapshot. |
| 8 | 🟠 P1 | `/(tabs)/split` → `/split/[id]` | Settlement confetti can fire during slow API leading to double-fire. | Idempotency token on settle endpoint (already shipped); add UI guard. |
| 9 | 🟡 P2 | `/legal/[page]` | Hardware back on tablet returns to wrong tab. | `useSmartBack` global. |
| 10 | 🟡 P2 | `/auth` | OTP timer doesn't pause when app is backgrounded. | Use `AppState.addEventListener` to pause/resume. |
| 11 | 🟡 P2 | `/unlock` | No skeleton for biometric prompt latency. | Already shows ActivityIndicator — verify timing < 200 ms. |
| 12 | 🟡 P2 | Modal stack | `BottomSheetModalProvider` allows multiple sheets simultaneously — confusing. | Add `SmartEntryHost` reservation lock. |
| 13 | 🟡 P2 | `/(tabs)/profile` | Settings group ordering changed across sessions. | Stable order via memoized `[Section]` array. |
| 14 | 🟡 P2 | Deep-link routing | `/join/[id]` for deleted/expired group → silent failure. | Add `BrutalEmptyState` with CTA to home. |
| 15 | 🟡 P2 | Push notifications | Tap routes to home regardless of `data.kind`. | Wire `usePushNotifications` notification-tap handler. |
| 16 | 🟢 P3 | `/(tabs)/_layout` | Tab focus haptic fires twice on iOS rapid swipes. | Debounce 150 ms. |
| 17 | 🟢 P3 | `/(tabs)/ai-coach` chat scroll | Scroll-to-bottom jumps when streaming token replaces. | Use `maintainVisibleContentPosition` on FlatList. |
| 18 | 🟢 P3 | `/(tabs)/profile` avatar | Long-press to change has no affordance. | Add tooltip + small camera icon overlay. |
| 19 | 🟢 P3 | Toast offsets | Bottom toast collides with tab bar on small Androids. | `bottomOffset={tabBarHeight + 12}`. |
| 20 | 🟢 P3 | Skeleton flicker | Skeleton shows for <80 ms when data is cached. | Skip skeleton when SWR returns from cache. |

---

## 3. Friction Heatmap (qualitative)

```
               COLD     WARM     HOT     COLD
             (rare)   (daily)  (multiple/day)
  /(tabs)/                       ████████   <- daily, fast paint
  /(tabs)/transactions             ████   <- add txn primary
  /(tabs)/ai-coach                 ███    <- post-fix STABLE
  /(tabs)/split                    ███
  /(tabs)/budget                   ███
  /pulse-v2                        ██
  /goals                           ██
  /premium-hub                     ██
  /search                          █
  /onboarding                █
  /unlock                    ████  <- every cold-start when locked
  /notifications             ██
  /spending-insights         ██
  /yearly                    █
  rest                       ▒
```

---

## 4. Dead-End Detection

| Screen | Dead-end? | Recovery |
|--------|----------|----------|
| `/+not-found` | ✅ recovers via 1.5s timeout | OK |
| `/join/[id]` (expired) | ❌ silent | NEEDS `BrutalEmptyState` |
| `/news-view` (deleted article) | ⚠️ partial | back works; no content message |
| `/insights/[range]` (no data) | ✅ shows empty | OK |
| `/spending-insights` (no txns) | ✅ shows skeleton then empty | OK |
| `/premium-activated?ok=0` | ✅ peach card + redirect | OK |

---

## 5. Navigation Hierarchy Tree

```
Root Stack (modal mode: standard)
├── (gate) /                  splash + auth check
├── /onboarding               (animation: default)
│   └── /onboarding/income    (gestureEnabled: false  ← prevents accidental back)
├── /auth                     (animation: fade)
├── /unlock                   (animation: fade  ← can't be popped)
├── /(tabs)                   primary tab navigator
│   ├── home, txn, budget, split, ai-coach, rewards, profile
│   └── (Bottom bar: 7 tabs, persisted across pushes)
├── Secondary push screens    (animation: slide_from_right)
│   ├── /premium-* family
│   ├── /yearly, /insights, /goals, /money-school
│   ├── /legal/[page], /about, /sms-import
│   ├── /gmail, /pulse-v2, /news-view
│   └── /profile/delete-account, /profile/export-data
├── Modal-style screens       (animation: slide_from_bottom)
│   ├── /search
│   └── /split/new-group
├── Confirmation landings     (animation: fade, auto-redirect)
│   ├── /premium-activated
│   └── /gmail-connected
└── /+not-found               (animation: fade)
```

---

## 6. Universal Navigation Contract

Every screen in MintU MUST honor:

1. **Back tile placement**: top-left, 36×36, 2px ink border, brutal shadow `xs`. (Use `<BrutalScreenHeader />`.)
2. **Title**: SCREAMING-CASE stamp font, max 22 chars before truncation.
3. **Subtitle (optional)**: caption font, ≤ 60 chars, brand-orange or muted ink.
4. **Right slot**: action button(s) with brutal border, 36×36, max 2 actions.
5. **Hardware back (Android)**: routes through `useSmartBack` → falls back to `/(tabs)`.
6. **Empty state**: ALWAYS use `<BrutalEmptyState />` — never a bare `<Text>No data</Text>`.
7. **Loading state**: skeleton if data > 200 ms; spinner only for transient inline actions.
8. **Offline state**: `<OfflineBanner />` at root + screen-level cached badge.
9. **Error state**: brutal RETRY button + plain-language reason; never a stack trace.
10. **State preservation**: scroll/filter/tab/keyboard preserved across stack push → pop.

---

## 7. Maintenance Notes

- **Adding a new route?** Update Section 1 + 5.
- **Removing a route?** Add a deprecation entry in Section 1 + redirect logic.
- **Renaming?** Update both this doc AND the `Stack.Screen` registration in `app/_layout.tsx`.
- **Deep-link from server?** Validate via `Linking.parseInitialURLAsync` in `_layout.tsx` then route through `useSmartBack` so the back stack is well-formed.
