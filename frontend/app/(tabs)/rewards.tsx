import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Share, Linking, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { trackAbEvent } from '../../services/rewards';
import { useLangStore } from '../../store/langStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import Skeleton from '../../components/ui/Skeleton';
import ScoreCard from '../../components/ScoreCard';
import { t } from '../../utils/i18n';
import useSwr from '../../hooks/useSwr';

// Push notification handler + registration now live in /hooks/usePushNotifications.ts
// (set up once globally in app/_layout.tsx).

export default function RewardsScreen() {
  const s = useStyles();
  const { lang } = useLangStore();
  const { user } = useAuthStore();

  // ── SWR data layer (Round 26) ───────────────────────────────────────
  // 9 parallel endpoints migrated to declarative useSwr hooks. All share
  // a 30s default TTL so returning to the tab serves cache instantly.
  const gate = { paused: !user?.id };
  const { data: referral, refetch: refRef } = useSwr<any>('/referral/my-code', { ttlMs: 60_000, ...gate });
  const { data: enhancedRef, refetch: refEnhRef } = useSwr<any>('/referral/enhanced-status', { ttlMs: 60_000, ...gate });
  const { data: gamification, refetch: refGame } = useSwr<any>('/gamification/status', { ttlMs: 30_000, ...gate });
  const { data: premium } = useSwr<any>('/premium/status', { ttlMs: 60_000, ...gate });
  const { data: paywall } = useSwr<any>('/premium/paywall-trigger', { ttlMs: 60_000, ...gate });
  const { data: scoreCardData } = useSwr<any>('/share/score-card', { ttlMs: 60_000, ...gate });
  const { data: abGroup } = useSwr<any>('/ab/paywall-group', { ttlMs: 60_000, ...gate });
  const { data: leaderboard, refetch: refLb } = useSwr<any>('/leaderboard/savings', { ttlMs: 30_000, ...gate });
  const { data: friendComparison, refetch: refFriends } = useSwr<any>('/leaderboard/friends', { ttlMs: 30_000, ...gate });

  // Loading gate — skeleton stays until the three must-have cards resolve.
  const loading = referral == null && gamification == null && premium == null;
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      await Promise.all([refRef(), refEnhRef(), refGame(), refLb(), refFriends()]);
    } finally { setRefreshing(false); }
  };

  // SWR auto-fetches on mount; the manual useEffect is redundant now.
  // Keeping `fetchData` available for pull-to-refresh / post-mutation
  // revalidations below.

  // Push notification registration moved to global hook in app/_layout.tsx
  // See hooks/usePushNotifications.ts — registers once globally with idempotency.

  const shareWhatsApp = (text: string) => {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: text });
    });
  };

  const shareReferral = () => { if (referral?.share_text) shareWhatsApp(referral.share_text); };

  const trackABEvent = async (event: string) => {
    trackAbEvent(event, abGroup?.group, abGroup?.placement);
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={{ padding: 20, gap: 10 }}>
        <Skeleton.Box w="100%" h={120} radius={18} />
        <Skeleton.Box w="100%" h={90} radius={16} />
        <Skeleton.Box w="100%" h={60} radius={12} />
        <Skeleton.Box w="100%" h={60} radius={12} />
        <Skeleton.Box w="100%" h={60} radius={12} />
      </View>
    </SafeAreaView>
  );

  const streak = gamification?.streak || 0;
  const badges = gamification?.badges_earned || [];
  const availBadges = gamification?.badges_available || [];
  const challenge = gamification?.weekly_challenge;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        testID="rewards-screen"
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.accent.primary} />}
      >
        <Text style={s.pageTitle}>{t('rewards', lang)}</Text>

        {/* Streak */}
        <View style={s.streakCard}>
          <View style={s.streakRow}>
            <View style={s.streakCircle}>
              <Ionicons name="flame" size={28} color="#F59E0B" />
              <Text style={s.streakNum}>{streak}</Text>
            </View>
            <View style={s.streakInfo}>
              <Text style={s.streakTitle}>{t('streak_days', lang, { n: streak })}</Text>
              <Text style={s.streakSub}>{t('keep_tracking', lang)}</Text>
            </View>
          </View>
          <TouchableOpacity testID="share-score-btn" style={s.shareScoreBtn} onPress={() => shareWhatsApp(`My Money Score on MintU is ${user?.money_score || 50}/100! Track your finances: https://mintu.app`)}>
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text style={s.shareScoreTxt}>{t('share_score', lang)}</Text>
          </TouchableOpacity>
        </View>

        {/* Instagram Story Card */}
        {scoreCardData && (
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={s.section}>{t('share_your_score', lang)}</Text>
            <ScoreCard
              name={scoreCardData.name}
              score={scoreCardData.score}
              streak={scoreCardData.streak}
              totalSaved={scoreCardData.total_saved}
              month={scoreCardData.month}
            />
          </View>
        )}

        {/* Weekly Challenge */}
        {challenge && (
          <View style={s.challengeCard}>
            <View style={s.challengeHeader}>
              <Ionicons name="trophy" size={18} color="#F59E0B" />
              <Text style={s.challengeOverline}>{t('weekly_challenge', lang).toUpperCase()}</Text>
            </View>
            <Text style={s.challengeTitle}>{challenge.title}</Text>
            <Text style={s.challengeDesc}>{challenge.desc}</Text>
          </View>
        )}

        {/* Badges */}
        <Text style={s.section}>{t('badges_earned', lang)} ({badges.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.badgeScroll}>
          {badges.map((b: any) => (
            <View key={b.id} style={s.badge}>
              <View style={s.badgeIcon}><Ionicons name={b.icon as any} size={24} color={COLORS.accent.primary} /></View>
              <Text style={s.badgeName}>{b.name}</Text>
            </View>
          ))}
          {badges.length === 0 && <Text style={s.emptyBadge}>Start tracking to earn badges!</Text>}
        </ScrollView>

        {availBadges.length > 0 && (
          <>
            <Text style={s.section}>Locked Badges ({availBadges.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.badgeScroll}>
              {availBadges.slice(0, 5).map((b: any) => (
                <View key={b.id} style={[s.badge, s.badgeLocked]}>
                  <View style={[s.badgeIcon, s.badgeIconLocked]}><Ionicons name={b.icon as any} size={24} color={COLORS.text.muted} /></View>
                  <Text style={[s.badgeName, { color: COLORS.text.muted }]}>{b.name}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { padding: SPACING.lg },
  pageTitle: { fontSize: 28, fontWeight: '800', color: c.text.primary, letterSpacing: -0.5, marginBottom: SPACING.xxl },
  section: { fontSize: 16, fontWeight: '700', color: c.text.secondary, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  // Streak
  streakCard: { backgroundColor: c.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#F59E0B25' },
  streakRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  streakCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F59E0B18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
  streakNum: { fontSize: 18, fontWeight: '800', color: '#F59E0B', marginTop: -4 },
  streakInfo: { flex: 1 },
  streakTitle: { fontSize: 20, fontWeight: '700', color: c.text.primary },
  streakSub: { fontSize: 13, color: c.text.muted, marginTop: 2 },
  shareScoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary, borderRadius: RADIUS.full, paddingVertical: 12 },
  shareScoreTxt: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Challenge
  challengeCard: { backgroundColor: c.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: c.border.card },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  challengeOverline: { fontSize: 11, fontWeight: '700', color: '#F59E0B', letterSpacing: 1 },
  challengeTitle: { fontSize: 18, fontWeight: '700', color: c.text.primary, marginBottom: 4 },
  challengeDesc: { fontSize: 14, color: c.text.secondary },
  // Badges
  badgeScroll: { marginBottom: SPACING.sm },
  badge: { alignItems: 'center', marginRight: 16, width: 80 },
  badgeLocked: { opacity: 0.5 },
  badgeIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent.primary + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  badgeIconLocked: { backgroundColor: c.bg.secondary },
  badgeName: { fontSize: 11, fontWeight: '600', color: c.text.primary, textAlign: 'center' },
  emptyBadge: { fontSize: 14, color: c.text.muted, paddingVertical: 16 },
  // Referral
  // Premium
  // Enhanced Referral
  // Leaderboard
  leaderboardCard: { backgroundColor: c.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: '#F59E0B25' },
  rankHero: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  rankCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F59E0B18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  rankNum: { fontSize: 20, fontWeight: '800', color: '#F59E0B' },
  rankInfo: { flex: 1 },
  rankTitle: { fontSize: 13, color: c.text.muted },
  rankPercentile: { fontSize: 14, fontWeight: '700', color: c.text.primary },
  rankScore: { alignItems: 'center' },
  rankScoreNum: { fontSize: 26, fontWeight: '800', color: c.accent.primary },
  rankScoreLabel: { fontSize: 10, color: c.text.muted },
  comparisonText: { fontSize: 14, fontWeight: '600', color: c.text.secondary, marginBottom: SPACING.lg, lineHeight: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border.subtle, gap: 10 },
  lbRowMe: { backgroundColor: c.accent.primary + '08', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbRank: { fontSize: 16, fontWeight: '700', width: 30, textAlign: 'center', color: c.text.secondary },
  lbName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text.primary },
  lbScore: { fontSize: 16, fontWeight: '700', color: c.accent.primary },
  lbStreak: { fontSize: 12, color: '#F59E0B' },
  // Friend Comparison
}));
