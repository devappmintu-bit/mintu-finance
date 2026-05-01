# MintU — Brand Kit v1.0

> **The premium fintech AI-companion brand**
> *One mascot. One palette. Zero compromise on polish.*

This brand kit is the canonical source of truth for every visual decision
across the MintU app, marketing site, social media, and product
touchpoints. It is derived directly from — and stays 100 % consistent
with — the in-app design system (`/app/frontend/utils/theme.ts`,
`/app/frontend/components/primitives/*`).

If you can't decide between two design choices, the answer is in this
document. If the answer isn't here, ask before inventing.

---

## 1 · Core Brand DNA

### 1.1 Personality

| Trait | What it means in design |
|-------|-------------------------|
| **Intelligent** | Crisp typography, no decorative noise, every pixel earns its place |
| **Trustworthy** | Generous spacing, clear hierarchy, restrained motion, never frantic |
| **Futuristic** | Soft 3D forms, subtle glows, glassmorphic depth, premium gradients |
| **Friendly** | The mascot, rounded geometry, warm orange accents, micro-celebrations |
| **Approachable** | Conversational copy, mascot-led empty states, never patronising |

### 1.2 Voice & Tone

- **Warm**, not corporate. Say *"Looks like you spent ₹420 on coffee this week"*, not *"Beverage transactions: ₹420"*.
- **Helpful**, not preachy. Suggest the next action; never lecture.
- **Slightly playful**, not childish. A wink at the right moment, never a smirk.
- **Confident**, not arrogant. State numbers plainly; no exclamation marks except for genuine wins.

### 1.3 Anti-patterns (NEVER do these)
- ❌ Over-bright orange floods (always pair with dark or off-white surfaces)
- ❌ Cartoon-style mascot poses (the robot is friendly, not a sticker)
- ❌ Decorative fonts, italic emphasis, or all-caps shouting
- ❌ More than 2 simultaneous animations on screen
- ❌ Flat shadows or hard edges — everything has soft depth

---

## 2 · Colour System

> 🚨 **All hex values below are the spec.** The current `theme.ts`
> uses slightly older variants (`#F56E1E`, `#E84A0C`); a Theme Migration
> section at the end of this document maps current → spec for the next
> theme refresh.

### 2.1 Primary Brand Gradient

The single most-used asset across the app — it lives on every CTA,
the mascot's body, the splash glow, and the active-tab indicator.

```
linear-gradient(135deg, #FF7A18 0%, #FF3D00 100%)
```

| Stop | Hex | RGB | Usage |
|------|-----|-----|-------|
| 0 % (warm) | `#FF7A18` | rgb(255, 122, 24) | Top-left of every gradient. Highlights, glow inner. |
| 100 % (deep) | `#FF3D00` | rgb(255, 61, 0) | Bottom-right of every gradient. Pressed states, depth. |

### 2.2 Secondary Accents

```
#FFA726   highlight glow     — Notification badge, success ping, mascot eye glint
#FFB74D   soft accent        — Disabled CTA gradient, mascot underbelly highlight
```

### 2.3 Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `dark.primary` | `#000000` | Splash background, hero sections, mascot canvas |
| `dark.secondary` | `#121212` | Elevated dark surfaces (modals on dark) |
| `light.surface` | `#F5F5F5` | Light-mode page background |
| `light.text` | `#FFFFFF` | Text & icons on dark gradient |

### 2.4 Semantic States

```
success     #16A34A   (green-600) — money in, goal funded, positive trend
warning     #D97706   (amber-600) — over budget, alerts
danger      #DC2626   (red-600)   — money out, critical errors, cancel
info        #2563EB   (blue-600)  — neutral informational chips
```

### 2.5 Usage Rules

✅ **DO**
- Use the primary gradient for ONE primary CTA per screen
- Apply gradient to the *active* state of toggles, the *unlocked* state of badges
- Pair `#000000` background with the orange gradient — it's the brand's signature visual
- Use `#F5F5F5` as the resting page colour in light mode, `#000000` in dark mode

