# MintU Motion + Transition Spec — R114 (Phase 5)

> _Generated: 2026-05-09 · Phase 5 of the End-to-End Navigation Rebuild._
>
> Single source of truth for screen-to-screen transitions, microinteractions,
> haptics, and resilience animations. Audit deliverable.

## 1. Stack-level transitions (expo-router)

Configured in `app/_layout.tsx`. **Default = `slide_from_right` @ 240ms**, with a
small set of explicit overrides for boot/auth/celebration screens that need a
cross-fade for trust/continuity reasons.

| Screen group              | Animation             | Gesture | Reason |
|---------------------------|-----------------------|---------|--------|
| `index`, `auth`, `unlock`, `onboarding`, `(tabs)` | `fade` | OFF | Boot continuity — user shouldn't see a slide before they've authenticated. |
| Premium / Money School / Yearly / Insights / Notifications | `slide_from_right` | ON  | iOS-native push feel. Edge swipe-back works. |
| `gmail-connected`, `premium-activated` | `fade`            | OFF | Celebration arrivals — the modal contents already animate, a slide on top of that feels jarring. |
| `search`                  | `slide_from_bottom`   | ON  | "Modal" affordance for search/filter. |
| All other content screens | (default) `slide_from_right` | ON  | Consistent push feel. |

**Default duration**: 240 ms (matches Apple's `kCAMediaTimingFunctionDefault` curve at standard navigation pace).

## 2. Sheet / modal animations

- `GlassSheet` (Gorhom) — spring-based snap, friction 7, tension 220.
- `Modal` for celebrations (`SettlementCelebration`) — spring scale 0.6→1 + fade in 220ms.
- All sheets open with **light haptic** (`Haptics.selectionAsync`) immediately at trigger time, never after the animation.

## 3. Smart-flow microinteractions

| Surface                  | Interaction                | Animation                         |
|--------------------------|----------------------------|-----------------------------------|
| Tab switch               | Press                      | Native (no extra) — tabs are stateful, no slide. |
| FAB → SmartEntry         | Press                      | Sheet rises from bottom, 320ms.   |
| Pull-to-refresh          | Pull > threshold           | Spinner; toast on offline (R114 A4). |
| Settle confetti          | Settle success             | Confetti burst + scale-spring on hero card. |
| OfflineBanner            | Connection drop > 1.2s     | Slide-down 220ms.                 |
| SlowNetworkHint          | Request > 3s               | Fade in 180ms; auto-dismiss on resolve. |

## 4. Haptics policy

- **Selection** (light): tab switch, segmented toggle, mode switch (Pulse Feed / Trending / Brief), FAB tap.
- **Light impact**: form submit success, optimistic actions.
- **Notification success**: first-ever transaction, milestone reaches.
- **Medium impact**: mascot tap (deliberate gesture).
- **Heavy impact / error**: rare; only used by `Toast({ type: 'error' })` paths.
- **Web**: all haptics no-op via `try/catch`.

## 5. Smart-flow memory animations

When restoring a tab to its previous state (`useScrollMemory`), we **never animate** the scroll — `scrollTo({ animated: false })` — because animating to a remembered position breaks the user's mental model ("I'm back where I left off, not somewhere I'm being driven to").

## 6. Resilience animations (R114)

| Resilience event              | Animation                                                  |
|------------------------------|------------------------------------------------------------|
| Network drops mid-flow       | `OfflineBanner` slides down. No layout shift on the screen below — banner is `absolute`. |
| Slow request (> 3s)          | `SlowNetworkHint` fades in below the banner zone.          |
| Auth-expired silent re-auth  | Cross-fade overlay from the lock screen back to the original screen. |
| Pull-to-refresh while offline| Toast hint, no spinner spin (instant return).              |
| Smart-entry duplicate open   | Silent dedupe (no animation churn) — second tap is a no-op.|

## 7. Phase-5 deliverables shipped

1. **R114-A4 Pull-to-refresh offline guard** — adopted in `budget`, `split` tabs.
2. **R114-B5 SmartEntry reservation lock** — `store/smartEntry.ts` open() dedupes within 400ms + suppresses cross-kind opens.
3. **R114-C8 Pulse-v2 mode-switch scroll preservation** — Feed/Trending/Brief tabs each remember their offset.
4. **Phase-5 default Stack animation** — switched to `slide_from_right` w/ gesture; auth/boot screens cross-fade.
5. **Motion + Transition spec doc** — this file.

## 8. Open items (Phase 6+)

- Per-screen shared-element transitions (e.g. expense row → expense detail).
- Reduced-motion accessibility hook (`useReducedMotion()` from reanimated).
- Skeleton fade-out coordination so list items don't pop in (C5).
- Tab-bar haptic dedupe on rapid swipe (C4 — currently no haptic, low priority).
