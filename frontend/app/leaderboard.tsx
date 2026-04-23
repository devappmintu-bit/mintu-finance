/**
 * Full Leaderboard Screen — dedicated, shareable, gamified.
 *
 * Linked from Home ("See full leaderboard") and Profile ("Leaderboards").
 * Uses the same backend /api/leaderboard/unified endpoint as UnifiedLeaderboard
 * but adds: hero your-rank card, podium top-3 visualisation, scrollable full
 * list, shareable rank card (captures your position as image for viral loop).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAppColors } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { shareImageSmart } from '../utils/share';
import PremiumUnlockTeaser from '../components/premium/PremiumUnlockTeaser';
import useSwr from '../hooks/useSwr';

type Scope = 'contacts' | 'global';

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

type LBData = {
  scope: Scope;
  total: number;
  you: Entry | null;
  leader: Entry | null;
  headline: string;
  contenders: Entry[];
};

export default function LeaderboardScreen() {
  const [scope, setScope] = useState<Scope>('contacts');
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<ViewShot>(null);
  const c = useAppColors();
  const s = useStyles();

  // ── SWR data layer (Round 26+) ─────────────────────────────────────
  // `useSwr` serves cached data instantly, revalidates in background,
  // re-fetches on focus, and gives us a declarative refetch() hook.
  const { data, isLoading, refetch } = useSwr<LBData>(
    `/leaderboard/unified?scope=${scope}`,
    { ttlMs: 15_000 }
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };

  const haptic = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const switchScope = (s: Scope) => {
    if (s === scope) return;
    haptic();
    setScope(s);
  };

  const onShare = async () => {
    if (!shareRef.current || !data?.you) return;
    haptic();
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 0.92 });
      const rank = data.you.rank;
      const caption = rank <= 3
        ? `🏆 I'm #${rank} on MintU's ${scope === 'contacts' ? 'friends' : 'global'} leaderboard! Join me: https://mintu.app`
        : `Climbing the MintU leaderboard · rank #${rank} (top ${100 - (data.you.percentile ?? 0)}%). Join me: https://mintu.app`;
      await shareImageSmart({ uri, fallbackText: caption, filename: `mintu-rank-${rank}.png` });
      Toast.show({ type: 'success', text1: '✓ Share sheet opened' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not share', text2: e?.message || 'Try again' });
    } finally {
      setSharing(false);
    }
  };

  const top3 = useMemo(() => (data?.contenders || []).slice(0, 3), [data]);
  const rest = useMemo(() => (data?.contenders || []).slice(3), [data]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={c.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>Leaderboard</Text>
          {data?.headline && <Text style={styles.subtitle} numberOfLines={1}>{data.headline}</Text>}
        </View>
        <TouchableOpacity
          onPress={onShare}
          style={[styles.iconBtn, (!data?.you || sharing) && { opacity: 0.4 }]}
          disabled={!data?.you || sharing}
          testID="lb-share-btn"
        >
          {sharing ? <ActivityIndicator size="small" color={c.accent.primary} /> : <Ionicons name="share-social" size={20} color={c.accent.primary} />}
        </TouchableOpacity>
      </View>

      {/* Scope toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.tog, scope === 'contacts' && styles.togActive]} onPress={() => switchScope('contacts')} activeOpacity={0.85} testID="lb-scope-contacts">
          <Ionicons name="people" size={14} color={scope === 'contacts' ? '#fff' : c.text.muted} />
          <Text style={[styles.togText, scope === 'contacts' && styles.togTextActive]}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tog, scope === 'global' && styles.togActive]} onPress={() => switchScope('global')} activeOpacity={0.85} testID="lb-scope-global">
          <Ionicons name="globe" size={14} color={scope === 'global' ? '#fff' : c.text.muted} />
          <Text style={[styles.togText, scope === 'global' && styles.togTextActive]}>Global</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent.primary} />
        </View>
      ) : !data || data.total === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="trophy-outline" size={64} color={c.text.muted} />
          <Text style={styles.emptyT}>No one on the board yet</Text>
          <Text style={styles.emptyS}>
            {scope === 'contacts' ? 'Invite friends to Split groups — their scores will appear here.' : 'Be the first mover in your cohort.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent.primary} />}
        >
          {/* Your Rank Hero Card — wrapped in ViewShot for sharing */}
          {data.you && (
            <ViewShot ref={shareRef} options={{ format: 'png', quality: 0.92 }} style={styles.shareContainer}>
              <View style={styles.heroCard}>
                <Text style={styles.heroLabel}>YOUR RANK</Text>
                <View style={styles.heroMainRow}>
                  <Text style={styles.heroRank}>#{data.you.rank}</Text>
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={styles.heroPercentile}>
                      Top {100 - (data.you.percentile ?? 0)}% of {data.total}
                    </Text>
                    <Text style={styles.heroScope}>
                      {scope === 'contacts' ? 'Among friends' : 'Globally'}
                    </Text>
                  </View>
                </View>
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatN}>{data.you.score}</Text>
                    <Text style={styles.heroStatL}>Score</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={[styles.heroStatN, { color: '#FFB020' }]}>🔥 {data.you.streak}</Text>
                    <Text style={styles.heroStatL}>Streak</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={[styles.heroStatN, { color: c.accent.moneyIn }]}>🪙 {data.you.coins}</Text>
                    <Text style={styles.heroStatL}>Coins</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={[styles.heroStatN, { color: c.accent.primaryLight }]}>🤝 {data.you.settlements}</Text>
                    <Text style={styles.heroStatL}>Splits</Text>
                  </View>
                </View>
                <Text style={styles.heroBrand}>🌱 MintU · Money moves minus the mess</Text>
              </View>
            </ViewShot>
          )}

          {/* Podium Top 3 */}
          {top3.length >= 2 && (
            <View style={styles.podiumWrap}>
              <Text style={styles.sectionTitle}>🏆 TOP 3</Text>
              <View style={styles.podium}>
                {/* Order the podium: #2, #1, #3 for visual pyramid */}
                {[top3[1], top3[0], top3[2]].filter(Boolean).map((e, i) => {
                  if (!e) return null;
                  const isFirst = e.rank === 1;
                  const medal = ['🥈', '🥇', '🥉'][i];
                  return (
                    <View key={e.id} style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}>
                      <Text style={styles.podiumMedal}>{medal}</Text>
                      <View style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst]}>
                        <Text style={styles.podiumAvatarT}>{(e.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.podiumName, e.is_me && { color: c.accent.primary }]} numberOfLines={1}>
                        {e.is_me ? 'You' : e.name}
                      </Text>
                      <Text style={styles.podiumScore}>{e.score}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Premium unlock teaser — only for non-Pro users, context-aware */}
          <PremiumUnlockTeaser context={scope === 'global' ? 'leaderboard_global' : 'streak_boost'} />

          {/* Rest of the list */}
          {rest.length > 0 && (
            <View style={styles.listWrap}>
              <Text style={styles.sectionTitle}>FULL RANKINGS</Text>
              {rest.map((e) => (
                <View key={e.id} style={[styles.row, e.is_me && styles.rowMe]}>
                  <Text style={[styles.rowRank, e.is_me && { color: c.accent.primary }]}>#{e.rank}</Text>
                  <View style={styles.rowAvatar}>
                    <Text style={styles.rowAvatarT}>{(e.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, e.is_me && { color: c.accent.primary, fontWeight: '800' }]} numberOfLines={1}>
                      {e.is_me ? 'You' : e.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      🔥 {e.streak}d · 🪙 {e.coins} · 🤝 {e.settlements} splits
                    </Text>
                  </View>
                  <Text style={styles.rowScore}>{e.score}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.footerNote}>
            Pull to refresh · Scores update every few minutes
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: c.bg.secondary, borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: c.text.muted, marginTop: 2, maxWidth: 260 },

  toggleRow: {
    flexDirection: 'row', gap: 8, padding: 12, backgroundColor: c.bg.secondary,
    borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  tog: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 999, backgroundColor: c.bg.elevated,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  togActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  togText: { fontSize: 13, fontWeight: '800', color: c.text.muted },
  togTextActive: { color: '#fff' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyT: { fontSize: 17, fontWeight: '800', color: c.text.primary, marginTop: 12 },
  emptyS: { fontSize: 13, color: c.text.secondary, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  // ── Hero Your Rank card (also the share capture target) ────────────
  shareContainer: { margin: 16, borderRadius: 20, overflow: 'hidden' },
  heroCard: {
    padding: 20, borderRadius: 20, backgroundColor: c.bg.secondary,
    borderWidth: 1.5, borderColor: c.accent.primary + '40',
    // Soft orange glow via box-shadow fallback (Android shadow props safe)
  },
  heroLabel: {
    fontSize: 10, fontWeight: '900', color: c.accent.primary, letterSpacing: 1.8,
    marginBottom: 10,
  },
  heroMainRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  heroRank: { fontSize: 64, fontWeight: '900', color: c.text.primary, letterSpacing: -3, lineHeight: 68 },
  heroPercentile: { fontSize: 16, fontWeight: '800', color: c.accent.primary },
  heroScope: { fontSize: 12, fontWeight: '700', color: c.text.muted, marginTop: 2 },
  heroStatsRow: {
    flexDirection: 'row', backgroundColor: c.bg.elevated, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: c.border.subtle, alignItems: 'center',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatN: { fontSize: 16, fontWeight: '900', color: c.text.primary },
  heroStatL: { fontSize: 9.5, fontWeight: '800', color: c.text.muted, marginTop: 3, letterSpacing: 0.4 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: c.border.subtle },
  heroBrand: {
    fontSize: 10, fontWeight: '800', color: c.text.muted, textAlign: 'center',
    letterSpacing: 0.6, marginTop: 14,
  },

  // ── Podium ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 11, fontWeight: '900', color: c.text.muted, letterSpacing: 1.5,
    marginLeft: 18, marginTop: 18, marginBottom: 10,
  },
  podiumWrap: { marginTop: 4 },
  podium: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  podiumItem: {
    flex: 1, alignItems: 'center', padding: 10, marginHorizontal: 4, borderRadius: 14,
    backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle,
    gap: 4, minHeight: 130,
  },
  podiumItemFirst: {
    borderColor: '#FFD54F', borderWidth: 2, backgroundColor: '#FFD54F' + '14',
    minHeight: 150, marginTop: -12,
  },
  podiumMedal: { fontSize: 28 },
  podiumAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent.primary + '24',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  podiumAvatarFirst: { backgroundColor: '#FFD54F40', borderWidth: 1.5, borderColor: '#FFD54F' },
  podiumAvatarT: { fontSize: 18, fontWeight: '900', color: c.text.primary },
  podiumName: { fontSize: 12, fontWeight: '800', color: c.text.primary, marginTop: 4, maxWidth: 90 },
  podiumScore: { fontSize: 15, fontWeight: '900', color: c.accent.primary, marginTop: 2 },

  // ── List ───────────────────────────────────────────────────────────
  listWrap: { marginHorizontal: 16, gap: 6, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
    backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle,
  },
  rowMe: { borderColor: c.accent.primary + '66', backgroundColor: c.accent.primary + '12' },
  rowRank: { fontSize: 13, fontWeight: '900', color: c.text.muted, minWidth: 32 },
  rowAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: c.accent.primary + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  rowAvatarT: { fontSize: 13, fontWeight: '900', color: c.text.primary },
  rowName: { fontSize: 13.5, fontWeight: '700', color: c.text.primary },
  rowMeta: { fontSize: 10.5, color: c.text.muted, marginTop: 2, fontWeight: '600' },
  rowScore: { fontSize: 16, fontWeight: '900', color: c.accent.primary, minWidth: 42, textAlign: 'right' },

  footerNote: {
    fontSize: 11, color: c.text.muted, textAlign: 'center', marginTop: 20, fontWeight: '600',
  },
}));
