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

        {/* Streak + Score Share */}
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

        {/* Referral — Enhanced with Pro Rewards */}
        <Text style={s.section}>Invite Friends — Earn Pro!</Text>
        <View style={s.referralCard}>
          <Text style={s.referralTitle}>Share MintU, Get Pro Days!</Text>
          {/* Enhanced reward tiers */}
          <View style={s.referralTiers}>
            {(enhancedRef?.reward_tiers || [
              { friends: 1, reward: '+3 days Pro', icon: 'star', unlocked: false },
              { friends: 3, reward: '+7 days Pro', icon: 'diamond', unlocked: false },
              { friends: 5, reward: '1 month Pro', icon: 'trophy', unlocked: false },
              { friends: 10, reward: 'Lifetime Pro', icon: 'crown', unlocked: false },
            ]).map((t: any, i: number) => (
              <View key={i} style={[s.tierRow, t.unlocked && s.tierComplete]}>
                <Ionicons name={t.icon as any} size={16} color={t.unlocked ? COLORS.accent.primary : COLORS.text.muted} />
                <Text style={[s.tierText, t.unlocked && { color: COLORS.accent.primary, fontWeight: '700' }]}>
                  {t.friends} friend{t.friends > 1 ? 's' : ''} → {t.reward}
                </Text>
                {t.unlocked && <Ionicons name="checkmark-circle" size={16} color={COLORS.accent.primary} />}
              </View>
            ))}
          </View>
          {/* Progress */}
          {enhancedRef?.next_milestone && enhancedRef.next_milestone.friends_needed > 0 && (
            <View style={s.nextMilestone}>
              <Text style={s.milestoneText}>
                {enhancedRef.next_milestone.friends_needed} more invite{enhancedRef.next_milestone.friends_needed > 1 ? 's' : ''} → {enhancedRef.next_milestone.reward}
              </Text>
            </View>
          )}
          {/* Pro days earned */}
          {(enhancedRef?.total_pro_days_earned || 0) > 0 && (
            <View style={s.proDaysEarned}>
              <Ionicons name="sparkles" size={16} color={COLORS.accent.primary} />
              <Text style={s.proDaysText}>🎉 You've earned {enhancedRef.total_pro_days_earned} Pro days!</Text>
            </View>
          )}
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Your Code</Text>
            <Text style={s.codeText}>{enhancedRef?.referral_code || referral?.referral_code}</Text>
          </View>
          <View style={s.shareRow}>
            <TouchableOpacity testID="share-whatsapp-btn" style={s.whatsappBtn} onPress={() => shareWhatsApp(enhancedRef?.whatsapp_text || referral?.share_text || '')}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={s.whatsappTxt}>Share on WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.copyBtn} onPress={() => { Share.share({ message: enhancedRef?.share_text || referral?.share_text || '' }); }}>
              <Ionicons name="copy" size={18} color={COLORS.text.primary} />
            </TouchableOpacity>
          </View>
          <Text style={s.referralCount}>{enhancedRef?.referral_count || referral?.referral_count || 0} friends invited</Text>
        </View>

        {/* Savings Leaderboard */}
        <Text style={s.section}>Leaderboard</Text>
        {leaderboard && (
          <View style={s.leaderboardCard}>
            {/* User's rank */}
            <View style={s.rankHero}>
              <View style={s.rankCircle}>
                <Text style={s.rankNum}>#{leaderboard.user_rank || '?'}</Text>
              </View>
              <View style={s.rankInfo}>
                <Text style={s.rankTitle}>Your Rank</Text>
                <Text style={s.rankPercentile}>Top {100 - (leaderboard.percentile || 50)}% of {leaderboard.total_users || 0} users</Text>
              </View>
              <View style={s.rankScore}>
                <Text style={s.rankScoreNum}>{leaderboard.user_score || 0}</Text>
                <Text style={s.rankScoreLabel}>Score</Text>
              </View>
            </View>
            <Text style={s.comparisonText}>{leaderboard.comparison_text}</Text>
            
            {/* Top 10 */}
            {(leaderboard.top_10 || []).slice(0, 5).map((entry: any, i: number) => (
              <View key={i} style={[s.lbRow, entry.is_me && s.lbRowMe]}>
                <Text style={[s.lbRank, i === 0 && { color: '#F59E0B' }, i === 1 && { color: '#94A3B8' }, i === 2 && { color: '#B45309' }]}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                </Text>
                <Text style={[s.lbName, entry.is_me && { fontWeight: '800', color: COLORS.accent.primary }]}>{entry.is_me ? 'You' : entry.name}</Text>
                <Text style={s.lbScore}>{entry.score}</Text>
                {entry.streak > 0 && <Text style={s.lbStreak}>🔥{entry.streak}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Friend Comparison */}
        {friendComparison && friendComparison.friends?.length > 0 && (
          <>
            <Text style={s.section}>vs Friends</Text>
            <View style={s.friendCard}>
              <Text style={s.friendSummary}>{friendComparison.summary}</Text>
              {friendComparison.friends.map((f: any, i: number) => (
                <View key={i} style={s.friendRow}>
                  <View style={[s.friendAvatar, { backgroundColor: f.ahead ? COLORS.accent.moneyOut + '15' : COLORS.accent.moneyIn + '15' }]}>
                    <Ionicons name="person" size={16} color={f.ahead ? COLORS.accent.moneyOut : COLORS.accent.moneyIn} />
                  </View>
                  <View style={s.friendInfo}>
                    <Text style={s.friendName}>{f.name}</Text>
                    <Text style={s.friendTaunt}>{f.taunt}</Text>
                  </View>
                  <View style={[s.friendDiff, { backgroundColor: f.ahead ? COLORS.accent.moneyIn + '15' : COLORS.accent.moneyOut + '15' }]}>
                    <Text style={[s.friendDiffText, { color: f.ahead ? COLORS.accent.moneyIn : COLORS.accent.moneyOut }]}>
                      {f.ahead ? '+' : ''}{f.diff}
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={s.challengeBtn} onPress={() => shareWhatsApp(friendComparison.challenge_text)}>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={s.challengeBtnText}>Challenge Friends</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Premium Upgrade - A/B tested placement */}
        {!premium?.is_premium && (
          <>
            <Text style={s.section}>Go Premium</Text>
            <View style={s.premiumCard}>
              <View style={s.premiumHeader}>
                <Ionicons name="diamond" size={24} color="#8B5CF6" />
                <Text style={s.premiumTitle}>MintU Premium</Text>
              </View>
              {abGroup?.group && (
                <View style={s.abBadge}>
                  <Text style={s.abBadgeText}>Test: {abGroup.placement === 'after_overspend' ? 'Smart Trigger' : 'Always Visible'}</Text>
                </View>
              )}
              {paywall?.waste_estimate > 0 && (
                <TouchableOpacity style={s.wasteAlert} onPress={() => trackABEvent('click')}>
                  <Text style={s.wasteText}>{paywall.hook_text}</Text>
                  <Text style={s.wasteSub}>{paywall.sub_text}</Text>
                </TouchableOpacity>
              )}
              {/* Pricing Cards */}
              <View style={s.pricingRow}>
                <TouchableOpacity style={s.pricingCard} onPress={() => Alert.alert('Coming Soon', 'Payment integration coming soon!')}>
                  <Text style={s.pricingLabel}>Intro</Text>
                  <Text style={s.pricingPrice}>{'\u20B9'}29</Text>
                  <Text style={s.pricingPeriod}>first month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pricingCard, s.pricingBest]}>
                  <View style={s.bestBadge}><Text style={s.bestBadgeText}>BEST VALUE</Text></View>
                  <Text style={[s.pricingLabel, { color: '#fff' }]}>Yearly</Text>
                  <Text style={[s.pricingPrice, { color: '#fff' }]}>{'\u20B9'}499</Text>
                  <Text style={[s.pricingPeriod, { color: 'rgba(255,255,255,0.7)' }]}>per year (58% off)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pricingCard}>
                  <Text style={s.pricingLabel}>Monthly</Text>
                  <Text style={s.pricingPrice}>{'\u20B9'}99</Text>
                  <Text style={s.pricingPeriod}>per month</Text>
                </TouchableOpacity>
              </View>
              {/* Features */}
              {paywall?.features?.slice(0, 4).map((f: any, i: number) => (
                <View key={i} style={s.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.accent.primary} />
                  <View style={s.featureInfo}>
                    <Text style={s.featureName}>{f.name}</Text>
                    <Text style={s.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
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
  premiumCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, borderWidth: 1, borderColor: '#8B5CF625' },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg },
  premiumTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary },
  abBadge: { backgroundColor: COLORS.accent.secondary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.md },
  abBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.accent.secondary },
  wasteAlert: { backgroundColor: COLORS.accent.moneyOut + '12', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  wasteText: { fontSize: 18, fontWeight: '700', color: COLORS.accent.moneyOut, marginBottom: 4 },
  wasteSub: { fontSize: 13, color: COLORS.text.secondary },
  pricingRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  pricingCard: { flex: 1, backgroundColor: COLORS.bg.primary, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.subtle },
  pricingBest: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
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
