# MintU Design System

> **Source of truth:** [`/app/frontend/utils/theme.ts`](../frontend/utils/theme.ts). Every screen, component, and style **must** consume tokens from this file. Hardcoded hex values (e.g. `#FF6B1A`, `#C14A06`) are a code smell — open a PR to extract them to tokens.

---

## 🎨 Brand Foundation

**Vision** — AI-first finance companion that feels like a friend, not an accountant.
**Personality** — Playful, Smart, Trustworthy (in that order).
**Tone of voice** — Conversational, crisp, intelligent. No finance jargon. No preaching.
**Target persona** — Indian Gen Z / young-millennial (18–32). Spends on UPI, saves in SIPs, shares memes.

---

## 🌈 Color System

Three palettes: `LIGHT`, `DARK` (default), `AMOLED` — all mutate `COLORS` in place via `applyTheme(mode)`. React components can subscribe reactively via `useAppColors()` / `useAppTheme()`.

### Core roles

| Token            | Dark      | Light     | Purpose                          |
|------------------|-----------|-----------|----------------------------------|
| `bg.primary`     | `#0B0B12` | `#FAFAF9` | App canvas                       |
| `bg.secondary`   | `#14141C` | `#FFFFFF` | Elevated surface                 |
| `bg.card`        | `#1A1A24` | `#FFFFFF` | Solid card fallback              |
| `accent.primary` | `#FF6B1A` | `#E84A0C` | Neon orange — hero accent        |
| `accent.moneyIn` | `#10E0A0` | `#059669` | Credit / positive                |
| `accent.moneyOut`| `#FF5470` | `#DC2626` | Debit / negative                 |
| `text.primary`   | `#F5F5F7` | `#111827` | Near-black/white                 |
| `text.muted`     | `#71717A` | `#6B7280` | Captions                         |

### Semantic state (light/dark adaptive)

`state.success · warning · danger · info` — each exposes `Bg` (10-14% alpha tint) and `Border` (30-40% alpha).

**Rule:** never use a raw hex for semantic meaning. Use `COLORS.state.danger` not `'#FF5470'`.

---

## 📐 Spacing & Radius

8-pt grid. Use the named scale only — no raw pixel values in layouts.

```
xs=4  sm=8  md=12  lg=16  xl=20  xxl=24  xxxl=32
```

`RADIUS`: `sm=8  md=12  lg=16  xl=20  xxl=24  card=28  full=999`

---

## ✒️ Typography

Inter 400/500/600/700/900 (loaded in `_layout.tsx`). Use the `FONT` scale:

| Token      | Size  | Family   | Use                       |
|------------|-------|----------|---------------------------|
| `display`  | 44/-1.2 | black    | Big balances, coin counts |
| `h1`       | 36/-0.8 | black    | Hero titles               |
| `h2`       | 28/-0.5 | bold     | Section headers           |
| `h3`       | 22/-0.3 | bold     | Card titles               |
| `h4`       | 18/-0.2 | semibold | Subsection                |
| `body`     | 16/26  | regular  | Body copy                 |
| `small`    | 14/22  | regular  | Secondary                 |
| `tiny`     | 12    | medium   | Metadata                  |
| `overline` | 11/1.5 | bold, uppercase | Eyebrow labels   |

---

## 🎞️ Motion

Use `MOTION` tokens for every animation. 60 fps or bust.

```
fast = 150ms (hover, tint)
base = 220ms (button press, ripple)
medium = 280ms (modal fade, screen transition)
slow = 420ms (hero reveal)
```

Spring presets: `quick · smooth · bouncy`.

---

## ✨ Gradient / Glow / Glass

Reuse canonical stops — **do not** hand-roll gradients.

```
GRADIENT.neon       → hero buttons, chips, glows
GRADIENT.premium    → AI bots, premium cards (orange → magenta → violet)
GRADIENT.success    → positive feedback
GRADIENT.moneyIn/Out → transaction pills
GRADIENT.pageBg     → subtle page radial
```

`GLOW.neon · success · danger · subtle` — spread into a `StyleSheet` entry for neon borders on iOS/Android/web.

