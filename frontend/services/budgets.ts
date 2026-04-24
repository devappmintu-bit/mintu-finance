/**
 * services/budgets.ts — Budget domain API wrappers.
 *
 * Writes route through `invalidateAfter('budget')` so dependent caches
 * (home/bundle, analytics/summary, alerts/smart, etc.) refetch
 * immediately. See /app/docs/DATA_GRAPH.md §4.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';
import type { Budget, BudgetAchievements } from './types';

export async function fetchBudgets(): Promise<Budget[]> {
  const r = await api.get('/budgets');
  return (r.data || []) as Budget[];
}

export async function fetchLiveBudgets(): Promise<Budget[]> {
  const r = await api.get('/budgets/live');
  return (r.data || []) as Budget[];
}

export async function createBudget(
  payload: Pick<Budget, 'category' | 'amount' | 'period'> & { recurring?: boolean; description?: string },
): Promise<Budget> {
  const r = await api.post('/budgets', payload);
  await invalidateAfter('budget');
  return r.data as Budget;
}

export async function updateBudget(id: string, payload: Partial<Budget> & { description?: string }): Promise<Budget> {
  const r = await api.put(`/budgets/${id}`, payload);
  await invalidateAfter('budget');
  return r.data as Budget;
}

export async function deleteBudget(id: string): Promise<void> {
  await api.delete(`/budgets/${id}`);
  await invalidateAfter('budget');
}

export async function fetchBudgetSuggestions(): Promise<any> {
  const r = await api.get('/budgets/smart-suggest');
  return r.data;
}

export async function applyBudgetSuggestion(category: string): Promise<any> {
  const r = await api.post(`/budgets/ai-apply/${encodeURIComponent(category)}`);
  await invalidateAfter('budget');
  return r.data;
}

export async function fetchBudgetAchievements(): Promise<BudgetAchievements> {
  const r = await api.get('/budgets/achievements');
  return r.data as BudgetAchievements;
}

export async function fetchBudgetInsights(): Promise<any> {
  const r = await api.get('/budgets/insights');
  return r.data;
}