❌ **DON'T**
- Apply the gradient to body text, captions, or borders
- Mix the orange gradient with any other hue's gradient on the same screen
- Use flat orange (`#FF6B1A`) in marketing creatives — always the gradient
- Place the gradient on more than 25 % of any single viewport

---

## 3 · Mascot — *Mintu*

The orange-robot mascot with the ₹ Rupee shield is the brand's
emotional anchor. Treat it as a real character, not clipart.

### 3.1 Anatomy

```
   [ antenna L ]   [ antenna R ]
        \              /
     ┌─── HELMET (oval visor) ───┐
     │   ●  GLOW EYES  ●         │
     └────────┬──────────────────┘
              │
     ┌── BODY (shield) ──┐
     │      ₹ Rupee      │
     └────┬─────────┬────┘
        leg L     leg R
```

- **Helmet** is a single rounded oval. The visor is `#0D0D0D` and reads as a "thinking surface" — never put expressions on it, only the two glow eyes.
- **Eyes** are pure white circles with a soft `#FFA726` outer glow. They are the only place the mascot expresses emotion.
- **Shield** carries the Rupee glyph and uses the primary gradient. This is the canonical brand-mark.
- **Body proportions** stay 1 : 1.2 (height : width of shield) — never stretch.

### 3.2 The 4 Canonical States

These ARE the only mascot states. Don't invent new ones.

| State | Visual cue | Used on | Reanimated cadence |
|-------|------------|---------|--------------------|
| `idle` | Calm breath + soft float + pulsing orange glow | Empty states, hero sections | breath 3.2 s · float 4 s · glow 4 s |
| `thinking` | Faster breath, brighter glow pulse, no float | AI Coach loading, sync in progress | breath 1.1 s · glow 1.1 s |
| `success` | Quick scale-bounce 1.0→1.18→0.96→1.0, glow flash, settles into idle | Goal completed, transaction added, badge unlocked | bounce 360 ms · then idle |
| `error` | Single small horizontal head-shake, then idle resumes | Network error, validation fail | shake 80 ms × 5 |

The component lives at `/app/frontend/components/MintuMascot.tsx` and
exposes `<MintuMascot size={...} state={...} disableMotion={...} />`.

### 3.3 Sizing

| Context | Size (pt) | Notes |
|---------|-----------|-------|
| Splash / launch | 220 | The hero moment — give it room |
| Empty-state hero | 120 | Default for `<EmptyState mascot />` |
| AI Coach loading | 96 | Above the skeleton bars |
| Inline chat indicator | 40 | Replace ThinkingDots in chat replies |
| Tab badge / avatar | 32 | `disableMotion` to save GPU |

### 3.4 Backgrounds

The mascot is designed for **dark** canvases. On light surfaces, wrap
it in a black `#000000` rounded-card with 20 pt padding so the visor
contrast holds.

```
✅ Good                  ❌ Bad
[ #000 card · 24 pt ]    [ #FFF page · no card ]
[       🤖           ]    [        🤖             ]   ← visor disappears
[ ────────────────  ]    [                       ]
```

### 3.5 Mascot Do's & Don'ts

✅ **DO**
- Show only one mascot per screen
- Use `disableMotion` for users with reduce-motion enabled (auto-detected via OS)
- Pair with brand gradient for hero / launch moments
- Let the breath cadence match the user's emotional tempo (idle = calm, thinking = engaged)

❌ **DON'T**
- Mirror, rotate beyond ±10°, or skew the mascot
- Add hats, glasses, or seasonal decorations (treat it as a real character)
- Place text over the mascot — text always sits below
- Use any state other than the 4 canonical ones
- Render at < 32 pt — anatomy breaks down

---

## 4 · Typography

### 4.1 Type Stack

```
Primary:    Inter (variable)
Numerics:   SF Pro Rounded (iOS) · Inter Tabular (everywhere else)
Fallback:   -apple-system, "Segoe UI", "Roboto", sans-serif
```

We chose Inter for its slightly rounded terminals, generous x-height,
and tabular-numeral feature — finance UIs live and die on the
alignment of currency amounts.

### 4.2 Type Scale (matches `theme.ts → TYPO`)

