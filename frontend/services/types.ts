/**
 * services/types.ts — Shared domain types for the API service layer.
 * Kept deliberately minimal — expand as screens migrate off `any`.
 */

export type Budget = {
  id: string;
  category: string;
  amount: number;
  period: 'daily' | 'weekly' | 'monthly';
  recurring?: boolean;
  spent?: number;
  status?: 'ok' | 'warning' | 'over';
};

export type Transaction = {
  id: string;
  amount: number;
  category: string;
  description?: string;
  type: 'debit' | 'credit' | 'expense' | 'income';
  date: string;
  source?: 'manual' | 'sms' | 'gmail' | 'voice';
};

export type SplitGroup = {
  id: string;
  name: string;
  custom_emoji?: string;
  members: Array<{ user_id: string; name: string; phone?: string }>;
  created_at?: string;
};

export type SplitBalance = {
  user_id: string;
  name: string;
  amount: number;   // + means they owe you, − means you owe them
  group_id?: string;
};

export type Achievement = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  unlocked: boolean;
  progress_pct: number;
  progress_label: string;
};

export type BudgetAchievements = {
  streak: { current_days: number; longest_days: number; target: number; pct: number };
  stats: {
    days_under_budget_mtd: number;
    days_in_month_so_far: number;
    under_rate_pct: number;
    categories_under: number;
    categories_over: number;
    total_categories: number;
    saved_amount: number;
    saved_pct: number;
  };
  badges: Achievement[];
  next_badge: Achievement | null;
  headline: string;
};

export type User = {
  id?: string;
  _id?: string;
  name?: string;
  phone?: string;
  email?: string;
  is_premium?: boolean;
  reward_coins?: number;
  avatar?: string;
};

export type PremiumStatus = {
  is_premium: boolean;
  plan?: 'monthly' | 'yearly' | 'family';
  expires_at?: string;
  days_remaining?: number;
  reward_coins: number;
};

export type RazorpayOrder = {
  order_id: string;
  amount_paise: number;
  effective_amount: number;
  list_amount: number;
  coin_discount: number;
  coins_to_use: number;
  key_id: string;
  currency: 'INR';
  checkout_url: string;
};

export type SmartAlert = {
  type: string;
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  route?: string;
  action?: string;
  data?: Record<string, unknown>;
};

export type NewsItem = {
  title: string;
  url?: string;
  summary?: string;
  source?: string;
  published_at?: string;
  image_url?: string;
};

export type GroupSummary = {
  id: string;
  total_expenses: number;
  simplified_debts: Array<{ from: string; to: string; amount: number; from_name?: string; to_name?: string }>;
  member_balances: Record<string, number>;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
};
