# MintU Design System 2.0 — Developer Handoff

> _Apple-level polish + Stripe-level clarity + Notion-level usability + AI-first intelligence._

This document is the **single source of truth** for the MintU visual & interaction language. Every primitive, every token, every motion curve is defined here. When you build a new screen, start here.

---

## 1. Core Principle

> **Clarity > Beauty. Functionality > Decoration.**

The DS2.0 revamp is not a coat of paint — it is a foundation that enforces:
- **Clarity** — the user never asks "what is this?"
- **Speed** — every interaction resolves in < 300 ms perceived latency.
- **Cognitive ease** — one primary action per screen.
- **Functional depth** — intelligence is surfaced, not dumped.
- **Delight** — micro-interactions reward the user, never distract them.

---

## 2. Color System

All colors are read from `utils/theme.ts::COLORS`. **Never hardcode**.

### 2.1 Brand (MintU Orange ladder)
| Token | Hex | Use |
|---|---|---|
| `accent.primary` | `#E84A0C` | Default brand — CTAs, links, focus rings |
| `accent.primaryDark` | `#C23D09` | Pressed states, strong emphasis |
| `accent.brandSoft` | `#FFF1EB` | Subtle tonal backgrounds, halos |
| `accent.brandDark` | `#9B3208` | Dark gradient bottoms |

### 2.2 Semantic (money-in / money-out)
| Token | Hex | Use |
|---|---|---|
| `state.success` | `#059669` | Money-in, positive deltas, saved ✓ |
| `state.warning` | `#F59E0B` | Mild alerts, overdue-soon budgets |
| `state.danger` | `#DC2626` | Money-out, overbudget, hard errors |
| `state.info` | `#2563EB` | Neutral informational callouts |

### 2.3 Neutrals (light-only canvas)
| Token | Use |
|---|---|
| `bg.primary` | Page canvas |
| `bg.card` | Card surface |
| `bg.subtle` | Divider bands, list headers |
| `text.primary` | Headings, body |
| `text.secondary` | Supporting text |
| `text.muted` | Captions, meta |
| `text.subtle` | Placeholder, disabled |
| `border.subtle` | Hairline dividers |

### 2.4 Accessibility Rule
Every text/bg pair in code MUST clear **WCAG AA 4.5:1 contrast**. The theme token matrix is pre-validated; only handwritten colors need auditing.

---

## 3. Typography

All text is **Inter** (variable weights 500/600/700/900). Access via `TYPO.*` spreads.

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `display` | 48 / 52 | 900 | Hero numbers (money score) |
| `h0` | 32 / 36 | 700 | Screen titles |
| `h1` | 24 / 28 | 700 | Section heroes |
| `h2` | 20 / 24 | 600 | Card titles |
| `h3` | 17 / 22 | 600 | Row headings |
| `body` | 15 / 20 | 500 | Paragraph |
| `bodySm` | 13 / 18 | 500 | Supporting |
| `caption` | 12 / 16 | 500 | Meta |
| `micro` | 10 / 12 | 600 | Uppercase badges |
| `mono` | 15 / 20 | 600 tabular | Tabulated numbers |

**Rule:** Use `mono` for anything aligned by digit (₹1,230 vs ₹12,300 in a list).

---

## 4. Spacing & Radius

All spacing flows from the 4 pt grid.

| Token | px | Use |
|---|---|---|
| `SPACE.xxs` | 2 | icon-to-text |
| `SPACE.xs` | 4 | badge paddings |
| `SPACE.sm` | 8 | list gaps |
| `SPACE.md` | 12 | card internal |
| `SPACE.lg` | 16 | card external |
| `SPACE.xl` | 24 | section gap |
| `SPACE.xxl` | 32 | page gutter |

Radius ladder: `sm=6, md=10, lg=14, xl=20, 2xl=26, 3xl=32, pill=999`.

**Rule:** Cards = `RADIUS.xl`. Chips = `RADIUS.pill`. Inputs = `RADIUS.lg`. FABs = `RADIUS.full`.

---

## 5. Elevation (6-tier shadow scale)

| Token | Use |
|---|---|
| `ELEVATION.z0` | Flat — inline rows, pressed states |
| `ELEVATION.z1` | Subtle — default cards |
| `ELEVATION.z2` | Elevated — modals, primary cards |
| `ELEVATION.z3` | Floating — FABs, sticky headers |
| `ELEVATION.z4` | Overlay — sheets, drawers |
| `ELEVATION.z5` | Above-all — toasts, tooltips |

**Rule:** Never mix custom `shadowOpacity` with these. Spread the token and stop.

---

## 6. Motion

All motion is on the **UI thread** via Reanimated / moti.

### 6.1 Spring physics (canonical)
| Context | damping | stiffness |
|---|---|---|
| Press in | 14 | 320 |
| Press out | 18 | 260 |
| Accordion / sheet | 18 | 220 |
| Focus glow | 16 | 260 |

### 6.2 Timing curves
| Duration | Easing | Use |
|---|---|---|
| 120 ms | `Easing.out(quad)` | Shadow lift |
| 180 ms | `Easing.out(cubic)` | Label float, subtle fades |
| 220 ms | `Easing.out(cubic)` | Caret rotate |
| 380 ms | `Easing.out(cubic)` | Glow fade-out, hero mount |
| 420 ms | `timing` | Staggered card reveal |

### 6.3 Stagger defaults
- **Delay between children**: `60 ms` (home), `70 ms` (list-based)
- **Distance**: `14 px` upward
- **Duration per child**: `420 ms`

