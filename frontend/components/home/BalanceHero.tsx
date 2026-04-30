/**
 * BalanceHero — MintU Home redesign primary card.
 *
 * Round 58b — Design parity pass with the Profile revamp.
 *   • Replaces full saffron flood with a glass-card surface that
 *     matches the new app design language (#FAFAF9 canvas + iOS
 *     crystal cards on Profile + Spending Insights).
 *   • Brand presence is preserved via a TWO-STOP accent strip at
 *     the top of the card (LinearGradient) and via the amount
 *     color on a positive-savings month.
 *   • Negative months render the amount in danger ink so the
 *     emotional cue isn't drowned by the brand color.
 *   • Tier + streak pills now use color-tinted glass like the
 *     identity card pill on Profile.
 *
 * Data: same one-glance "money story" as before — tier emoji,
 * streak, headline amount, contextual sub-line, breakdown CTA.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, GLASS, shadowStyle } from '../../utils/theme';

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
  const tierColor = snapshot?.tier?.current?.color || COLORS.accent.brand;
  const streak = Number(snapshot?.tier?.streak_days || user?.streak_days || 0);

  const onPress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { router.push('/(tabs)/transactions' as any); } catch {}
  };

  const amountColor = data.primary.positive ? COLORS.accent.brand : COLORS.state.danger;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={s.shell}>
      <View style={s.card}>
        {/* Brand accent strip — the only orange flood on the card. 4px tall,
            spans the top edge. Gradient anchors brand-light → brand for warmth. */}
        <LinearGradient
          colors={[COLORS.accent.brand, COLORS.accent.brandDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.accentStrip}
        />

        <View style={s.headerRow}>
          <View style={[s.tierPill, { backgroundColor: tierColor + '14', borderColor: tierColor + '33' }]}>
            <Text style={s.tierEmoji}>{tierEmoji}</Text>
            <Text style={[s.tierTxt, { color: tierColor }]}>{String(tierName).toUpperCase()}</Text>
          </View>
          {streak > 0 && (
            <View style={s.streakPill}>
              <Text style={s.streakEmoji}>🔥</Text>
              <Text style={s.streakTxt}>{streak}d streak</Text>
            </View>
          )}
        </View>

        <Text style={s.greet}>Hi {name}</Text>
        <Text style={s.label}>{data.primary.label}</Text>

        <View style={s.amountRow}>
          <Text style={[s.amount, { color: amountColor }]} numberOfLines={1}>
            {fmt(data.primary.amount)}
          </Text>
          {data.hasData && data.savingsRate !== 0 && (
            <View style={[
              s.rateChip,
              data.primary.positive ? s.ratePositive : s.rateNegative,
            ]}>
              <Ionicons
                name={data.primary.positive ? 'trending-up' : 'trending-down'}
                size={11}
                color={data.primary.positive ? COLORS.state.success : COLORS.state.danger}
              />
              <Text style={[
                s.rateTxt,
                { color: data.primary.positive ? COLORS.state.success : COLORS.state.danger },
              ]}>
                {Math.abs(data.savingsRate).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        <Text style={s.sub} numberOfLines={2}>{data.sub}</Text>

        <View style={s.ctaRow}>
          <Text style={s.ctaTxt}>Tap for full breakdown</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.accent.brand} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default memo(BalanceHero);

const useStyles = makeStyles((c) => ({
  shell: { marginTop: 6, marginBottom: 14 },
  card: {
    backgroundColor: GLASS.solidBg,
    borderRadius: 24, padding: 20, paddingTop: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    overflow: 'hidden',
    ...shadowStyle('#111827', 6, 24, 0.06, 4),
  },
  // Round 58b — single 4px brand strip at the top edge replaces the
  // full-flood gradient. Massive de-clutter while keeping brand DNA.
  accentStrip: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
  },
  tierEmoji: { fontSize: 11 },
  tierTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.accent.primary + '14',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: c.accent.primary + '33',
  },
  streakEmoji: { fontSize: 11 },
  streakTxt: { fontSize: 10, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.4 },
  greet: { fontSize: 13, fontWeight: '700', color: c.text.muted, letterSpacing: 0.2 },
  label: {
    fontSize: 11, fontWeight: '800', color: c.text.muted,
    letterSpacing: 1, marginTop: 8, textTransform: 'uppercase',
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  amount: { fontSize: 44, fontWeight: '900', letterSpacing: -1.5 },
  rateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    borderWidth: 1, marginBottom: 6,
  },
  ratePositive: { backgroundColor: c.state.successBg, borderColor: c.state.successBorder },
  rateNegative: { backgroundColor: c.state.dangerBg, borderColor: c.state.dangerBorder },
  rateTxt: { fontSize: 11, fontWeight: '900' },
  sub: { fontSize: 13, fontWeight: '500', color: c.text.secondary, marginTop: 10, lineHeight: 18 },
  ctaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, alignSelf: 'flex-start',
    backgroundColor: c.accent.primary + '12',
    borderWidth: 1, borderColor: c.accent.primary + '2A',
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
  },
  ctaTxt: { fontSize: 12, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.2 },
}));
