/**
 * TransactionsHeroBrutalist — v10 Brutalist rollout (Phase 3).
 *
 * Replaces the saffron-gradient hero with a structured Brutalist
 * command block: heavy borders, monospaced ledger numerals, and a
 * direct-action bar that feeds SmartEntry.
 *
 * Design grammar (matches AIBrainDashboard & NewsCardStack):
 *   • 2px INK borders, 1px internal dividers (LINE).
 *   • Menlo/mono for ₹ values (so rows line up like a bank statement).
 *   • Accent rule bar + eyebrow for the section tag.
 *   • "Quick-add" brutalist row replaces the round + icon — clearer,
 *     wider tap target, and ties straight into SmartEntry store.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmartEntry } from '../../store/smartEntry';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#E84A0C';
const LINE   = '#E4E2DB';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const WARN   = '#D97706';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

type Props = {
  transactions: any[];
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

function TransactionsHeroBrutalist({ transactions, onPressFilter, activeFilterCount = 0, filteredCount = 0 }: Props) {
  const totals = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    let expense = 0, income = 0, todaySpend = 0, todayCount = 0;
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
        todayCount += 1;
      }
    }
    const net = income - expense;
    const saveRate = income > 0 ? Math.max(0, Math.min(100, Math.round((net / income) * 100))) : 0;
    return { expense, income, net, todaySpend, todayCount, saveRate, count: transactions.length };
  }, [transactions]);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  const openEntry = (kind: 'expense' | 'budget' | 'goal', type?: 'debit' | 'credit') => {
    haptic();
    useSmartEntry.getState().open(kind, type ? { type } : {}, 'tx_hero');
  };

  const netTone = totals.net >= 0 ? OK : WARN;

  return (
    <View style={styles.wrap}>
      {/* Eyebrow / section tag */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>LEDGER · {monthLabel}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onPressFilter} hitSlop={8} style={styles.filterBtn} testID="tx-hero-filter">
          <Ionicons name="options-outline" size={13} color={INK} />
          <Text style={styles.filterText}>FILTER</Text>
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}><Text style={styles.filterBadgeTxt}>{activeFilterCount}</Text></View>
          ) : null}
        </Pressable>
      </View>

      {/* Main block */}
      <View style={styles.card}>
        {/* Row 1: focal SPENT ₹ */}
        <View style={styles.focalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.focalTag}>SPENT THIS MONTH</Text>
            <Text style={styles.focal} numberOfLines={1}>{fmt(totals.expense)}</Text>
            <Text style={styles.sub}>
              {filteredCount > 0 && activeFilterCount > 0
                ? `${filteredCount} of ${totals.count} shown`
                : `${totals.count} transactions logged`}
            </Text>
          </View>

          {/* Save-rate gauge */}
          <View style={styles.gauge}>
            <Text style={[styles.gaugeNum, { color: netTone }]}>{totals.saveRate}</Text>
            <Text style={styles.gaugeLabel}>% SAVED</Text>
          </View>
        </View>

        {/* Row 2: 3-col stat strip */}
        <View style={styles.strip}>
          <StatCell label="TODAY" value={fmt(totals.todaySpend)} sub={`${totals.todayCount} txn`} />
          <View style={styles.vbar} />
          <StatCell label="IN" value={fmt(totals.income)} tone={OK} />
          <View style={styles.vbar} />
          <StatCell
            label={totals.net >= 0 ? 'NET+' : 'NET-'}
            value={`${totals.net >= 0 ? '+' : '−'}${fmt(totals.net)}`}
            tone={netTone}
            last
          />
        </View>

        {/* Row 3: Brutalist action bar (SmartEntry wired) */}
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.actionPrimary, pressed && { transform: [{ translateY: 1 }] }]} onPress={() => openEntry('expense', 'debit')} testID="tx-hero-add-expense">
            <Ionicons name="remove-circle" size={14} color="#fff" />
            <Text style={styles.actionPrimaryTxt}>EXPENSE</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.action, pressed && { transform: [{ translateY: 1 }] }]} onPress={() => openEntry('expense', 'credit')} testID="tx-hero-add-income">
            <Ionicons name="add-circle-outline" size={14} color={INK} />
            <Text style={styles.actionTxt}>INCOME</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.action, styles.actionLast, pressed && { transform: [{ translateY: 1 }] }]} onPress={() => openEntry('budget')} testID="tx-hero-add-budget">
            <Ionicons name="pie-chart-outline" size={14} color={INK} />
            <Text style={styles.actionTxt}>BUDGET</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StatCell({ label, value, sub, tone = INK, last }: { label: string; value: string; sub?: string; tone?: string; last?: boolean }) {
  return (
    <View style={[styles.cell, last && { borderRightWidth: 0 }]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellVal, { color: tone }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.cellSub}>{sub}</Text> : null}
    </View>
  );
}

export default memo(TransactionsHeroBrutalist);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: INK, backgroundColor: PAPER,
  },
  filterText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: INK },
  filterBadge: { marginLeft: 4, minWidth: 14, height: 14, paddingHorizontal: 3, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  filterBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#fff' },

  card: { borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },

  focalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderColor: INK },
  focalTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED },
  focal: { fontFamily: MONO, fontSize: 38, fontWeight: '900', color: INK, letterSpacing: -1.6, lineHeight: 42, marginTop: 2 },
  sub: { fontSize: 10.5, fontWeight: '700', color: MUTED, marginTop: 4, letterSpacing: 0.2 },

  gauge: { minWidth: 68, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: INK, backgroundColor: PAPER },
  gaugeNum: { fontFamily: MONO, fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
  gaugeLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, color: INK, marginTop: 2 },

  strip: { flexDirection: 'row', borderBottomWidth: 1, borderColor: INK, backgroundColor: PAPER },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderColor: INK, alignItems: 'flex-start' },
  cellLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED },
  cellVal: { fontFamily: MONO, fontSize: 14, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },
  cellSub: { fontSize: 9, fontWeight: '700', color: MUTED, marginTop: 2 },
  vbar: { width: 0 },

  actions: { flexDirection: 'row' },
  actionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, backgroundColor: ACCENT, borderRightWidth: 1, borderColor: INK, minHeight: 48,
  },
  actionPrimaryTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },
  action: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, backgroundColor: '#fff', borderRightWidth: 1, borderColor: INK, minHeight: 48,
  },
  actionLast: { borderRightWidth: 0 },
  actionTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK },
});