### 6.4 Rule
**Motion guides attention; it never distracts.** Anything > 500 ms should be justified.

---

## 7. Primitive Library

All live under `/components/primitives/` and re-export from `./index.ts`.

| Primitive | Responsibility |
|---|---|
| `SpringPress` | Universal Pressable wrapper (4 variants: tap / bouncy / ghost / card) |
| `Shimmer` | Flowing gradient skeleton. Replaces static grey blocks. |
| `SuccessGlow` | Transient emerald halo on save/submit. |
| `PremiumCard` | 4 variants (flat / elevated / glass / hero) |
| `PremiumButton` | 5 variants × 3 sizes with haptic + spring + icons |
| `PremiumInput` | Floating label + focus glow + inline validation |
| `CurrencyField` | ₹ currency input: mask, lakh-preview, shake on error, min/max validation |
| `CategorySelector` | Searchable chip grid; single + multi select |
| `SegmentedToggle` | iOS-style segmented control with spring pill indicator |
| `ExpandableSection` | Accordion with spring-height animation |
| `EmptyState` | Unified empty/zero-data fragment |
| `SmartSuggestion` | AI-first contextual callout (5 kinds) |
| `AlertBanner` | Transient top-of-screen status banner (4 tones, dismissible) |
| `SectionHeader` | Title + optional subtitle + "See all" CTA |
| `StaggeredEntrance` | Apple-Wallet cascade reveal |
| `ParallaxHeader` | Collapsible scroll-linked header |
| `MoneyNumber` | Tabular Indian-format currency display |
| `MicroBarChart` | Inline 7-point spark bars |
| `PinDot` | 4-digit glass PIN indicator |

---

## 8. Interaction Patterns

### 8.1 Haptic Choreography
| Action | Haptic |
|---|---|
| Tab / chip select | `selection` |
| Button press | `impactLight` |
| Primary CTA press | `impactLight` |
| Destructive confirm | `impactMedium` |
| Success save | `notificationSuccess` |
| Error | `notificationError` |

Centralised via `utils/haptics.ts::haptic(intent)`.

### 8.2 Loading States
- **≤ 600 ms expected**: show nothing (perceived instant).
- **600 ms – 3 s**: `Shimmer` skeletons matching layout.
- **> 3 s**: `Shimmer` + inline progress message.
- **Never** use a bare `<ActivityIndicator />` at the page level.

### 8.3 Error States
- Inline (input field): `PremiumInput` `error` prop → shows `alert-circle` + red border.
- Contextual (card): `SmartSuggestion` `kind="alert"` with action to resolve.
- Global (API failure): toast via `utils/toast.ts`, never alert().

### 8.4 Empty States
Always use `EmptyState` primitive. Never ship a bare "No data" label.

---

## 9. Screen Archetypes

### 9.1 Dashboard / Feed
```
<Header (optional ParallaxHeader)>
<StaggeredEntrance>
  <HeroCard> — one primary glanceable insight
  <SmartSuggestion> — up to 2 stacked
  <SectionHeader title="Today" action="See all">
    <Cards />
  <SectionHeader title="This week">
    <Cards />
</StaggeredEntrance>
```

### 9.2 Form
```
<Header>
<KeyboardAvoidingView>
  <PremiumInput label="Name" />
  <PremiumInput label="Amount" keyboardType="numeric" />
  <ExpandableSection title="Advanced">
    <PremiumInput label="Note" />
  </ExpandableSection>
</KeyboardAvoidingView>
<Footer>
  <PremiumButton label="Save" variant="primary" fullWidth />
</Footer>
```

### 9.3 List / FlatList
```
<FlashList
  ListHeaderComponent={<StaggeredEntrance>...header blocks...</StaggeredEntrance>}
  ListEmptyComponent={<EmptyState ... />}
  renderItem={...}
/>
```

---

## 10. Dos & Don'ts

✅ **Do**
- Spread `ELEVATION.zN` instead of handwriting shadows.
- Use `SpringPress` for every tappable element.
- Use `mono` for any number in a vertical list.
- Use `SmartSuggestion` to surface AI insights, not dump them in body copy.
- Ship skeletons (`Shimmer`) for every network-fetched view.

❌ **Don't**
- Hardcode colors, font families, or shadow values.
- Use `TouchableOpacity` raw — always wrap in `SpringPress`.
- Use `<ActivityIndicator />` as a full-page loader.
- Introduce new font weights/sizes outside `TYPO`.
- Animate anything > 500 ms without a justifying interaction.

---

## 11. Rollout Status (as of 2026-05-01)

| Primitive | Status |
|---|---|
| SpringPress / Shimmer / SuccessGlow | ✅ Shipped |
| PremiumCard / PremiumButton | ✅ Shipped |
| PremiumInput / ExpandableSection | ✅ Shipped |
| EmptyState / SmartSuggestion | ✅ Shipped |
| SectionHeader / StaggeredEntrance / ParallaxHeader | ✅ Shipped |

| Screen | StaggeredEntrance | Next |
|---|---|---|
| Home, AI Coach, Budget, Rewards, Profile, Premium Hub, Goals | ✅ | — |
| Leaderboard, Money School, Spending Insights, Premium Reports, Rewards Hub, Yearly, About | ✅ | — |
| Transactions, Split, Notifications, Coin Ledger, Search | ⏳ | ListHeaderComponent wrap |
| Onboarding, Auth, Unlock | ⏳ | Low priority — simple one-offs |
| Profile sub-screens, Split sub-screens, Gmail | ⏳ | Wave 4 |

---

_Last updated: 2026-05-01 · Owner: design-system maintainers_
