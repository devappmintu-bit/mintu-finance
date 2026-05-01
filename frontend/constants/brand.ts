/**
 * Brand Kit v1.0 — strongly-typed tokens.
 *
 * This is the **runtime mirror** of `/app/memory/BRAND_KIT.md`. Any
 * component or marketing surface that needs a brand value should
 * import from here, NOT hard-code hex strings.
 *
 *     import { BRAND, BRAND_GRADIENT, MASCOT_STATES } from '@/constants/brand';
 *
 * Why a separate file instead of merging into `theme.ts`?
 *   • `theme.ts` is the *current* design system — touched by 200+
 *     screens. Mutating it forces a global re-render risk.
 *   • This file is the *brand* spec — colors, gradient stops, sizing
 *     for marketing/launch surfaces and any future redesign.
 *   • The mapping between `theme.ts` tokens and brand spec lives in
 *     BRAND_KIT.md §11 (Theme Migration Map).
 *
 * Keep this file 100 % aligned with BRAND_KIT.md. Whenever you bump
 * one, bump the other in the same PR.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/* ─────────────────────────────────────────────────────────────────
 *  COLOUR TOKENS
 * ──────────────────────────────────────────────────────────────── */

/** The defining brand gradient — used on every CTA, hero, splash. */
export const BRAND_GRADIENT = ['#FF7A18', '#FF3D00'] as const;

/** Brand-kit master object. Treat as read-only (`as const`). */
export const BRAND = {
  // Primary gradient stops — also exported individually as BRAND_GRADIENT.
  primary: {
    warm: '#FF7A18',
    deep: '#FF3D00',
    /** Default linear-gradient angle, radians-friendly for Reanimated. */
    angleDeg: 135,
  },

  // Highlights — used sparingly (badges, glow rings, mascot eye glint).
  accent: {
    glow: '#FFA726',
    soft: '#FFB74D',
  },

  // Neutrals — backgrounds and text.
  neutral: {
    black: '#000000',
    nearBlack: '#121212',
    white: '#FFFFFF',
    surface: '#F5F5F5',
  },

  // Semantic state colours — money flow & system status.
  state: {
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#2563EB',
  },

  // Glassmorphism recipes — only on premium surfaces.
  glass: {
    light: {
      backgroundColor: 'rgba(255, 255, 255, 0.72)',
      borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    dark: {
      backgroundColor: 'rgba(0, 0, 0, 0.42)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
  },
} as const;

/* ─────────────────────────────────────────────────────────────────
 *  GEOMETRY
 * ──────────────────────────────────────────────────────────────── */

/** Border-radius scale — pulled straight from BRAND_KIT.md §5.1. */
export const BRAND_RADIUS = {
  input: 12,
  button: 14,
  card: 20,
  sheet: 24,
  pill: 999,
} as const;

/** 8 pt grid. Anything else is a code smell. */
export const BRAND_SPACE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** 3-tier shadow ladder. Never invent a 4th. */
export const BRAND_ELEVATION = {
  // Tier 0 — body, list rows.
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  // Tier 1 — cards, sheets.
  tier1: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // Tier 2 — floating CTA, modals.
  tier2: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
} as const;

/* ─────────────────────────────────────────────────────────────────
 *  TYPOGRAPHY
 * ──────────────────────────────────────────────────────────────── */

/** Type scale — keep weights to 400/600/700 only. */
export const BRAND_TYPE = {
  display: { fontSize: 40, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -0.4 },
  h1:      { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2:      { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.2 },
  h3:      { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.1 },
  body:    { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: 0.1 },
  microUpper: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;

/* ─────────────────────────────────────────────────────────────────
 *  MOTION
 * ──────────────────────────────────────────────────────────────── */

/** Animation durations — see BRAND_KIT.md §8.2. */
export const BRAND_MOTION = {
  tap: 120,
  page: 240,
  sheet: 320,
  mascotBreathIdle: 3200,
  mascotBreathThinking: 1100,
  mascotSuccessBounce: 360,
  skeletonShimmer: 1400,
} as const;

/* ─────────────────────────────────────────────────────────────────
 *  MASCOT
 * ──────────────────────────────────────────────────────────────── */

/** Canonical mascot states — these are the ONLY valid values. */
export const MASCOT_STATES = ['idle', 'thinking', 'success', 'error'] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

/** Recommended mascot sizing per surface (BRAND_KIT.md §3.3). */
export const MASCOT_SIZE = {
  splash: 220,
  emptyState: 120,
  loading: 96,
  inline: 40,
  badge: 32,
} as const;

/* ─────────────────────────────────────────────────────────────────
 *  ACCESSIBILITY
 * ──────────────────────────────────────────────────────────────── */

/** Minimum touch target — iOS HIG / Material both call for 44 pt. */
export const BRAND_MIN_TOUCH = 44;

/* ─────────────────────────────────────────────────────────────────
 *  HELPERS
 * ──────────────────────────────────────────────────────────────── */

/**
 * Convenient pre-built linear-gradient props for `expo-linear-gradient`.
 *
 *     <LinearGradient {...brandLinearGradient()} />
 */
export function brandLinearGradient(angleDeg: number = BRAND.primary.angleDeg) {
  // Convert CSS-style 135° (top-left → bottom-right) into start/end points.
  const r = (angleDeg - 90) * (Math.PI / 180);
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  return {
    colors: [...BRAND_GRADIENT] as readonly string[],
    start: { x: Math.max(0, -dx) * 0.5 + 0.5 - dx * 0.5, y: Math.max(0, -dy) * 0.5 + 0.5 - dy * 0.5 },
    end:   { x: 0.5 + dx * 0.5, y: 0.5 + dy * 0.5 },
  };
}

/**
 * RGBA from a hex color + alpha — handy for glow shadows and overlays.
 *
 *     shadowColor: rgba(BRAND.primary.warm, 0.4)
 */
export function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Default export for convenience — let consumers `import BRAND from ...`
export default BRAND;
