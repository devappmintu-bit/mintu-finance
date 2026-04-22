/**
 * CompactLeaderboard.tsx — Top-3 ranks preview.
 * Wraps the existing UnifiedLeaderboard / calls /api/leaderboard/unified.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../../utils/api';

type Row = { rank: number; name: string; score: number; is_you?: boolean; avatar?: string | null };

export default function CompactLeaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/leaderboard/unified?scope=global');
        const arr: Row[] = (r.data?.entries || r.data?.leaderboard || r.data || []).slice(0, 3);
        setRows(arr);
      } catch { /* no-op */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>🏆</Text>
          <Text style={s.title}>Leaderboard</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/rewards' as any)} hitSlop={10}>
          <Text style={s.viewAll}>View all →</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator color="#F56E1E" /></View>
      ) : rows.length === 0 ? (
        <Text style={s.empty}>Leaderboard data syncing…</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((r) => (
            <View key={r.rank} style={[s.row, r.is_you && s.rowYou]}>
              <View style={[s.medal, { backgroundColor: medalColor(r.rank) + '22' }]}>
                <Text style={{ fontSize: 14 }}>{medalEmoji(r.rank)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {r.is_you ? 'You' : (r.name || `Player ${r.rank}`)}
                </Text>
                <Text style={s.sub}>Rank #{r.rank}</Text>
              </View>
              <Text style={s.score}>{Math.round(r.score || 0)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function medalEmoji(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '🏅';
}
function medalColor(rank: number) {
  if (rank === 1) return '#F59E0B';
  if (rank === 2) return '#9CA3AF';
  if (rank === 3) return '#CD7F32';
  return '#6B7280';
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '900', color: '#111827', letterSpacing: -0.2 },
  viewAll: { fontSize: 11.5, fontWeight: '900', color: '#F56E1E' },
  empty: { fontSize: 12, color: '#6B7280', fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 12 },
  rowYou: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' },
  medal: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginTop: 1 },
  score: { fontSize: 14, fontWeight: '900', color: '#F56E1E' },
});
