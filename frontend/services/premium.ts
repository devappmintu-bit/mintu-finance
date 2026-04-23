/**
 * services/premium.ts — Premium subscription + coin economy wrappers.
 */
import api from '../utils/api';
import type { PremiumStatus } from './types';

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
  return r.data;
}

export async function awardCoins(action: string, amount: number = 1, dedupeKey?: string): Promise<any> {
  // Backend contract: {action: string, dedupe_key?: string}
  //  • `action` is looked up in COIN_RULES for the coin value + daily cap.
  //  • `dedupe_key` (optional) makes the award idempotent — calling twice
  //    with the same key awards coins once. Pass the resource ID (e.g.
  //    transaction_id, expense_id) whose creation earned the coin.
  //    Closes the Round 29c "farm coins by add+delete+add" micro-abuse.
  const body: any = { action, amount };
  if (dedupeKey) body.dedupe_key = dedupeKey;
  const r = await api.post('/coins/award', body);
  return r.data;
}

export async function fetchLeaderboard(scope: 'contacts' | 'global' = 'contacts'): Promise<any[]> {
  const r = await api.get('/leaderboard/unified', { params: { scope } });
  return r.data || [];
}
