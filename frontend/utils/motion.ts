/**
 * motion.ts — MintU Motion Token System (R115 Sprint-1).
 *
 * Single source of truth for every duration, easing curve, spring preset,
 * gesture threshold, and depth-stack value used in the app. Hardcoded
 * animation values anywhere else are a regression — replace them with a
 * reference into this file.
 *
 * Why a token system?
 * -------------------
 *  • Consistency — every transition obeys the same physics.
 *  • Reduced-motion accessibility — flip one flag and the whole app
 *    respects the OS preference.
 *  • Performance auditing — every motion has a known cost ceiling.
 *  • Refactor-safe — change a curve here and every screen updates.
 *
 * Quick reference
 * ---------------
 *  Tap acknowledge        : DURATION.instant + SPRING.press
 *  Sheet open             : DURATION.normal + SPRING.snappy
 *  Card → detail          : DURATION.normal + EASING.emphasized
 *  Toast pop              : DURATION.fast + EASING.standard
 *  Skeleton shimmer       : DURATION.shimmer (looped)
 *  Hero number count-up   : DURATION.slow + EASING.decelerate
 */
import { Easing, Platform } from 'react-native';

// ─── DURATIONS ──────────────────────────────────────────────────────────
// Powers-of-two-ish ladder. Anything outside this set should be flagged.
export const DURATION = {
  instant: 80,    // tap acknowledge, micro feedback
  fast:    160,   // toast, chip toggle, segment switch
  normal:  240,   // sheet open, screen push, card flip
  slow:    360,   // hero entrance, donut redraw, count-up
  slowest: 540,   // celebration, settle confetti, achievement
  shimmer: 1100,  // skeleton loop period
} as const;

export type DurationKey = keyof typeof DURATION;

// ─── EASING CURVES (Material 3 expressive set) ──────────────────────────
export const EASING = {
  // Default — feels right for most UI
  standard:    Easing.bezier(0.2, 0.0, 0.0, 1.0),
  // Heavier deceleration — for things that arrive
  emphasized:  Easing.bezier(0.05, 0.7, 0.1, 1.0),
  decelerate:  Easing.out(Easing.cubic),
  // Things that leave
  accelerate:  Easing.in(Easing.cubic),
  // Linear (rare — only for skeleton shimmer)
  linear:      Easing.linear,
  // Spring approximation for non-spring contexts
  spring:      Easing.bezier(0.25, 1.4, 0.5, 1.0),
} as const;

// ─── SPRING PRESETS (Animated.spring + Reanimated withSpring) ───────────
export const SPRING = {
  // General-purpose — sheet open, card scale
  default: { damping: 18, stiffness: 180, mass: 1 },
  // Snappier — toggles, segments, modal pop
  snappy:  { damping: 16, stiffness: 260, mass: 0.9 },
  // Tap acknowledge — extremely fast
  press:   { damping: 14, stiffness: 380, mass: 0.8 },
  // Soft / aspirational — hero count-up, mascot
  gentle:  { damping: 22, stiffness: 90,  mass: 1.2 },
  // Big celebration — settle, milestone
  bouncy:  { damping: 10, stiffness: 220, mass: 1 },
} as const;

// Animated API equivalents (different parameter names than Reanimated).
export const SPRING_RN = {
  default: { friction: 7, tension: 120 },
  snappy:  { friction: 6, tension: 220 },
  press:   { friction: 5, tension: 380 },
  gentle:  { friction: 9, tension: 60  },
  bouncy:  { friction: 4, tension: 180 },
} as const;

// ─── GESTURE THRESHOLDS ─────────────────────────────────────────────────
export const GESTURE = {
  /** px of drag before a gesture is recognized */
  minDrag:           8,
  /** velocity (px/ms) above which a swipe counts as fling */
  swipeVelocity:     0.45,
  /** velocity above which a sheet auto-dismisses */
  dismissVelocity:   1.0,
  /** drag distance ratio (0..1) of sheet height before snap-down */
  snapThreshold:     0.4,
  /** ms allowed between two taps before they count as a double-tap */
  doubleTapWindow:   280,
  /** ms after open during which the dismiss gesture is suppressed */
  postOpenLockout:   180,
} as const;

// ─── DEPTH STACK (z-index ladder) ───────────────────────────────────────
// Establishes a strict order so layers can never collide.
export const DEPTH = {
  base:        0,
  card:        1,
  stickyHead:  10,
  fab:         50,
  backdrop:    100,
  sheet:       200,
  modal:       300,
  toast:       400,
  bannerBar:   450,   // OfflineBanner / SlowNetworkHint
  appLock:     500,   // must always sit on top of everything
} as const;

// ─── REDUCED MOTION ─────────────────────────────────────────────────────
// On web this is a CSS media query; on native it's an AccessibilityInfo flag.
// Cached at module-eval time + invalidated by callers if needed.
import { AccessibilityInfo } from 'react-native';
let _reducedMotion = false;
if (Platform.OS !== 'web') {
  AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { _reducedMotion = !!v; }).catch(() => {});
  // Subscribe to changes so toggling it in OS settings doesn't require a relaunch.
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { _reducedMotion = !!v; });
}
export function isReducedMotion(): boolean { return _reducedMotion; }

/**
 * Adjusts a duration based on the user's reduced-motion preference.
 * Anything 240ms or less → 0 (instant). Anything bigger → halved.
 */
export function applyMotion(d: number): number {
  if (!_reducedMotion) return d;
  if (d <= DURATION.normal) return 0;
  return Math.round(d * 0.5);
}

export default {
  DURATION,
  EASING,
  SPRING,
  SPRING_RN,
  GESTURE,
  DEPTH,
  isReducedMotion,
  applyMotion,
};
