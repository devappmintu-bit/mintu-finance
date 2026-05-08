/**
 * MintU Neo-Brutalism Design System — v1 (R103)
 *
 * The single source of truth for the full-app brutalist rebuild.
 * Additive: existing screens keep importing `utils/theme.ts > COLORS`;
 * the new screens (Phase 2+) consume tokens from THIS file directly,
 * or via the `components/brutal/*` primitive library.
 *
 * Design pillars from the brief:
 *   • Thick 3–5 px borders, hard offset shadows, layered cards
 *   • Vibrant gradients, neon accents, soft cream surfaces
 *   • Playful oversized UI, rounded brutalist geometry
 *   • Tactile interactions, depth illusion, spring physics
 *
 * Tokens are FROZEN objects — never mutate at runtime. If we add
 * theme switching later, we'll proxy at the consumer level.
 */
import { Platform, type TextStyle } from 'react-native';

/* ─────────────────────────────────────────────────────────────
 * 1. PALETTE — Light "playful editorial magazine"
 *    + Dark "cyberpunk brutalism" (built but not flipped yet)
 * ──────────────────────────────────────────────────────────── */

export const PALETTE = Object.freeze({
  /** Foundation: matte black, deep charcoal, papers, creams */
  ink:         '#0A0A0A',     // Hard borders, primary text on light
  charcoal:    '#1F1F1F',     // Dark surfaces (dark mode bg)
  graphite:    '#2A2A2A',     // Mid-tier dark
  smoke:       '#5A5A5A',     // Muted text on light
  ash:         '#8A8A8A',     // Captions / placeholder
  paper:       '#FFFFFF',     // Cards on light bg
  cream:       '#FAF6EE',     // Warm canvas (default light bg)
  parchment:   '#FFF7E1',     // Warmer "highlight" bg for cards
  lavender:    '#F5F0FF',     // Subtle alternate surface (premium feel)
  mist:        '#F1F5F9',     // Cool alt surface

  /** MintU mascot brand orange — kept as PRIMARY accent so the
   *  brutalist rebuild doesn't fight identity. Yellow becomes a
   *  secondary accent for highlight callouts only. */
  brand:       '#F56E1E',     // Bright orange — mascot / primary CTA
  brandDeep:   '#C14A06',     // Pressed / dark variant
  brandSoft:   '#FFF7ED',     // Warm-orange tint surface
  /** Vibrant brutalist accents (high contrast, intentional clashes) */
  lime:        '#C7F464',     // Neon lime — POSITIVE / celebrate
  limeDeep:    '#A8DA42',
  purple:      '#A78BFA',     // Electric purple — premium highlight
  purpleDeep:  '#7C3AED',
  yellow:      '#FFD93D',     // Bright yellow — secondary highlight
  yellowDeep:  '#E8B800',
  peach:       '#FFB199',     // Peach orange — warm callouts
  peachDeep:   '#FF8C66',
  cyan:        '#7DD3FC',     // Cyan — info / data viz
  cyanDeep:    '#0EA5E9',
  pink:        '#FB7185',     // Magenta accent (rare use)
  pinkDeep:    '#E11D48',

  /** Semantic states — calibrated for ink-on-cream contrast */
  success:     '#16A34A',
  successSoft: '#DCFCE7',
  warning:     '#D97706',
  warningSoft: '#FEF3C7',
  danger:      '#DC2626',
  dangerSoft:  '#FEE2E2',
  info:        '#2563EB',
  infoSoft:    '#DBEAFE',
});

/* ─────────────────────────────────────────────────────────────
 * 2. SEMANTIC ROLES — what to reach for in screens
 * ──────────────────────────────────────────────────────────── */
