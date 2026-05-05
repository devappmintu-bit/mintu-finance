/**
 * useHomeBundleData.ts — Round 67 R3 decomposition
 *
 * Encapsulates ALL data fetching for the Home screen:
 *   • Primary /home/bundle SWR fetch (with 30s cache)
 *   • Phase-2 fallback fan-out (avatar, snapshot, alerts, weekly, predict, coins)
 *   • Daily coin reward + confetti trigger
 *   • News feed (deferred until idle)
 *   • Cache-graph subscription (auto-refresh on txn/budget/etc invalidation)
 *   • Pull-to-refresh
 *   • Error surfacing when nothing has painted
 *
 * Returns a single bundle of data + setters + lifecycle handlers so
 * the HomeScreen orchestrator becomes pure presentation logic.
 *
 * Previously these ~210 lines lived directly in /app/(tabs)/index.tsx,
 * making the file hard to reason about. R3 keeps the contract intact
 * (same paint timing, same SWR shape) while moving the side-effect
 * spaghetti out of view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useFinContext } from '../store/financialContext';
import { fetchCurrentUser, fetchAvatar } from '../services/user';
// Round 92 — gamification hard-killed. awardCoins is now a no-op stub.
import { fetchStatsOverview, fetchTransactions } from '../services/transactions';
import { runWhenIdle } from './usePerf';

export type HomeBundleData = {
  // Raw API surfaces — passed straight into the home cards
  stats: any;
  snapshot: any;
  predict: any;
  recentTxns: any[];
  smartAlerts: any[];
  weeklyReport: any;
  // Round 94 — coinsStatus removed (gamification kill).
  news: any[];
  newsUpdatedAt: string | null;
  newsLoading: boolean;

  // Lifecycle flags
  loading: boolean;
  refreshing: boolean;
  loadError: boolean;
  showConfetti: boolean;

  // Handlers
  onRefresh: () => void;
  onRefreshNews: () => void;
  onConfettiDone: () => void;
  retry: () => void;

  // Memoised derived values used by the feed
  gettingStartedCounts: { transactions: number; budgets: number; goals: number; groups: number } | null;
  txnCount: number;
  topLeaks: { label: string; amount: number; emoji: string }[];
  monthlyLoss: number;
  moneyScore: number;
};

/**
 * Single source of truth for /home/* data.
 *
 * @param lang  — current i18n locale; bundle is keyed by language so
 *                changing the user's language refetches.
 */