| Token | Size / Line | Weight | Tracking | Use |
|-------|-------------|--------|----------|-----|
| `display` | 40 / 48 | 700 | -0.4 | Hero balances ("₹12,420") |
| `h1` | 28 / 34 | 700 | -0.3 | Screen titles |
| `h2` | 22 / 28 | 600 | -0.2 | Section headers |
| `h3` | 18 / 24 | 600 | -0.1 | Card titles |
| `body` | 15 / 22 | 400 | 0 | Default copy |
| `bodyStrong` | 15 / 22 | 600 | 0 | Inline emphasis |
| `caption` | 13 / 18 | 400 | 0.1 | Helper text, timestamps |
| `microUpper` | 11 / 14 | 700 | 0.8 | "PREMIUM" / "LIVE" pills, all-caps |

### 4.3 Type Rules

✅ **DO**
- Use tabular numbers for every currency figure (`fontVariant: ['tabular-nums']`)
- Round-trip line-heights — body 22 / caption 18 / h1 34 — never odd values
- Limit type weights to 400 / 600 / 700 — never 500 or 800

❌ **DON'T**
- Use italic — at all
- All-caps anything > 18 pt
- Mix Inter with another sans-serif on the same screen

---

## 5 · UI Design Language

### 5.1 Geometry

| Element | Radius | Reason |
|---------|--------|--------|
| Buttons | 14 pt | Friendly but assertive |
| Cards | 20 pt | Premium "swiped from a wallet" feel |
| Sheets / Modals | 24 pt | Top corners only, hugs the safe area |
| Pills / Tags | 999 pt | Fully rounded for badge legibility |
| Inputs | 12 pt | Tight enough to read as input, soft enough to match cards |

### 5.2 Spacing — the **8 pt grid**

```
SPACE.xs  4
SPACE.sm  8
SPACE.md 16
SPACE.lg 24
SPACE.xl 32
SPACE.2x 48
```

Anything else is a code smell. If you find yourself reaching for 14 or
27 pt, step back — it's almost always wrong.

### 5.3 Elevation & Shadows

We use **3 elevation tiers** — never more.

| Tier | Use | iOS shadow | Android elevation |
|------|-----|------------|-------------------|
| 0 | Body, list rows | none | 0 |
| 1 | Cards, sheets | `0 4 12 / rgba(0,0,0,0.08)` | 4 |
| 2 | Floating CTA, modals | `0 8 24 / rgba(0,0,0,0.12)` | 12 |

Never use `tier 3` shadows. If your component needs more depth, it's
probably the wrong component.

### 5.4 Glassmorphism

Reserved for *premium* surfaces only:
- Splash hero
- Premium upgrade card
- Onboarding milestone celebration

Recipe (light mode):
```
background-color: rgba(255, 255, 255, 0.72)
backdrop-filter:  blur(24px) saturate(180%)
border:           1px solid rgba(255, 255, 255, 0.6)
```

In dark mode, swap to `rgba(0, 0, 0, 0.42)` and `border rgba(255,255,255,0.08)`.

Don't use glass on every card — it will feel cheap. Reserve it for
moments worth celebrating.

---

## 6 · Components — Reference Mapping

Each brand-kit element maps directly to an existing primitive. Don't
re-implement; use the primitive.

| Brand element | Code |
|---------------|------|
| Primary gradient CTA | `<PremiumButton variant="primary" />` |
| Secondary CTA | `<PremiumButton variant="ghost" />` |
| Mascot (animated) | `<MintuMascot state="..." />` |
| Empty state w/ mascot | `<EmptyState mascot title="..." />` |
| Currency input | `<CurrencyField />` |
| Smart suggestion chip | `<SmartSuggestion />` |
| Numeric pill / badge | `<GlowPill />` |
| Loading skeleton | `<Skeleton.Box />` |
| Confetti celebration | `<SuccessGlow />` |
| Spring-press wrapper | `<SpringPress>...</SpringPress>` |
| Staggered list reveal | `<StaggeredEntrance>` |

### 6.1 Buttons — the canonical CTA

