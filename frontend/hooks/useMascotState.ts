/**
 * useMascotState — v10 Phase 2C.
 *
 * Derives a single reactive "mascot state" from the global
 * `financialContext`. Any screen that renders <MintuMascot state={..}/>
 * can now reflect the user's real money health without per-screen
 * bookkeeping.
 *
 *   const { state, moodline, tone } = useMascotState();
 *
 * State rules (priority-ordered — first match wins):
 *   1. error    — overspending OR anomalies detected
 *   2. thinking — empty state (no txns yet)      → "let's start"
 *   3. success  — score ≥ 75 OR goal almost-done → celebrate
 *   4. idle     — healthy neutral
 *
 * tone: 'warn' | 'info' | 'ok' — hint for surrounding UI to color-match.
 */
import { useMemo } from 'react';
import { useFinContext } from '../store/financialContext';

export type MascotState = 'idle' | 'thinking' | 'success' | 'error';
export type MascotTone  = 'warn' | 'info' | 'ok';

export interface MascotDerived {
  state: MascotState;
  tone: MascotTone;
  moodline: string;        // one-liner the UI can display (optional)
  glyph?: string;          // optional small emoji to pair with moodline
}

export function useMascotState(): MascotDerived {
  const ctx = useFinContext();
  return useMemo<MascotDerived>(() => {
    const t = ctx.transactions;
    const b = ctx.budgets;
    const g = ctx.goals;
    const s = ctx.score;
    const ins = ctx.insights;

    // 1) Overspending or anomalies → concerned
    if ((ins?.overspending?.length || 0) > 0 || (ins?.anomalies?.length || 0) > 0) {
      const over = ins.overspending?.[0] || 'Something looks off';
      return {
        state: 'error',
        tone: 'warn',
        moodline: over.length > 80 ? 'Overspending alert — let\'s fix it.' : over,
        glyph: '🚨',
      };
    }

    // 2) No data → thinking / onboarding
    if ((t?.count || 0) === 0) {
      return {
        state: 'thinking',
        tone: 'info',
        moodline: 'I can\'t read your money yet. Log the first expense.',
        glyph: '🧠',
      };
    }

    // 3) Great score OR goal almost done → celebrate
    const scoreGood = (s?.value || 0) >= 75;
    const topGoal = g?.topGoal;
    const goalPct = topGoal && topGoal.target > 0 ? topGoal.saved / topGoal.target : 0;
    if (scoreGood) {
      return {
        state: 'success',
        tone: 'ok',
        moodline: `Score ${s.value}/100 — you're in the green.`,
        glyph: '🌟',
      };
    }
    if (topGoal && goalPct >= 0.8) {
      const left = Math.max(0, topGoal.target - topGoal.saved);
      return {
        state: 'success',
        tone: 'ok',
        moodline: `"${topGoal.name}" is almost done — ₹${fmt(left)} left.`,
        glyph: '🏁',
      };
    }

    // 4) Idle neutral — still give a tiny insight
    const budgetUsed = (b?.used || 0) / Math.max(1, b?.total || 1);
    if (b?.total && budgetUsed >= 0.7 && budgetUsed < 1) {
      return {
        state: 'idle',
        tone: 'info',
        moodline: `${Math.round(budgetUsed * 100)}% of budget used — stay frugal.`,
        glyph: '👀',
      };
    }
    return {
      state: 'idle',
      tone: 'info',
      moodline: t.count > 0 ? `Tracking ${t.count} txns this month — keep going.` : 'All systems green.',
      glyph: '✨',
    };
  }, [
    ctx.transactions?.count,
    ctx.budgets?.used,
    ctx.budgets?.total,
    ctx.goals?.topGoal?.saved,
    ctx.goals?.topGoal?.target,
    ctx.goals?.topGoal?.name,
    ctx.score?.value,
    ctx.insights?.overspending?.length,
    ctx.insights?.anomalies?.length,
  ]);
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}
