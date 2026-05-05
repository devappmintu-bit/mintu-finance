/**
 * services/premium.ts — Premium subscription + coin economy wrappers.
 */
import api from '../utils/api';
import type { PremiumStatus } from './types';
import { invalidateAfter } from '../utils/cacheGraph';

export async function fetchPremiumStatus(): Promise<PremiumStatus> {
  const r = await api.get('/premium/status');
  return r.data as PremiumStatus;
}

export async function createPremiumOrder(payload: { plan: 'monthly' | 'yearly' | 'family'; coins_to_use?: number }): Promise<any> {
  const r = await api.post('/premium/create-order', payload);
  return r.data;
}

export async function verifyPremiumPayment(payload: { order_id: string; payment_id: string; signature: string }): Promise<any> {
  const r = await api.post('/premium/verify-payment', payload);
  // Round 59 — successful payment flips premium status; refresh the
  // gates everywhere (paywall, premium-only screens, home upsell).
  await invalidateAfter('premium.tier');
  return r.data;
}

export async function awardCoins(action: string, amount: number = 1, dedupeKey?: string): Promise<any> {
  // Round 92 — Gamification hard-killed. This is now a NO-OP.
  // Backend `/coins/award` returns 410 Gone. Habit-loop reward beat
  // moved to /coach/rewards/recent (projected savings, not coins).
  // Kept for backwards compatibility with stale call sites — silent no-op.
  void action; void amount; void dedupeKey;
  return { awarded: 0, deprecated: true, reason: 'gamification_retired' };
}

export async function fetchLeaderboard(_scope: 'contacts' | 'global' = 'contacts'): Promise<any[]> {
  // Round 92 — Leaderboards retired. Returns empty array silently.
  void _scope;
  return [];
}