```tsx
<PremiumButton
  label="Add transaction"
  onPress={...}
  size="md"          // sm | md | lg
  variant="primary"  // primary (gradient) | ghost (text only) | danger
/>
```

- Min touch target: **44 × 44 pt** (iOS HIG / Material)
- Pressed state: scale 0.96, gradient deepens 4 % towards `#FF3D00`
- Disabled: opacity 0.4, no glow

### 6.2 Cards

```tsx
// Glass card (premium moments only)
<PressableGlass onPress={...} feedback="light" style={{...}}>
  ...
</PressableGlass>

// Solid card (everywhere else)
<View style={{
  backgroundColor: '#FFFFFF',
  borderRadius: 20,
  padding: 16,
  ...SHADOW.tier1,
}}>
```

### 6.3 Inputs

```tsx
<PremiumInput
  label="Description"
  placeholder="Coffee with friends"
  returnKeyType="next"
  onSubmitEditing={() => nextRef.current?.focus()}
/>
```

- Always show label above (never floating-only — accessibility win)
- Error state: 1 px `#DC2626` border + 12 pt error text below
- Success state: 1 px `#16A34A` glow on blur

---

## 7 · Iconography

Use `Ionicons` (already in stack). Stick to **outline variants** for
neutral UI; switch to **filled** only when the icon represents an
*active* / *selected* state.

```
Outline    →  ionicon-name-outline   default state
Filled     →  ionicon-name           selected / unread / starred
```

- Stroke width: 1.5 pt at 24 pt size — never thicker
- Size scale: 16 / 20 / 24 / 28 / 32
- Custom icons (rare): match Ionicon's geometric language; export at 24 pt SVG with `fill="currentColor"`

When an icon needs to signal a primary action, paint it with the brand
gradient via `MaskedView` — but only ONE per screen.

---

## 8 · Motion & Interaction

### 8.1 Principles

1. **Motion serves meaning** — never decorate.
2. **UI thread only** — Reanimated worklets, no JS-bridge animations.
3. **Stop when done** — every loop has an exit. The mascot is the only
   continuous loop on screen.
4. **Respect reduce-motion** — every animation has a `disableMotion`
   prop or a global `useReducedMotion()` check.

### 8.2 Timing

| Action | Duration | Easing |
|--------|----------|--------|
| Tap response | 120 ms | `Easing.out(Easing.cubic)` |
| Sheet open | 320 ms | `Easing.out(Easing.cubic)` |
| Page transition | 240 ms | `Easing.inOut(Easing.cubic)` |
| Mascot breath | 3.2 s loop | `Easing.inOut(Easing.sin)` |
| Mascot success bounce | 360 ms | `Easing.out(Easing.cubic)` |
| Skeleton shimmer | 1.4 s loop | `Easing.linear` |

### 8.3 Micro-interactions

- **Pressable rows** → scale 0.985 on press-in, 1.0 on press-out (`<SpringPress />`)
- **Number changes** → tween via `<AnimatedNumber />` (200 ms cubic-out)
- **List reveal** → 70 ms stagger, 14 pt slide-up (`<StaggeredEntrance />`)
- **Goal funded** → `<MintuMascot state="success" />` + `<SuccessGlow />`

---

## 9 · Brand Asset Library

These are the assets every shipping touchpoint needs. Source files
live under `/app/frontend/assets/`.

| Asset | File | Size |
|-------|------|------|
| iOS app icon | `assets/images/icon.png` | 1024 × 1024 |
| Android adaptive | `assets/images/adaptive-icon.png` | 1024 × 1024 |
| Splash icon | `assets/images/splash-icon.png` | 1024 × 1024 |
| Web favicon | `assets/images/favicon.png` | 1024 × 1024 |
| 512 master | `assets/images/icon-512.png` | 1024 × 1024 |

### 9.1 Logo System

