/**
 * BalanceHero — MintU 2.0 home redesign primary card.
 *
 * Shows the user's headline money story in ONE glance:
 *   • Tier pill + streak chip header
 *   • Big "Saved" or "Spent" amount (based on sign)
 *   • Contextual sub-line (daily avg, projected, or "let's start")
 *   • Tap → jumps to Transactions
 *
 * Uses saffron brand gradient with decorative blobs.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

type Props = { user: any | null; snapshot: any | null; stats: any | null };

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function BalanceHero({ user, snapshot, stats }: Props) {
  const s = useStyles();

  const data = useMemo(() => {
    const income = Number(snapshot?.mtd_income ?? snapshot?.monthly_income ?? stats?.total_income ?? 0);
    const spend  = Number(snapshot?.mtd_spend  ?? snapshot?.total_spend_month ?? stats?.total_expense ?? 0);
    const saved  = income - spend;
    const savingsRate = Number(snapshot?.savings_rate ?? 0);
    const dailyAvg = Number(snapshot?.daily_avg ?? 0);
    const projected = Number(snapshot?.projected_month_end ?? 0);
    const hasData = spend > 0 || income > 0;

    let primary: { label: string; amount: number; positive: boolean };
    if (income > 0) {
      primary = { label: saved >= 0 ? 'Saved this month' : 'Over budget by', amount: saved, positive: saved >= 0 };
    } else if (spend > 0) {
      primary = { label: 'Spent this month', amount: spend, positive: false };
    } else {
      primary = { label: 'Start tracking', amount: 0, positive: true };
    }

    let sub = '';
    if (!hasData) sub = 'Add your first expense to see your spending pulse';
    else if (projected > 0 && dailyAvg > 0) sub = `₹${Math.round(dailyAvg).toLocaleString('en-IN')}/day · Projected ${fmt(projected)} by month end`;
    else if (dailyAvg > 0) sub = `₹${Math.round(dailyAvg).toLocaleString('en-IN')}/day spend pace`;
    else if (spend > 0) sub = `${fmt(spend)} spent · ${fmt(income)} earned`;
    else sub = 'Tap to log your first expense';

    return { primary, sub, savingsRate, hasData };
  }, [user, snapshot, stats]);

  const name = (user?.name || '').split(' ')[0] || 'there';
  const tierEmoji = snapshot?.tier?.current?.emoji || '🌱';
  const tierName = snapshot?.tier?.current?.name || 'Starter';
  const streak = Number(snapshot?.tier?.streak_days || user?.streak_days || 0);

  const onPress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { router.push('/(tabs)/transactions' as any); } catch {}
  };

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={s.shell}>
      <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        <View style={s.blob1} />
        <View style={s.blob2} />

        <View style={s.headerRow}>
          <View style={s.tierPill}>
            <Text style={s.tierEmoji}>{tierEmoji}</Text>
            <Text style={s.tierTxt}>{String(tierName).toUpperCase()}</Text>
          </View>
          {streak > 0 && (
            <View style={s.streakPill}>
              <Text style={s.streakEmoji}>🔥</Text>
              <Text style={s.streakTxt}>{streak}d</Text>
            </View>
          )}
        </View>

        <Text style={s.greet}>Hi {name}</Text>

        <Text style={s.label}>{data.primary.label}</Text>
        <View style={s.amountRow}>
          <Text style={s.amount} numberOfLines={1}>{fmt(data.primary.amount)}</Text>
          {data.hasData && data.savingsRate !== 0 && (
            <View style={[s.rateChip, { backgroundColor: data.primary.positive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }]}>
              <Ionicons name={data.primary.positive ? 'trending-up' : 'trending-down'} size={11} color={'#FFFFFF'} />
              <Text style={s.rateTxt}>{Math.abs(data.savingsRate).toFixed(0)}%</Text>
            </View>
          )}
        </View>

        <Text style={s.sub} numberOfLines={2}>{data.sub}</Text>

        <View style={s.ctaRow}>
          <Ionicons name="arrow-forward-circle" size={16} color="#FFFFFF" />
          <Text style={s.ctaTxt}>Tap for full breakdown</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default memo(BalanceHero);

const useStyles = makeStyles((c) => ({
  shell: { marginTop: 6, marginBottom: 14 },
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: c.accent.brandDark, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -50, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.08)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierEmoji: { fontSize: 12 },
  tierTxt: { fontSize: 10, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.8 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  streakEmoji: { fontSize: 12 },
  streakTxt: { fontSize: 11, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.4 },
  greet: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.2 },
  label: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1, marginTop: 10, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  amount: { fontSize: 44, fontWeight: '900', color: c.bg.elevated, letterSpacing: -1.5 },
  rateChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  rateTxt: { fontSize: 11, fontWeight: '900', color: c.bg.elevated },
  sub: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.88)', marginTop: 8, lineHeight: 17 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.18)', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  ctaTxt: { fontSize: 11.5, fontWeight: '800', color: c.bg.elevated, letterSpacing: 0.2 },
}));
