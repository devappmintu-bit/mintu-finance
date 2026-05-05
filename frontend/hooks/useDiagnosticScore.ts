/**
 * useDiagnosticScore — Round 92 Diagnostic Score (replaces abstract Money Score).
 *
 * Surfaces the 3-line diagnostic from /api/home/diagnostic. Used by
 * HeroDecision on the Home tab.
 *
 *   • score          (0..100)
 *   • delta_week     (signed integer; +/- vs last week)
 *   • percentile     (vs user's own last-12-weeks history)
 *   • weakest_category   ({category, overshoot_pct, ...} or null)
 *
 * Cache: in-memory swrGet for 60 s. Refetches when /home/bundle invalidates.
 */
import { useEffect, useState, useCallback } from 'react';
import { useFinContext } from '../store/financialContext';

export interface DiagnosticScore {
  score: number;
  delta_week: number;
  percentile: number;
  percentile_basis: 'own_history' | 'insufficient_history';
  history_count: number;
  weakest_category:
    | {
        category: string;
        current_month_spend: number;
        typical_daily: number;
        current_daily: number;
        overshoot_pct: number;
      }
    | null;
  headline: {
    score_line: string;
    percentile_line: string;
    weakest_line: string;
  };
}

export function useDiagnosticScore() {
  const [data, setData] = useState<DiagnosticScore | null>(null);
  const [loading, setLoading] = useState(true);
  // Pull score value from financial context as fallback so we paint
  // something even before the diagnostic call returns.
  const ctxScore = useFinContext((s) => s.score?.value ?? 0);

  const fetchOnce = useCallback(async () => {
    try {
      const { swrGet } = await import('../utils/swrGet');
      const res = await swrGet('/home/diagnostic', { ttlMs: 60_000 });
      if (res.data) setData(res.data as DiagnosticScore);
      if (res.isStale) {
        res.fresh.then((fresh) => { if (fresh) setData(fresh as DiagnosticScore); }).catch(() => {});
      }
    } catch {
      // Soft-fail: HeroDecision falls back to ctxScore.
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOnce(); }, [fetchOnce]);

  // Subscribe to bundle invalidation so the score refreshes when
  // transactions / budgets land.
  useEffect(() => {
    let cancelled = false;
    let unsubs: Array<() => void> = [];
    (async () => {
      const { subscribeInvalidation } = await import('../utils/swrGet');
      const tick = () => { if (!cancelled) fetchOnce(); };
      unsubs = [
        subscribeInvalidation('/home/bundle', tick),
        subscribeInvalidation('/home/diagnostic', tick),
      ];
    })();
    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [fetchOnce]);

  return { data, loading, ctxScore };
}
