/**
 * HeroCard — MintU 2.0 dynamic AI-driven hero at the top of Home.
 *
 * Replaces clutter with ONE personalised insight + ONE clear CTA per the
 * "INSIGHT → ACTION → REWARD" UX philosophy.
 *
 * Picks 1 of 6 states based on live snapshot data (no extra API call):
 *   1. 🌱 First-run   — no transactions yet
 *   2. 🔥 Big saver   — savings_rate > 25%
 *   3. ⚠️ Overbudget  — top category over its budget
 *   4. 📈 Spike       — top category spend > 40% of total
 *   5. 💪 On track    — positive savings, within budget
 *   6. 🧘 Neutral     — fallback for missing signals
 *
 * Only ONE card. Theme-adaptive gradient. Primary CTA always routes to a
 * meaningful screen (not a dead end).
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { makeStyles } from '../../utils/makeStyles';
import {  COLORS, useAppColors } from '../../utils/theme';

type Props = {
  snapshot: any | null;
  stats: any | null;
  user: any | null;
  txnCount: number;
};

type HeroVariant = 'first_run' | 'big_saver' | 'overbudget' | 'spike' | 'on_track' | 'neutral';
type HeroState = {
  variant: HeroVariant;
  emoji: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaRoute: string;
  gradient: [string, string];
  ctaIcon: keyof typeof Ionicons.glyphMap;
};

function computeHeroState({ snapshot, stats, user, txnCount }: Props): HeroState {
  const name = (user?.name || '').split(' ')[0] || 'there';
  const savingsRate = Number(snapshot?.savings_rate || 0);
  const topCat = snapshot?.top_category || {};
  const topCatName: string = topCat.name || '';
  const topCatAmt: number = Number(topCat.amount || 0);
  const topCatBudget: number = Number(topCat.budget || 0);
  const totalSpend: number = Number(snapshot?.total_spend_month || stats?.total_expense || 0);
  const monthlyIncome: number = Number(snapshot?.monthly_income || stats?.total_income || 0);
  const streak: number = Number(snapshot?.tier?.streak_days || user?.streak_days || 0);

  // 1. First-run — no transactions yet
  if (txnCount === 0 && totalSpend === 0) {
    return {
      variant: 'first_run',
      emoji: '🌱',
      title: `Hi ${name}! Let's start tracking`,
      subtitle: 'Add your first expense and MintU will find patterns & money leaks.',
      ctaLabel: 'Add first expense',
      ctaRoute: '/(tabs)/transactions',
      ctaIcon: 'add-circle',
      gradient: ['#10B981', '#059669'],
    };
  }

  // 2. Overbudget in top category
  if (topCatBudget > 0 && topCatAmt > topCatBudget) {
    const overBy = Math.round(topCatAmt - topCatBudget);
    return {
      variant: 'overbudget',
      emoji: '⚠️',
      title: `${topCatName} is ₹${overBy.toLocaleString('en-IN')} over budget`,
      subtitle: `You've used ${Math.round((topCatAmt / topCatBudget) * 100)}% of your ${topCatName} cap this month.`,
      ctaLabel: 'Fix it now',
      ctaRoute: '/(tabs)/budget',
      ctaIcon: 'construct',
      gradient: ['#EF4444', '#B91C1C'],
    };
  }

  // 3. Spending spike — top category >= 40% of total spend
  if (totalSpend > 0 && topCatAmt > 0 && topCatAmt / totalSpend >= 0.4) {
    const pct = Math.round((topCatAmt / totalSpend) * 100);
    return {
      variant: 'spike',
      emoji: '📈',
      title: `${topCatName} is ${pct}% of your spending`,
      subtitle: `₹${topCatAmt.toLocaleString('en-IN')} this month — could be where your money is leaking.`,
      ctaLabel: 'See breakdown',
      ctaRoute: '/(tabs)/budget',
      ctaIcon: 'pie-chart',
      gradient: ['#F59E0B', '#D97706'],
    };
  }

  // 4. Big saver — savings_rate > 25%
  if (monthlyIncome > 0 && savingsRate > 25) {
    return {
      variant: 'big_saver',
      emoji: '🔥',
      title: `You're saving ${savingsRate.toFixed(0)}% this month!`,
      subtitle: streak > 0
        ? `${streak}-day streak going strong — top 22% of MintU users 🚀`
        : 'Way above the 15% average — keep going.',
      ctaLabel: 'Share this win',
      ctaRoute: '/profile',
      ctaIcon: 'share-social',
      gradient: ['#10B981', '#047857'],
    };
  }

  // 5. On track — positive savings, no red flags
  if (savingsRate > 0 && monthlyIncome > 0) {
    const saved = Math.round(monthlyIncome - totalSpend);
    return {
      variant: 'on_track',
      emoji: '💪',
      title: `On track — ₹${saved.toLocaleString('en-IN')} saved so far`,
      subtitle: 'Balanced spending this month. Let AI Coach optimise further.',
      ctaLabel: 'Ask AI Coach',
      ctaRoute: '/(tabs)/ai-coach',
      ctaIcon: 'sparkles',
      gradient: ['#F56E1E', '#C14A06'],
    };
  }

  // 6. Neutral fallback
  return {
    variant: 'neutral',
    emoji: '🧘',
    title: `Hi ${name}, how's your money today?`,
    subtitle: 'Tap AI Coach for personalised guidance, or log today\'s expenses.',
    ctaLabel: 'Open AI Coach',
    ctaRoute: '/(tabs)/ai-coach',
    ctaIcon: 'sparkles',
    gradient: ['#F56E1E', '#C14A06'],
  };
}


function HeroCard(props: Props) {
  const s = useStyles();
  const c = useAppColors();
  const state = useMemo(() => computeHeroState(props), [props]);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    router.push(state.ctaRoute as any);
  };

  return (
    <LinearGradient colors={state.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.wrap}>
      <View style={s.topRow}>
        <Text style={s.emoji}>{state.emoji}</Text>
        <View style={s.dailyBadge}>
          <Ionicons name="calendar" size={10} color="#FFFFFF" />
          <Text style={s.dailyBadgeTxt}>TODAY</Text>
        </View>
      </View>

      <Text style={s.title} numberOfLines={2}>{state.title}</Text>
      <Text style={s.subtitle} numberOfLines={3}>{state.subtitle}</Text>

      <TouchableOpacity style={s.ctaBtn} onPress={handlePress} activeOpacity={0.82}>
        <Ionicons name={state.ctaIcon} size={16} color={state.gradient[1]} />
        <Text style={[s.ctaTxt, { color: state.gradient[1] }]}>{state.ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color={state.gradient[1]} />
      </TouchableOpacity>
    </LinearGradient>
  );
}

export default React.memo(HeroCard);

const useStyles = makeStyles((c) => ({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 20,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  emoji: { fontSize: 32 },
  dailyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  dailyBadgeTxt: { color: c.bg.elevated, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: {
    color: c.bg.elevated,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 6,
    lineHeight: 25,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 16,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.bg.elevated,
    paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: 14,
    alignSelf: 'flex-start',
  },
  ctaTxt: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
}));