export const BR_COLORS = Object.freeze({
  /** Surfaces */
  bg:          PALETTE.cream,         // Default canvas
  bgAlt:       PALETTE.lavender,      // Alt-surface for layered sections
  bgWarm:      PALETTE.parchment,
  bgCool:      PALETTE.mist,
  card:        PALETTE.paper,
  cardWarm:    PALETTE.parchment,
  cardLavender: PALETTE.lavender,

  /** Lines & frames */
  ink:         PALETTE.ink,           // Borders + primary text
  line:        '#E5E5E5',             // Subtle inner divider
  lineStrong:  '#0A0A0A22',           // 13% ink

  /** Type */
  text:        PALETTE.ink,
  textMuted:   PALETTE.smoke,
  textFaint:   PALETTE.ash,
  textOnDark:  '#FFFFFF',
  textOnAccent: PALETTE.ink,          // Brutal: keep dark text on yellow/lime

  /** Accent roles — PRIMARY is mascot orange to preserve identity */
  accent:      PALETTE.brand,         // Mascot orange — default CTA fill
  accentText:  '#FFFFFF',
  positive:    PALETTE.lime,
  positiveText: PALETTE.ink,
  premium:     PALETTE.purple,
  premiumText: PALETTE.ink,
  cool:        PALETTE.cyan,
  coolText:    PALETTE.ink,
  warm:        PALETTE.peach,
  warmText:    PALETTE.ink,
  highlight:   PALETTE.yellow,        // Secondary highlight (Smart Settle, alerts)
  highlightText: PALETTE.ink,

  /** State (re-exported for terseness) */
  success:     PALETTE.success,
  successSoft: PALETTE.successSoft,
  warning:     PALETTE.warning,
  warningSoft: PALETTE.warningSoft,
  danger:      PALETTE.danger,
  dangerSoft:  PALETTE.dangerSoft,
  info:        PALETTE.info,
  infoSoft:    PALETTE.infoSoft,
});

/* ─────────────────────────────────────────────────────────────
 * 3. BORDERS — thick is the point
 * ──────────────────────────────────────────────────────────── */
export const BR_BORDER = Object.freeze({
  hair:    1,
  fine:    1.5,
  base:    2,    // Default brutal frame
  thick:   3,    // Buttons, hero cards
  thicker: 4,    // Top-level brutal billboards
  slab:    5,    // Splash / showcase
});

/* ─────────────────────────────────────────────────────────────
 * 4. STAMP SHADOWS — hard offset, never blurred
 *    Use platform-aware: native uses shadow* + elevation 0,
 *    web/Android picks up via React Native Web fallback.
 * ──────────────────────────────────────────────────────────── */
const stamp = (dx: number, dy: number) => ({
  shadowColor: PALETTE.ink,
  shadowOpacity: 1,
  shadowRadius: 0,
  shadowOffset: { width: dx, height: dy },
  // RNW respects boxShadow via this — keep elevation 0 to disable Android
  // soft blur and force the brutal hard-edge look.
  elevation: 0,
});

export const BR_SHADOW = Object.freeze({
  none: { shadowColor: 'transparent' },
  xs:   stamp(2, 2),    // Chips, tiny pills
  sm:   stamp(3, 3),    // Cards default
  md:   stamp(4, 4),    // Buttons
  lg:   stamp(6, 6),    // Hero cards
  xl:   stamp(8, 8),    // Floating decorative slabs
  /** "Pressed" — translateY shifts content into the shadow */
  pressShift: { transform: [{ translateY: 2 }] as any },
});

/* ─────────────────────────────────────────────────────────────
 * 5. RADIUS — brutal "corners" (not pillows)
 * ──────────────────────────────────────────────────────────── */
export const BR_RADIUS = Object.freeze({
  sharp:  0,
  xs:     4,
  sm:     8,
  md:     12,
  lg:     16,
  xl:     24,
  pill:   999,
});

/* ─────────────────────────────────────────────────────────────
 * 6. SPACING — 4-pt rhythm, with brutalist breathing room
 * ──────────────────────────────────────────────────────────── */
export const BR_SPACE = Object.freeze({
  '0':  0,
  '1':  4,
  '2':  8,
  '3':  12,
  '4':  16,
  '5':  20,
  '6':  24,
  '7':  28,
  '8':  32,
  '10': 40,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
});

/* ─────────────────────────────────────────────────────────────
 * 7. TYPOGRAPHY — editorial, oversized, expressive
 * ──────────────────────────────────────────────────────────── */
const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, "SF Mono", Menlo, monospace',
});

