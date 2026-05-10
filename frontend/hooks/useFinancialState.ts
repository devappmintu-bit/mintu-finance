/**
 * useFinancialState — R116 "Calm Mode" emotional state engine.
 *
 * Computes a single, app-wide emotional state for the user from the data
 * we already have. This becomes the master switch that decides:
 *
 *   • Which hero card shows (NBHero vs HeroDecision vs nothing).
 *   • What tone the mascot adopts (confident / calm / curious / concerned).
 *   • How loud the alerts are (silent / quiet / soft / sharp).
 *   • What the primary CTA is.
 *
 * The four states (lowest noise → highest noise):
 *
 *   flourishing  — Under budget across the board, savings rate ≥ 15%,
 *                  streak alive, no overdue splits.
 *   steady       — On track. Maybe 1-2 categories to watch. Default.
 *   attention    — One concrete thing needs the user's eyes today
 *                  (specific category over budget, bill due in 24h, etc).
 *   critical     — Multiple overspent categories OR streak about to break
 *                  OR a bill 50% over typical. Only NOW does Home go red.
 *
 * Inputs: pulled from the existing snapshot + diagnostic score hooks.
 * Output: { state, accent, mascotMood, headline, subline, suggestCTA }.
 *
 * Deliberately pure + memo-stable — never spawns new objects unless the
 * underlying state actually changed (avoids cascading re-renders on Home).
 */
import { useMemo } from 'react';
import { useDiagnosticScore } from './useDiagnosticScore';

export type FinancialState = 'flourishing' | 'steady' | 'attention' | 'critical';

export interface FinancialStateResult {
  state: FinancialState;
  /** Accent color hint (palette key). Component decides exact RGB. */
  accent: 'positive' | 'neutral' | 'soft-warn' | 'sharp-warn';
  /** Mascot pose hint. */
  mascotMood: 'confident' | 'calm' | 'curious' | 'concerned';
  /** ≤32-char headline copy. */
  headline: string;
  /** Optional ≤56-char subline. */
  subline?: string;
  /** Optional CTA label — surfaced by Home when state ≥ attention. */
  suggestCTA?: string;
  /** Diagnostic numbers (so callers don't double-fetch). */
  meta: {
    score: number;
    overspentCount: number;
    underBudgetSavings: number;
    txnCount: number;
  };
}

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

export function useFinancialState(snapshot?: any, txnCountOverride?: number): FinancialStateResult {
  const { data: diag, ctxScore } = useDiagnosticScore();

  return useMemo<FinancialStateResult>(() => {
    const score = Number((diag as any)?.score ?? ctxScore ?? 0);
    const txnCount = txnCountOverride !== undefined
      ? Number(txnCountOverride)
      : Number((snapshot as any)?.txn_count ?? (snapshot as any)?.transaction_count ?? 0);

    // Pull the most reliable budget signals we have. Different snapshot
    // shapes exist across versions — we read defensively.
    const budgets = (snapshot as any)?.budgets ?? (snapshot as any)?.budget_summary ?? [];
    const overspent = Array.isArray(budgets)
      ? budgets.filter((b: any) => Number(b?.percent_used ?? b?.usage_pct ?? 0) >= 100).length
      : 0;
    const watching = Array.isArray(budgets)
      ? budgets.filter((b: any) => {
          const p = Number(b?.percent_used ?? b?.usage_pct ?? 0);
          return p >= 80 && p < 100;
        }).length
      : 0;

    const monthlyBudget = Number((snapshot as any)?.monthly_budget_total ?? (snapshot as any)?.monthly_budget ?? 0);
    const mtdSpend = Number((snapshot as any)?.mtd_spend ?? 0);
    const underBudgetSavings = Math.max(0, monthlyBudget - mtdSpend);

    // R116 — onboarding / cold-start users always get `steady` so they
    // never see a red home before they've earned it.
    if (txnCount < 3) {
      return {
        state: 'steady',
        accent: 'neutral',
        mascotMood: 'calm',
        headline: txnCount === 0 ? 'Welcome — let\'s start' : 'Building your picture',
        subline: txnCount === 0 ? 'Add your first 3 expenses' : 'A few more taps and I can help',
        meta: { score, overspentCount: overspent, underBudgetSavings, txnCount },
      };
    }

    // CRITICAL — multiple overspent OR score < 40.
    if (overspent >= 2 || score < 40) {
      return {
        state: 'critical',
        accent: 'sharp-warn',
        mascotMood: 'concerned',
        headline: `${overspent} categories need a reset`,
        subline: 'Tap to see the fastest fix',
        suggestCTA: 'Recover with MintU',
        meta: { score, overspentCount: overspent, underBudgetSavings, txnCount },
      };
    }

    // ATTENTION — exactly one concrete thing.
    if (overspent === 1 || score < 60) {
      return {
        state: 'attention',
        accent: 'soft-warn',
        mascotMood: 'curious',
        headline: overspent === 1 ? 'One category to watch' : 'Score dipped a little',
        subline: 'Quick fix saves your week',
        suggestCTA: 'See the fix',
        meta: { score, overspentCount: overspent, underBudgetSavings, txnCount },
      };
    }

    // FLOURISHING — under budget AND score ≥ 75 AND nothing watching.
    if (score >= 75 && watching === 0 && underBudgetSavings > 0) {
      return {
        state: 'flourishing',
        accent: 'positive',
        mascotMood: 'confident',
        headline: `${inr(underBudgetSavings)} under budget`,
        subline: 'Keep this streak going',
        meta: { score, overspentCount: overspent, underBudgetSavings, txnCount },
      };
    }

    // Default → STEADY.
    return {
      state: 'steady',
      accent: 'neutral',
      mascotMood: 'calm',
      headline: watching > 0 ? `On track · ${watching} to watch` : 'On track',
      subline: undefined,
      meta: { score, overspentCount: overspent, underBudgetSavings, txnCount },
    };
  }, [snapshot, diag, ctxScore, txnCountOverride]);
}

export default useFinancialState;
