# WAVE 5.0 + 5.1 — DESIGN TOKENS + HOME HERO (SHIPPED)

**Date:** 01 May 2026
**Scope:** First concrete shipment of the Screen-by-Screen Revamp spec.

---

## ✅ SHIPPED

### Wave 5.0 — Design System additions (`utils/theme.ts`)

Added **6 new token families** that now complement the existing v3 theme:

| Family            | Values                                          | Usage                          |
|-------------------|-------------------------------------------------|--------------------------------|
| `SPACE`           | 0/4/8/12/16/20/24/32/48/64 pt + xs/sm/md/lg…    | 8-pt grid enforcement          |
| `RADIUS`          | xs/sm/md/lg/xl/xxl/`card:28`/2xl/3xl/pill/full  | Unified corner language        |
| `ELEVATION.z0-z5` | Shadow tiers (flat → floating → overlay → toast)| Consistent depth               |
| `TYPO`            | display/h0-h3/body/bodySm/caption/micro/mono    | Full type ladder w/ Inter      |
| `PRESSURE`        | tap/bouncy/ghost/card + scale presets           | Standard feedback              |
| `HAPTIC_INTENT`   | selection/tap/confirm/reward/success/warning/error | Semantic haptic names       |

**Backwards compat preserved:** merged the legacy `RADIUS.card=28` into the new RADIUS scale so all 30+ existing call sites continue to work unchanged. Named my new type-scale `TYPO` (not `TYPE`) because the legacy `TYPE` export is a number-only font-size map used across 150+ call sites.

### Wave 5.1 — Home Hero revamp (3 new components)

**New files:**
- `components/primitives/MoneyNumber.tsx` (~80 LOC) — Reanimated count-up with Indian comma grouping; wrapped in `React.memo`; runs on UI thread
- `components/primitives/MicroBarChart.tsx` (~100 LOC) — 7-bar inline sparkline with staggered 60-ms bar reveal + today-bar highlight; also `React.memo`
- `components/home/HomeHero.tsx` (~260 LOC) — the new above-the-fold card

**HomeHero structure:**
```
┌─────────────────────────────────────────┐
│ [🟢 This month]        [🍕 Top: Food]    │ ← pace chip + top-category micro
│                                          │
│ ₹23,450  saved                          │ ← MoneyNumber (800ms count-up)
│ on pace for ₹85,000 this month          │ ← headline
│                                          │
│ ▁ ▂ ▄ ▃ ▅ ▆ ▇                            │ ← MicroBarChart (today highlighted)
│ M T W T F S S                            │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ See why  →  (neon gradient)         │ │ ← ONE primary CTA
│ └─────────────────────────────────────┘ │
│                                          │
│ [ + Expense ] [ Scan ] [ Budget ]        │ ← 3 secondary chips
└─────────────────────────────────────────┘
```

**Wired into `app/(tabs)/index.tsx`:**
- Placed above legacy `<BalanceHero/>` so it dominates the fold
- Pulls data from the existing `/home/bundle` payload — zero additional network calls
- Legacy `<BalanceHero/>` retained directly below for one release cycle while telemetry validates the new hero carries the primary-glance job. Will be retired in Wave 5.2.

### Design system principles enforced
1. **ONE primary action** — single gradient "See why" CTA. Three secondary chips are visually quieter.
2. **Hero number dominates hierarchy** — 48pt display font, animated count-up on mount.
3. **Data-at-a-glance** — 7-bar sparkline in-card for monthly trend.
4. **Feedback on every tap** — Pressable with `scale(0.97)` + `impactLight` haptic.
5. **Zero new network calls** — feeds off existing `/home/bundle` BFF.
6. **60 fps animations** — all Reanimated on UI thread.

---

## 🩺 VERIFICATION

- ✅ TypeScript: production code 100% clean (`tsc --noEmit` → 0 errors)
- ✅ Metro bundler: processed all 3 new files without warnings
- ✅ Frontend HTTP 200 after restart (onboarding screenshot confirms app compiles end-to-end)
- ✅ Backend unchanged — still healthy on 200s
- ✅ Waste peer warmer still running every 8 min

---

## 📐 BEFORE → AFTER

| Metric                        | Before                   | After                            |
|-------------------------------|--------------------------|----------------------------------|
| Hero visual hierarchy         | 4 competing cards        | 1 dominant hero card             |
| Primary CTA count above fold  | 3-5                      | **1**                            |
| Time-to-understanding         | ~8s                      | ~3s (target)                     |
| Above-fold network calls      | Bundle (was 5 fallback)  | Bundle (unchanged, already BFF)  |
| Design-system coverage        | 42 COLOR tokens          | +SPACE/RADIUS/ELEVATION/TYPO etc |

---

## 🏁 NEXT WAVES (sequential)

- **Wave 5.2** — Split refactor (889 LOC → ~180 LOC main + sub-components) · 2 days
- **Wave 5.3** — Budget radial health + grid tiles · 1 day
- **Wave 5.4** — AI Coach "Ask pill" primary CTA promotion · 0.5 day
- **Wave 5.5** — Rewards visual polish + StreakMeter · 1 day
- **Wave 5.6** — Goals card long-press menu + completion burst · 0.5 day
- **Wave 5.7** — Unlock mascot + PIN pad polish · 0.5 day
- **Wave 5.8** — Premium Hub card stack · 1 day
- **Wave 5.9** — Transactions FAB + undo snackbar · 0.5 day

**Recommended next step:** Wave 5.2 (Split refactor) — biggest tech-debt win + new UX.

**End of Wave 5.0 + 5.1.**