| Variant | When |
|---------|------|
| **Mark only** (mascot icon) | App icon, social avatar, video bug |
| **Wordmark only** (`MintU` in Inter 700 + gradient) | Footer, in-app header on small screens |
| **Lock-up** (mark + wordmark, horizontal) | Marketing site header, email signature |
| **Monochrome** (#FFFFFF on dark · #000000 on light) | Press, partner co-branding, embossed merch |

Wordmark spec:
- Font: Inter 700, tracking -0.3
- Letter spacing matters: `MintU`, NOT `Mint U` or `MINTU`
- Gradient version uses MaskedView with the primary gradient
- Minimum size: 64 pt wide. Below that → mark only.

### 9.2 Clear Space

Maintain a **clear space equal to ½ × the mascot helmet height**
around any logo placement. No content, even decorative dots, may
intrude into this margin.

---

## 10 · Marketing Visual Style

### 10.1 Hero Composition

```
┌────────────────────────────────────┐
│  TOP-LEFT       gradient #FF7A18    │
│   ╲                                 │
│    🤖   ← mascot, centered, 35 % w  │
│         glow ring at 90 %           │
│                                     │
│  H1 in Inter 700 · #FFFFFF          │
│  Sub in Inter 400 · #FFFFFFB3       │
│                                     │
│  [ Primary CTA (gradient) ]         │
│                       ╲             │
│  BOTTOM-RIGHT  gradient #FF3D00     │
└────────────────────────────────────┘
```

### 10.2 Social Templates

| Format | Aspect | Mascot size | Type lock |
|--------|--------|-------------|-----------|
| Instagram post | 1:1 | 30 % canvas | H1 + 1-line tagline |
| Story / Reel | 9:16 | 22 % canvas | H1 only, mascot animates |
| Twitter card | 16:9 | 18 % canvas | H1 left-aligned, mascot right |
| LinkedIn ad | 1.91:1 | 16 % canvas | "MintU helps you ___" formula |

### 10.3 Photography & Illustration

- **No stock photos** of human hands holding phones — feels dated
- Custom illustrations should match the mascot's geometry (rounded, soft 3D, gentle gradients)
- Screenshots of the app are the *primary* marketing visual; the mascot is the secondary

---

## 11 · Theme Migration Map

This brand-kit spec is slightly more saturated than the current
`theme.ts`. To migrate, run the codemod under `/app/scripts/codemod_*`
and rebuild:

| Current token (`theme.ts`) | New brand-kit value | Touch-points |
|---------------------------|---------------------|--------------|
| `accent.brand` `#F56E1E` | `#FF7A18` | splash CTA · onboarding (8 files) |
| `accent.primaryLight` `#FF6B1A` | `#FF7A18` | gradient stop · button glow (32 files) |
| `accent.primary` `#E84A0C` | `#FF3D00` | text-on-light · 7-day-streak ring |
| `accent.brandDark` `#C14A06` | `#FF3D00` | pressed CTA · active tab |
| `accent.warning` `#D97706` | `#D97706` | unchanged (semantic) |

These are the **only** colour token changes needed. Keep all spacing,
type, radius, and shadow tokens as-is.

---

## 12 · Quick-Reference Cheat Sheet

```
🟠 PRIMARY GRADIENT     #FF7A18 → #FF3D00 (135°)
✨ HIGHLIGHT GLOW       #FFA726
🌙 DARK BG              #000000
📄 LIGHT BG             #F5F5F5
🤖 MASCOT STATES        idle · thinking · success · error
🔠 FONT                 Inter (variable)
📐 GRID                 8 pt
🟩 RADII                12 (input) · 14 (button) · 20 (card) · 24 (sheet)
⏱ MOTION               120 ms tap · 240 ms page · 320 ms sheet
📱 TOUCH TARGET MIN     44 × 44 pt
```

---

## 13 · Living Document

Owner: Design + Eng leads, jointly.
Updated: June 2025.
Review cadence: every 6 months OR when a brand surface (mascot, logo,
colour, voice) ships a change.

When updating this file:
1. Bump the version number at the top
2. Add a `## Changelog` entry at the bottom
3. Open a Code-Owner-required PR — no solo edits

---

## Changelog

- **v1.0** (Jun 2025) · Initial brand kit derived from in-app DS 2.0 +
  the user-shipped robot mascot (Round 55). Single source of truth
  for product, marketing, and partner brand work.
