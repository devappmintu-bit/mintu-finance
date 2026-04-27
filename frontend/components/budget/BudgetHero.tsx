/**
 * BudgetHero — month progress saffron hero for Budget tab.
 * Shows total budgeted vs spent, health indicator, animated progress bar.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';

type Props = {
  budgets: any[];
  onPressAdd?: () => void;
  onPressShare?: () => void;
  sharing?: boolean;
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function BudgetHero({ budgets, onPressAdd, onPressShare, sharing }: Props) {
  const s = useStyles();

  const totals = useMemo(() => {
    const totalBudget = budgets.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
    const totalSpent = budgets.reduce((sum: number, b: any) => sum + Number(b.spent || 0), 0);
    const pct = totalBudget > 0 ? Math.min(999, (totalSpent / totalBudget) * 100) : 0;
    const over = budgets.filter((b: any) => Number(b.spent || 0) > Number(b.amount || 0)).length;
    const warning = budgets.filter((b: any) => {
      const a = Number(b.amount || 0); const sp = Number(b.spent || 0);
      return a > 0 && sp / a >= 0.8 && sp < a;
    }).length;
    const left = totalBudget - totalSpent;

    let healthEmoji = '💪';
    let healthLabel = 'On Track';
    if (pct >= 100) { healthEmoji = '🚨'; healthLabel = 'Over Budget'; }
    else if (pct >= 80) { healthEmoji = '⚠️'; healthLabel = 'Watching'; }
    else if (pct >= 60) { healthEmoji = '👀'; healthLabel = 'Careful'; }

    return { totalBudget, totalSpent, pct, over, warning, left, healthEmoji, healthLabel };
  }, [budgets]);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <LinearGradient colors={[COLORS.accent.brand, COLORS.accent.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.topRow}>
        <View style={s.healthPill}>
          <Text style={s.healthEmoji}>{totals.healthEmoji}</Text>
          <Text style={s.healthTxt}>{totals.healthLabel.toUpperCase()}</Text>
        </View>
        <View style={s.headActions}>
          <TouchableOpacity style={s.iconBtn} onPress={() => { haptic(); onPressShare?.(); }} activeOpacity={0.8} disabled={!!sharing} testID="budget-hero-share">
            {sharing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="share-social-outline" size={17} color="#FFFFFF" />}
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => { haptic(); onPressAdd?.(); }} activeOpacity={0.88} testID="budget-hero-add">
            <Ionicons name="add" size={20} color={COLORS.accent.brandDark} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.eyebrow}>{`${monthLabel.toUpperCase()} · ${budgets.length} BUDGET${budgets.length === 1 ? '' : 'S'}`}</Text>

      <View style={s.amountRow}>
        <Text style={s.amount} numberOfLines={1}>{fmt(totals.totalSpent)}</Text>
        <Text style={s.of}>of {fmt(totals.totalBudget)}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.barBg}>
        <View style={[
          s.barFill,
          { width: `${Math.min(100, totals.pct)}%` },
          totals.pct >= 100 && { backgroundColor: '#FCA5A5' },
          totals.pct >= 80 && totals.pct < 100 && { backgroundColor: '#FDE68A' },
        ]} />
      </View>

      <View style={s.metaRow}>
        <Text style={s.metaTxt}>
          {totals.pct.toFixed(0)}% used
        </Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.metaTxt}>
          {totals.left >= 0 ? `${fmt(totals.left)} left` : `${fmt(totals.left)} over`}
        </Text>
        {totals.over > 0 && (
          <>
            <Text style={s.metaDot}>·</Text>
            <Text style={[s.metaTxt, { color: '#FECACA' }]}>{totals.over} over</Text>
          </>
        )}
        {totals.warning > 0 && (
          <>
            <Text style={s.metaDot}>·</Text>
            <Text style={[s.metaTxt, { color: '#FEF3C7' }]}>{totals.warning} near cap</Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

export default memo(BudgetHero);

const useStyles = makeStyles((c) => ({
  card: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: c.accent.brandDark, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  blob1: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.08)' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  healthEmoji: { fontSize: 13 },
  healthTxt: { fontSize: 10, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.8 },
  headActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.82)', marginTop: 14 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 3 },
  amount: { fontSize: 36, fontWeight: '900', color: c.bg.elevated, letterSpacing: -1.2 },
  of: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.78)' },
  barBg: { marginTop: 12, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: c.bg.elevated },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 9 },
  metaTxt: { fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },
  metaDot: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
}));
