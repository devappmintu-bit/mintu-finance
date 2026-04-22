/**
 * InsightMinimal — single insight card with neutral background + "Fix this" CTA.
 * Replaces the previous horizontal scroll of multiple colored chips.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

type Stats = {
  monthlySpend: number;
  savingsRate: number;
  topCategory: { name: string; amount: number } | null;
  transactionCount: number;
  balance: number;
} | null;

interface Props {
  stats: Stats;
  score: number;
}

export default function InsightMinimal({ stats, score }: Props) {
  const s = useStyles();
  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  // Pick the single most actionable insight
  const insight = useMemo(() => {
    if (stats?.savingsRate !== undefined && stats.savingsRate < 15) {
      return {
        title: `Your savings rate is ${stats.savingsRate}%`,
        desc: 'Below India average of 18%. Small tweaks could close the gap.',
        cta: 'Fix this',
        route: '/(tabs)/ai',
      };
    }
    if (stats?.topCategory && stats.topCategory.amount > 5000) {
      return {
        title: `${stats.topCategory.name} is your biggest spend`,
        desc: `₹${stats.topCategory.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} this month — set a cap?`,
        cta: 'Set budget',
        route: '/(tabs)/budget',
      };
    }
    if (score < 60) {
      return {
        title: `Score ${score}/100 — steady climb ahead`,
        desc: 'Complete today’s tasks to unlock the next tier.',
        cta: 'See how',
        route: '/(tabs)/rewards',
      };
    }
    return {
      title: `You’re tracking well — keep it up`,
      desc: 'Review the week to spot small wins worth ₹200+.',
      cta: 'Review',
      route: '/yearly',
    };
  }, [stats, score]);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.iconBubble}>
          <Ionicons name="sparkles" size={14} color={'#F56E1E'} />
        </View>
        <Text style={s.label}>Insight</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>{insight.title}</Text>
      <Text style={s.desc} numberOfLines={2}>{insight.desc}</Text>
      <TouchableOpacity
        style={s.cta}
        onPress={() => { haptic(); try { router.push(insight.route as any); } catch {} }}
        activeOpacity={0.8}
      >
        <Text style={s.ctaTxt}>{insight.cta}</Text>
        <Ionicons name="arrow-forward" size={13} color={'#F56E1E'} />
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  iconBubble: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent.primary + '1F' },
  label: { fontSize: 10.5, fontWeight: '700', color: c.accent.primary, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  desc: { fontSize: 12.5, fontWeight: '500', color: c.text.secondary, marginTop: 4, lineHeight: 17 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.accent.primary + '14' },
  ctaTxt: { fontSize: 12.5, fontWeight: '700', color: c.accent.primary },
}));
