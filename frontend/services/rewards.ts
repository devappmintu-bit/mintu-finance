/**
 * services/rewards.ts — Referrals, A/B, gamification, share-card wrappers.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';

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
  // Note: /ab/track-event is a fire-and-forget telemetry write — no UI cache to invalidate.
}

export async function fetchSavingsLeaderboard(): Promise<any> {
  const r = await api.get('/leaderboard/savings');
  return r.data;
}

export async function fetchFriendsLeaderboard(): Promise<any> {
  const r = await api.get('/leaderboard/friends');
  return r.data;
}


// ═══════════════════════════════════════════════════════════════
// Rewards Hub v2 (Gamification — Wave 1)
// ═══════════════════════════════════════════════════════════════

export async function fetchRewardsSummary(): Promise<any> {
  const r = await api.get('/rewards/summary');
  return r.data;
}

export async function spinWheel(): Promise<any> {
  const r = await api.post('/rewards/spin');
  await invalidateAfter('reward.claim');  // Round 59 — coins/streak/board
  return r.data;
}

export async function fetchMissions(): Promise<any> {
  const r = await api.get('/rewards/missions');
  return r.data;
}

export async function claimMission(mission_id: string): Promise<any> {
  const r = await api.post('/rewards/missions/claim', { mission_id });
  await invalidateAfter('reward.claim');  // Round 59 — coins land
  return r.data;
}

export async function fetchTier(): Promise<any> {
  const r = await api.get('/rewards/tier');
  return r.data;
}

export async function fetchRewardsVouchers(category: string = 'food'): Promise<any> {
  const r = await api.get(`/rewards/vouchers?category=${encodeURIComponent(category)}`);
  return r.data;
}

export async function claimVoucher(voucher_id: string): Promise<any> {
  const r = await api.post('/rewards/claim-voucher', { voucher_id });
  await invalidateAfter('reward.claim');  // Round 59 — wallet/marketplace refresh
  return r.data;
}

export async function fetchMarketplace(): Promise<any> {
  const r = await api.get('/rewards/marketplace');
  return r.data;
}

export async function fetchSocialFeed(): Promise<any> {
  const r = await api.get('/rewards/social-feed');
  return r.data;
}

export async function fetchEvents(): Promise<any> {
  const r = await api.get('/rewards/events');
  return r.data;
}

export async function claimMarketplaceReward(reward_id: string): Promise<any> {
  const r = await api.post('/rewards/claim-marketplace', { reward_id });
  await invalidateAfter('reward.claim');  // Round 59 — marketplace + wallet
  return r.data;
}

