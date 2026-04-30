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
export async function fetchSplitGroups(): Promise<SplitGroup[]> {  const r = await api.get('/split/groups');
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
/**
 * Create a split expense.
 *
 * Phase 2 (offline queue): when the caller passes `opts.client_expense_id`
 * we forward it as the backend `Idempotency-Key` header. Replays of the
 * same uuid return the original record verbatim, so retrying after a
 * timeout / reconnect can never insert a duplicate.
 */
export async function createExpense(
  payload: any,
  opts?: { client_expense_id?: string },
): Promise<any> {
  const headers: Record<string, string> = {};
  if (opts?.client_expense_id) {
    headers['Idempotency-Key'] = opts.client_expense_id;
  }
  const r = await api.post('/split/expenses', payload, { headers });
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

// ── Round 53k — Smart Settlements (auto-optimize who pays whom) ───────
export type SmartSettleTransfer = {
  from: string;
  from_name: string;
  to: string;
  to_name: string;
  amount: number;
  amount_paise: number;
  is_mine: boolean;
};

export type SmartSettlePlan = {
  group_id: string;
  group_name: string;
  transfers: SmartSettleTransfer[];
  my_transfers: SmartSettleTransfer[];
  my_total_outgoing: number;
  my_total_outgoing_paise: number;
  summary: { transfers: number; total_paise: number; debtors: number; creditors: number };
  members: Record<string, string>;
  drift_paise: number;
};

export type SmartSettleResult = {
  message: string;
  batch_ref: string;
  settled_count: number;
  total_amount: number;
  total_paise: number;
  settlement_ids: string[];
  transfers: { to: string; to_name: string; amount: number; amount_paise: number }[];
};

/** Read-only optimized settlement plan for a group. */
export async function fetchSettlePlan(groupId: string): Promise<SmartSettlePlan> {
  const r = await api.get(`/split/groups/${groupId}/settle-plan`);
  return r.data as SmartSettlePlan;
}

/**
 * Atomic batch-execute the caller's outgoing legs of the optimized plan.
 *
 * @param groupId Group whose books we're settling
 * @param expectedTotalPaise Server-side drift guard. Pass the value from
 *   the preview; if the recomputed plan disagrees the API returns 409
 *   so the UI can refresh + re-confirm.
 * @param idempotencyKey Caller-supplied UUID. Reuse on retries to get
 *   the original response replayed verbatim (exactly-once semantics).
 * @param method Payment method label persisted on each settlement doc.
 */
export async function settleMyPart(
  groupId: string,
  expectedTotalPaise: number,
  idempotencyKey: string,
  method: string = 'upi',
): Promise<SmartSettleResult> {
  const r = await api.post(
    `/split/groups/${groupId}/settle-my-part`,
    { method, expected_total_paise: expectedTotalPaise },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  await invalidateAfter('split.settle');
  return r.data as SmartSettleResult;
}

// ── Round 51j — Drafts (Solo / unattached expenses) ──────────────────
// Lightweight helpers wrapping the 4 new backend endpoints. Drafts
// don't belong to any group so we don't trigger split-cache
// invalidation here — only the attach-to-group call does (server-side).
export type DraftExpense = {
  id: string;
  description: string;
  amount: number;
  paid_by?: string;
  split_type?: string;
  splits_hint?: Record<string, number>;
  created_at?: string;
};

export async function createDraftExpense(payload: {
  description: string;
  amount: number;
  paid_by?: string;
  split_type?: string;
  splits?: Record<string, number>;
}): Promise<DraftExpense> {
  const r = await api.post('/split/expenses/draft', payload);
  return r.data;
}

export async function fetchDraftExpenses(): Promise<{ drafts: DraftExpense[]; count: number }> {
  const r = await api.get('/split/expenses/drafts');
  return r.data;
}

export async function deleteDraftExpense(draftId: string): Promise<void> {
  await api.delete(`/split/expenses/drafts/${draftId}`);
}

export async function attachDraftToGroup(draftId: string, groupId: string): Promise<any> {
  const r = await api.post(`/split/expenses/${draftId}/attach-to-group`, { group_id: groupId });
  await invalidateAfter('split.expense');
  return r.data;
}
