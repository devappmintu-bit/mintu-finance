/**
 * pickHomeSmartSuggestion — picks the single best DS 2.0 SmartSuggestion
 * to render on Home based on the user's current snapshot.
 *
 * Extracted from app/(tabs)/index.tsx during Refactor Wave R3.
 *
 * Priority order (picks the *first* match):
 *   1. Open Smart Alert  → waste / alert (overbudget / anomaly)
 *   2. Monthly-loss + top leak category  → saving
 *   3. Active streak ≥ 3 days  → streak
 *   4. Otherwise → nothing (we never nag a brand-new user)
 *
 * Returns a ready-to-spread prop-object suitable for <SmartSuggestion /> or
 * `null` when nothing should be shown. Decoupling this logic from the
 * screen makes it:
 *   - testable in isolation (pure function over a shape);
 *   - reusable (e.g. on AI-Coach tab later);
 *   - easier to unit-inspect the priority rules.
 */
import type { ComponentProps } from 'react';
import type SmartSuggestion from '../components/primitives/SmartSuggestion';

export interface HomeSmartSuggestionInput {
  txnCount: number;
  smartAlerts: Array<{
    title?: string;
    message?: string;
    severity?: string;
    actions?: Array<{ label?: string }>;
  }> | undefined;
  monthlyLoss: number;
  topLeaks: Array<{ category?: string }> | undefined;
  snapshot: { streak_days?: number | null } | null | undefined;
}

export interface HomeSmartSuggestionResult {
  props: Omit<ComponentProps<typeof SmartSuggestion>, 'onAction'> & {
    actionLabel?: string;
    onActionRoute?: '/(tabs)/budget' | '/(tabs)/ai-coach' | '/(tabs)/rewards';
  };
}

/**
 * Pick the best SmartSuggestion for the Home feed.
 * Returns `null` when the user has zero transactions (don't nag) OR
 * when none of the three priority buckets match.
 */
export function pickHomeSmartSuggestion(
  input: HomeSmartSuggestionInput
): HomeSmartSuggestionResult | null {
  const { txnCount, smartAlerts, monthlyLoss, topLeaks, snapshot } = input;

  // Brand-new users have nothing to be suggested about.
  if (txnCount <= 0) return null;

  // ── Priority 1: an open Smart Alert ──────────────────────────────
  const topAlert = smartAlerts?.[0];
  if (topAlert) {
    return {
      props: {
        kind: topAlert.severity === 'high' ? 'waste' : 'alert',
        title: topAlert.title || 'Heads up',
        body: topAlert.message,
        actionLabel: topAlert.actions?.[0]?.label || 'View details',
        onActionRoute: '/(tabs)/budget',
      },
    };
  }

  // ── Priority 2: a saving opportunity on the top leak ─────────────
  if (monthlyLoss > 0 && Array.isArray(topLeaks) && topLeaks.length > 0) {
    const lead = topLeaks[0];
    return {
      props: {
        kind: 'saving',
        title: `You could save ₹${monthlyLoss.toLocaleString('en-IN')} this month`,
        body: lead?.category
          ? `Your ${lead.category} spend is leading the leak.`
          : undefined,
        actionLabel: 'See plan',
        onActionRoute: '/(tabs)/ai-coach',
      },
    };
  }

  // ── Priority 3: encourage an active streak ───────────────────────
  const streak = Number(snapshot?.streak_days || 0);
  if (streak >= 3) {
    return {
      props: {
        kind: 'streak',
        title: `🔥 ${streak}-day streak alive`,
        body: 'Check in today to keep it going and bank more coins.',
        actionLabel: 'Check in',
        onActionRoute: '/(tabs)/rewards',
      },
    };
  }

  return null;
}
