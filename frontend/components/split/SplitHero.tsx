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
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

function SplitHero({ balances, coins, groupCount, onAddGroup }: Props) {
  const s = useStyles();

  const { owed, owe, net, positive } = useMemo(() => {
    const owed = Number(balances?.total_owed_to_you || 0);
    const owe = Number(balances?.total_you_owe || 0);
    const net = owed - owe;
    return { owed, owe, net, positive: net >= 0 };
  }, [balances]);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };

  return (
    <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.topRow}>
        <View style={s.pill}>
          <Ionicons name="people" size={12} color="#fff" />
          <Text style={s.pillTxt}>{groupCount} {groupCount === 1 ? 'GROUP' : 'GROUPS'}</Text>
        </View>
        <View style={s.coinPill}>
          <Text style={s.coinEmoji}>🪙</Text>
          <Text style={s.coinTxt}>{coins}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { haptic(); onAddGroup?.(); }} activeOpacity={0.85} testID="split-hero-add">
          <Ionicons name="add" size={20} color="#C14A06" />
        </TouchableOpacity>
      </View>

      <Text style={s.eyebrow}>{positive ? 'NET BALANCE' : 'YOU OWE NET'}</Text>
      <Text style={s.amount} numberOfLines={1}>
        {positive ? '+' : '−'}{fmt(net)}
      </Text>
      <Text style={s.sub} numberOfLines={2}>
        {owed === 0 && owe === 0
          ? 'No splits yet — create a group to start tracking shared expenses'
          : positive
            ? `You're net owed ${fmt(net)} — tap friends to collect 💸`
            : `You owe ${fmt(net)} net — settle up to hit zero`}
      </Text>

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

const useStyles = makeStyles(() => ({
  card: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#C14A06', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.08)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  pillTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  coinEmoji: { fontSize: 12 },
  coinTxt: { fontSize: 11, fontWeight: '900', color: '#FCD34D' },
  addBtn: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.82)' },
  amount: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1.5, marginTop: 2 },
  sub: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 17 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingVertical: 12 },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9, color: 'rgba(255,255,255,0.7)' },
  statVal: { fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  divider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.22)' },
}));
