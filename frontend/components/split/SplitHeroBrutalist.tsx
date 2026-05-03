/**
 * SplitHeroBrutalist — v10 Brutalist rollout (Phase 3).
 *
 * Replaces the gradient SplitHero with a Brutalist net-position block.
 * State-driven coloring via a left accent bar (green YOU GET / orange
 * YOU OWE / grey SETTLED) instead of a full gradient. Action bar wires
 * to `onAddGroup` / `onSettleUp`.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#E84A0C';
const LINE   = '#E4E2DB';
const MUTED  = '#6B6B6B';
const OK     = '#0E8F5B';
const DANGER = '#C2185B';
const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace' });

type Props = {
  balances: any;
  coins: number;
  groupCount: number;
  onAddGroup?: () => void;
  onSettleUp?: () => void;
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function SplitHeroBrutalist({ balances, coins, groupCount, onAddGroup, onSettleUp }: Props) {
  const { owed, owe, net, state } = useMemo(() => {
    const owed = Number(balances?.total_owed_to_you || 0);
    const owe  = Number(balances?.total_you_owe || 0);
    const net  = owed - owe;
    let state: 'get' | 'owe' | 'settled' = 'settled';
    if (Math.abs(net) > 0.5) state = net > 0 ? 'get' : 'owe';
    return { owed, owe, net, state };
  }, [balances]);

  const tone = state === 'get' ? OK : state === 'owe' ? ACCENT : MUTED;
  const stateLabel = state === 'get' ? 'YOU GET' : state === 'owe' ? 'YOU OWE' : 'ALL SETTLED';
  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <View style={styles.wrap}>
      {/* Eyebrow / tag row */}
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>SPLIT · NET POSITION</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.coinPill}>
          <Ionicons name="disc" size={10} color="#E5A80A" />
          <Text style={styles.coinTxt}>{coins} COINS</Text>
        </View>
      </View>

      <View style={styles.card}>
        {/* Focal row with state accent bar on the left */}
        <View style={styles.focalRow}>
          <View style={[styles.accentBar, { backgroundColor: tone }]} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={[styles.stateChip, { backgroundColor: tone }]}>
              <Text style={styles.stateChipText}>{stateLabel}</Text>
            </View>
            <Text style={styles.focal} numberOfLines={1}>
              {state === 'settled' ? '₹0' : `${state === 'get' ? '+' : '−'}${fmt(Math.abs(net))}`}
            </Text>
            <Text style={styles.sub} numberOfLines={2}>
              {state === 'get'
                ? `${fmt(Math.abs(net))} to collect · remind friends`
                : state === 'owe'
                  ? `Clear ${fmt(Math.abs(net))} in one tap`
                  : groupCount === 0
                    ? 'Create your first group to start splitting'
                    : `${groupCount} group${groupCount === 1 ? '' : 's'} — all squared up 🎉`}
            </Text>
          </View>
        </View>

        {/* Stat strip */}
        <View style={styles.strip}>
          <Cell label="OWED TO YOU" value={fmt(owed)} tone={owed > 0 ? OK : INK} />
          <Cell label="YOU OWE" value={fmt(owe)} tone={owe > 0 ? DANGER : INK} />
          <Cell label="GROUPS" value={String(groupCount)} last />
        </View>

        {/* Action bar */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionPrimary, pressed && { transform: [{ translateY: 1 }] }]}
            onPress={() => { haptic(); onAddGroup?.(); }}
            testID="split-hero-add"
          >
            <Ionicons name="add-circle" size={14} color="#fff" />
            <Text style={styles.actionPrimaryTxt}>NEW GROUP</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.action, styles.actionLast,
              state !== 'owe' && styles.actionDisabled,
              pressed && { transform: [{ translateY: 1 }] },
            ]}
            onPress={() => { if (state === 'owe') { haptic(); onSettleUp?.(); } }}
            testID="split-hero-settle"
            disabled={state !== 'owe'}
          >
            <Ionicons name="flash" size={14} color={state === 'owe' ? INK : MUTED} />
            <Text style={[styles.actionTxt, state !== 'owe' && { color: MUTED }]}>
              {state === 'owe' ? 'SETTLE NOW' : 'ALL SETTLED'}
            </Text>
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
      <Text style={[styles.cellVal, { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default memo(SplitHeroBrutalist);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: INK, backgroundColor: '#FFF8E1' },
  coinTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: INK },

  card: { borderWidth: 2, borderColor: INK, backgroundColor: '#fff' },

  focalRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: INK },
  accentBar: { width: 6, minHeight: 64 },
  stateChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3 },
  stateChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: '#fff' },
  focal: { fontFamily: MONO, fontSize: 34, fontWeight: '900', color: INK, letterSpacing: -1.4, lineHeight: 38, marginTop: 6 },
  sub: { fontSize: 11.5, fontWeight: '700', color: MUTED, marginTop: 4, lineHeight: 16 },

  strip: { flexDirection: 'row', borderBottomWidth: 1, borderColor: INK, backgroundColor: PAPER },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderColor: INK, alignItems: 'flex-start' },
  cellLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: MUTED },
  cellVal: { fontFamily: MONO, fontSize: 14, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },

  actions: { flexDirection: 'row' },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: ACCENT, borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionPrimaryTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#fff' },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, backgroundColor: '#fff', borderRightWidth: 1, borderColor: INK, minHeight: 48 },
  actionDisabled: { backgroundColor: PAPER },
  actionLast: { borderRightWidth: 0 },
  actionTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK },
});
