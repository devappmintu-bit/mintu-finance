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
// 1. LIGHT THEME PALETTE — MintU mono-brand + semantic accents
// ─────────────────────────────────────────────────────────────────────
//
// Round 100AF: Brand chrome stays mono (orange + black + cream — the
// disciplined identity from R100AE), but semantic colors return as
// CATEGORY/STATE ACCENTS only. This is the Stripe/Linear approach:
//   - Orange  = brand chrome (CTAs, hero, tab bar)
//   - Green   = savings / positive deltas
//   - Red     = overspend / destructive
//   - Blue    = analytics / insights
//   - Yellow  = alerts / rewards (NOT brand chrome)
//   - Purple  = AI / coach (NOT brand chrome)
//
// The semantic accents appear on chips, badges, chart bars, status
// pills — NEVER on primary CTAs or hero cards (those stay orange).
// Result: one brand identity + clear category signaling.
export const NB_LIGHT = {
  // Ground
  bg:         '#FFF8F2',  // warm cream
  surface:    '#FFFFFF',  // paper-pure
  surfaceAlt: '#FFEDD5',  // peach soft
  ink:        '#0A0A0A',
  inkSoft:    '#3F3F46',
  muted:      '#71717A',

  // Brand chrome (the only colors on primary CTAs / hero)
  orange:     '#FF8C66',  // PRIMARY — Mintu's body
  orangeDeep: '#F56E1E',  // hover/pressed
  orangeSoft: '#FFEDD5',  // peach soft surface
  black:      '#0A0A0A',
  blackInk:   '#FF8C66',

  // Semantic accents (category / state communication ONLY — never chrome)
  success:    '#16A34A',  // savings / growth
  successSoft:'#DCFCE7',
  danger:     '#DC2626',  // overspend / destructive
  dangerSoft: '#FEE2E2',
  info:       '#2563EB',  // analytics / insights
  infoSoft:   '#DBEAFE',
  warn:       '#F59E0B',  // alerts / rewards (semantic yellow — NOT brand)
  warnSoft:   '#FEF3C7',
  ai:         '#8B5CF6',  // AI / coach (semantic purple — NOT brand)
  aiSoft:     '#EDE9FE',

  // Legacy aliases — remap to semantic accents
  lime:       '#16A34A',  // → success
  limeInk:    '#FFFFFF',
  yellow:     '#F59E0B',  // → warn
  yellowInk:  '#0A0A0A',
  coral:      '#DC2626',  // → danger
  coralInk:   '#FFFFFF',
  purple:     '#8B5CF6',  // → ai
  purpleInk:  '#FFFFFF',
  sky:        '#2563EB',  // → info
  skyInk:     '#FFFFFF',
  pink:       '#FFEDD5',
  pinkInk:    '#0A0A0A',
  mint:       '#16A34A',
  mintInk:    '#FFFFFF',
} as const;

// ─────────────────────────────────────────────────────────────────────
// 2. DARK THEME PALETTE — Cyber MintU + neonified semantics
// ─────────────────────────────────────────────────────────────────────
export const NB_DARK = {
  bg:         '#0E0E10',
  surface:    '#18181B',
  surfaceAlt: '#27272A',
  ink:        '#FAFAFA',
  inkSoft:    '#D4D4D8',
  muted:      '#A1A1AA',

  orange:     '#FF8538',
  orangeDeep: '#FF8C66',
  orangeSoft: '#3D2A1F',
  black:      '#FAFAFA',
  blackInk:   '#FF8538',

  // Neonified semantic accents — punchier, retain category meaning
  success:    '#22C55E',
  successSoft:'#1E3D2A',
  danger:     '#EF4444',
  dangerSoft: '#3D1F1F',
  info:       '#3B82F6',
  infoSoft:   '#1E2D3D',
  warn:       '#FBBF24',
  warnSoft:   '#3D2F1E',
  ai:         '#A78BFA',
  aiSoft:     '#2A1E3D',

  // Legacy aliases
  lime:       '#22C55E',
  limeInk:    '#0A0A0A',
  yellow:     '#FBBF24',
  yellowInk:  '#0A0A0A',
  coral:      '#EF4444',
  coralInk:   '#FAFAFA',
  purple:     '#A78BFA',
  purpleInk:  '#0A0A0A',
  sky:        '#3B82F6',
  skyInk:     '#FAFAFA',
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
// 5. RADIUS — Round 100AF: bumped to brutalist sweet spot 20-32px
// ─────────────────────────────────────────────────────────────────────
//
// Old: 0/8/14/20/pill (Memphis)
// New: 0/16/24/32/pill — chunkier, more sticker-like, more tactile.
// Cards/CTAs/heroes feel oversized and collectible. Chips stay pill.
export const NB_RADIUS = {
  none:  0,    // brutalist micro-elements (rare)
  sm:    16,   // chips, small cards (was 8)
  md:    24,   // default cards (was 14)
  lg:    32,   // hero cards, modals (was 20)
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
  // R100AF — Mono-brand chrome + semantic accents.
  // Primary CTAs and hero stay ORANGE (brand chrome). Category and
  // state roles use semantic accents (preserves MintU's existing
  // color meanings: green=savings, red=overspend, yellow=alerts/rewards,
  // purple=AI, blue=analytics).
  switch (r) {
    case 'rewards': return { bg: p.warn,       ink: '#0A0A0A' };  // semantic yellow — alerts/rewards
    case 'savings': return { bg: p.success,    ink: '#FFFFFF' };  // semantic green — growth/savings
    case 'coach':   return { bg: p.ai,         ink: '#FFFFFF' };  // semantic purple — AI/coach
    case 'split':   return { bg: p.info,       ink: '#FFFFFF' };  // semantic blue — analytics/social
    case 'alert':   return { bg: p.danger,     ink: '#FFFFFF' };  // semantic red — overspend/destructive
    case 'success': return { bg: p.success,    ink: '#FFFFFF' };  // semantic green — confirmations
    case 'premium': return { bg: p.black,      ink: '#FF8C66' };  // black + orange ink (CRED move)
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
