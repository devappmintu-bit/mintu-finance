/**
 * hooks/usePriorityInsight — ONE BRAIN for Home + AI Coach.
 *
 * Round 89 (Strike 2) — both Home HeroDecision and Home TodayAction,
 * as well as AICoachStateView, now derive their priority insight from
 * THIS single pure function. If the priority chain ever evolves (new
 * categories, new signals), it evolves in exactly one place.
 *
 * Priority chain (first computable wins — don't reorder without buy-in):
 *
 *   1. Budget overspend (any)              → "Rebalance budgets"
 *   2. MoM spike ≥ 15 %                    → "Set a monthly cap"
 *   3. Category dominance ≥ 35 %           → "Track {category}"
 *   4. Active but healthy (≥ 11 txns)      → "Send surplus to goal"
 *   5. New user (0 txns)                   → "Add first expense"
 *   6. Low data (1-10 txns)                → "Keep logging"
 *
 * Every insight is COMPUTABLE — if the numbers don't support a claim,
 * the function returns a lower-priority fallback or null. Never generic
 * fluff like "Keep your rhythm going".
 */
import { useMemo } from 'react';
import { router } from 'expo-router';
import { useFinContext } from '../store/financialContext';
import { ROUTES } from '../constants/routes';

export type InsightTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';
export type RiskLevel = 'ok' | 'watch' | 'caution' | 'risk';

export interface PriorityInsight {
  /** Tag pill text (BUDGET HEAT / MONTHLY TREND / CATEGORY / HEALTHY / START HERE). */
  tag: string;
  /** Risk badge color token for HeroDecision. */
  tone: InsightTone;
  /** Mapped to Hero's risk flag: ok (green) / watch (amber) / caution (orange) / risk (red). */
  risk: RiskLevel;
  /** Punchy headline with a live number woven in. */
  headline: string;
  /** One supporting sentence backing the headline with data. */
  body: string;
  /** Primary action button label — always a verb. */
  actionLabel: string;
  /** Pressing the primary action calls this. */
  onAction: () => void;
  /** Route we push to on action (for prefetch + a11y). */
  actionRoute?: string;
  /** Optional secondary action — shown only on TodayAction, kept short. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Prefill prompt for the AI Coach when Today is tapped as a whole. */
  coachPrompt: string;
  /** Chat-chip prefills (max 3). Used by AICoachStateView only. */
  chips: { label: string; prompt: string }[];
}

function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

