import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Share, Linking, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from '../../utils/api';
import { useLangStore } from '../../store/langStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';
import ScoreCard from '../../components/ScoreCard';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export default function RewardsScreen() {
  const { lang } = useLangStore();
  const { user } = useAuthStore();
  const [referral, setReferral] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const [premium, setPremium] = useState<any>(null);
  const [paywall, setPaywall] = useState<any>(null);
  const [scoreCardData, setScoreCardData] = useState<any>(null);
  const [abGroup, setAbGroup] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [friendComparison, setFriendComparison] = useState<any>(null);
  const [enhancedRef, setEnhancedRef] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [refRes, gameRes, premRes, payRes, cardRes, abRes, lbRes, friendRes, enhRefRes] = await Promise.all([
        api.get('/referral/my-code'),
        api.get('/gamification/status'),
        api.get('/premium/status'),
        api.get('/premium/paywall-trigger'),
        api.get('/share/score-card'),
        api.get('/ab/paywall-group'),
        api.get('/leaderboard/savings'),
        api.get('/leaderboard/friends'),
        api.get('/referral/enhanced-status'),
      ]);
      setReferral(refRes.data);
      setGamification(gameRes.data);
      setPremium(premRes.data);
      setPaywall(payRes.data);
      setScoreCardData(cardRes.data);
      setAbGroup(abRes.data);
      setLeaderboard(lbRes.data);
      setFriendComparison(friendRes.data);
      setEnhancedRef(enhRefRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    fetchData();
    registerForPush();
  }, []);

  // Push notification registration
  const registerForPush = async () => {
    try {
      if (!Device.isDevice) return;
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      await api.post('/notifications/register-token', { push_token: token });
    } catch (e) { console.log('Push reg skip:', e); }
  };

  const shareWhatsApp = (text: string) => {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: text });
    });
  };

  const shareReferral = () => { if (referral?.share_text) shareWhatsApp(referral.share_text); };

  const trackABEvent = async (event: string) => {
    try { await api.post('/ab/track-event', { event, group: abGroup?.group, placement: abGroup?.placement }); } catch {}
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 100 }} /></SafeAreaView>;

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
        <Text style={s.pageTitle}>Rewards</Text>

        {/* LEADERBOARD — TOP POSITION */}
        {leaderboard && (
          <View style={s.leaderboardCard}>
            <View style={s.rankHero}>
              <View style={s.rankCircle}><Text style={s.rankNum}>#{leaderboard.user_rank || '?'}</Text></View>
              <View style={s.rankInfo}><Text style={s.rankTitle}>Your Rank</Text><Text style={s.rankPercentile}>Top {100 - (leaderboard.percentile || 50)}% of {leaderboard.total_users || 0} users</Text></View>
              <View style={s.rankScore}><Text style={s.rankScoreNum}>{leaderboard.user_score || 0}</Text><Text style={s.rankScoreLabel}>Score</Text></View>
            </View>
            <Text style={s.comparisonText}>{leaderboard.comparison_text}</Text>
            {(leaderboard.top_10 || []).slice(0, 5).map((entry: any, i: number) => (
              <View key={i} style={[s.lbRow, entry.is_me && s.lbRowMe]}>
                <Text style={[s.lbRank, i === 0 && { color: '#F59E0B' }, i === 1 && { color: '#94A3B8' }, i === 2 && { color: '#B45309' }]}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}</Text>
                <Text style={[s.lbName, entry.is_me && { fontWeight: '800', color: COLORS.accent.primary }]}>{entry.is_me ? 'You' : entry.name}</Text>
                <Text style={s.lbScore}>{entry.score}</Text>
                {entry.streak > 0 && <Text style={s.lbStreak}>🔥{entry.streak}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Streak */}
        <View style={s.streakCard}>
          <View style={s.streakRow}>
            <View style={s.streakCircle}>
              <Ionicons name="flame" size={28} color="#F59E0B" />
              <Text style={s.streakNum}>{streak}</Text>
            </View>
            <View style={s.streakInfo}>
              <Text style={s.streakTitle}>{streak} Day Streak</Text>
              <Text style={s.streakSub}>Keep tracking to grow your streak!</Text>
            </View>
          </View>
          <TouchableOpacity testID="share-score-btn" style={s.shareScoreBtn} onPress={() => shareWhatsApp(`My Money Score on MintU is ${user?.money_score || 50}/100! Track your finances: https://mintu.app`)}>
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text style={s.shareScoreTxt}>Share Score</Text>
          </TouchableOpacity>
        </View>

        {/* Instagram Story Card */}
        {scoreCardData && (
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={s.section}>Share Your Score</Text>
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
              <Text style={s.challengeOverline}>WEEKLY CHALLENGE</Text>
            </View>
            <Text style={s.challengeTitle}>{challenge.title}</Text>
            <Text style={s.challengeDesc}>{challenge.desc}</Text>
          </View>
        )}

        {/* Badges */}
        <Text style={s.section}>Badges Earned ({badges.length})</Text>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: SPACING.lg },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.5, marginBottom: SPACING.xxl },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text.secondary, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  // Streak
  streakCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#F59E0B25' },
  streakRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  streakCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F59E0B18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
  streakNum: { fontSize: 18, fontWeight: '800', color: '#F59E0B', marginTop: -4 },
  streakInfo: { flex: 1 },
  streakTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  streakSub: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
  shareScoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 12 },
  shareScoreTxt: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Challenge
  challengeCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm },
  challengeOverline: { fontSize: 11, fontWeight: '700', color: '#F59E0B', letterSpacing: 1 },
  challengeTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
  challengeDesc: { fontSize: 14, color: COLORS.text.secondary },
  // Badges
  badgeScroll: { marginBottom: SPACING.sm },
  badge: { alignItems: 'center', marginRight: 16, width: 80 },
  badgeLocked: { opacity: 0.5 },
  badgeIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  badgeIconLocked: { backgroundColor: COLORS.bg.secondary },
  badgeName: { fontSize: 11, fontWeight: '600', color: COLORS.text.primary, textAlign: 'center' },
  emptyBadge: { fontSize: 14, color: COLORS.text.muted, paddingVertical: 16 },
  // Referral
  referralCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.accent.primary + '25' },
  referralTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.lg },
  referralTiers: { marginBottom: SPACING.lg },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  tierComplete: { backgroundColor: COLORS.accent.primary + '08', borderRadius: 8, paddingHorizontal: 8 },
  tierText: { flex: 1, fontSize: 14, color: COLORS.text.secondary },
  codeBox: { backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.lg },
  codeLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted, letterSpacing: 1, marginBottom: 4 },
  codeText: { fontSize: 24, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 2 },
  shareRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  whatsappBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: RADIUS.full, paddingVertical: 14 },
  whatsappTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  copyBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bg.secondary, borderWidth: 1, borderColor: COLORS.border.subtle, justifyContent: 'center', alignItems: 'center' },
  referralCount: { fontSize: 13, color: COLORS.text.muted, textAlign: 'center' },
  // Premium
  premiumCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: '#E6510025' },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg },
  premiumTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary },
  abBadge: { backgroundColor: COLORS.accent.secondary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.md },
  abBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.accent.secondary },
  wasteAlert: { backgroundColor: COLORS.accent.moneyOut + '12', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  wasteText: { fontSize: 18, fontWeight: '700', color: COLORS.accent.moneyOut, marginBottom: 4 },
  wasteSub: { fontSize: 13, color: COLORS.text.secondary },
  pricingRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  pricingCard: { flex: 1, backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.subtle },
  pricingBest: { backgroundColor: '#E65100', borderColor: '#E65100' },
  bestBadge: { backgroundColor: '#FFD700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 6 },
  bestBadgeText: { fontSize: 9, fontWeight: '800', color: '#000' },
  pricingLabel: { fontSize: 12, color: COLORS.text.muted, marginBottom: 4 },
  pricingPrice: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary },
  pricingPeriod: { fontSize: 10, color: COLORS.text.muted, marginTop: 2 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: SPACING.md },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  featureDesc: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  // Enhanced Referral
  nextMilestone: { backgroundColor: COLORS.accent.primary + '10', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  milestoneText: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary, textAlign: 'center' },
  proDaysEarned: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accent.moneyIn + '12', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  proDaysText: { fontSize: 14, fontWeight: '600', color: COLORS.accent.moneyIn },
  // Leaderboard
  leaderboardCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: '#F59E0B25' },
  rankHero: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  rankCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F59E0B18', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  rankNum: { fontSize: 20, fontWeight: '800', color: '#F59E0B' },
  rankInfo: { flex: 1 },
  rankTitle: { fontSize: 13, color: COLORS.text.muted },
  rankPercentile: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  rankScore: { alignItems: 'center' },
  rankScoreNum: { fontSize: 26, fontWeight: '800', color: COLORS.accent.primary },
  rankScoreLabel: { fontSize: 10, color: COLORS.text.muted },
  comparisonText: { fontSize: 14, fontWeight: '600', color: COLORS.text.secondary, marginBottom: SPACING.lg, lineHeight: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border.subtle, gap: 10 },
  lbRowMe: { backgroundColor: COLORS.accent.primary + '08', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 },
  lbRank: { fontSize: 16, fontWeight: '700', width: 30, textAlign: 'center', color: COLORS.text.secondary },
  lbName: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  lbScore: { fontSize: 16, fontWeight: '700', color: COLORS.accent.primary },
  lbStreak: { fontSize: 12, color: '#F59E0B' },
  // Friend Comparison
  friendCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border.card },
  friendSummary: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: SPACING.lg },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  friendAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },
  friendTaunt: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  friendDiff: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  friendDiffText: { fontSize: 14, fontWeight: '700' },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: RADIUS.full, paddingVertical: 14, marginTop: SPACING.lg },
  challengeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
