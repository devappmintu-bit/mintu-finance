# MintU Navigation Transition Matrix — R115 Sprint-1

_Last updated: 2026-05-09 · Source of truth for every screen-to-screen, sheet, and gesture transition._

> **Rule**: every motion in the app is **a row in this table**. If you find
> yourself reaching for a hardcoded number, that's a refactor — add it here.

## 1. Stack-level transitions (`expo-router`)

| Action / Surface              | Animation             | Duration              | Easing      | Gesture-back | Notes |
|-------------------------------|-----------------------|-----------------------|-------------|--------------|-------|
| **Boot / auth chain** (`index`, `auth`, `unlock`, `onboarding`, `(tabs)`) | `fade`                | `DURATION.normal`     | `standard`  | OFF          | Continuity. User shouldn't see a slide before being authed. |
| **Tab switch** (within `(tabs)`)| `none` (state-preserving) | —              | —           | —            | Tabs are stateful. No animation = no perceived loading. |
| **Drill-down** (default for non-tabs) | `slide_from_right`   | `DURATION.normal`     | `emphasized`| ON           | iOS push feel. Edge swipe-back enabled. |
| **Modal / sheet stack screens** | `slide_from_bottom`   | `DURATION.normal`     | `standard`  | ON           | Search, premium upsell sheets. |
| **Celebration arrivals** (`gmail-connected`, `premium-activated`) | `fade` | `DURATION.fast` | `decelerate` | OFF | Inner content already animates; slide on top is jarring. |

## 2. Sheet / modal transitions (Gorhom + Modal)

| Surface                         | Open                                  | Close                                | Backdrop fade |
|---------------------------------|---------------------------------------|--------------------------------------|---------------|
| Add Expense / Goal / Budget sheet | spring `SPRING.snappy` snap to 92%   | spring `SPRING.default`              | `DURATION.fast`|
| AI Quick Sheet                  | spring `SPRING.snappy` snap to 60%    | spring `SPRING.default`              | `DURATION.fast`|
| BrutalToast                     | spring `SPRING.snappy` translateY     | timing `DURATION.fast`               | —             |
| SettlementCelebration           | spring scale 0.6→1 + fade 220ms       | timing `DURATION.fast` fade-out     | `DURATION.normal`|
| AppLockOverlay                  | timing `DURATION.fast` fade-in        | timing `DURATION.fast` fade-out      | full-cover    |

## 3. Tap interactions (PressableScale)

| Component         | scaleTo | pressedOpacity | haptic intent |
|-------------------|---------|----------------|---------------|
| Default button    | 0.97    | 0.85           | `tap`         |
| Big primary CTA   | 0.94    | 0.80           | `press`       |
| Tab pill          | 0.96    | 0.85           | `select`      |
| Card → detail     | 0.98    | 0.92           | `navigate`    |
| FAB               | 0.92    | 0.85           | `press`       |
| Settle button     | 0.95    | 0.85           | `payment`     |
| Confirm-delete    | 0.95    | 0.85           | `warn`        |
| Disabled state    | 1.00    | 1.00           | `none`        |

## 4. Microinteractions / feedback

| Event                                | Visual                              | Haptic     | Duration              |
|--------------------------------------|-------------------------------------|------------|-----------------------|
| Save success                         | inline check + green flash          | `success`  | `DURATION.fast`       |
| Save fail / network down             | red shake (3px x 2)                 | `error`    | `DURATION.fast`       |
| Toast appear (top brutal)            | translate-Y from -40 + fade         | —          | `DURATION.normal`     |
| First transaction                    | confetti + mascot bounce            | `celebrate`| `DURATION.slowest`    |
| Settle ₹                             | confetti + count-down ₹ → ₹0        | `settle`   | `DURATION.slowest`    |
| Pull-to-refresh fire                 | spinner appears                     | `tap`      | platform default      |
| Pull-to-refresh while offline        | toast hint, no spinner              | `warn`     | `DURATION.fast`       |
| Mode switch (Pulse Feed/Trending)    | crossfade chip + scroll restore     | `select`   | `DURATION.fast`       |
| Tab switch                           | 0 ms (state-preserving)             | `select`   | —                     |
| Mascot tap                           | scale 1→1.08→1 spring               | `press`    | `DURATION.normal`     |

## 5. Gesture priority (conflict resolution)

From **highest to lowest** priority — the higher item wins when both are available:

1. **System back gesture** (iOS edge swipe + Android hw-back) → routes through `useSmartBack`.
2. **Sheet drag-to-dismiss** (Gorhom) → registered via `useModalDismiss`; intercepts the back BEFORE the screen pops.
3. **Card swipe-to-action** (split row, txn row swipe-delete).
4. **Horizontal carousel pan** (Pulse v2 cards).
5. **Vertical scroll** (default fallback).

Thresholds (`utils/motion.ts → GESTURE`):
- `minDrag: 8 px` before any pan recognises.
- `swipeVelocity: 0.45 px/ms` separates a pan from a fling.
- `dismissVelocity: 1.0 px/ms` triggers an auto-dismiss on a sheet.
- `snapThreshold: 0.4` of sheet height before commit.
- `postOpenLockout: 180 ms` — dismiss gestures are ignored for the first 180 ms after open (prevents "open + accidental drag-down").

## 6. Reduced-motion overrides

When `motion.isReducedMotion()` is `true`:

- All durations ≤ `DURATION.normal` collapse to **0** (instant).
- Larger durations are **halved**.
- PressableScale falls back to **opacity-only** (no scale transform).
- Confetti is skipped; the post-celebration toast still fires.
- Skeleton shimmer holds steady (no infinite tween).

## 7. Performance budget

| Surface                         | First paint   | Frame drop budget | Notes |
|---------------------------------|---------------|-------------------|-------|
| Tab change                      | < 16 ms       | 0                 | State-preserving = no remount. |
| Stack push                      | < 280 ms      | ≤ 1 frame         | Animation runs on UI thread. |
| Sheet open                      | < 240 ms      | 0                 | Reanimated worklet. |
| Skeleton → data swap            | < 80 ms       | 0                 | 80ms cross-fade hides flash. |
| Confetti burst                  | full 540 ms   | ≤ 2 frames        | Rare event; budget relaxed. |

---

_The matrix is enforced via `utils/motion.ts` + `utils/haptics.ts`. PRs that
introduce hardcoded numbers without a token reference should be flagged in
review._
