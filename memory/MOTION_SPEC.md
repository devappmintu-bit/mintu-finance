# MintU Motion + Haptic Specification v1

_Generated: 2026-05-08 · R114_

This spec is enforceable: any new transition that violates these rules
should be rejected in code review.

---

## 1. Animation Timings

| Surface | Duration | Easing | Direction |
|---------|----------|--------|-----------|
| Tab swap (within `/(tabs)`) | 0 ms (instant) | — | — |
| Stack push (secondary screen) | 280 ms | `Easing.out(Easing.cubic)` | slide_from_right |
| Stack pop | 240 ms | `Easing.in(Easing.cubic)` | slide_from_right reverse |
| Modal sheet | 320 ms | spring(damping=18, stiffness=180) | slide_from_bottom |
| Confirmation landing (`/premium-activated`, `/gmail-connected`) | 220 ms | linear | fade |
| Toast (top brutal) | enter 200 ms · stay 3.2 s · exit 240 ms | bounce-out | translateY |
| Toast (bottom standard) | enter 180 ms · stay 3.5 s · exit 200 ms | ease-in-out | translateY |
| Card press feedback | 80 ms in / 120 ms out | spring | scale 0.97 + shadow shift |
| Skeleton shimmer | 1200 ms loop | linear | translateX gradient |
| Streak/confetti | 1800 ms | ease-out | particle physics |
| Settlement celebration | 2400 ms | ease-out | confetti + scale-up |
| Theme cross-fade | 300 ms | linear | opacity |
| Tab bar dock morph | 240 ms | spring(damping=20) | scale + translateY |

**Rules:**
- Never animate `width`/`height` on JS thread — use `transform: scale` instead.
- Never use `transition: all` on web — only target specific properties.
- All > 200 ms animations MUST be `useNativeDriver: true`.

---

## 2. Haptic Triggers

| Action | Type | Where |
|--------|------|-------|
| Tab focus change | `Haptics.selectionAsync()` | `/(tabs)/_layout` |
| Card tap (primary CTA) | `Haptics.selectionAsync()` | All tappable cards |
| Brutal button press | `Haptics.impactAsync(Light)` | `BrutalButton` |
| Save/submit success | `Haptics.notificationAsync(Success)` | All forms |
| Settlement complete | `Haptics.notificationAsync(Success)` | `/split/[id]` |
| Streak earned | `Haptics.notificationAsync(Success)` | rewards, mascot |
| Form validation error | `Haptics.notificationAsync(Error)` | All forms |
| Destructive confirm | `Haptics.impactAsync(Heavy)` | delete-account, leave group |
| OTP digit entry | `Haptics.selectionAsync()` | `/auth` OTP boxes |
| mPIN digit entry | `Haptics.selectionAsync()` | `/unlock` PIN boxes |
| Wrong PIN | `Haptics.notificationAsync(Error)` | `/unlock` |
| Pull-to-refresh | `Haptics.impactAsync(Medium)` on release | All FlatList screens |
| Reaction emoji | `Haptics.selectionAsync()` | pulse-v2 |

**Rules:**
- Never haptic on **mount** or **scroll** — only on **deliberate user action**.
- Always wrap in `try { ... } catch {}` — haptics may not be permitted on web.
- Web fallback: noop (no spurious console errors).

---

## 3. Shared Element Transitions (planned, not all shipped yet)

| From | To | Element | Status |
|------|----|---------|--------|
| Transactions list | Transaction detail | Amount + merchant | 🟡 planned |
| Goals list | Goal detail | ProgressRing + emoji | 🟡 planned |
| Pulse-v2 card | News-view article | Headline + emoji | 🟡 planned |
| Split groups list | Group detail | Group avatar + name | 🟡 planned |
| Premium hub tile | Tool screen | Tool icon tile | 🟡 planned |

_(Implementation: use `expo-router`'s `LayoutAnimation` config OR react-native-reanimated `SharedValue` between mounts.)_

---

## 4. Loading Skeleton Policy

- Show skeleton if data fetch > 200 ms (cache miss).
- Skip skeleton if data already in SWR cache (immediate paint, then refresh).
- Skeleton must use brutal-bordered Box primitives (not rounded grey blobs).
- Always reserve final layout height — no cumulative layout shift after data arrives.

---

## 5. Forbidden Motion Patterns

❌ White-flash on screen swap (always use `contentStyle: { backgroundColor: c.bg.primary }`)
❌ Scroll-jump on stream-token-replace (use `maintainVisibleContentPosition`)
❌ Modal layered on modal without explicit z-index
❌ Animation > 500 ms on a primary CTA (kills perceived speed)
❌ Haptic on `useEffect(() => {})` mount
❌ Easing `Easing.bezier(0,0,1,1)` (= linear) on character motion — feels robotic
