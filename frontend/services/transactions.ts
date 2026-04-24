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

export async function fetchTransactions(params?: {
  source?: string; type?: string; status?: string; month?: string; limit?: number;
}): Promise<Transaction[]> {
  const r = await api.get('/transactions', { params });
  return (r.data || []) as Transaction[];
}

export async function addTransaction(payload: {
  amount: number; category: string; description?: string;
  type: 'debit' | 'credit'; date?: string;
}): Promise<Transaction> {
  const r = await api.post('/transactions', payload);
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
