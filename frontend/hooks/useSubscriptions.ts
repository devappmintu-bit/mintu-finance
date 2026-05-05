/**
 * hooks/useSubscriptions.ts — Round 99C.
 *
 * Pulls the recurring-subscription deck from /api/subscriptions and
 * exposes scan/dismiss/restore mutations. Optimistic UI: toggling
 * dismiss flips the flag locally before the server confirms, then
 * reconciles on response.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

export interface Subscription {
  subscription_id: string;
  merchant_key: string;
  merchant_label: string;
  category: string;
  amount_avg: number;
  amount_min: number;
  amount_max: number;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly' | string;
  median_interval_days: number;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  next_predicted: string;
  annualised_cost: number;
  confidence: number;
  status: 'active' | 'dormant' | 'cancelled' | string;
  user_dismissed?: boolean;
}

export interface SubscriptionsSummary {
  total: number;
  active: number;
  annualised_active: number;
  biggest_leak: string | null;
}

export interface SubscriptionsState {
  subs:        Subscription[];
  summary:     SubscriptionsSummary | null;
  loading:     boolean;
  scanning:    boolean;
  error:       string | null;
  refetch:     (includeDismissed?: boolean) => Promise<void>;
  scan:        () => Promise<void>;
  dismiss:     (id: string) => Promise<void>;
  restore:     (id: string) => Promise<void>;
}

export function useSubscriptions(): SubscriptionsState {
  const [subs, setSubs]       = useState<Subscription[]>([]);
  const [summary, setSummary] = useState<SubscriptionsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScan]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refetch = useCallback(async (includeDismissed: boolean = false) => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/subscriptions', {
        params: includeDismissed ? { include_dismissed: true } : {},
      });
      setSubs(Array.isArray(res?.data?.subscriptions) ? res.data.subscriptions : []);
      setSummary(res?.data?.summary ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setScan(true); setError(null);
    try {
      const res = await api.post('/subscriptions/scan');
      setSubs(Array.isArray(res?.data?.subscriptions) ? res.data.subscriptions : []);
      setSummary(res?.data?.summary ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Scan failed');
    } finally {
      setScan(false);
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    // Optimistic: drop from local list immediately.
    const prev = subs;
    setSubs(s => s.filter(x => x.subscription_id !== id));
    try {
      await api.post(`/subscriptions/${encodeURIComponent(id)}/dismiss`);
    } catch (e: any) {
      setSubs(prev);    // rollback
      setError(e?.response?.data?.detail || 'Could not dismiss');
    }
  }, [subs]);

  const restore = useCallback(async (id: string) => {
    try {
      await api.post(`/subscriptions/${encodeURIComponent(id)}/restore`);
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not restore');
    }
  }, [refetch]);

  useEffect(() => { refetch().catch(() => {}); }, [refetch]);

  return { subs, summary, loading, scanning, error, refetch, scan, dismiss, restore };
}

export default useSubscriptions;
