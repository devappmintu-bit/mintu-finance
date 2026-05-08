/**
 * BudgetHeroBrutalist — v10 Brutalist rollout (Phase 3).
 *
 * Replaces the saffron-gradient BudgetHero with a structured Brutalist
 * command block: 2px INK border, mono ledger numerals, 3-col stat strip
 * and an action bar wired to SmartEntry. Same grammar as
 * TransactionsHeroBrutalist + AIBrainDashboard.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmartEntry } from '../../store/smartEntry';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#F56E1E';
const LINE   = '#E4E2DB';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const WARN   = '#D97706';
const DANGER = '#C2185B';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

type Props = {
  budgets: any[];
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

function BudgetHeroBrutalist({ budgets, onPressShare, sharing }: Props) {
  const totals = useMemo(() => {
    const totalBudget = budgets.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
    const totalSpent  = budgets.reduce((sum: number, b: any) => sum + Number(b.spent || 0), 0);
    const pct = totalBudget > 0 ? Math.min(999, (totalSpent / totalBudget) * 100) : 0;
    const over    = budgets.filter((b: any) => Number(b.spent || 0) > Number(b.amount || 0)).length;
    const warning = budgets.filter((b: any) => {
      const a = Number(b.amount || 0); const sp = Number(b.spent || 0);
      return a > 0 && sp / a >= 0.8 && sp < a;
    }).length;
    const left = totalBudget - totalSpent;
    let tag = 'ON TRACK', tagTone = OK;
    if (pct >= 100)      { tag = 'OVER BUDGET';  tagTone = DANGER; }
    else if (pct >= 80)  { tag = 'WATCHING';     tagTone = WARN; }
    else if (pct >= 60)  { tag = 'CAREFUL';      tagTone = WARN; }
    return { totalBudget, totalSpent, pct, over, warning, left, tag, tagTone };
  }, [budgets]);

  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  const openBudget = () => { haptic(); useSmartEntry.getState().open('budget', {}, 'budget_hero'); };
  const openExpense = () => { haptic(); useSmartEntry.getState().open('expense', { type: 'debit' }, 'budget_hero'); };

  // If no budgets yet, show a compact onboarding block — still brutalist.
  const empty = budgets.length === 0;

  return (
    <View style={styles.wrap}>
      {/* Eyebrow / tag row */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>BUDGET · {monthLabel}</Text>
        <View style={{ flex: 1 }} />
        {!empty ? (
          <Pressable onPress={onPressShare} hitSlop={8} style={styles.sharebtn} disabled={!!sharing} testID="budget-hero-share">
            {sharing ? (
              <ActivityIndicator size="small" color={INK} />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={12} color={INK} />
                <Text style={styles.shareText}>SHARE</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        {/* Focal row */}
        <View style={styles.focalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.focalTag}>SPENT / ALLOCATED</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.focal} numberOfLines={1}>{fmt(totals.totalSpent)}</Text>
              <Text style={styles.focalOf} numberOfLines={1}> / {fmt(totals.totalBudget)}</Text>
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              {empty ? 'No budgets yet — set your first cap below' :
                `${budgets.length} budget${budgets.length === 1 ? '' : 's'} · ${totals.left >= 0 ? `${fmt(totals.left)} left` : `${fmt(totals.left)} over`}`}
            </Text>
          </View>

          {/* Status chip */}
          {!empty ? (
            <View style={[styles.chip, { borderColor: totals.tagTone }]}>
              <Text style={[styles.chipNum, { color: totals.tagTone }]}>{Math.round(totals.pct)}</Text>
              <Text style={[styles.chipLabel, { color: totals.tagTone }]}>% USED</Text>
            </View>
          ) : null}
        </View>

        {/* Progress bar — brutalist stepped */}
        {!empty ? (
          <View style={styles.bar}>
            <View style={[
              styles.barFill,
              { width: `${Math.min(100, totals.pct)}%`,
                backgroundColor: totals.pct >= 100 ? DANGER : totals.pct >= 80 ? WARN : OK },
            ]} />
            <View style={styles.barTrackTicks}>
              {[0.25, 0.5, 0.75].map((t, i) => (
                <View key={i} style={[styles.tick, { left: `${t * 100}%` }]} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Stat strip */}
        {!empty ? (
          <View style={styles.strip}>
            <Cell label={totals.tag} value={`${totals.pct.toFixed(0)}%`} tone={totals.tagTone} />
            <Cell label="OVER" value={String(totals.over)} tone={totals.over ? DANGER : INK} />
            <Cell label="NEAR CAP" value={String(totals.warning)} tone={totals.warning ? WARN : INK} last />
          </View>
        ) : null}

        {/* Action bar */}
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.actionPrimary, pressed && { transform: [{ translateY: 1 }] }]} onPress={openBudget} testID="budget-hero-new">
            <Ionicons name="pie-chart" size={14} color="#fff" />
            <Text style={styles.actionPrimaryTxt}>NEW BUDGET</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.action, styles.actionLast, pressed && { transform: [{ translateY: 1 }] }]} onPress={openExpense} testID="budget-hero-log">
            <Ionicons name="add-circle-outline" size={14} color={INK} />
            <Text style={styles.actionTxt}>LOG EXPENSE</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Cell({ label, value, tone = INK, last }: { label: string; value: string; tone?: string; last?: boolean }) {
  return (
    <View style={[styles.cell, last && { borderRightWidth: 0 }]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellVal, { color: tone }]}>{value}</Text>
    </View>
  );
}

export default memo(BudgetHeroBrutalist);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  sharebtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: INK, backgroundColor: PAPER },
  shareText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: INK },

  card: { borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },
  focalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderColor: INK },
  focalTag: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: MUTED },
  focal: { fontFamily: MONO, fontSize: 32, fontWeight: '900', color: INK, letterSpacing: -1.3, lineHeight: 36, marginTop: 2 },
  focalOf: { fontFamily: MONO, fontSize: 15, fontWeight: '800', color: MUTED, letterSpacing: -0.5 },
  sub: { fontSize: 10.5, fontWeight: '700', color: MUTED, marginTop: 4, letterSpacing: 0.2 },

  chip: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, backgroundColor: PAPER, minWidth: 72 },
  chipNum: { fontFamily: MONO, fontSize: 20, fontWeight: '900', letterSpacing: -0.8 },
  chipLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 },

  bar: { height: 10, backgroundColor: PAPER, borderBottomWidth: 1, borderColor: INK, position: 'relative' },
  barFill: { height: '100%' },
  barTrackTicks: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.15)' },

  strip: { flexDirection: 'row', borderBottomWidth: 1, borderColor: INK, backgroundColor: PAPER },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderColor: INK, alignItems: 'flex-start' },
  cellLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED },
  cellVal: { fontFamily: MONO, fontSize: 15, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },

  actions: { flexDirection: 'row' },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: ACCENT, borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionPrimaryTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: '#fff', borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionLast: { borderRightWidth: 0 },
  actionTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK },
});
