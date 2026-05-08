/**
 * AICoachOneTap — context-aware 1-tap actions card.
 * Purple/indigo accent distinguishes from orange/blue siblings.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.bg.secondary, borderRadius: 0, padding: 16, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  iconBubble: { width: 26, height: 26, borderRadius: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED1F' },
  label: { flex: 1, fontSize: 11, fontWeight: '800', color: c.accent.tertiary, letterSpacing: 0.5, textTransform: 'uppercase' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.state.success },
  liveTxt: { fontSize: 9, fontWeight: '800', color: c.state.success, letterSpacing: 0.5 },

  action: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  actionTitle: { fontSize: 13, fontWeight: '700', color: c.text.primary, lineHeight: 17 },
  actionSaves: { fontSize: 10.5, fontWeight: '700', color: c.state.success, marginTop: 2 },
  oneTap: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 0, backgroundColor: '#7C3AED14' },
  oneTapTxt: { fontSize: 10.5, fontWeight: '800', color: c.accent.tertiary },
}));

type Stats = { monthlySpend: number; savingsRate: number; topCategory: { name: string; amount: number } | null; transactionCount: number; balance: number } | null;

interface Props { stats: Stats; score: number; }

type Action = { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; saves?: number; route: string };

export default function AICoachOneTap({ stats, score }: Props) {
  const s = useStyles();
  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (stats?.topCategory && stats.topCategory.amount > 3000) {
      list.push({ key: 'cap-top-cat', icon: 'pie-chart-outline', title: `Cap ${stats.topCategory.name} at ₹${Math.round(stats.topCategory.amount * 0.8).toLocaleString('en-IN')}`, saves: Math.round(stats.topCategory.amount * 0.2), route: '/(tabs)/budget' });
    }
    if (stats && stats.savingsRate < 15) {
      list.push({ key: 'save-300', icon: 'wallet-outline', title: 'Move ₹300 to savings now', saves: 300, route: '/(tabs)/transactions' });
    }
    if (score < 60) {
      list.push({ key: 'spin-daily', icon: 'gift-outline', title: 'Claim today\'s free spin', route: '/(tabs)/rewards' });
    }
    list.push({ key: 'ask-ai', icon: 'chatbubbles-outline', title: 'Ask: "Am I overspending today?"', route: '/(tabs)/ai' });
    return list.slice(0, 3);
  }, [stats, score]);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.iconBubble}>
          <Ionicons name="sparkles" size={13} color={'#7C3AED'} />
        </View>
        <Text style={s.label}>MintU AI Coach</Text>
        <View style={s.liveDot} />
        <Text style={s.liveTxt}>LIVE</Text>
      </View>

      {actions.map((a, idx) => (
        <TouchableOpacity
          key={a.key}
          style={[s.action, idx > 0 && s.actionDivider]}
          onPress={() => { haptic(); try { router.push(a.route as any); } catch {} }}
          activeOpacity={0.75}
        >
          <Ionicons name={a.icon} size={17} color={COLORS.text.muted} style={{ width: 22 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.actionTitle} numberOfLines={2}>{a.title}</Text>
            {a.saves ? <Text style={s.actionSaves}>Save ₹{a.saves.toLocaleString('en-IN')}/mo</Text> : null}
          </View>
          <View style={s.oneTap}>
            <Text style={s.oneTapTxt}>Fix in 1 tap</Text>
            <Ionicons name="arrow-forward" size={11} color={'#7C3AED'} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

