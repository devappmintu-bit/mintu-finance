# WAVE 5.7 — UNLOCK PIN DOT POLISH (SHIPPED)

**Date:** 01 May 2026
**Scope:** Highest-frequency surface polish — unlock screen seen every session.

---

## ✅ SHIPPED

### New primitive: `PinDot`
**`components/primitives/PinDot.tsx`** (~90 LOC, `React.memo`-wrapped)

Replaces the static 4-dot PIN row on the unlock screen with an animated
Reanimated-driven primitive. Each dot now:

1. **Ink-pop** on fill — scales 0 → 1.25 → 1 with a spring (damping 12,
   stiffness 180) over ~320 ms. The surrounding box gives a subtle 5%
   bounce in parallel.
2. **Fade-out** on backspace — dot fades to 0 over 140 ms.
3. **Error tint** — box border + inner dot flip to `state.danger` crimson
   when the parent `errored` flag is true. Parent screen's existing
   shake animation remains untouched.

### Visual spec
| State   | Box                                | Dot                           |
|---------|------------------------------------|-------------------------------|
| Empty   | Hollow, 1.5pt muted border, white  | Invisible (scale 0)           |
| Filled  | Orange border, cream fill          | Ink-pop scale spring           |
| Errored | Crimson border, pink-tint fill     | Crimson, shake in parent row  |

### Wired into `app/unlock.tsx`
Replaced the inline `<View style={[s.pinBox, filled && s.pinBoxFilled, errored && s.pinBoxErr]}>` blocks with `<PinDot filled={pin.length > i} errored={!!error} />` — 15-line inline component → single-line JSX + shared primitive. The parent's shake animation, haptic feedback, and error text all remain untouched.

---

## 🩺 VERIFICATION
- ✅ TypeScript: `tsc --noEmit` → 0 production-code errors
- ✅ Frontend HTTP 200
- ✅ Backend HTTP 200, waste peer warmer cycling on schedule (05:47, 05:55, 06:03 UTC — confirmed 8-min interval)
- ✅ Live backend traffic — zero 5xx errors
- ✅ All 4 PinDot slots receive independent `filled` / `errored` props so staggered-fill visual works out-of-the-box

---

## 🎯 BEFORE → AFTER

| Aspect                         | Before                            | After                              |
|--------------------------------|-----------------------------------|------------------------------------|
| PIN digit entry feedback       | Instant dot appears (no motion)   | **Ink-pop spring** (120ms+spring)  |
| Error visual                   | Red dot + shake                   | Ink-pop still fires, then crimson  |
| Backspace                      | Dot disappears abruptly           | 140ms fade-out                     |
| Perceived tactility            | Plain                             | Physical, satisfying               |
| Every-session polish           | Functional                        | **Delightful**                     |

---

## 📁 DELIVERABLES
- `components/primitives/PinDot.tsx` — NEW (90 LOC)
- `app/unlock.tsx` — 1 import + 14-line inline block replaced with JSX component calls

---

## 🏁 CUMULATIVE WAVE 5 PROGRESS — 5 of 10 shipped

| Wave | Status | Impact |
|------|--------|--------|
| 5.0 — Design tokens | ✅ | Foundation (SPACE/RADIUS/ELEVATION/TYPO/PRESSURE/HAPTIC_INTENT) |
| 5.1 — Home Hero | ✅ | 1 dominant hero card replacing 4 competing |
| 5.4 — AI Coach Pill | ✅ | Flagship "Ask" promoted to shimmer pill |
| 5.6 — Goals Impact | ✅ | Opinionated celebratory headline |
| **5.7 — Unlock PinDot** | ✅ **SHIPPED** | Ink-pop tactile feedback |
| 5.2 — Split refactor | ⏳ | 889 LOC → ~180 |
| 5.3 — Budget radial | ⏳ | Animated health ring |
| 5.5 — Rewards polish | ⏳ | StreakMeter + particles |
| 5.8 — Premium stack | ⏳ | Card deck UX |
| 5.9 — Txn FAB | ⏳ | Multi-action add flow |

**5 of 10 design waves SHIPPED · 50% of spec complete.**

**End of Wave 5.7.**
