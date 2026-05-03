/**
 * financialContextStore — v10 "AI Brain" (Context Engine).
 *
 * The SINGLE SOURCE OF TRUTH for anything AI-driven in the app. All
 * AI CTAs (Boost Score, Build Plan, Add Expense, Budget Optimize,
 * Goal Strategy, Split Advice, Daily Brief) pass a `mode` + snapshot
 * of this context to the coach — no more generic chat.
 *
 * Shape mirrors the master v10 spec:
 *   profile · score · transactions · budgets · goals · splits ·
 *   streak · insights (overspending / anomalies / recommendations)
 *
 * Persisted in memory only; auto-refresh on any mutation via
 * `refresh()` which hits existing endpoints (no new backend work
 * needed for the Brain).
 */
import { create } from 'zustand';
import { api } from '../utils/api';

export type Mode =
  | 'score_boost'
  | 'plan_build'
  | 'expense_help'
  | 'budget_optimize'
  | 'goal_strategy'
  | 'split_advice'
  | 'daily_brief'
  | 'free';

export interface UserFinancialContext {
  profile:      { name?: string; tier?: string; isPro?: boolean };
  score:        { value: number; factors?: Record<string, any>; delta?: number };
  transactions: { count: number; monthlySpend: number; categories: Record<string, number>; lastTxnDate?: string | null };
  budgets:      { total: number; used: number; categories: Record<string, { limit: number; spent: number }> };
  goals:        { count: number; totalTarget: number; totalSaved: number; topGoal?: { name: string; saved: number; target: number } | null };
  splits:       { groups: number; owed: number; owe: number };
  streak:       { days: number };
  insights:     { overspending: string[]; anomalies: string[]; recommendations: string[];
                  peer?: { median_spend?: number; score_percentile?: number };
                  mom?:  { current_spend?: number; previous_spend?: number; delta_pct?: number } };
  meta:         { lastRefreshMs: number; loaded: boolean };
}

const EMPTY: UserFinancialContext = {
  profile: {}, score: { value: 0 },
  transactions: { count: 0, monthlySpend: 0, categories: {}, lastTxnDate: null },
  budgets: { total: 0, used: 0, categories: {} },
  goals: { count: 0, totalTarget: 0, totalSaved: 0, topGoal: null },
  splits: { groups: 0, owed: 0, owe: 0 },
  streak: { days: 0 },
  insights: { overspending: [], anomalies: [], recommendations: [] },
  meta: { lastRefreshMs: 0, loaded: false },
};

interface Store extends UserFinancialContext {
  refresh: (force?: boolean) => Promise<void>;
  get: () => UserFinancialContext;
}

const STALE_MS = 60_000; // refresh only if older than 60s

