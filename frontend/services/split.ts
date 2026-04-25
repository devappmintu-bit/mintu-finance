/**
 * services/split.ts — Split/group/settlement domain API wrappers.
 *
 * Every write fires the appropriate `invalidateAfter(...)` so dependent
 * caches across the app refetch immediately. See DATA_GRAPH.md §4.
 */
import api from '../utils/api';
import { invalidateAfter, invalidateAll } from '../utils/cacheGraph';
import type { SplitGroup, SplitBalance, RazorpayOrder } from './types';

// ── Groups ─────────────────────────────────────────────────────────────
export async function fetchSplitGroups(): Promise<SplitGroup[]> {
  const r = await api.get('/split/groups');
  return (r.data || []) as SplitGroup[];
}

// Round 46 audit — payload type fix. The TS type previously said
// `Array<{ phone, name? }>` but the runtime actually sends `string[]`
// (phone numbers) which is what the backend `SplitGroupCreate.members`
// expects (`List[str]`). The mismatch was masked by an `as any` at the
// call site. Aligning the type prevents future caller bugs.
export async function createSplitGroup(payload: { name: string; members: string[]; custom_emoji?: string }): Promise<SplitGroup> {
  const r = await api.post('/split/groups', payload);
  await invalidateAfter('split.group');
  return r.data as SplitGroup;
}

export async function fetchGroupSummary(groupId: string): Promise<any> {
  const r = await api.get(`/split/groups/${groupId}/summary`);
  return r.data;
}

export async function fetchGroupManage(groupId: string): Promise<any> {
  const r = await api.get(`/split/groups/${groupId}/manage`);
  return r.data;
}

// ── Balances & activity ────────────────────────────────────────────────
export async function fetchSplitBalances(): Promise<SplitBalance[]> {
  const r = await api.get('/split/balances');
  return (r.data || []) as SplitBalance[];
}

export async function fetchSplitActivity(limit = 15): Promise<any[]> {
  const r = await api.get('/split/activity', { params: { limit } });
  return r.data || [];
}

// ── Settlements ─────────────────────────────────────────────────────────
export async function settlePayment(payload: {
  target_user_id: string; amount: number; method: 'cash' | 'upi' | 'razorpay';
  group_id?: string; coins_to_use?: number; txn_ref?: string;
}): Promise<any> {
  const r = await api.post('/split/settle', payload);
  await invalidateAfter('split.settle');
  return r.data;
}

export async function partialSettle(payload: {
  target_user_id: string; amount: number; method: 'cash' | 'upi';
  group_id?: string; coins_to_use?: number;
}): Promise<any> {
  const r = await api.post('/split/partial-settle', payload);
  await invalidateAfter('split.settle');
  return r.data;
}

// ── Razorpay settlement ────────────────────────────────────────────────
export async function createSplitRazorpayOrder(payload: {
  target_user_id: string; amount: number; group_id?: string; coins_to_use?: number;
}): Promise<RazorpayOrder> {
  const r = await api.post('/split/razorpay-order', payload);
  return r.data as RazorpayOrder;
}

// ── Reminders ─────────────────────────────────────────────────────────
export async function sendPaymentReminder(payload: { target_user_id: string; amount: number; group_id?: string }): Promise<any> {
  const r = await api.post('/split/remind', payload);
  await invalidateAfter('split.reminder');
  return r.data;
}

export async function fetchReminders(): Promise<any[]> {
  const r = await api.get('/split/reminders');
  return r.data || [];
}

export async function dismissReminder(reminderId: string): Promise<void> {
  await api.post(`/split/reminders/${reminderId}/dismiss`);
  await invalidateAfter('split.reminder');
}

export async function coinRedeemPreview(amount: number, coinsToUse: number): Promise<any> {
  const r = await api.post('/split/coin-redeem-preview', { amount, coins_to_use: coinsToUse });
  return r.data;
}


// ── Group management ─────────────────────────────────────────────────────
export async function updateGroupName(groupId: string, name: string): Promise<any> {
  const r = await api.put(`/split/groups/${groupId}/name`, { name });
  await invalidateAfter('split.group');
  return r.data;
}

export async function addGroupMember(groupId: string, phone: string): Promise<any> {
  const r = await api.post(`/split/groups/${groupId}/members`, { phones: [phone] });
  await invalidateAfter('split.member');
  return r.data;
}

export async function previewGroupForJoin(groupId: string): Promise<any> {
  const r = await api.get(`/split/groups/${groupId}/preview`);
  return r.data;
}

export async function joinGroup(groupId: string): Promise<any> {
  const r = await api.post(`/split/groups/${groupId}/join`);
  await invalidateAfter('split.member');
  return r.data;
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<void> {
  await api.delete(`/split/groups/${groupId}/members/${memberId}`);
  await invalidateAfter('split.member');
}

export async function leaveGroup(groupId: string): Promise<void> {
  await api.delete(`/split/groups/${groupId}/leave`);
  await invalidateAfter('split.group');
}

export async function deleteGroup(groupId: string): Promise<void> {
  await api.delete(`/split/groups/${groupId}`);
  await invalidateAfter('split.group');
}

// ── Expenses ─────────────────────────────────────────────────────────────
export async function createExpense(payload: any): Promise<any> {
  const r = await api.post('/split/expenses', payload);
  await invalidateAfter('split.expense');
  return r.data;
}

export async function updateExpense(expenseId: string, payload: any): Promise<any> {
  const r = await api.put(`/split/expenses/${expenseId}`, payload);
  await invalidateAfter('split.expense');
  return r.data;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await api.delete(`/split/expenses/${expenseId}`);
  await invalidateAfter('split.expense');
}

// ── Rewards, UPI intents, offline payments ──────────────────────────────
export async function fetchSettlementLeaderboard(): Promise<any> {
  const r = await api.get('/split/settlement-leaderboard');
  return r.data;
}

export async function fetchPayIntent(targetUserId: string, amount: number): Promise<any> {
  const r = await api.get(`/split/pay-intent/${targetUserId}`, { params: { amount } });
  return r.data;
}

export async function settleWithRewards(payload: any): Promise<any> {
  const r = await api.post('/split/settle-with-rewards', payload);
  // settle-with-rewards touches BOTH debt state AND coin balance.
  await invalidateAll(['split.settle', 'coin.reward']);
  return r.data;
}

export async function markPaidOffline(payload: {
  target_user_id: string; amount: number; group_id?: string; method: string;
}): Promise<any> {
  const r = await api.post('/split/mark-paid-offline', payload);
  await invalidateAfter('split.settle');
  return r.data;
}
