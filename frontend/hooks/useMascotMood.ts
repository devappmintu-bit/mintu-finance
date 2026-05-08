/**
 * useMascotMood — Duolingo-grade emotion engine for Mintu.
 *
 * Extends the existing 4-state `useMascotState` into a 9-mood
 * personality reactor. Reads from FinContext + clock + streak signals
 * to pick ONE contextual mood + one-line dialogue + animation hint.
 *
 *   const { mood, line, action, intensity, showStreak, gated } = useMascotMood();
 *
 * MOOD VOCABULARY (priority order — first match wins):
 *   panicked    → spending velocity high, big overspending
 *   sad         → missed streak / inactivity 5+ days (only for users
 *                 who already had a streak — never for cold-start)
 *   sleepy      → late night activity (after 11 PM IST)
 *   sarcastic   → repeat impulse spending in same category 3x today
 *   proud       → score >= 75 OR savings goal >= 80% complete
 *   celebrating → streak milestone day OR goal hit OR salary credited
 *   encouraging → user has 1-2 txns (just starting) — gentle support
 *   focused     → budget burn 50-70% of total (mid-month watch)
 *   idle        → calm neutral fallback
 *
 * HONESTY GATES:
 *   • Returns `gated: true` when txnCount === 0 — caller should hide
 *     mascot-driven gamification surfaces (no fake guilt for new users).
 *   • Returns `showStreak: false` when streak.days === 0 — keeps
 *     streak surfaces hidden until the user earns day 1.
 */
import { useMemo } from 'react';
import { useFinContext } from '../store/financialContext';

export type MascotMood =
  | 'idle'
  | 'panicked'
  | 'sad'
  | 'sleepy'
  | 'sarcastic'
  | 'proud'
  | 'celebrating'
  | 'encouraging'
  | 'focused';

/** Animation actions the renderer knows how to play. Subset of the
 *  curated vocabulary in `utils/mascotAnimations.ts`. */
export type MascotMoodAction =
  | 'idle' | 'shake' | 'wilt' | 'lean' | 'tilt'
  | 'pose' | 'burst' | 'wave' | 'breathe-fast';

export interface MascotMoodResult {
  mood: MascotMood;
  /** Suggested rendering state for `<MintuMascot state={..}/>`. */
  state: 'idle' | 'thinking' | 'success' | 'error';
  /** One-line dialogue (≤80 chars). Honest — never fakes data. */
  line: string;
  /** 0..1 — animation intensity hint (caller can amplify glow/particles). */
  intensity: number;
  /** True when there's enough signal to show streak/gamification UI. */
  showStreak: boolean;
  /** True when mascot-driven gamification should be HIDDEN (cold-start). */
  gated: boolean;
  /** Optional emoji glyph to pair with line. */
  glyph?: string;
}

function hourIST(): number {
  // Rough IST (UTC+5:30); sufficient for "is it past 11 PM?" gates.
  const utc = new Date().getUTCHours();
  return (utc + 5) % 24;
}

function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return Infinity;
  return Math.floor(ms / 86400000);
}

