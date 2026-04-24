/**
 * Goals service — savings-goal CRUD with auto-invalidation.
 */
import api from '../utils/api';
import { invalidateAfter } from '../utils/cacheGraph';

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date?: string | null;
  color: string;
  emoji: string;
  linked_budget_id?: string | null;
};

export async function fetchGoals(): Promise<{ goals: Goal[] }> {
  const r = await api.get('/goals');
  return r.data;
}

export async function createGoal(payload: Partial<Goal>): Promise<{ ok: boolean; goal: Goal }> {
  const r = await api.post('/goals', payload);
  await invalidateAfter('goal');
  return r.data;
}

export async function updateGoal(id: string, payload: Partial<Goal>): Promise<{ ok: boolean; goal: Goal }> {
  const r = await api.patch(`/goals/${id}`, payload);
  await invalidateAfter('goal');
  return r.data;
}

export async function deleteGoal(id: string): Promise<{ ok: boolean }> {
  const r = await api.delete(`/goals/${id}`);
  await invalidateAfter('goal');
  return r.data;
}
