import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Share, Linking, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useLangStore } from '../../store/langStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

export default function RewardsScreen() {
  const { lang } = useLangStore();
  const { user } = useAuthStore();
  const [referral, setReferral] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const [premium, setPremium] = useState<any>(null);
  const [paywall, setPaywall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const fetchData = async () => {
    try {
      const [refRes, gameRes, premRes, payRes] = await Promise.all([
        api.get('/referral/my-code'),
        api.get('/gamification/status'),
        api.get('/premium/status'),
        api.get('/premium/paywall-trigger'),
      ]);
      setReferral(refRes.data);
      setGamification(gameRes.data);
      setPremium(premRes.data);
      setPaywall(payRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const shareWhatsApp = (text: string) => {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: text });
    });
  };

  const shareReferral = () => {
    if (referral?.share_text) shareWhatsApp(referral.share_text);
  };

  const shareMoneyScore = () => {
    const score = user?.money_score || 50;
    const text = `My Money Score on MintU is ${score}/100! 🔥\nTrack your finances and beat my score!\nDownload: https://mintu.app`;
    shareWhatsApp(text);
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
          <TouchableOpacity testID="share-score-btn" style={s.shareScoreBtn} onPress={shareMoneyScore}>
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text style={s.shareScoreTxt}>Share Score</Text>
          </TouchableOpacity>
        </View>

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

        {/* Referral */}
        <Text style={s.section}>Invite Friends</Text>
        <View style={s.referralCard}>
          <Text style={s.referralTitle}>Share MintU, Earn Premium!</Text>
          <View style={s.referralTiers}>
            {[
              { n: 1, r: 'Advanced insights (1 week)', icon: 'sparkles' },
              { n: 3, r: 'Premium (1 month)', icon: 'diamond' },
              { n: 10, r: 'Lifetime badge + perks', icon: 'star' },
            ].map((t, i) => (
              <View key={i} style={[s.tierRow, (referral?.referral_count || 0) >= t.n && s.tierComplete]}>
                <Ionicons name={t.icon as any} size={16} color={(referral?.referral_count || 0) >= t.n ? COLORS.accent.primary : COLORS.text.muted} />
                <Text style={[s.tierText, (referral?.referral_count || 0) >= t.n && { color: COLORS.accent.primary }]}>
                  {t.n} invite{t.n > 1 ? 's' : ''} → {t.r}
                </Text>
                {(referral?.referral_count || 0) >= t.n && <Ionicons name="checkmark-circle" size={16} color={COLORS.accent.primary} />}
              </View>
            ))}
          </View>
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Your Code</Text>
            <Text style={s.codeText}>{referral?.referral_code}</Text>
          </View>
          <View style={s.shareRow}>
            <TouchableOpacity testID="share-whatsapp-btn" style={s.whatsappBtn} onPress={shareReferral}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={s.whatsappTxt}>Share on WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.copyBtn} onPress={() => { Share.share({ message: referral?.share_text || '' }); }}>
              <Ionicons name="copy" size={18} color={COLORS.text.primary} />
            </TouchableOpacity>
          </View>
          <Text style={s.referralCount}>{referral?.referral_count || 0} friends invited</Text>
        </View>

        {/* Premium Upgrade */}
        {!premium?.is_premium && (
          <>
            <Text style={s.section}>Go Premium</Text>
            <View style={s.premiumCard}>
              <View style={s.premiumHeader}>
                <Ionicons name="diamond" size={24} color="#8B5CF6" />
                <Text style={s.premiumTitle}>MintU Premium</Text>
              </View>
              {paywall?.waste_estimate > 0 && (
                <View style={s.wasteAlert}>
                  <Text style={s.wasteText}>{paywall.hook_text}</Text>
                  <Text style={s.wasteSub}>{paywall.sub_text}</Text>
                </View>
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
});
