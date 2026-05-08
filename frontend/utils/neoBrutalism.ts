/**
 * utils/neoBrutalism.ts — Round 100Z.
 *
 * Full Neo-Brutalism design system. Replaces the Swiss-mono Round 76
 * `BR_COLORS` philosophy with a Memphis-Group / Duolingo-grade chunky,
 * shadow-heavy, multi-color token system. Both LIGHT and DARK variants.
 *
 * Light = Memphis bright (sky blue ground, yellow/lime/pink surfaces).
 * Dark  = Cyber neon (charcoal ground, neon-yellow CTA, purple cards).
 *
 * The OLD BR_COLORS export remains in `utils/brutalist.ts` for backward
 * compatibility with the 100+ files that import it. New work imports
 * from this file instead. Migration is incremental — surface by surface.
 *
 * Design DNA (the north star):
 *   1. THICK borders (3-4px, never hairline)
 *   2. HARD shadows (4-8px offset, ZERO blur, ZERO spread)
 *   3. CHUNKY radius (8-20px — not 0, not 32 — Memphis sweet spot)
 *   4. LOUD colors used PURPOSEFULLY:
 *        Rewards   → Cyber Yellow
 *        AI Coach  → Neon Purple
 *        Savings   → Electric Lime
 *        Alerts    → Coral
 *        Split     → Sky Blue
 *        Premium   → Black + Yellow accents
 *   5. STICKERS — rotated badges, hanging tags, decorative shapes
 *   6. TACTILE — every press compresses shadow + scales
 *   7. BIG TYPE — display weights, tight tracking, no thin grays
 */
import type { ViewStyle, TextStyle } from 'react-native';

// ─────────────────────────────────────────────────────────────────────
// 1. LIGHT THEME PALETTE — MintU mono-brand (orange + black + cream)
// ─────────────────────────────────────────────────────────────────────
//
// Round 100AE: Yellow dropped entirely. Rebuilt from scratch as a
// disciplined mono-brand palette: ORANGE + BLACK + CREAM + WHITE.
// Closer to CRED / Stripe / Robinhood — serious finance with one
// hero color, no decorative loudness.
//
//   • Mintu's body  → ORANGE       (#FF6B1A — primary brand)
//   • Mintu's outline → BLACK      (#0A0A0A — borders, premium)
//   • Mintu's face  → CREAM        (#FFF8F2 — warm bg)
//   • Surface       → WHITE        (#FFFFFF — cards)
//   • Soft warmth   → PEACH        (#FFEDD5 — secondary cards)
//   • Deep accent   → ORANGE-DEEP  (#E84A0C — hover/pressed)
//
// Plus narrow semantic-only:
//   • #16A34A success green (confirmations)
//   • #DC2626 danger red    (destructive)
//
// Legacy multi-color keys (lime/purple/sky/pink/mint/coral/yellow)
// are KEPT as aliases — every one now maps to the orange-family
// or semantic green/red. So legacy components don't crash on import;
// they render with the disciplined mono palette automatically.
export const NB_LIGHT = {
  // Ground
  bg:         '#FFF8F2',  // warm cream
  surface:    '#FFFFFF',  // paper-pure card surface
  surfaceAlt: '#FFEDD5',  // peach contrast card (warm)
  ink:        '#0A0A0A',  // borders, body text, icons
  inkSoft:    '#3F3F46',  // secondary text
  muted:      '#71717A',  // meta, timestamps

  // Brand trio (the only colors that should ever appear on chrome)
  orange:     '#FF6B1A',  // PRIMARY — Mintu's body
  orangeDeep: '#E84A0C',  // hover/pressed/coach (deeper warmth)
  orangeSoft: '#FFEDD5',  // peach soft surface (low-contrast warmth)
  black:      '#0A0A0A',  // premium surface
  blackInk:   '#FF6B1A',  // type ON black uses orange (CRED move)

  // Semantic-only colors (kept narrow — only for state communication)
  success:    '#16A34A',  // green — confirmations only
  danger:     '#DC2626',  // red   — destructive only

  // Legacy aliases — all REMAP to brand or semantic via roleColor().
  // Listed here for backward compat with components that still read
  // `palette.lime`/`palette.yellow`/etc. directly. They all resolve
  // to safe mono-brand values; the UI reads as ONE identity.
  lime:       '#FF6B1A',  // → orange
  limeInk:    '#FFFFFF',
  yellow:     '#FFEDD5',  // → peach soft (no more loud yellow)
  yellowInk:  '#0A0A0A',
  coral:      '#DC2626',  // → danger red (alerts only)
  coralInk:   '#FFFFFF',
  purple:     '#E84A0C',  // → orangeDeep
  purpleInk:  '#FFFFFF',
  sky:        '#0A0A0A',  // → black surface
  skyInk:     '#FF6B1A',
  pink:       '#FFEDD5',  // → peach soft
  pinkInk:    '#0A0A0A',
  mint:       '#16A34A',  // → success green
  mintInk:    '#FFFFFF',
} as const;

