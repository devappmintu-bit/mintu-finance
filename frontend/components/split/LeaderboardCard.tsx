import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';

const MEDALS = ['🥇', '🥈', '🥉'];

type Props = { settleLB: any };

export default function LeaderboardCard({ settleLB }: Props) {
  if (!settleLB || !settleLB.leaderboard?.length) return null;
  return (
    <View style={s.lbCard}>
      <View style={s.lbHead}>
        <Ionicons name="trophy" size={16} color={C.gold} />
        <Text style={s.lbTitle}>SETTLEMENT KINGS</Text>
      </View>
      {settleLB.leaderboard.slice(0, 3).map((e: any, i: number) => (
        <View key={i} style={[s.lbRow, e.is_me && s.lbMe]}>
          <Text style={s.lbMedal}>{MEDALS[i]}</Text>
          <Text style={[s.lbName, e.is_me && { color: C.accent, fontWeight: '800' }]}>{e.is_me ? 'You' : e.name}</Text>
          <Text style={s.lbCoins}>{`🪙 ${e.coins}`}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  lbCard: { backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  lbHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  lbTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#92400E' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  lbMe: { backgroundColor: 'rgba(230,81,0,0.06)', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbMedal: { fontSize: 16, width: 28 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text2 },
  lbCoins: { fontSize: 14, fontWeight: '700', color: '#92400E' },
});
