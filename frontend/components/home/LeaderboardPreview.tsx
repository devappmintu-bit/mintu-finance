import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

interface Props {
  leaderboard: any;
}

export default function LeaderboardPreview({ leaderboard }: Props) {
  if (!leaderboard?.top_10 || leaderboard.top_10.length === 0) return null;

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.9} onPress={() => router.push('/(tabs)/rewards' as any)}>
      <View style={s.header}>
        <Ionicons name="trophy" size={18} color="#F59E0B" />
        <Text style={s.title}>Savings Leaderboard</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
      </View>
      <View style={s.metaRow}>
        <View style={s.metaBox}>
          <Text style={s.metaNum}>#{leaderboard.user_rank || '-'}</Text>
          <Text style={s.metaLbl}>Your Rank</Text>
        </View>
        <View style={[s.metaBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#FDE68A' }]}>
          <Text style={[s.metaNum, { color: '#10B981' }]}>{leaderboard.percentile || 0}%</Text>
          <Text style={s.metaLbl}>Percentile</Text>
        </View>
        <View style={s.metaBox}>
          <Text style={[s.metaNum, { color: '#E65100' }]}>{leaderboard.user_score || 0}</Text>
          <Text style={s.metaLbl}>Score</Text>
        </View>
      </View>
      <View style={s.top3Row}>
        {[1, 0, 2].map((idx) => {
          const p = leaderboard.top_10[idx];
          if (!p) return <View key={idx} style={{ flex: 1 }} />;
          const medals = ['🥇', '🥈', '🥉'];
          const heights = [80, 60, 50];
          const colors = ['#F59E0B', '#94A3B8', '#C77632'];
          const rank = p.rank;
          return (
            <View key={idx} style={s.podium}>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>{medals[rank - 1]}</Text>
              <View style={[s.podiumBar, { height: heights[rank - 1], backgroundColor: colors[rank - 1] }]}>
                <Text style={s.podiumRank}>{rank}</Text>
              </View>
              <Text style={s.podiumName} numberOfLines={1}>{p.is_me ? 'You' : p.name.split(' ')[0]}</Text>
              <Text style={s.podiumScore}>{p.score}/100</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.comparison}>
        {leaderboard.comparison_text || `You're in the top ${100 - (leaderboard.percentile || 50)}% of savers!`}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFBEB', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#92400E', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: '#fff', borderRadius: RADIUS.lg },
  metaBox: { alignItems: 'center', flex: 1 },
  metaNum: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  metaLbl: { fontSize: 10, color: COLORS.text.muted, marginTop: 2 },
  top3Row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', marginTop: 8 },
  podium: { flex: 1, alignItems: 'center' },
  podiumBar: { width: 48, borderRadius: 8, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 6 },
  podiumRank: { color: '#fff', fontWeight: '900', fontSize: 18 },
  podiumName: { fontSize: 12, fontWeight: '700', color: COLORS.text.primary, marginTop: 6 },
  podiumScore: { fontSize: 10, color: COLORS.text.muted },
  comparison: { fontSize: 12, color: COLORS.text.secondary, marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
});
