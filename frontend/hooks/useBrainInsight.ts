/**
 * useBrainInsight — v10 bridge between financialContext + AI server.
 *
 * Calls POST /ai-coach/context-response with the live `financialContext`
 * snapshot and selected mode. First response is a deterministic
 * fallback (<50 ms); a subsequent refetch returns the LLM-enriched
 * version once the backend's stale-while-revalidate worker refreshes.
 *
 * Modes supported server-side:
 *   waste_detector | what_if | home_pulse | budget_optimize |
 *   goal_strategy | split_advice | daily_brief | free | ...
 *
 * Returns:
 *   { insight, actions, deepAnalysis, priority, loading, refresh() }
 *
 * The hook is idempotent; callers can safely swap modes at any time.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFinContext } from '../store/financialContext';
import api from '../utils/api';

export interface BrainAction {
  label: string;
  sub?: string;
  cta?: string;   // 'open_expense' | 'open_budget' | 'open_goal' | 'open_split' | 'open_score' | 'chat'
}

export interface BrainPayload {
  insight: string;
  actions: BrainAction[];
  deepAnalysis: string[];
  priority: 'low' | 'med' | 'high';
  loading: boolean;
  mode: string;
  refresh: () => void;
}

export function useBrainInsight(mode: string, opts: { enabled?: boolean } = {}): BrainPayload {
  const { enabled = true } = opts;
  const ctx = useFinContext();
  const [state, setState] = useState<{ insight: string; actions: BrainAction[]; deepAnalysis: string[]; priority: 'low'|'med'|'high' }>({
    insight: '',
    actions: [],
    deepAnalysis: [],
    priority: 'low',
  });
  const [loading, setLoading] = useState<boolean>(false);

  const fetchMode = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      // Serialise only the fields the server actually needs. Keeps
      // payload < 2 KB even for heavy users.
      const payload = {
        mode,
        lang: 'en',
        source: 'brain_dashboard',
        context: {
          profile: ctx.profile,
          score: ctx.score,
          transactions: ctx.transactions,
          budgets: ctx.budgets,
          goals: ctx.goals,
          splits: ctx.splits,
          streak: ctx.streak,
          insights: ctx.insights,
        },
      };
      const resp = await api.post('/ai-coach/context-response', payload);
      const json: any = resp?.data || {};
      if (json?.data?.insight) {
        setState({
          insight: String(json.data.insight),
          actions: Array.isArray(json.data.actions) ? json.data.actions.slice(0, 4) : [],
          deepAnalysis: Array.isArray(json.data.deep_analysis) ? json.data.deep_analysis.slice(0, 5) : [],
          priority: (json.data.priority as any) || 'low',
        });
      }
    } catch {
      // Silent fail — caller already has the client-side buildBrain
      // derivation as a hard fallback.
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    mode,
    // Only re-fetch when the "shape" of the user's money changes
    // meaningfully. This matches the server's cache-shard logic.
    ctx.transactions?.count,
    Math.floor((ctx.transactions?.monthlySpend || 0) / 500),
    Math.floor((ctx.budgets?.used || 0) / 500),
    ctx.goals?.count,
    ctx.insights?.overspending?.length,
  ]);

  useEffect(() => {
    fetchMode();
    // Refetch after 8s to pick up LLM-regenerated cache.
    const t = setTimeout(fetchMode, 8000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMode]);

  return {
    ...state,
    loading,
    mode,
    refresh: fetchMode,
  };
}
