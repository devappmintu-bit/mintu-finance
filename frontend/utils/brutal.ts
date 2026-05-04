/**
 * BRUTAL — 3-layer contrast design tokens.
 *
 * The brutal system enforces a strict visual hierarchy through three
 * contrast layers. Every surface in the app must pick exactly one.
 *
 *   PRIMARY   — Hero. Thick ink border, hard-offset shadow, flat fill.
 *               Reserved for: balance hero, destructive CTAs, critical
 *               alerts, the ONE thing on screen that must be obeyed.
 *
 *   SECONDARY — Structure. Thin ink border, small soft shadow.
 *               Reserved for: supporting cards, list items, form fields,
 *               insight tiles. The workhorse layer (~70% of surfaces).
 *
 *   PASSIVE   — Ambient. Zero border, zero shadow, tinted fill only.
 *               Reserved for: background bands, info strips, group
 *               containers that shouldn't compete for attention.
 *
 * Rationale: without an explicit hierarchy, every card competes, and
 * the UI reads as noise. The 3-layer system forces authors to declare
 * importance, which makes dense screens scannable at a glance.
 */

import { Platform, ViewStyle } from 'react-native';
import { COLORS, SPACING } from './theme';

// ══════════════════════════════════════════════════════════════════════
//  BORDERS — ink-on-paper. Never coloured; colour belongs to content.
// ══════════════════════════════════════════════════════════════════════
export const BRUTAL_BORDER = {
  primary:   3,
  secondary: 1.5,
  passive:   0,
} as const;

// ══════════════════════════════════════════════════════════════════════
//  SHADOWS — hard-offset for Primary ("stamped"), soft for Secondary,
//  none for Passive. Uses box-shadow on web + RN elevation on native so
//  it works identically in both runtimes.
// ══════════════════════════════════════════════════════════════════════
const hardShadow = (dx: number, dy: number): ViewStyle =>
  Platform.select({
    web:    { boxShadow: `${dx}px ${dy}px 0 0 ${COLORS.text.primary}` } as any,
    ios:    { shadowColor: COLORS.text.primary, shadowOpacity: 1, shadowOffset: { width: dx, height: dy }, shadowRadius: 0 },
    android:{ elevation: 0 },
    default:{ },
  }) as ViewStyle;

const softShadow = (dx: number, dy: number, blur: number, opacity: number): ViewStyle =>
  Platform.select({
    web:    { boxShadow: `${dx}px ${dy}px ${blur}px 0 rgba(0,0,0,${opacity})` } as any,
    ios:    { shadowColor: '#000', shadowOpacity: opacity, shadowOffset: { width: dx, height: dy }, shadowRadius: blur },
    android:{ elevation: 2 },
    default:{ },
  }) as ViewStyle;

export const BRUTAL_SHADOW = {
  primary:   hardShadow(4, 4),           // stamped / ink-offset
  secondary: softShadow(0, 2, 4, 0.08),  // subtle lift
  passive:   {} as ViewStyle,            // none
};

// ══════════════════════════════════════════════════════════════════════
//  DENSITY — internal padding knobs. Keep it simple: comfortable vs compact.
//  All values on the 4-pt grid.
// ══════════════════════════════════════════════════════════════════════
export const BRUTAL_DENSITY = {
  comfortable: {
    paddingV: SPACING.lg,   // 16
    paddingH: SPACING.lg,   // 16
    gap:      SPACING.md,   // 12
  },
  compact: {
    paddingV: SPACING.md,   // 12
    paddingH: SPACING.md,   // 12
    gap:      SPACING.sm,   // 8
  },
} as const;

// ══════════════════════════════════════════════════════════════════════
//  SURFACES — fill colours per layer. Theme-aware via COLORS.
//  Primary uses paper (canvas), Secondary uses paper, Passive uses a
//  muted tint so it reads as "ambient".
// ══════════════════════════════════════════════════════════════════════
export const BRUTAL_SURFACE = {
  primary:   COLORS.bg.card,
  secondary: COLORS.bg.card,
  passive:   COLORS.bg.dark,  // slightly muted vs the canvas
} as const;

// ══════════════════════════════════════════════════════════════════════
//  RADII — brutalist = flat. Everything gets 0 unless a pill is desired.
// ══════════════════════════════════════════════════════════════════════
export const BRUTAL_RADIUS = {
  card: 0,
  pill: 999,
} as const;

export type BrutalLayer = 'primary' | 'secondary' | 'passive';

/**
 * Convenience — build the base style object for a brutal surface in one
 * call. Used internally by the primitives. Kept exported in case a
 * consumer wants to inline the look into a custom container.
 */
export const brutalSurfaceStyle = (
  layer: BrutalLayer,
  density: 'comfortable' | 'compact' = 'comfortable',
): ViewStyle => {
  const d = BRUTAL_DENSITY[density];
  const base: ViewStyle = {
    backgroundColor: BRUTAL_SURFACE[layer],
    borderRadius:    BRUTAL_RADIUS.card,
    paddingVertical:   d.paddingV,
    paddingHorizontal: d.paddingH,
  };
  if (layer !== 'passive') {
    base.borderWidth = BRUTAL_BORDER[layer];
    base.borderColor = COLORS.text.primary;
  }
  return { ...base, ...BRUTAL_SHADOW[layer] };
};
