/**
 * services/budgets.ts — Budget domain API wrappers.
 */
import api from '../utils/api';
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
  return r.data as Budget;
}

export async function updateBudget(id: string, payload: Partial<Budget> & { description?: string }): Promise<Budget> {
  const r = await api.put(`/budgets/${id}`, payload);
  return r.data as Budget;
}

export async function deleteBudget(id: string): Promise<void> {
  await api.delete(`/budgets/${id}`);
}

export async function fetchBudgetSuggestions(): Promise<any> {
  const r = await api.get('/budgets/smart-suggest');
  return r.data;
}

export async function applyBudgetSuggestion(category: string): Promise<any> {
  const r = await api.post(`/budgets/ai-apply/${encodeURIComponent(category)}`);
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