/** Core — pure, testable, same function called from Home + AI Coach. */
export function deriveInsightFromCtx(ctx: any): PriorityInsight {
  const txnCount = Number(ctx?.transactions?.count ?? 0);
  const categories: Record<string, number> = ctx?.transactions?.categories || {};
  const monthlySpend = Number(ctx?.transactions?.monthlySpend ?? 0);
  const overspend: string[] = Array.isArray(ctx?.insights?.overspending) ? ctx.insights.overspending : [];
  const mom = ctx?.insights?.mom || {};

  // ── 1. Budget overspend — highest priority, always actionable ──────────
  if (overspend.length > 0) {
    const first = overspend[0] || '';
    const m = /^([A-Za-z][\w\s]+?)\s+over\s+budget\s+by\s+₹(\d+)/.exec(first);
    const cat = (m && m[1]) ? m[1].trim() : 'a category';
    const amt = (m && m[2]) ? `₹${m[2]}` : 'a lot';
    const go = () => { try { router.push(ROUTES.BUDGET); } catch { /* noop */ } };
    const coachPrompt = `Why am I over on ${cat}? Give me a reallocation plan.`;
    return {
      tag: 'BUDGET HEAT',
      tone: 'danger',
      risk: 'risk',
      headline: `${cat} is ${amt} over budget`,
      body: overspend.length > 1
        ? `${overspend.length} categories are running hot. Re-balancing now saves your month.`
        : `You've blown past your ${cat} limit. A quick reallocation fixes the month without giving up spending.`,
      actionLabel: 'Rebalance budgets',
      onAction: go,
      actionRoute: ROUTES.BUDGET,
      secondaryLabel: 'Ask why',
      onSecondary: () => { try { router.push(`${ROUTES.AI_COACH}?prompt=${encodeURIComponent(coachPrompt)}` as any); } catch { /* noop */ } },
      coachPrompt,
      chips: [
        { label: `WHY OVER ON ${cat.toUpperCase()}?`, prompt: coachPrompt },
        { label: 'FIX THIS MONTH',                    prompt: 'Help me finish the month under budget with a concrete plan.' },
        { label: 'CUT 20% NEXT MONTH',                prompt: `Build a plan to cut ${cat} by 20% next month with 3 concrete swaps.` },
      ],
    };
  }

  // ── 2. MoM spike ≥ 15 % — trend alarm ───────────────────────────────────
  const deltaPct = Number(mom?.delta_pct ?? 0);
  if (monthlySpend > 0 && Math.abs(deltaPct) >= 15) {
    const up = deltaPct > 0;
    const route = up ? ROUTES.BUDGET : ROUTES.GOALS;
    const coachPrompt = up
      ? 'What categories caused my month-over-month spike? Show me the top 3.'
      : 'How do I lock in my savings win this month? Help me route it to a goal.';
    return {
      tag: 'MONTHLY TREND',
      tone: up ? 'warning' : 'success',
      risk: up ? 'caution' : 'ok',
      headline: up
        ? `Spending up ${Math.round(deltaPct)}% vs last month`
        : `Spending down ${Math.abs(Math.round(deltaPct))}% vs last month`,
      body: up
        ? `Prev: ${fmtINR(mom?.previous_spend)}   ·   Now: ${fmtINR(mom?.current_spend)}. A soft cap stops the drift.`
        : `Prev: ${fmtINR(mom?.previous_spend)}   ·   Now: ${fmtINR(mom?.current_spend)}. Lock in the win by redirecting the delta to a goal.`,
      actionLabel: up ? 'Set a monthly cap' : 'Send surplus to goal',
      onAction: () => { try { router.push(route); } catch { /* noop */ } },
      actionRoute: route,
      coachPrompt,
      chips: up
        ? [
            { label: 'WHAT CAUSED THE SPIKE?', prompt: coachPrompt },
            { label: 'BUILD A CAP PLAN',       prompt: 'Build a monthly spending cap plan that matches my actual categories.' },
            { label: 'WEEKLY BUDGET SPLIT',    prompt: 'Split my monthly cap into weekly budgets. Account for fixed bills.' },
          ]
        : [
            { label: 'LOCK IN MY WIN',     prompt: coachPrompt },
            { label: 'REPEAT NEXT MONTH',  prompt: 'What should I repeat next month to keep the savings streak going?' },
            { label: 'INVEST THE SURPLUS', prompt: 'Where should I invest the surplus from this month? SIP vs lumpsum.' },
          ],
    };
  }

  // ── 3. Category dominance ≥ 35 % ────────────────────────────────────────
  if (monthlySpend > 0 && Object.keys(categories).length > 0) {
    let topCat = ''; let topAmt = 0;
    for (const [k, v] of Object.entries(categories)) {
      const n = Number(v);
      if (n > topAmt) { topAmt = n; topCat = k; }
    }
    const share = (topAmt / monthlySpend) * 100;
    if (share >= 35 && topCat) {
      const coachPrompt = `Why is ${topCat} so high this month? Break down the transactions.`;
      return {
        tag: 'CATEGORY DOMINANCE',
        tone: 'info',
        risk: 'watch',
        headline: `${topCat} = ${Math.round(share)}% of your spend`,
        body: `${fmtINR(topAmt)} out of ${fmtINR(monthlySpend)} this month. If ${topCat} shifts 10%, the whole month shifts.`,
        actionLabel: `Track ${topCat}`,
        onAction: () => { try { router.push(ROUTES.BUDGET); } catch { /* noop */ } },
        actionRoute: ROUTES.BUDGET,
        coachPrompt,
        chips: [
          { label: `WHY SO MUCH ${topCat.toUpperCase()}?`, prompt: coachPrompt },
          { label: 'REDUCE THIS CATEGORY',                 prompt: `Give me 3 concrete ways to cut ${topCat} by 20% next month.` },
          { label: 'COMPARE TO PEERS',                     prompt: `How does my ${topCat} spending compare to peers in my income range?` },
        ],
      };
    }
  }

  // ── 4. Healthy active user — surplus play ───────────────────────────────
  if (txnCount >= 11) {
    const coachPrompt = 'Where should I invest the surplus I\'m building this month?';
    return {
      tag: 'HEALTHY',
      tone: 'success',
      risk: 'ok',
      headline: 'Your money is on rails this month',
      body: `${txnCount} transactions logged. No overspend, no spikes — this is the moment to bank the surplus.`,
      actionLabel: 'Create a savings goal',
      onAction: () => { try { router.push(ROUTES.GOALS); } catch { /* noop */ } },
      actionRoute: ROUTES.GOALS,
      coachPrompt,
      chips: [
        { label: 'WHERE SHOULD I INVEST?',  prompt: coachPrompt },
        { label: 'BUILD AN EMERGENCY FUND', prompt: 'Help me plan a realistic emergency fund based on my current spending.' },
        { label: 'TAX-OPTIMISE MY SAVINGS', prompt: 'How do I tax-optimise the savings I\'m building? Best 80C vs NPS plays.' },
      ],
    };
  }

  // ── 5. NEW USER — zero transactions ─────────────────────────────────────
  if (txnCount === 0) {
    const go = () => { try { router.push(ROUTES.TRANSACTIONS); } catch { /* noop */ } };
    return {
      tag: 'START HERE',
      tone: 'neutral',
      risk: 'watch',
      headline: 'Add your first expense',
      body: 'Once you log one real expense, I can tell you where your money is going and what to do about it.',
      actionLabel: 'Add expense',
      onAction: go,
      actionRoute: ROUTES.TRANSACTIONS,
      coachPrompt: 'What should I do first to start tracking my money with you?',
      chips: [],
    };
  }

  // ── 6. LOW DATA — 1-10 transactions ─────────────────────────────────────
  const coachPrompt = 'I\'ve logged a few expenses. What pattern do you see so far?';
  return {
    tag: 'KEEP GOING',
    tone: 'info',
    risk: 'watch',
    headline: `${txnCount} ${txnCount === 1 ? 'expense' : 'expenses'} logged so far`,
    body: 'Log a few more this week and I\'ll spot real patterns. Today\'s biggest spend is a great place to start.',
    actionLabel: 'Log another',
    onAction: () => { try { router.push(ROUTES.TRANSACTIONS); } catch { /* noop */ } },
    actionRoute: ROUTES.TRANSACTIONS,
    coachPrompt,
    chips: [],
  };
}

/** React hook wrapper — memoised against SSoT. */
export function usePriorityInsight(): PriorityInsight {
  const ctx = useFinContext();
  return useMemo(() => deriveInsightFromCtx(ctx), [
    ctx?.transactions?.count,
    ctx?.transactions?.monthlySpend,
    ctx?.transactions?.categories,
    ctx?.insights?.overspending,
    ctx?.insights?.mom?.delta_pct,
    ctx?.insights?.mom?.current_spend,
    ctx?.insights?.mom?.previous_spend,
  ]);
}