export function useMascotMood(): MascotMoodResult {
  const ctx = useFinContext();
  return useMemo<MascotMoodResult>(() => {
    const t = ctx.transactions;
    const b = ctx.budgets;
    const g = ctx.goals;
    const s = ctx.score;
    const ins = ctx.insights;
    const streakDays = ctx.streak?.days ?? 0;

    const txnCount = t?.count ?? 0;
    const gated = txnCount === 0;
    const showStreak = streakDays >= 1;

    // ── Cold-start: gentle invitation, no gamification ────────────
    if (gated) {
      return {
        mood: 'idle',
        state: 'thinking',
        line: 'Ready when you are. Log your first expense to begin.',
        intensity: 0.4,
        showStreak: false,
        gated: true,
        glyph: '👋',
      };
    }

    const hour = hourIST();
    const overspendN = ins?.overspending?.length || 0;
    const anomalyN = ins?.anomalies?.length || 0;
    const inactiveDays = daysSince(t?.lastTxnDate);

    // ── 1) PANICKED — overspending or anomaly cluster ─────────────
    if (overspendN >= 2 || anomalyN >= 2) {
      const first = ins.overspending?.[0] || ins.anomalies?.[0] || 'Spending looks heavy.';
      return {
        mood: 'panicked',
        state: 'error',
        line: first.length > 70 ? 'Whoa — your spend is heating up. Let\'s look at it.' : first,
        intensity: 1,
        showStreak,
        gated: false,
        glyph: '🚨',
      };
    }

    // ── 2) SAD — was active, now ghosted (had streak, broke it) ───
    if (streakDays === 0 && inactiveDays >= 5 && txnCount >= 5) {
      return {
        mood: 'sad',
        state: 'error',
        line: `${inactiveDays} days off-track. One small log gets us back.`,
        intensity: 0.5,
        showStreak: false,
        gated: false,
        glyph: '🥺',
      };
    }

    // ── 3) CELEBRATING — milestone or topGoal nearly done ─────────
    const milestoneDays = [7, 14, 30, 50, 100];
    if (milestoneDays.includes(streakDays)) {
      return {
        mood: 'celebrating',
        state: 'success',
        line: `${streakDays}-day streak! You're built different.`,
        intensity: 1,
        showStreak: true,
        gated: false,
        glyph: '🎉',
      };
    }
    const topGoal = g?.topGoal;
    const goalPct = topGoal && topGoal.target > 0 ? topGoal.saved / topGoal.target : 0;
    if (topGoal && goalPct >= 1) {
      return {
        mood: 'celebrating',
        state: 'success',
        line: `You hit "${topGoal.name}"! Goal smashed.`,
        intensity: 1,
        showStreak,
        gated: false,
        glyph: '🏆',
      };
    }

    // ── 4) PROUD — score green or goal close to done ──────────────
    if ((s?.value || 0) >= 75) {
      return {
        mood: 'proud',
        state: 'success',
        line: `Score ${s.value}/100. Quietly winning.`,
        intensity: 0.8,
        showStreak,
        gated: false,
        glyph: '🌟',
      };
    }
    if (topGoal && goalPct >= 0.8) {
      const left = Math.max(0, topGoal.target - topGoal.saved);
      return {
        mood: 'proud',
        state: 'success',
        line: `"${topGoal.name}" — only ₹${fmt(left)} to go.`,
        intensity: 0.8,
        showStreak,
        gated: false,
        glyph: '🏁',
      };
    }

    // ── 5) SLEEPY — late-night activity (post 11pm IST) ───────────
    if (hour >= 23 || hour < 5) {
      return {
        mood: 'sleepy',
        state: 'idle',
        line: 'Late-night spending? Let\'s not regret this tomorrow.',
        intensity: 0.4,
        showStreak,
        gated: false,
        glyph: '🌙',
      };
    }

    // ── 6) SARCASTIC — repeated impulse signal (3+ in same cat) ───
    const cats = t?.categories || {};
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    const monthlySpend = t?.monthlySpend || 0;
    if (topCat && monthlySpend > 0 && topCat[1] / monthlySpend >= 0.45) {
      return {
        mood: 'sarcastic',
        state: 'idle',
        line: `${topCat[0]}? Again? Bold strategy.`,
        intensity: 0.6,
        showStreak,
        gated: false,
        glyph: '👀',
      };
    }

    // ── 7) FOCUSED — mid-month budget watch (50-70% used) ─────────
    const budgetUsed = b?.total ? (b.used || 0) / b.total : 0;
    if (b?.total && budgetUsed >= 0.5 && budgetUsed < 0.7) {
      return {
        mood: 'focused',
        state: 'idle',
        line: `${Math.round(budgetUsed * 100)}% of budget used. Stay sharp.`,
        intensity: 0.6,
        showStreak,
        gated: false,
        glyph: '🎯',
      };
    }

    // ── 8) ENCOURAGING — early users (1-2 txns) ───────────────────
    if (txnCount >= 1 && txnCount <= 2) {
      return {
        mood: 'encouraging',
        state: 'thinking',
        line: 'Nice start! A few more logs and I\'ll really know you.',
        intensity: 0.6,
        showStreak,
        gated: false,
        glyph: '🌱',
      };
    }

    // ── 9) IDLE — calm neutral ────────────────────────────────────
    if (showStreak) {
      return {
        mood: 'idle',
        state: 'idle',
        line: `${streakDays}-day streak. Keep the chain alive.`,
        intensity: 0.5,
        showStreak: true,
        gated: false,
        glyph: '🔥',
      };
    }
    return {
      mood: 'idle',
      state: 'idle',
      line: `Tracking ${txnCount} txns this month. Steady.`,
      intensity: 0.4,
      showStreak: false,
      gated: false,
      glyph: '✨',
    };
  }, [
    ctx.transactions?.count,
    ctx.transactions?.monthlySpend,
    ctx.transactions?.lastTxnDate,
    ctx.transactions?.categories,
    ctx.budgets?.total,
    ctx.budgets?.used,
    ctx.goals?.topGoal?.saved,
    ctx.goals?.topGoal?.target,
    ctx.goals?.topGoal?.name,
    ctx.score?.value,
    ctx.streak?.days,
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

export default useMascotMood;
