/**
 * SplitHero — MintU 2.0 saffron-gradient hero for Split tab.
 * Shows net position (owed to me − I owe), balance stats, coins + CTAs.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

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

function SplitHero({ balances, coins, groupCount, onAddGroup, onSettleUp }: Props) {
  const s = useStyles();

  const { owed, owe, net, state } = useMemo(() => {
    const owed = Number(balances?.total_owed_to_you || 0);
    const owe = Number(balances?.total_you_owe || 0);
    const net = owed - owe;
    let state: 'get' | 'owe' | 'settled' = 'settled';
    if (Math.abs(net) > 0.5) state = net > 0 ? 'get' : 'owe';
    return { owed, owe, net, state };
  }, [balances]);

  // Dynamic gradient colors by state
  const gradient: [string, string] = state === 'get'
    ? ['#10B981', '#047857']          // green — you get
    : state === 'owe'
      ? ['#F56E1E', '#C14A06']        // saffron — you owe
      : ['#6B7280', '#374151'];       // grey — settled

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.topRow}>
        <View style={s.pill}>
          <Ionicons name="people" size={12} color="#FFFFFF" />
          <Text style={s.pillTxt}>{groupCount} {groupCount === 1 ? 'GROUP' : 'GROUPS'}</Text>
        </View>
        <View style={s.coinPill}>
          <Text style={s.coinEmoji}>🪙</Text>
          <Text style={s.coinTxt}>{coins}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { haptic(); onAddGroup?.(); }} activeOpacity={0.85} testID="split-hero-add">
          <Ionicons name="add" size={20} color={state === 'get' ? '#047857' : state === 'owe' ? '#C14A06' : '#374151'} />
        </TouchableOpacity>
      </View>

      <Text style={s.eyebrow}>
        {state === 'get' ? '🟢 YOU GET' : state === 'owe' ? '🔴 YOU OWE' : '⚪ ALL SETTLED'}
      </Text>
      <Text style={s.amount} numberOfLines={1}>
        {state === 'settled' ? '₹0' : `${state === 'get' ? '+' : '−'}${fmt(net)}`}
      </Text>
      <Text style={s.sub} numberOfLines={2}>
        {state === 'get'
          ? `${fmt(net)} to collect · tap friends to remind 💸`
          : state === 'owe'
            ? `Tap Settle Up to clear ${fmt(Math.abs(net))} now`
            : owed === 0 && owe === 0
              ? 'No splits yet — create a group to start'
              : '🎉 You’re all squared up'}
      </Text>

      {/* Settle CTA — only when owing */}
      {state === 'owe' && (
        <TouchableOpacity style={s.settleBtn} onPress={() => { haptic(); onSettleUp?.(); }} activeOpacity={0.88} testID="split-hero-settle">
          <Ionicons name="flash" size={14} color="#C14A06" />
          <Text style={s.settleTxt}>Settle now</Text>
          <Ionicons name="arrow-forward" size={13} color="#C14A06" />
        </TouchableOpacity>
      )}

      <View style={s.statsRow}>
        <View style={s.statBlock}>
          <Text style={s.statLabel}>OWED TO YOU</Text>
          <Text style={[s.statVal, { color: '#D1FAE5' }]}>{fmt(owed)}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.statBlock}>
          <Text style={s.statLabel}>YOU OWE</Text>
          <Text style={[s.statVal, { color: '#FECACA' }]}>{fmt(owe)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export default memo(SplitHero);

const useStyles = makeStyles((c) => ({
  card: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: c.accent.brandDark, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.08)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  pillTxt: { fontSize: 10, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.8 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  coinEmoji: { fontSize: 12 },
  coinTxt: { fontSize: 11, fontWeight: '900', color: '#FCD34D' },
  addBtn: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.82)' },
  amount: { fontSize: 40, fontWeight: '900', color: c.bg.elevated, letterSpacing: -1.5, marginTop: 2 },
  sub: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 17 },
  settleBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.bg.elevated, marginTop: 10 },
  settleTxt: { fontSize: 12, fontWeight: '900', color: c.accent.brandDark, letterSpacing: -0.1 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingVertical: 12 },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9, color: 'rgba(255,255,255,0.7)' },
  statVal: { fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  divider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.22)' },
}));