export const useFinContext = create<Store>((set, get) => ({
  ...EMPTY,

  get: () => {
    const s: any = get();
    const { refresh: _r, get: _g, ...ctx } = s;
    return ctx as UserFinancialContext;
  },

  refresh: async (force = false) => {
    const s: any = get();
    if (!force && s.meta.loaded && Date.now() - s.meta.lastRefreshMs < STALE_MS) return;

    const results = await Promise.allSettled([
      api.get('/profile/identity'),
      api.get('/analytics/summary'),
      api.get('/transactions', { params: { limit: 50 } }).catch(() => null),
      api.get('/budgets/live').catch(() => null),
      api.get('/goals').catch(() => null),
      api.get('/splits/summary').catch(() => null),
      api.get('/gamification/status').catch(() => null),
      api.get('/ai/proactive-nudges').catch(() => null),
      // v10 — pulls peer + MoM insights for the new AI perspective modes.
      api.get('/home/bundle').catch(() => null),
    ]);

    const data = (i: number) =>
      results[i].status === 'fulfilled' ? (results[i] as any).value?.data || (results[i] as any).value : null;

    const identity = data(0) || {};
    const summary = data(1) || {};
    const txnList: any[] = (data(2)?.transactions || data(2)?.items || data(2) || []) as any[];
    const budgetsResp = data(3) || {};
    const goalsResp = data(4) || {};
    const splitsResp = data(5) || {};
    const gami = data(6) || {};
    const nudges = data(7) || {};
    const bundle = data(8) || {};
    const bundleInsights = (bundle as any)?.insights || {};

    // ── Transactions aggregation ────────────────────────────────
    const monthlySpend = Number(summary?.total_expense || 0);
    const catMap: Record<string, number> = {};
    for (const t of txnList) {
      const c = (t.category || 'Other').toString();
      const v = Math.abs(Number(t.amount || 0));
      catMap[c] = (catMap[c] || 0) + v;
    }
    const lastTxn = txnList[0]?.date || txnList[0]?.created_at || null;

    // ── Budgets aggregation ─────────────────────────────────────
    const budgetsArr = Array.isArray(budgetsResp?.budgets)
      ? budgetsResp.budgets
      : Array.isArray(budgetsResp) ? budgetsResp : [];
    const budgetMap: Record<string, { limit: number; spent: number }> = {};
    let budTotal = 0, budUsed = 0;
    for (const b of budgetsArr) {
      const cat = (b.category || b.name || 'General').toString();
      const lim = Number(b.limit || b.amount || 0);
      const sp = Number(b.spent || b.used || 0);
      budgetMap[cat] = { limit: lim, spent: sp };
      budTotal += lim; budUsed += sp;
    }

    // ── Goals aggregation ───────────────────────────────────────
    const goalsArr = Array.isArray(goalsResp?.goals) ? goalsResp.goals :
                     Array.isArray(goalsResp) ? goalsResp : [];
    let gTarget = 0, gSaved = 0;
    let topGoal: any = null;
    for (const g of goalsArr) {
      gTarget += Number(g.target_amount || 0);
      gSaved += Number(g.saved_amount || 0);
      const pct = g.target_amount ? (g.saved_amount / g.target_amount) : 0;
      if (!topGoal || pct > (topGoal.saved / (topGoal.target || 1))) {
        topGoal = { name: g.name, saved: g.saved_amount || 0, target: g.target_amount || 0 };
      }
    }

    // ── Splits aggregation ──────────────────────────────────────
    const splits = {
      groups: Number(splitsResp?.groups_count || splitsResp?.groups?.length || 0),
      owed: Number(splitsResp?.total_owed_to_you || splitsResp?.owed || 0),
      owe: Number(splitsResp?.total_you_owe || splitsResp?.owe || 0),
    };

    // ── Insights ────────────────────────────────────────────────
    const overspending: string[] = [];
    const anomalies: string[] = [];
    const recommendations: string[] = (nudges?.nudges || []).map((n: any) => n.text || n).slice(0, 3);
    for (const [cat, limSp] of Object.entries(budgetMap)) {
      if (limSp.spent > limSp.limit && limSp.limit > 0) {
        overspending.push(`${cat} over budget by ₹${Math.round(limSp.spent - limSp.limit)}`);
      }
    }

    set({
      profile: {
        name: identity?.name,
        tier: identity?.tier_label,
        isPro: !!identity?.is_premium,
      },
      score: {
        value: Number(identity?.money_score || 0),
        factors: identity?.score_factors,
        delta: identity?.weekly_delta,
      },
      transactions: {
        count: txnList.length,
        monthlySpend,
        categories: catMap,
        lastTxnDate: lastTxn,
      },
      budgets: { total: budTotal, used: budUsed, categories: budgetMap },
      goals: {
        count: goalsArr.length,
        totalTarget: gTarget,
        totalSaved: gSaved,
        topGoal,
      },
      splits,
      streak: { days: Number(identity?.streak || gami?.streak || 0) },
      insights: {
        overspending,
        anomalies,
        recommendations,
        // v10 — peer benchmark + month-over-month, consumed by
        // ai_context peer_compare / mom_compare modes.
        peer: bundleInsights?.peer || {},
        mom:  bundleInsights?.mom  || {},
      },
      meta: { lastRefreshMs: Date.now(), loaded: true },
    });
  },
}));

// Helper for non-hook callers.
export function getUserFinancialContext(): UserFinancialContext {
  return useFinContext.getState().get();
}
