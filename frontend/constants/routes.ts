/**
 * constants/routes.ts — canonical app route paths.
 *
 * Why this exists
 * ---------------
 * Hard-coded `router.push('/premium')`-style paths were scattered across
 * 6+ call sites each. A typo or rename would silently break navigation
 * from some entry points but not others.
 *
 * Usage
 * -----
 *   import { ROUTES } from '@/constants/routes';
 *   router.push(ROUTES.PREMIUM);
 *   router.push(ROUTES.TRANSACTIONS);
 */

export const ROUTES = {
  // ── Tabs ──
  HOME:          '/(tabs)/',
  TRANSACTIONS:  '/(tabs)/transactions',
  BUDGET:        '/(tabs)/budget',
  SPLIT:         '/(tabs)/split',
  REWARDS:       '/(tabs)/rewards',
  AI_COACH:      '/(tabs)/ai-coach',
  PROFILE:       '/(tabs)/profile',
  MASCOT:        '/(tabs)/mascot',

  // ── Auth / onboarding ──
  AUTH:          '/auth',
  ONBOARDING:    '/onboarding',
  // Round 98 — TTFV<45s single-slider step. New users land here
  // DIRECTLY after OTP success; feeds the Home pre-seed.
  ONBOARDING_INCOME: '/onboarding/income',

  // ── Premium ──
  PREMIUM:           '/premium',
  PREMIUM_ACTIVATED: '/premium-activated',

  // ── Standalone screens ──
  GOALS:            '/goals',
  NOTIFICATIONS:    '/notifications',
  MONEY_SCHOOL:     '/money-school',
  SPENDING_INSIGHTS:'/spending-insights',
  REWARDS_HUB:      '/rewards-hub',
  MYSTERY_BOX:      '/mystery-box',
  NUDGES:           '/nudges',

  // ── Split flows ──
  SPLIT_ADD_EXPENSE: '/split/add-expense',
  SPLIT_CREATE:      '/split/create',
  SPLIT_GROUP:       '/split/group',
  SPLIT_SETTLE:      '/split/settle',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
