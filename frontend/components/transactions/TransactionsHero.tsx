/**
 * TransactionsHero — month-at-a-glance saffron hero for Transactions tab.
 * Shows total spent this month, income, and net — with big focal amount.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  transactions: any[];
  onPressAdd?: () => void;
  onPressFilter?: () => void;
  activeFilterCount?: number;
  filteredCount?: number;
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function TransactionsHero({ transactions, onPressAdd, onPressFilter, activeFilterCount = 0, filteredCount = 0 }: Props) {
  const s = useStyles();

  const totals = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    let expense = 0, income = 0, todaySpend = 0;
    const todayKey = now.toDateString();
    for (const t of transactions || []) {
      const d = new Date(t.date);
      if (d.getMonth() === m && d.getFullYear() === y) {
        const amt = Number(t.amount || 0);
        if (t.type === 'credit') income += amt;
        else expense += amt;
      }
      if (d.toDateString() === todayKey && t.type !== 'credit') {
        todaySpend += Number(t.amount || 0);
      }
    }
    return { expense, income, net: income - expense, todaySpend, count: transactions.length };
  }, [transactions]);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.headRow}>
        <View>
          <Text style={s.eyebrow}>SPENT · {monthLabel.toUpperCase()}</Text>
          <Text style={s.amount} numberOfLines={1}>{fmt(totals.expense)}</Text>
        </View>
        <View style={s.headActions}>
          <TouchableOpacity style={s.iconBtn} onPress={() => { haptic(); onPressFilter?.(); }} activeOpacity={0.8} testID="tx-hero-filter">
            <Ionicons name="options-outline" size={18} color="#fff" />
            {activeFilterCount > 0 && (
              <View style={s.filterBadge}><Text style={s.filterBadgeTxt}>{activeFilterCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => { haptic(); onPressAdd?.(); }} activeOpacity={0.88} testID="tx-hero-add">
            <Ionicons name="add" size={20} color="#C14A06" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.statsRow}>
        <View style={s.statBlock}>
          <Text style={s.statLabel}>TODAY</Text>
          <Text style={s.statVal}>{fmt(totals.todaySpend)}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.statBlock}>
          <Text style={s.statLabel}>INCOME</Text>
          <Text style={s.statVal}>{fmt(totals.income)}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.statBlock}>
          <Text style={s.statLabel}>{totals.net >= 0 ? 'NET SAVED' : 'NET SPEND'}</Text>
          <Text style={[s.statVal, totals.net < 0 && { color: '#FECACA' }]}>
            {totals.net >= 0 ? '+' : '-'}{fmt(totals.net)}
          </Text>
        </View>
      </View>

      <View style={s.footerRow}>
        <Ionicons name="list" size={13} color="rgba(255,255,255,0.85)" />
        <Text style={s.footerTxt}>
          {filteredCount > 0 && activeFilterCount > 0
            ? `${filteredCount} of ${totals.count} shown`
            : `${totals.count} transactions this month`}
        </Text>
      </View>
    </LinearGradient>
  );
}

export default memo(TransactionsHero);

const useStyles = makeStyles(() => ({
  card: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    marginHorizontal: 0,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#C14A06', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  blob1: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.08)' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.85)' },
  amount: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1.2, marginTop: 3 },
  headActions: { flexDirection: 'row', gap: 8, marginTop: 3 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  filterBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#C14A06' },
  filterBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#C14A06' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, paddingVertical: 10 },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)' },
  statVal: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  divider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 11 },
  footerTxt: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },
}));
