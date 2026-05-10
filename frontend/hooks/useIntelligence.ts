/**
 * hooks/useIntelligence.ts — R118 SLICE A
 *
 * SWR-style hooks that consume the new /api/intelligence/* endpoints:
 *   • useMoodScore()        → 0-100 composite + band + headline
 *   • useMoneyStory(month?) → 5-panel Instagram-style monthly recap
 *   • useIntelligenceSubs() → subscription vault summary + list
 *
 * All three are deterministic backend reads (no LLM), so they are
 * safe to revalidate on screen focus without rate-limit concerns.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { useIntelligenceRefresh } from '../store/intelligenceRefreshStore';

// ─── Types ─────────────────────────────────────────────────────

export type MoodBand = 'critical' | 'stressed' | 'stable' | 'healthy' | 'thriving';

// SLICE B — Behavioral Finance Engine
export type BehaviorKind = 'late_night_impulse' | 'weekend_overspend' | 'payday_inflation' | 'stress_pattern';
export interface BehaviorInsight {
  kind: BehaviorKind;
  title: string;
  emoji: string;
  is_active: boolean;
  confidence: number;
  signal_text: string;
  copy: string;
  evidence: Record<string, any>;
}
export interface BehaviorBundle {
  insights: BehaviorInsight[];
  active_count: number;
  headline: string | null;
  headline_kind: BehaviorKind | null;
  window_days: number;
  tx_count: number;
  tone: string;
}

// SLICE D — Predictive Cash Flow
export interface BillAlert {
  merchant: string;
  emoji: string;
  amount: number;
  due_iso: string;
  days_until: number;
  category: string | null;
}
export interface CashFlow {
  days_to_eom: number;
  avg_daily_burn: number;
  avg_daily_in: number;
  projected_spend: number;
  projected_in: number;
  projected_net: number;
  upcoming_bills_total: number;
  bill_alerts: BillAlert[];
  low_balance: boolean;
  copy: string;
  vibe: 'warm' | 'cool';
  window_days: number;
  tx_count: number;
}

export interface MoodScore {
  score: number;           // 0..100
  band: MoodBand;
  label: string;
  emoji: string;
  tone: string;
  headline: string;
  sub_scores: {
    savings_trend: number;
    spending_stability: number;
    recurring_burden: number;
    impulse_behavior: number;
    cash_runway: number;
    bill_safety: number;
  };
  weights: Record<string, number>;
  drags: string[];
  computed_at: string;
  window_days: number;
  tx_count: number;
}

export type StoryVibe = 'warm' | 'cool' | 'neutral';

export interface StoryPanel {
  kind: 'hero' | 'top_category' | 'best_week' | 'subscriptions' | 'savings_delta';
  title: string;
  copy: string;
  vibe: StoryVibe;
  // hero
  primary_value?: number;
  primary_label?: string;
  secondary_value?: number;
  secondary_label?: string;
  // top_category
  category?: string;
  amount?: number;
  share_pct?: number;
  // best_week
  week_label?: string;
  // subscriptions
  count?: number;
  // savings_delta
  current_net?: number;
  previous_net?: number;
  delta?: number;
}

export interface MoneyStory {
  month: string;
  month_label: string;
  panels: StoryPanel[];
  totals: { in: number; out: number; net: number };
  tx_count: number;
}

export interface IntelligenceSub {
  id: string;
  merchant_key: string;
  merchant: string;
  category: string | null;
  emoji: string;
  monthly_cost: number;
  last_charge: number;
  last_seen_iso: string;
  next_predicted_iso: string;
  occurrences: number;
  lifetime_spent: number;
  amount_stability: number;
  cadence: number;
  confidence: number;
  is_known: boolean;
}

export interface IntelligenceSubsBundle {
  subscriptions: IntelligenceSub[];
  summary: {
    count: number;
    monthly_total: number;
    annual_projection: number;
    horizon_days: number;
  };
  tone: string;
}

// ─── Hooks ─────────────────────────────────────────────────────

export function useMoodScore() {
  const [data, setData] = useState<MoodScore | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useIntelligenceRefresh(s => s.tick);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/intelligence/mood-score');
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load mood');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch().catch(() => {}); }, [refetch, tick]);

  return { data, loading, error, refetch };
}

export function useMoneyStory(month?: string) {
  const [data, setData] = useState<MoneyStory | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useIntelligenceRefresh(s => s.tick);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/intelligence/money-story', {
        params: month ? { month } : {},
      });
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load story');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { refetch().catch(() => {}); }, [refetch, tick]);

  return { data, loading, error, refetch };
}

export function useIntelligenceSubs() {
  const [data, setData] = useState<IntelligenceSubsBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useIntelligenceRefresh(s => s.tick);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/intelligence/subscriptions');
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load subs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch().catch(() => {}); }, [refetch, tick]);

  return { data, loading, error, refetch };
}

// SLICE B — Behavioral insights
export function useBehavior() {
  const [data, setData] = useState<BehaviorBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useIntelligenceRefresh(s => s.tick);
  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/intelligence/behavior');
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load behavior');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refetch().catch(() => {}); }, [refetch, tick]);
  return { data, loading, error, refetch };
}

// SLICE D — Predictive cash flow
export function useCashflow() {
  const [data, setData] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useIntelligenceRefresh(s => s.tick);
  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/intelligence/cashflow');
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load cashflow');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refetch().catch(() => {}); }, [refetch, tick]);
  return { data, loading, error, refetch };
}

// ─── Display helpers ───────────────────────────────────────────

const BAND_COLORS: Record<MoodBand, { bg: string; ink: string; ring: string }> = {
  critical: { bg: '#FFE4E4', ink: '#7A1212', ring: '#B21A1A' },
  stressed: { bg: '#FFEDD9', ink: '#6E3A05', ring: '#B87400' },
  stable:   { bg: '#FFF8DC', ink: '#5A4500', ring: '#B89400' },
  healthy:  { bg: '#DDF5E5', ink: '#0B4E2A', ring: '#0B6E3A' },
  thriving: { bg: '#E0F0FF', ink: '#0A3A66', ring: '#1865B5' },
};

export function bandPalette(band: MoodBand) {
  return BAND_COLORS[band] || BAND_COLORS.stable;
}

const DRAG_COPY: Record<string, string> = {
  savings_trend:      'Savings could grow',
  spending_stability: 'Spending can be smoother',
  recurring_burden:   'Subscriptions weigh in',
  impulse_behavior:   'Late-night spends crept in',
  cash_runway:        'Runway is tighter',
  bill_safety:        'Bills cushion is thin',
};

export function dragLabel(key: string): string {
  return DRAG_COPY[key] || key.replace(/_/g, ' ');
}
