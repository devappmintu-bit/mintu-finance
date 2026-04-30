// Round 37 — unified search client. Debounced query via custom hook.
import api from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SearchTxn { id: string; amount: number; merchant: string; description: string; category: string; type: string; date: string; }
export interface SearchBudget { id: string; category: string; amount: number; period: string; description?: string; }
export interface SearchGoal { id: string; name: string; emoji: string; target_amount: number; saved_amount: number; pct: number; }
export interface SearchGroup { id: string; name: string; emoji: string; member_count: number; }
export interface SearchResults {
  transactions: SearchTxn[];
  budgets: SearchBudget[];
  goals: SearchGoal[];
  groups: SearchGroup[];
  total: number;
}

export async function runSearch(q: string): Promise<SearchResults> {
  if (!q || !q.trim()) return { transactions: [], budgets: [], goals: [], groups: [], total: 0 };
  const r = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
  return r.data;
}

// Recent searches — AsyncStorage, capped at 5, most-recent-first.
const RECENT_KEY = 'search_recent_v1';
const RECENT_MAX = 5;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function pushRecentSearch(q: string): Promise<void> {
  const term = (q || '').trim();
  if (!term || term.length < 2) return;
  try {
    const curr = await getRecentSearches();
    const next = [term, ...curr.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, RECENT_MAX);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (e) { if (__DEV__) console.warn('[search] silent-catch', e); }
}

export async function clearRecentSearches(): Promise<void> {
  try { await AsyncStorage.removeItem(RECENT_KEY); } catch (e) { if (__DEV__) console.warn('[search] silent-catch', e); }
}
