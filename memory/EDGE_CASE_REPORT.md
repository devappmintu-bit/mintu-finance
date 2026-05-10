# MintU Edge-Case Simulation Report v1

_Generated: 2026-05-08 · R114_
_Format: scenario → expected behavior → current state → fix._

## TIER A — User-visible critical (fix this session)

### A1. Cold-start with no internet
- **Expected**: app boots, shows skeleton on home, then mounts `OfflineBanner` saying "You're offline · Showing your last sync."
- **Current**: ✅ already works — `useIsOnline` hook + `OfflineBanner` mounted in `_layout.tsx`.
- **Action**: VERIFY in screenshot.

### A2. Authenticated user, slow API (5s+ on /home/bundle)
- **Expected**: skeleton shows. After 3 s, a subtle "Slower than usual…" hint surfaces.
- **Current**: ❌ no slow-network hint — user just stares at skeleton, may force-quit.
- **Action**: ✅ FIX — ship `<SlowNetworkHint />` component (R114 starter wave).

### A3. Hardware back from a deep-link to a deleted resource
- **Expected**: brutal empty state with CTA "Back to Home".
- **Current**: ⚠️ stack is empty → Android exits the app.
- **Action**: ✅ FIX — `useSmartBack` falls back to `/(tabs)`. Wired into `BrutalScreenHeader`.

### A4. Pulled-to-refresh on `/(tabs)/transactions` while offline
- **Expected**: brief shake + toast "You're offline · pull again later."
- **Current**: ⚠️ silently fails or 5-s spinner.
- **Action**: ✅ FIX — early-return in `onRefresh` if `!isOnline`, show toast.

### A5. Authenticated request 401 mid-flow
- **Expected**: silent re-auth via `/unlock`, then resume the original action.
- **Current**: ✅ partial — axios interceptor + auth-expired redirect already wired (`_layout.tsx` line 226).
- **Action**: VERIFY no in-flight action is lost.

## TIER B — Reliability (next sessions)

| ID | Scenario | Severity | Status |
|----|----------|----------|--------|
| B1 | App killed during a transaction edit (form data loss) | 🟠 | needs draft-autosave hook |
| B2 | Push notification tap → routes to wrong screen | 🟠 | needs `notificationResponseListener` mapping |
| B3 | Deep-link `/join/[id]` for expired group | 🟠 | needs empty state |
| B4 | OTP form during incoming call (background) | 🟡 | OTP timer should pause |
| B5 | Two simultaneous "Add expense" sheet opens | 🟡 | reservation lock on `SmartEntryHost` |
| B6 | Switch language mid-session | 🟡 | already handled via langStore |
| B7 | Switch theme mid-session | 🟡 | handled via `useAppColors` |
| B8 | Token refresh during streaming SSE on `/api/coach/chat-stream` | 🟠 | needs reconnect-with-resume cursor |
| B9 | Razorpay payment success but the redirect URL is dropped | 🟠 | webhook fallback (already shipped) |
| B10 | NetInfo false-negative (probe fails on healthy network) | 🟢 | already mitigated (`useIsOnline.ts` line 22-29) |

## TIER C — Polish (future)

| ID | Scenario | Severity |
|----|----------|----------|
| C1 | Tab swap during keyboard-open form | 🟢 |
| C2 | Pull-to-refresh during another fetch | 🟢 |
| C3 | Avatar long-press affordance discovery | 🟢 |
| C4 | Tabbar haptic double-fire on rapid swipe | 🟢 |
| C5 | Skeleton flicker for cached-data screens | 🟢 |
| C6 | Toast collision with tab bar on small Androids | 🟢 |
| C7 | Theme-aware status bar on iOS | 🟢 |
| C8 | Pulse-v2 mode switch loses scroll position | 🟢 |
| C9 | Notifications mark-all spinner blocks tap | 🟢 |
| C10 | Confetti fires twice on settle if double-tap | 🟢 |

## R114 starter-wave fixes shipped

1. ✅ `useSmartBack` global hook (Section A3)
2. ✅ `SlowNetworkHint` component (Section A2)
3. ✅ Verified `OfflineBanner` (Section A1)
4. ✅ Pull-to-refresh offline guard pattern (Section A4) — documented for adoption
5. ✅ `useNavigationMemory` hook (B1 / scroll preservation foundation)

## R114 second-wave fixes shipped (Phase 5)

6. ✅ **A4 Pull-to-refresh offline guard adoption** — `useOfflineRefresh` hook adopted in `(tabs)/budget` + `(tabs)/split`. Toast hint + spinner-clear guarantee. (`hooks/useOfflineRefresh.ts`)
7. ✅ **B5 SmartEntry reservation lock** — `store/smartEntry.ts` now dedupes `open()` within a 400ms window AND suppresses cross-kind opens while a sheet is mounted.
8. ✅ **C8 Pulse-v2 mode-switch scroll preservation** — Feed/Trending/Brief now each remember their offset, restored on mode-swap.
9. ✅ **Phase-5 default Stack animation** — `app/_layout.tsx` default switched from `fade` to `slide_from_right` (240ms, gesture-back enabled). Boot/auth screens explicitly cross-fade.
10. ✅ **Motion + Transition spec doc** — `/app/memory/MOTION_TRANSITION_SPEC.md` (Phase 12 deliverable bring-forward).

