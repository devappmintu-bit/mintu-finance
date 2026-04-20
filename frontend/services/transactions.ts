/**
 * services/transactions.ts — Transaction domain API wrappers.
 */
import api from '../utils/api';
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
  return r.data as Transaction;
}

export async function updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
  const r = await api.put(`/transactions/${id}`, payload);
  return r.data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`);
}

export async function parseSmsTransaction(text: string): Promise<Transaction | null> {
  const r = await api.post('/sms/parse', { text });
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