`GLASS` — paired with `expo-blur`'s `<BlurView tint={GLASS.tint} intensity={GLASS.intensity}>`. Falls back to `GLASS.solidBg` on low-end Android / web.

---

## 🧱 Component Library (current live)

### Primitives (cross-app)
- **`<NeonButton>`** — the canonical CTA. Variants: `primary · secondary · ghost`. Built-in pulse.
- **`<InsightCard>`** — big-value + headline + body + CTA. Used on AI Coach, Home, Premium.
- **`<GlowPill>`** — tagged status chip (`neon · success · warning · danger`).
- **`<Skeleton.Box>`** — shimmer placeholders.
- **`<ThinkingDots>`** — AI-streaming ellipsis animation.

### Domain-specific
- **Profile**: `ProfileHeroV4`, `MissionsEngine`, `BeatLastWeek`, `AICoachOneTap`, `PremiumConversionFunnel`, `ScoreBreakdownModal`, `ScoreBoostModal`, `SettingsList` + `SettingsListItem`, `SmartStatusRow`, `ProfilePhotoSheet`, `WeeklyWinCard` + `ShareWeeklyWinModal`.
- **Home**: `BalanceHero`, `HeroCard`, `AIInsightCard`, `ActionableAlertCard`, `NewsCarousel`, `QuickActionBar`, `TodayChips`, `WeeklyReport`, `EmbeddedFinanceCard`, `MoneySchoolCard`, `FinancialBrainCard`.
- **Premium**: `PlansView`, `PremiumComparison`, `SoftPaywall`, `CoinRedeemPanel`, `InvestmentSuggester`, `TaxCalculator`, `PulseCTA`.

### Status (Apr 22, 2026)
After the Round 1 dead-code purge, `/components/profile/` is down from 39 files → 19. Deleted: `ProfileHero[V1-V3]`, `WeeklyChallenge[Calm]`, `AccordionSection`, `SettingsGroup`, `TodayCard`, `Premium[Upsell|Calm]`, `ShareScoreCard`, `FinancialSnapshot`, `ProgressionStrip`, `BadgesSection`, `RewardsHub`, `CompactLeaderboard`, `ReferralDashboard`, `InviteEarnStrip`, `InsightMinimal`, `InsightsCard` (profile dupe), `AIOrb`, `AIOrbSheet`.

---

## 🔤 Iconography

Ionicons (outline preferred for neutral rows, filled for state emphasis). Categories map in `CATEGORIES` object — always use it for category icon/color.

---

## 📏 Layout rules (non-negotiable)

1. Minimum touch target: **44×44 iOS / 48×48 Android**.
2. Use `SafeAreaView` from `react-native-safe-area-context` at every screen root.
3. Wrap form screens in `KeyboardAvoidingView` with `behavior: Platform.OS === 'ios' ? 'padding' : 'height'`.
4. Use `StyleSheet.create` or `makeStyles((c) => ({…}))` — never inline objects unless dynamic.
5. Never hardcode colors, spacing, radius, shadow, font size, or font family.

---

## 🚀 Motion language

- **Primary CTA** — spring press (0.96 scale, 120ms).
- **Mission complete** — confetti + haptic `success`.
- **Score increase** — number count-up (300ms ease-out) + ring fill (480ms).
- **Mystery box reveal** — 2-stage: shake (300ms) → burst (420ms, bouncy).
- **Streak flame** — subtle 1.5s loop while active.

---

## 🧭 Next upgrades (roadmap)

1. **`<Button>` / `<Card>` variants** — consolidate the 4 button flavors + 3 card flavors into single components with `variant` prop.
2. **`<Sheet>` primitive** — unify bottom sheets (auth, delete, photo, share). Currently 4 independent implementations.
3. **Theme-aware illustrations** — SVG illustrations that adopt the active palette (remove fixed PNGs from `ONBOARDING_IMAGES`).
4. **Mascot system** — MintU-AI character with expressions (happy / thinking / celebrating) for empty/loading/success states.

---

_Last updated: Apr 22, 2026 (Round 1 audit)._
