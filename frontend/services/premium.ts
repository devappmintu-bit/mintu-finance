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

export async function awardCoins(action: string, amount: number = 1): Promise<any> {
  // Backend contract: {action: string} — looked up in COIN_RULES for the coin value
  const r = await api.post('/coins/award', { action, amount });
  return r.data;
}

export async function fetchLeaderboard(scope: 'contacts' | 'global' = 'contacts'): Promise<any[]> {
  const r = await api.get('/leaderboard/unified', { params: { scope } });
  return r.data || [];
}
