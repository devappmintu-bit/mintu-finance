/**
 * InsightsCard — AI-coded insight chips for the Profile identity hub.
 *
 * Purpose: Surface the 2–3 most important "what's happening with my
 * money" moments, with clickable routes into the detailed tab.
 *
 * Design: horizontal scrollable chips with dopamine-coded emojis, tight
 * typography. Tapping an insight navigates to the relevant screen.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Stats = {
  monthlySpend: number;
  savingsRate: number;
  topCategory: { name: string; amount: number } | null;
  transactionCount: number;
  balance: number;
} | null;

type Insight = {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  gradient: [string, string];
  accent: string;
  cta: string;
  onPress: () => void;
};

export default function InsightsCard({
  stats,
  score,
}: {
  stats: Stats;
  score: number;
}) {
  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];

    // 1) Savings rate insight
    if (stats) {
      if (stats.savingsRate >= 20) {
        list.push({
          key: 'saving-king',
          emoji: '👑',
          title: `You saved ${stats.savingsRate}% this month`,
          sub: 'Above India avg of 18% — keep crushing it',
          gradient: ['#059669', '#047857'],
          accent: '#A7F3D0',
          cta: 'View breakdown',
          onPress: () => router.push('/yearly' as any),
        });
      } else if (stats.savingsRate >= 10) {
        list.push({
          key: 'saving-rising',
          emoji: '📈',
          title: `Saving ${stats.savingsRate}% — close to average`,
          sub: 'Trim ₹500 more to hit top 30% savers',
          gradient: ['#3B82F6', '#1D4ED8'],
          accent: '#BFDBFE',
          cta: 'See where',
          onPress: () => router.push('/yearly' as any),
        });
      } else {
        list.push({
          key: 'saving-low',
          emoji: '⚠️',
          title: `Savings rate is only ${stats.savingsRate}%`,
          sub: 'Let’s find ₹1,000 to cut this week',
          gradient: ['#DC2626', '#991B1B'],
          accent: '#FECACA',
          cta: 'Ask AI coach',
          onPress: () => router.push('/(tabs)/ai' as any),
        });
      }
    }

    // 2) Top category insight
    if (stats?.topCategory) {
      list.push({
        key: 'top-cat',
        emoji: '🍔',
        title: `${stats.topCategory.name} is your #1 spend`,
        sub: `₹${stats.topCategory.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} this month`,
        gradient: ['#F59E0B', '#B45309'],
        accent: '#FDE68A',
        cta: 'Set a budget',
        onPress: () => router.push('/(tabs)/budget' as any),
      });
    }

    // 3) Money score insight
    if (score >= 80) {
      list.push({
        key: 'score-flex',
        emoji: '🏆',
        title: `Score ${score}/100 — Elite Saver`,
        sub: 'Share your flex card and earn coins',
        gradient: ['#7C3AED', '#4C1D95'],
        accent: '#DDD6FE',
        cta: 'Flex now',
        onPress: () => router.push('/(tabs)/rewards' as any),
      });
    } else if (score < 50) {
      list.push({
        key: 'score-boost',
        emoji: '🚀',
        title: `Score ${score}/100 — room to climb`,
        sub: 'Complete 3 missions to reach the next tier',
        gradient: ['#7C3AED', '#4C1D95'],
        accent: '#DDD6FE',
        cta: 'Level up',
        onPress: () => router.push('/(tabs)/rewards' as any),
      });
    } else {
      list.push({
        key: 'score-mid',
        emoji: '⚡',
        title: `Score ${score}/100 — steady climber`,
        sub: 'Maintain streak 7 more days for +10 points',
        gradient: ['#7C3AED', '#4C1D95'],
        accent: '#DDD6FE',
        cta: 'See missions',
        onPress: () => router.push('/(tabs)/rewards' as any),
      });
    }

    // 4) Transaction count insight (dense trackers)
    if (stats && stats.transactionCount >= 30) {
      list.push({
        key: 'power-user',
        emoji: '💪',
        title: `${stats.transactionCount} txns logged`,
        sub: 'Power user mode unlocked — +5 coins',
        gradient: ['#0F172A', '#1E293B'],
        accent: '#FDE68A',
        cta: 'View report',
        onPress: () => router.push('/yearly' as any),
      });
    }

    return list.slice(0, 4);
  }, [stats, score]);

  const haptic = () => { try { Haptics.selectionAsync(); } catch {} };

  if (insights.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={14} color="#F56E1E" />
          <Text style={s.title}>Insights for you</Text>
        </View>
        <TouchableOpacity hitSlop={10} onPress={() => router.push('/(tabs)/ai' as any)}>
          <Text style={s.viewAll}>Ask AI →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {insights.map((ins) => (
          <TouchableOpacity
            key={ins.key}
            activeOpacity={0.9}
            onPress={() => { haptic(); ins.onPress(); }}
          >
            <LinearGradient colors={ins.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
              <Text style={s.emoji}>{ins.emoji}</Text>
              <Text style={[s.cardTitle, { color: '#fff' }]} numberOfLines={2}>{ins.title}</Text>
              <Text style={[s.cardSub, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>{ins.sub}</Text>
              <View style={s.ctaRow}>
                <Text style={[s.ctaTxt, { color: ins.accent }]}>{ins.cta}</Text>
                <Ionicons name="arrow-forward" size={12} color={ins.accent} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: '#111827', letterSpacing: -0.2 },
  viewAll: { fontSize: 11.5, fontWeight: '900', color: '#F56E1E' },
  row: { gap: 10, paddingRight: 16, paddingVertical: 2 },
  card: { width: 220, padding: 14, borderRadius: 18, gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  emoji: { fontSize: 22, marginBottom: 2 },
  cardTitle: { fontSize: 14.5, fontWeight: '900', letterSpacing: -0.2, lineHeight: 18 },
  cardSub: { fontSize: 11.5, fontWeight: '700', lineHeight: 15 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ctaTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 0.1 },
});
