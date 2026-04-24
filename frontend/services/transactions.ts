/**
 * services/transactions.ts — Transaction domain API wrappers.
 *
 * Every write routes through `invalidateAfter('txn')` so dependent caches
 * (analytics/summary, stats/overview, home/bundle, budgets, etc.) refetch
 * immediately. See /app/docs/DATA_GRAPH.md §4 for the full invalidation
 * matrix.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';
import type { Transaction } from './types';

/** Cross-platform UUIDv4 generator.
 *
 * • Uses native `crypto.randomUUID()` where available (web + RN 0.74+).
 * • Falls back to a math.random-based RFC4122 v4 shim elsewhere.
 *
 * Used to give every "Add Transaction" POST a unique `idempotency_key`
 * so spam-clicks (user taps Save 20×) collapse into a single server-side
 * insert via the partial-unique index on (user_id, idempotency_key).
 */
function generateUUID(): string {
  try {
    const g: any = globalThis as any;
    if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  } catch { /* fall through */ }
  // RFC4122 v4 shim
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function fetchTransactions(params?: {
  source?: string; type?: string; status?: string; month?: string; limit?: number;
}): Promise<Transaction[]> {
  const r = await api.get('/transactions', { params });
  return (r.data || []) as Transaction[];
}

export async function addTransaction(payload: {
  amount: number; category: string; description?: string;
  type: 'debit' | 'credit'; date?: string;
  /** Optional explicit key. If omitted, a UUID is generated so each
   *  distinct user-action is de-duped against spam-clicks server-side. */
  idempotency_key?: string;
}): Promise<Transaction> {
  const body = {
    ...payload,
    idempotency_key: payload.idempotency_key || generateUUID(),
  };
  const r = await api.post('/transactions', body);
  await invalidateAfter('txn');
  return r.data as Transaction;
}

export async function updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
  const r = await api.put(`/transactions/${id}`, payload);
  await invalidateAfter('txn');
  return r.data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`);
  await invalidateAfter('txn');
}

export async function parseSmsTransaction(text: string): Promise<Transaction | null> {
  // Backend route lives under /api/transactions/parse-sms and expects
  // the raw text under the `sms_text` key. Earlier the frontend was
  // calling /api/sms/parse which never existed (Round 30 fix).
  const r = await api.post('/transactions/parse-sms', { sms_text: text });
  // Parse-SMS may or may not persist a txn — invalidate defensively.
  await invalidateAfter('txn');
  return r.data as Transaction;
}

export async function fetchStatsOverview(): Promise<any> {
  const r = await api.get('/stats/overview');
  return r.data;
}

export async function fetchAnalyticsSummary(): Promise<any> {
  const r = await api.get('/analytics/summary');
  return r.data;
}