// ─────────────────────────────────────────────────────────────────────
// 2. DARK THEME PALETTE — Mono-brand on charcoal
// ─────────────────────────────────────────────────────────────────────
export const NB_DARK = {
  bg:         '#0E0E10',  // charcoal (NOT pure black)
  surface:    '#18181B',  // elevated card
  surfaceAlt: '#27272A',  // alternative card
  ink:        '#FAFAFA',  // borders, body text
  inkSoft:    '#D4D4D8',
  muted:      '#A1A1AA',

  // Brand trio — punchier on charcoal for visibility, but no yellow
  orange:     '#FF8538',  // brighter on charcoal
  orangeDeep: '#FF6B1A',
  orangeSoft: '#3D2A1F',  // dark peach for soft surfaces
  black:      '#FAFAFA',  // inverts on dark
  blackInk:   '#FF8538',

  success:    '#22C55E',
  danger:     '#EF4444',

  // Legacy aliases → all remap to brand
  lime:       '#FF8538',
  limeInk:    '#0A0A0A',
  yellow:     '#3D2A1F',
  yellowInk:  '#FAFAFA',
  coral:      '#EF4444',
  coralInk:   '#FAFAFA',
  purple:     '#FF6B1A',
  purpleInk:  '#FAFAFA',
  sky:        '#FAFAFA',
  skyInk:     '#FF8538',
  pink:       '#3D2A1F',
  pinkInk:    '#FAFAFA',
  mint:       '#22C55E',
  mintInk:    '#0A0A0A',
} as const;

export type NeoPalette = typeof NB_LIGHT;

// ─────────────────────────────────────────────────────────────────────
// 3. SHADOW PRESETS — hard, offset, ZERO blur
// ─────────────────────────────────────────────────────────────────────
//
// Three sizes covering the entire app:
//   sm  = chips, small tags        (3px offset)
//   md  = cards, default CTAs      (5px offset)
//   lg  = hero CTAs, modals, drama (7px offset)
//
// Shadow color is THEME-AWARE because hard shadows in dark mode need
// to come from the brand color (otherwise invisible on charcoal).
export function nbShadow(palette: NeoPalette, size: 'sm' | 'md' | 'lg' = 'md'): ViewStyle {
  const offset = size === 'sm' ? 3 : size === 'md' ? 5 : 7;
  return {
    shadowColor: palette.ink,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  };
}