export const BR_FONT = Object.freeze({
  display: {
    fontSize: 40,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  h1: {
    fontSize: 28,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  h2: {
    fontSize: 22,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  h3: {
    fontSize: 18,
    fontWeight: '800' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  bodyLg: {
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 16,
  },
  /** All-caps brutal stamp labels — paired with letterSpacing */
  stamp: {
    fontSize: 11,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  stampSm: {
    fontSize: 9,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  /** Numerics use mono for ledger alignment */
  mono: {
    fontFamily: MONO,
    fontWeight: '900' as TextStyle['fontWeight'],
  },
  numericLg: {
    fontFamily: MONO,
    fontSize: 32,
    fontWeight: '900' as TextStyle['fontWeight'],
    letterSpacing: -0.5,
  },
  numeric: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '900' as TextStyle['fontWeight'],
  },
});

/* ─────────────────────────────────────────────────────────────
 * 8. MOTION — spring presets
 *    Consumed by react-native-reanimated `withSpring(value, preset)`.
 * ──────────────────────────────────────────────────────────── */
export const BR_SPRING = Object.freeze({
  /** Snappy — the default for taps + tiny shifts */
  snappy:  { damping: 18, stiffness: 320, mass: 0.7 },
  /** Bouncy — playful for celebrations + reveals */
  bouncy:  { damping: 12, stiffness: 220, mass: 0.85 },
  /** Gentle — ambient idle motion (mascot float, badge bob) */
  gentle:  { damping: 22, stiffness: 90,  mass: 1 },
  /** Punchy — buttons compressing on press */
  punchy:  { damping: 14, stiffness: 420, mass: 0.5 },
});

export const BR_TIMING = Object.freeze({
  fast:    150,
  base:    220,
  slow:    320,
  cinema:  520,
});

/* ─────────────────────────────────────────────────────────────
 * 9. LAYERS — z-index discipline
 * ──────────────────────────────────────────────────────────── */
export const BR_Z = Object.freeze({
  base: 0,
  raised: 1,
  card: 5,
  sticky: 10,
  header: 20,
  drawer: 50,
  sheet: 60,
  toast: 80,
  modal: 100,
});

/* ─────────────────────────────────────────────────────────────
 * 10. COMPOSITE SHORTCUTS — common combos so screen code is terse
 * ──────────────────────────────────────────────────────────── */
export const BR_CARD = Object.freeze({
  base: {
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    ...BR_SHADOW.sm,
  },
  hero: {
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.md,
    ...BR_SHADOW.lg,
  },
  warm: {
    backgroundColor: BR_COLORS.cardWarm,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    ...BR_SHADOW.sm,
  },
});

/** Convenience aliases used by primitives + screens */
export const INK = BR_COLORS.ink;
export const PAPER = BR_COLORS.card;
export const CREAM = BR_COLORS.bg;
export const ACCENT_BRAND = PALETTE.brand;       // PRIMARY (mascot orange)
export const ACCENT_YELLOW = PALETTE.yellow;      // Secondary highlight
export const ACCENT_LIME = PALETTE.lime;
export const ACCENT_PURPLE = PALETTE.purple;
export const ACCENT_PEACH = PALETTE.peach;
export const ACCENT_CYAN = PALETTE.cyan;

/* ─────────────────────────────────────────────────────────────
 * 11. HELPERS
 * ──────────────────────────────────────────────────────────── */

/** Accent role → matching ink-on-light style. Used by buttons/chips. */
export type BrutalTone =
  | 'accent'    // mascot orange (PRIMARY)
  | 'highlight' // yellow (secondary callouts)
  | 'positive'  // lime
  | 'premium'   // purple
  | 'cool'      // cyan
  | 'warm'      // peach
  | 'ink'       // black on cream
  | 'paper'     // ghost
  | 'danger'
  | 'success'
  | 'warning';

export const TONE_BG: Record<BrutalTone, string> = {
  accent:    PALETTE.brand,
  highlight: PALETTE.yellow,
  positive:  PALETTE.lime,
  premium:   PALETTE.purple,
  cool:      PALETTE.cyan,
  warm:      PALETTE.peach,
  ink:       PALETTE.ink,
  paper:     PALETTE.paper,
  danger:    PALETTE.danger,
  success:   PALETTE.success,
  warning:   PALETTE.warning,
};

export const TONE_FG: Record<BrutalTone, string> = {
  accent:    '#FFFFFF',
  highlight: PALETTE.ink,
  positive:  PALETTE.ink,
  premium:   PALETTE.ink,
  cool:      PALETTE.ink,
  warm:      PALETTE.ink,
  ink:       '#FFFFFF',
  paper:     PALETTE.ink,
  danger:    '#FFFFFF',
  success:   '#FFFFFF',
  warning:   PALETTE.ink,
};

/** Hard 1-line export so screens can `import * as Brutal from 'theme/brutal'`. */
const Brutal = {
  PALETTE,
  COLORS: BR_COLORS,
  BORDER: BR_BORDER,
  SHADOW: BR_SHADOW,
  RADIUS: BR_RADIUS,
  SPACE: BR_SPACE,
  FONT: BR_FONT,
  SPRING: BR_SPRING,
  TIMING: BR_TIMING,
  Z: BR_Z,
  CARD: BR_CARD,
  TONE_BG,
  TONE_FG,
};
export default Brutal;
