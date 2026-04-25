// Unified Leaderboard — shared across Home / Rewards / Split screens.
// Scope toggle: "Contacts" (your split-group + referred users) vs "Global".
// Auto-refreshes on every focus, pulls from /api/leaderboard/unified.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  title?: string;
  compact?: boolean;
  onPressMore?: () => void;
  defaultScope?: 'contacts' | 'global';
}

type Entry = {
  rank: number;
  id: string;
  name: string;
  score: number;
  streak: number;
  coins: number;
  settlements: number;
  is_me: boolean;
  phone_masked: string;
  has_avatar: boolean;
  percentile?: number;
};

function UnifiedLeaderboard({ title = 'Leaderboard', compact = false, onPressMore, defaultScope = 'contacts' }: Props) {
  const s = useStyles();
  const [scope, setScope] = useState<'contacts' | 'global'>(defaultScope);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async (nextScope = scope) => {
    setLoading(true);
    try {
      const res = await api.get(`/leaderboard/unified?scope=${nextScope}`);
      setData(res.data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { load(scope); }, [scope]);

  // Refresh on every focus — ensures real-time updates after actions elsewhere
  useFocusEffect(useCallback(() => { load(scope); }, [scope, load]));

  const switchScope = (newScope: 'contacts' | 'global') => {
    if (newScope !== scope) setScope(newScope);
  };

  const contenders: Entry[] = data?.contenders || [];
  const you: Entry | null = data?.you || null;
  // Default compact: show only top 3 per design ask. Expanded shows up to 20.
  const [expanded, setExpanded] = useState(false);
  const displayList = (compact && !expanded) ? contenders.slice(0, 3) : contenders.slice(0, 20);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <View style={s.card}>
      {/* Header with scope toggle */}
      <View style={s.header}>
        <Ionicons name="trophy" size={18} color="#F59E0B" />
        <Text style={s.title}>{title}</Text>
        <View style={s.toggle}>
          <TouchableOpacity
            style={[s.tog, scope === 'contacts' && s.togActive]}
            onPress={() => switchScope('contacts')}
            activeOpacity={0.8}
          >
            <Text style={[s.togText, scope === 'contacts' && s.togTextActive]}>Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tog, scope === 'global' && s.togActive]}
            onPress={() => switchScope('global')}
            activeOpacity={0.8}
          >
            <Text style={[s.togText, scope === 'global' && s.togTextActive]}>Global</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Headline */}
      {data?.headline && <Text style={s.headline}>{data.headline}</Text>}

      {/* Your stats bar */}
      {you && (
        <View style={s.meBar}>
          <View style={s.meBox}>
            <Text style={s.meLabel}>Your Rank</Text>
            <Text style={s.meNum}>#{you.rank}</Text>
          </View>
          <View style={s.meBox}>
            <Text style={s.meLabel}>Score</Text>
            <Text style={[s.meNum, { color: COLORS.accent.primary }]}>{you.score}</Text>
          </View>
          <View style={s.meBox}>
            <Text style={s.meLabel}>Percentile</Text>
            <Text style={[s.meNum, { color: '#10B981' }]}>{you.percentile ?? 0}%</Text>
          </View>
          <View style={s.meBox}>
            <Text style={s.meLabel}>Coins</Text>
            <Text style={[s.meNum, { color: '#F59E0B' }]}>{you.coins}</Text>
          </View>
        </View>
      )}

      {/* Rank list */}
      {loading ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={COLORS.accent.primary} />
        </View>
      ) : displayList.length === 0 ? (
        <Text style={s.empty}>
          {scope === 'contacts' ? 'No friends yet — invite some to start competing!' : 'No users yet'}
        </Text>
      ) : (
        displayList.map((e) => (
          <View key={e.id} style={[s.row, e.is_me && s.rowMe]}>
            <View style={s.rankBox}>
              {e.rank <= 3 ? (
                <Text style={s.medal}>{medals[e.rank - 1]}</Text>
              ) : (
                <Text style={s.rankNum}>#{e.rank}</Text>
              )}
            </View>
            <View style={s.avatar}>
              <Text style={s.avatarT}>{e.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[s.name, e.is_me && { color: COLORS.accent.primary, fontWeight: '800' }]} numberOfLines={1}>
                {e.is_me ? 'You' : e.name}
              </Text>
              <Text style={s.meta}>
                🔥 {e.streak}d · 🪙 {e.coins} · 🤝 {e.settlements} splits
              </Text>
            </View>
            <Text style={s.score}>{e.score}</Text>
          </View>
        ))
      )}

      {compact && contenders.length > 3 && (
        <TouchableOpacity
          style={s.moreBtn}
          onPress={() => { if (expanded) setExpanded(false); else onPressMore ? onPressMore() : setExpanded(true); }}
          activeOpacity={0.8}
        >
          <Text style={s.moreText}>{expanded ? 'Show top 3 only' : 'See full leaderboard'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={14} color={COLORS.accent.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: '#92400E', flex: 1 },
  toggle: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 999, padding: 2 },
  tog: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  togActive: { backgroundColor: c.accent.primary },
  togText: { fontSize: 11, fontWeight: '700', color: c.text.muted },
  togTextActive: { color: '#fff' },
  headline: { fontSize: 13, fontWeight: '700', color: c.text.primary, marginBottom: 12 },
  meBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 14, gap: 4 },
  meBox: { flex: 1, alignItems: 'center' },
  meLabel: { fontSize: 9, fontWeight: '700', color: c.text.muted, letterSpacing: 0.5, marginBottom: 2 },
  meNum: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  empty: { textAlign: 'center', color: c.text.muted, padding: 20, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10 },
  rowMe: { backgroundColor: c.accent.primary + '12' },
  rankBox: { width: 36, alignItems: 'center' },
  medal: { fontSize: 20 },
  rankNum: { fontSize: 12, fontWeight: '800', color: c.text.muted },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent.primary + '20', justifyContent: 'center', alignItems: 'center' },
  avatarT: { fontSize: 13, fontWeight: '800', color: c.accent.primary },
  name: { fontSize: 13, fontWeight: '600', color: c.text.primary },
  meta: { fontSize: 10, color: c.text.muted, marginTop: 1 },
  score: { fontSize: 16, fontWeight: '800', color: '#E65100', minWidth: 40, textAlign: 'right' },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 10 },
  moreText: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
}));

// Round 43 perf — memoized so unrelated parent state changes don't re-render this widget.
export default React.memo(UnifiedLeaderboard);