export function useHomeBundleData(lang: string): HomeBundleData {
  const { setUser, setAvatar } = useAuthStore();
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [predict, setPredict] = useState<any>(null);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [smartAlerts, setSmartAlerts] = useState<any[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  // Round 94 — coinsStatus state removed (gamification kill).
  const [showConfetti, setShowConfetti] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Mirror user/stats so fetchData can detect "nothing painted" without
  // pulling them into its dep array (would cause an infinite refetch).
  const userRef = useRef<any>(user);
  const statsRef = useRef<any>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  // News fetch (separate timeout + silent failure)
  const fetchNews = useCallback(async (refresh = false) => {
    setNewsLoading(true);
    try {
      // Phase 5 Wave 4 — explicit short timeout for upstream news.
      // Anything past 4 s is wasted user time; show inline fallback.
      const res = await api.get(
        `/news/india-finance${refresh ? '?refresh=1' : ''}`,
        { timeout: 4000 },
      );
      setNews(res.data?.articles || []);
      setNewsUpdatedAt(res.data?.updated_at || null);
    } catch (e) {
      // Silent — UI shows inline "Latest news unavailable".
      if (__DEV__) console.warn('[home] news fetch failed', e);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const onRefreshNews = useCallback(() => fetchNews(true), [fetchNews]);

  // Primary fetch — SWR-cached /home/bundle, falling back to fan-out.
  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      try {
        const { swrGet } = await import('../utils/swrGet');
        const res = await swrGet(`/home/bundle?lang=${lang}`, { ttlMs: 30_000 });
        const paint = (b: any) => {
          if (!b) return;
          if (b.user) setUser(b.user);
          if (b.stats) setStats(b.stats);
          if (Array.isArray(b.recent_txns)) setRecentTxns(b.recent_txns.slice(0, 4));
          if (b.avatar?.avatar) setAvatar(b.avatar.avatar);
          if (b.snapshot) setSnapshot(b.snapshot);
          setSmartAlerts(b.alerts?.alerts || []);
          if (b.weekly_report) setWeeklyReport(b.weekly_report);
          if (b.ai_predict) setPredict(b.ai_predict);
          // Round 94 — `b.coins` no longer in bundle.
          // Round 82 — SSoT adoption. Push the bundle into useFinContext
          // so downstream consumers (AIBrainDashboard, NewsCardStack,
          // useBrainInsight) see fresh numbers without re-fetching.
          try { useFinContext.getState().hydrateFromBundle(b); } catch { /* noop */ }
        };
        paint(res.data);
        setLoading(false);
        if (res.isStale) {
          res.fresh.then((fresh) => { if (fresh) paint(fresh); }).catch(() => {});
        }
        // Round 92 — coin awards killed. Confetti/celebration now driven
        // by /coach/rewards/recent (projected savings) instead.
        try {
          const r = await api.get('/coach/rewards/recent');
          if (r?.data?.reward) setShowConfetti(true);
        } catch { /* noop */ }
        fetchNews(false);
        setRefreshing(false);
        return;
      } catch (bundleErr) {
        if (__DEV__) console.warn('home/bundle failed, fallback', bundleErr);
      }

      // Phase 1 — paint above-the-fold from 3 essential fetches.
      const [profileRes, statsRes, txnRes] = await Promise.all([
        fetchCurrentUser().then(data => ({ data })),
        fetchStatsOverview().then(data => ({ data })),
        fetchTransactions({ limit: 5 }).then(data => ({ data })),
      ]);
      setUser(profileRes.data as Parameters<typeof setUser>[0]);
      setStats(statsRes.data);
      setRecentTxns(Array.isArray(txnRes.data) ? txnRes.data.slice(0, 4) : []);
      setLoading(false);

      // Phase 2 — defer non-critical fetches until idle.
      InteractionManager.runAfterInteractions(async () => {
        try {
          const [avatarRes, snapRes, alertsRes, reportRes, predRes] = await Promise.all([
            fetchAvatar().then(data => ({ data })).catch(() => ({ data: null })),
            api.get('/home/snapshot').catch(() => ({ data: null })),
            api.get('/alerts/smart').catch(() => ({ data: { alerts: [] } })),
            api.get('/reports/weekly').catch(() => ({ data: null })),
            api.get('/ai/predict').catch(() => ({ data: null })),
            // Round 92 — /coins/status + awardCoins polling killed.
          ]);
          if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
          if (snapRes.data) setSnapshot(snapRes.data);
          setSmartAlerts(alertsRes.data?.alerts || []);
          if (reportRes.data) setWeeklyReport(reportRes.data);
          if (predRes.data) setPredict(predRes.data);
        } catch (e) { if (__DEV__) console.error('Phase2 err', e); }
        // News fires last so the visible feed paints before remote feeds.
        fetchNews(false);
      });
    } catch (error) {
      if (__DEV__) console.error('Dashboard fetch error:', error);
      // Surface a retry banner only if NOTHING has painted yet —
      // partial paints still give the user something to look at.
      if (!userRef.current && !statsRef.current) {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang, setUser, setAvatar, fetchNews]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const retry = useCallback(() => { fetchData(); }, [fetchData]);

  const onConfettiDone = useCallback(() => setShowConfetti(false), []);

  // Cache-graph subscription — auto-refresh on cross-tab mutations.
  useEffect(() => {
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (cancelled) return;
      // Debounce — a single transaction triggers multiple upstream
      // invalidations (txn + budget + rewards). Collapse into one fetch.
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { if (!cancelled) fetchData(); }, 300);
    };
    let unsubs: Array<() => void> = [];
    (async () => {
      const { subscribeInvalidation } = await import('../utils/swrGet');
      unsubs = [
        subscribeInvalidation('/home/bundle', tick),
        subscribeInvalidation('/home/snapshot', tick),
        subscribeInvalidation('/analytics/summary', tick),
        subscribeInvalidation('/alerts/smart', tick),
        subscribeInvalidation('/reports/weekly', tick),
      ];
    })();
    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      for (const u of unsubs) u();
    };
  }, [fetchData]);

  // Defer news refresh until first interactive frame on every focus.
  useFocusEffect(
    useCallback(() => {
      const cancel = runWhenIdle(() => fetchNews(true));
      return cancel;
    }, [fetchNews]),
  );

  // ── Memoised derived values ────────────────────────────────────
  const gettingStartedCounts = useMemo(() => {
    if (!stats) return null;
    return {
      transactions: Number(stats?.month?.transaction_count || stats?.transaction_count || stats?.transactions_count || 0),
      budgets: Number(stats?.budget_count || (stats?.budgets || []).length || 0),
      goals: Number(stats?.goal_count || (stats?.goals || []).length || 0),
      groups: Number(stats?.group_count || (stats?.groups || []).length || 0),
    };
  }, [stats]);

  const txnCount = useMemo(() => Number(
    stats?.transaction_count
    ?? stats?.txn_count
    ?? stats?.total_transactions
    ?? snapshot?.transaction_count
    ?? snapshot?.txn_count
    ?? 0
  ), [stats, snapshot]);

  const topLeaks = useMemo(
    () => (predict?.waste_comparisons || []).slice(0, 3).map((w: any) => ({
      label: w.title || w.category || 'Spending leak',
      amount: Number(w.amount || 0),
      emoji: w.emoji || '💸',
    })),
    [predict]
  );

  const monthlyLoss = Number(predict?.monthly_waste || predict?.overspend_total || 0);
  const moneyScore = Number(user?.money_score || 0);

  return {
    stats, snapshot, predict, recentTxns, smartAlerts, weeklyReport,
    news, newsUpdatedAt, newsLoading,
    loading, refreshing, loadError, showConfetti,
    onRefresh, onRefreshNews, onConfettiDone, retry,
    gettingStartedCounts, txnCount, topLeaks, monthlyLoss, moneyScore,
  };
}
