/**
 * MintU Premium Gating Helper
 *
 * Plan tiers:
 *   - free    → Basic tracking, 5 AI msgs/day, 7-day insights
 *   - intro   → ₹29 first month. Unlimited AI, 30-day insights, Waste detector
 *   - monthly → ₹99/mo. All intro + Tax + Investments + Yearly + Reports
 *   - yearly  → ₹499/yr. All monthly + Priority AI + Custom reports + Exclusive badges + Ad-free + Early access
 *
 * Selection is persisted in AsyncStorage. No real payment — yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plan = 'free' | 'intro' | 'monthly' | 'yearly';

export const PLAN_META: Record<Plan, {
  id: Plan;
  label: string;
  price: string;
  priceSub: string;
  tagline?: string;
  features: string[];
  color: string;
  emoji: string;
}> = {
  free: {
    id: 'free',
    label: 'Free',
    price: '₹0',
    priceSub: 'forever',
    features: ['Expense tracking', 'SMS parsing', 'Budgets', 'Split expenses', '5 AI messages / day', '7-day insights only'],
    color: '#9E8E84',
    emoji: '🌱',
  },
  intro: {
    id: 'intro',
    label: 'Intro',
    price: '₹29',
    priceSub: 'first month',
    tagline: 'Taste of Premium',
    features: ['Unlimited AI Coach', '30-day insights', 'Waste detector'],
    color: '#FFB300',
    emoji: '⚡',
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    price: '₹99',
    priceSub: 'per month',
    features: ['Everything in Intro', 'Tax calculator', 'Investment suggester', 'Yearly dashboard', 'Analytics & reports'],
    color: '#E65100',
    emoji: '📊',
  },
  yearly: {
    id: 'yearly',
    label: 'Yearly',
    price: '₹499',
    priceSub: 'per year (58% off)',
    tagline: 'Best Value',
    features: ['Everything in Monthly', 'Priority AI responses', 'Custom reports', 'Exclusive badges', 'Ad-free', 'Early access', 'Smart alerts'],
    color: '#880E4F',
    emoji: '👑',
  },
};

// Bit-level feature flags. Order = ascending access.
export const FEATURES = {
  UNLIMITED_AI: 'unlimited_ai',
  INSIGHTS_30D: 'insights_30d',
  WASTE_DETECTOR: 'waste_detector',
  TAX_CALCULATOR: 'tax_calculator',
  INVESTMENT_SUGGESTER: 'investment_suggester',
  YEARLY_DASHBOARD: 'yearly_dashboard',
  REPORTS: 'reports',
  PRIORITY_AI: 'priority_ai',
  CUSTOM_REPORTS: 'custom_reports',
  EXCLUSIVE_BADGES: 'exclusive_badges',
  AD_FREE: 'ad_free',
  EARLY_ACCESS: 'early_access',
  SMART_ALERTS: 'smart_alerts',
} as const;
export type Feature = typeof FEATURES[keyof typeof FEATURES];

const PLAN_ACCESS: Record<Plan, Feature[]> = {
  free: [],
  intro: [FEATURES.UNLIMITED_AI, FEATURES.INSIGHTS_30D, FEATURES.WASTE_DETECTOR],
  monthly: [
    FEATURES.UNLIMITED_AI, FEATURES.INSIGHTS_30D, FEATURES.WASTE_DETECTOR,
    FEATURES.TAX_CALCULATOR, FEATURES.INVESTMENT_SUGGESTER, FEATURES.YEARLY_DASHBOARD, FEATURES.REPORTS,
  ],
  yearly: [
    FEATURES.UNLIMITED_AI, FEATURES.INSIGHTS_30D, FEATURES.WASTE_DETECTOR,
    FEATURES.TAX_CALCULATOR, FEATURES.INVESTMENT_SUGGESTER, FEATURES.YEARLY_DASHBOARD, FEATURES.REPORTS,
    FEATURES.PRIORITY_AI, FEATURES.CUSTOM_REPORTS, FEATURES.EXCLUSIVE_BADGES,
    FEATURES.AD_FREE, FEATURES.EARLY_ACCESS, FEATURES.SMART_ALERTS,
  ],
};

const STORAGE_KEY = '@mintu/premium/plan';
const STORAGE_STARTED = '@mintu/premium/started_at';

// ─────── runtime cache so gating checks don't hit storage on every render ───────
let _cachedPlan: Plan | null = null;
const _listeners = new Set<(p: Plan) => void>();

export async function getActivePlan(): Promise<Plan> {
  if (_cachedPlan) return _cachedPlan;
  try {
    const v = (await AsyncStorage.getItem(STORAGE_KEY)) as Plan | null;
    _cachedPlan = (v && ['free', 'intro', 'monthly', 'yearly'].includes(v) ? v : 'free') as Plan;
    return _cachedPlan;
  } catch {
    _cachedPlan = 'free';
    return 'free';
  }
}

export function getActivePlanSync(): Plan {
  return _cachedPlan || 'free';
}

export async function setActivePlan(plan: Plan): Promise<void> {
  _cachedPlan = plan;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, plan);
    if (plan !== 'free') {
      await AsyncStorage.setItem(STORAGE_STARTED, new Date().toISOString());
    }
  } catch {}
  _listeners.forEach((fn) => fn(plan));
}

export async function clearPlan(): Promise<void> {
  await setActivePlan('free');
}

/** Subscribe to plan changes. Returns unsubscribe. */
export function subscribePlan(fn: (p: Plan) => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Sync check — requires getActivePlan() to have been called once (e.g. at app start). */
export function canAccess(feature: Feature, plan?: Plan): boolean {
  const active = plan || _cachedPlan || 'free';
  return PLAN_ACCESS[active].includes(feature);
}

/** Pretty human label for "why is this locked" toasts. */
export function requiredPlanFor(feature: Feature): Plan {
  if (PLAN_ACCESS.intro.includes(feature)) return 'intro';
  if (PLAN_ACCESS.monthly.includes(feature)) return 'monthly';
  return 'yearly';
}

/** React hook — re-renders when the plan changes. */
import { useEffect, useState } from 'react';
export function useActivePlan(): [Plan, (p: Plan) => Promise<void>] {
  const [plan, setPlan] = useState<Plan>(_cachedPlan || 'free');
  useEffect(() => {
    getActivePlan().then(setPlan);
    const unsub = subscribePlan(setPlan);
    return unsub;
  }, []);
  return [plan, setActivePlan];
}
