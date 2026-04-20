/**
 * services/rewards.ts — Referrals, A/B, gamification, share-card wrappers.
 */
import api from '../utils/api';

export async function fetchReferralCode(): Promise<any> {
  const r = await api.get('/referral/my-code');
  return r.data;
}

export async function fetchReferralStatus(): Promise<any> {
  const r = await api.get('/referral/enhanced-status');
  return r.data;
}

export async function fetchReferralScoreCard(): Promise<any> {
  const r = await api.get('/referral/money-score-card');
  return r.data;
}

export async function fetchGamificationStatus(): Promise<any> {
  const r = await api.get('/gamification/status');
  return r.data;
}

export async function fetchPaywallTrigger(): Promise<any> {
  const r = await api.get('/premium/paywall-trigger');
  return r.data;
}

export async function fetchShareScoreCard(): Promise<any> {
  const r = await api.get('/share/score-card');
  return r.data;
}

export async function fetchPaywallGroup(): Promise<any> {
  const r = await api.get('/ab/paywall-group');
  return r.data;
}

export async function trackAbEvent(event: string, group?: string, placement?: string): Promise<void> {
  try { await api.post('/ab/track-event', { event, group, placement }); } catch { /* silent */ }
}

export async function fetchSavingsLeaderboard(): Promise<any> {
  const r = await api.get('/leaderboard/savings');
  return r.data;
}

export async function fetchFriendsLeaderboard(): Promise<any> {
  const r = await api.get('/leaderboard/friends');
  return r.data;
}