/** Press-state shadow — same color, halved offset for tactile compress feel. */
export function nbShadowPressed(palette: NeoPalette, size: 'sm' | 'md' | 'lg' = 'md'): ViewStyle {
  const offset = size === 'sm' ? 1 : size === 'md' ? 2 : 3;
  return {
    shadowColor: palette.ink,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 4. BORDER WIDTHS — chunky, never hairline
// ─────────────────────────────────────────────────────────────────────
export const NB_BORDER = {
  thin:   2,   // chips, small badges
  medium: 3,   // default cards, CTAs
  thick:  4,   // hero CTAs, modals
  heavy:  5,   // accent decorations
} as const;

// ─────────────────────────────────────────────────────────────────────
// 5. RADIUS — Memphis sweet spot (NOT zero, NOT pill)
// ─────────────────────────────────────────────────────────────────────
export const NB_RADIUS = {
  none:  0,    // brutalist micro-elements
  sm:    8,    // chips, small cards
  md:    14,   // default cards (Memphis sweet spot)
  lg:    20,   // hero cards, modals
  pill:  999,  // category chips, mascot rings
} as const;

// ─────────────────────────────────────────────────────────────────────
// 6. SPACING — 4pt grid (tighter than Swiss 8pt for chunky density)
// ─────────────────────────────────────────────────────────────────────
export const NB_SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  xxxl: 48,
  xxxxl: 64,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 7. TYPOGRAPHY — display weights, tight tracking
// ─────────────────────────────────────────────────────────────────────
export const NB_TYPE = {
  // Display — homepage hero, celebration overlays
  display:  { fontSize: 48, fontWeight: '900', letterSpacing: -1.6, lineHeight: 50 } as TextStyle,
  // H1 — section page titles
  h1:       { fontSize: 34, fontWeight: '900', letterSpacing: -1.0, lineHeight: 38 } as TextStyle,
  h2:       { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, lineHeight: 30 } as TextStyle,
  h3:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, lineHeight: 24 } as TextStyle,

  // Loud label — sticker/badge text
  loud:     { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, lineHeight: 13, textTransform: 'uppercase' } as TextStyle,
  loudLg:   { fontSize: 14, fontWeight: '900', letterSpacing: 1.2, lineHeight: 16, textTransform: 'uppercase' } as TextStyle,

  // Body
  body:     { fontSize: 15, fontWeight: '600', letterSpacing: 0,    lineHeight: 22 } as TextStyle,
  bodyBold: { fontSize: 15, fontWeight: '900', letterSpacing: 0,    lineHeight: 22 } as TextStyle,
  sub:      { fontSize: 13, fontWeight: '600', letterSpacing: 0,    lineHeight: 18 } as TextStyle,

  // CTA text — chunky, all caps
  cta:      { fontSize: 15, fontWeight: '900', letterSpacing: 1.0,  textTransform: 'uppercase' } as TextStyle,
  ctaLg:    { fontSize: 17, fontWeight: '900', letterSpacing: 1.0,  textTransform: 'uppercase' } as TextStyle,

  // Numbers — display weight for amounts
  num:      { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 } as TextStyle,
  numLg:    { fontSize: 38, fontWeight: '900', letterSpacing: -1.4, lineHeight: 42 } as TextStyle,
  numXl:    { fontSize: 56, fontWeight: '900', letterSpacing: -2.0, lineHeight: 60 } as TextStyle,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 8. ROTATION PRESETS — for sticker chaos
// ─────────────────────────────────────────────────────────────────────
export const NB_ROTATE = {
  none:  '0deg',
  tilt1: '-2deg',
  tilt2: '2deg',
  tilt3: '-4deg',
  tilt4: '4deg',
  tilt5: '-6deg',
  tilt6: '6deg',
  spin1: '-12deg',
  spin2: '12deg',
} as const;

// ─────────────────────────────────────────────────────────────────────
// 9. SEMANTIC COLOR ROLES — domain-driven mapping
// ─────────────────────────────────────────────────────────────────────
//
// Use these instead of raw colors for semantic clarity in components.
// Components grab role colors from the active palette so theme switch
// just works.
export type NeoRole =
  | 'primary'    // brand action — orange-y in light, neon in dark
  | 'rewards'    // yellow — XP, streak, achievements
  | 'savings'    // lime — saving wins, goal progress
  | 'coach'      // purple — AI Coach moments
  | 'split'      // sky — group expenses
  | 'alert'      // coral — overspend / danger
  | 'success'    // mint — confirmation
  | 'premium'    // black — pro tier
  | 'neutral';   // surface fallback

export function roleColor(p: NeoPalette, r: NeoRole): { bg: string; ink: string } {
  // R100AE — Mono-brand role mapping. NO yellow anywhere. Every role
  // resolves to orange-family or narrow semantic green/red. Result:
  // disciplined CRED-style identity. Hierarchy now communicated by
  // weight/depth rather than color spread.
  switch (r) {
    case 'rewards': return { bg: p.orangeSoft, ink: '#0A0A0A' };  // soft peach (earned, not loud)
    case 'savings': return { bg: p.orange,     ink: '#FFFFFF' };  // brand orange
    case 'coach':   return { bg: p.orangeDeep, ink: '#FFFFFF' };  // deeper orange — Mintu IS the coach
    case 'split':   return { bg: p.black,      ink: '#FF6B1A' };  // premium black + orange accent
    case 'alert':   return { bg: p.danger,     ink: '#FFFFFF' };  // red — destructive only
    case 'success': return { bg: p.success,    ink: '#FFFFFF' };  // green — confirmations only
    case 'premium': return { bg: p.black,      ink: '#FF6B1A' };  // black surface + orange ink (CRED move)
    case 'primary': return { bg: p.orange,     ink: '#FFFFFF' };  // brand orange CTA
    case 'neutral':
    default:        return { bg: p.surface,    ink: p.ink };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 10. ANIMATION CURVES (for Reanimated)
// ─────────────────────────────────────────────────────────────────────
export const NB_MOTION = {
  // Tactile — fast and physical (under 200ms)
  press:    { duration: 90,  damping: 20, stiffness: 300 },
  release:  { duration: 160, damping: 14, stiffness: 220 },
  // Pop — celebrations
  pop:      { duration: 220, damping: 8,  stiffness: 180 },
  // Slide — sheet/modal entrances
  slide:    { duration: 280, damping: 18, stiffness: 200 },
} as const;

// Convenience export: light is the default until theme store flips it.
export default NB_LIGHT;
