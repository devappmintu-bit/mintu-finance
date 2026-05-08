/**
 * utils/brutalist.ts — Round 76.
 *
 * Design token system for the Brutalist + Swiss + Minimal direction.
 *
 * Principles (the north star for every pixel):
 *   1. CLARITY over decoration — hard edges, stark contrast, no softening
 *   2. HIERARCHY via typography + grid — NOT via color or shadow
 *   3. MONOCHROME base + ONE accent — black + brand orange only
 *   4. STRUCTURE exposed — hairline black borders, not drop shadows
 *   5. NUMBERS are honoured — mono font for every currency / count
 *   6. GRIDS are sacred — 8pt base grid, strict left-alignment
 *
 * NOT used:
 *   ❌ Gradients          (R72's orange gradient CTAs get flat orange)
 *   ❌ BlurView / glass   (R71's AskBar blur → solid black)
 *   ❌ Soft drop shadows  (replaced with 1-2px hard black borders)
 *   ❌ Rounded 24px       (max radius is 6px; most = 0 or 2)
 *   ❌ Pastel tones       (no soft reds / ambers / blues; use solid 600 weights)
 *
 * Roll-out: import these tokens, don't import the glass `COLORS` /
 * `RADIUS` in the same file. Mixing the two systems is explicitly
 * banned — that's how visual coherence dies.
 */

// ─────────────────────────────────────────────────────────────────────
// 1. COLOR — 8 values, no more
// ─────────────────────────────────────────────────────────────────────
export const BR_COLORS = {
  // Base (greyscale is all we need for 90% of UI)
  ink:        '#0A0A0A',  // pure-ish black — borders, text, icons
  paper:      '#FAFAF7',  // off-white warm paper — background
  paperAlt:   '#F3F2ED',  // slightly darker paper — striped rows, wells
  line:       '#E4E2DB',  // hairline on paper
  muted:      '#6B6B6B',  // secondary text, de-emphasized
  quiet:      '#9E9A92',  // meta labels, timestamps

  // THE ONE accent — orange (kept from brand to preserve recognition)
  accent:     '#F56E1E',  // brand orange, solid
  accentInk:  '#FFFFFF',  // text/icon on accent surface

  // Semantic — solid, no pastels
  positive:   '#0B6E3A',  // saving / ok
  negative:   '#B21A1A',  // overspend / due / urgent
  warning:    '#B87400',  // attention
} as const;

// ─────────────────────────────────────────────────────────────────────
// 2. TYPOGRAPHY — Swiss grotesque + mono numbers
// ─────────────────────────────────────────────────────────────────────
// We don't load new fonts (keeps bundle lean). Instead we lean on
// system UI font with tight tracking + heavy weights for Swiss feel,
// and the system mono for numbers.
export const BR_FONT = {
  // Default stack — maps to `System` on RN; browsers get a native
  // Swiss-like grotesque.
  sans: 'System',
  // Monospace stack for numbers + codes. RN hands this to the
  // platform's default mono font.
  mono: 'Menlo',
} as const;

export const BR_TYPE = {
  // H1 — the page-level brutalist headline.
  // Massive, tight-tracked, ALL CAPS by default (StyleSheet applies
  // textTransform; content stays normal case in JSX for a11y).
  h1:       { fontSize: 38, fontWeight: '900' as const, letterSpacing: -1.2, lineHeight: 40 },
  h2:       { fontSize: 26, fontWeight: '900' as const, letterSpacing: -0.6, lineHeight: 30 },
  h3:       { fontSize: 18, fontWeight: '800' as const, letterSpacing: -0.3, lineHeight: 22 },

  // Section label — all caps, heavy tracking. The Swiss workhorse.
  label:    { fontSize: 10,   fontWeight: '800' as const, letterSpacing: 2.0, lineHeight: 12, textTransform: 'uppercase' as const },
  labelSm:  { fontSize: 9,    fontWeight: '700' as const, letterSpacing: 1.4, lineHeight: 11, textTransform: 'uppercase' as const },

  // Body
  body:     { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0,    lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '800' as const, letterSpacing: 0,    lineHeight: 22 },
  sub:      { fontSize: 13, fontWeight: '500' as const, letterSpacing: 0,    lineHeight: 18 },
  meta:     { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.1,  lineHeight: 14 },

  // Numbers always get the mono font — the signature Brutalist move.
  num:      { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.3, fontFamily: BR_FONT.mono },
  numLg:    { fontSize: 42, fontWeight: '900' as const, letterSpacing: -1.5, fontFamily: BR_FONT.mono, lineHeight: 46 },
} as const;

// ─────────────────────────────────────────────────────────────────────
// 3. GRID — 8pt base, strict
// ─────────────────────────────────────────────────────────────────────
export const BR_SPACE = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
  xxxl: 48,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 4. BORDERS — hard hairlines, no shadows
// ─────────────────────────────────────────────────────────────────────
export const BR_BORDER = {
  // Hairline (1px) - the default card edge
  hair:     1,
  // Bold (2px) - active states, primary surfaces
  bold:     2,
  // Heavy (3px) - maximum weight for buttons on press
  heavy:    3,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 5. RADIUS — nearly-zero by default
// ─────────────────────────────────────────────────────────────────────
export const BR_RADIUS = {
  none: 0,
  s:    2,
  m:    4,
  l:    6,     // max — used for primary CTAs only
} as const;

// ─────────────────────────────────────────────────────────────────────
// 6. MOTION — subtle, never decorative
// ─────────────────────────────────────────────────────────────────────
export const BR_MOTION = {
  // Instant feel. Brutalist design avoids "pretty" easings.
  snap:   { duration: 120, easing: 'linear' as const },
  ease:   { duration: 200, easing: 'ease-out' as const },
} as const;


// ─────────────────────────────────────────────────────────────────────
// 7. OFFSET STAMP — flat 2D drop on INK (no blur). Swiss/brutalist depth.
//    Usage: style={[styles.card, BR_STAMP.md]}
// ─────────────────────────────────────────────────────────────────────
import { Platform, ViewStyle } from 'react-native';

const stamp = (x: number, y: number, color: string = BR_COLORS.ink): ViewStyle =>
  (Platform.select<ViewStyle>({
    web:     { boxShadow: `${x}px ${y}px 0px 0px ${color}` } as any,
    ios:     { shadowColor: color, shadowOffset: { width: x, height: y }, shadowOpacity: 1, shadowRadius: 0 },
    android: { elevation: 3 },
    default: {},
  }) || {}) as ViewStyle;

export const BR_STAMP = {
  sm: stamp(2, 2),
  md: stamp(4, 4),
  lg: stamp(6, 6),
  accent: stamp(4, 4, BR_COLORS.accent),
  negative: stamp(4, 4, BR_COLORS.negative),
};
