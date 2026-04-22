/**
 * ProfileScreen — MintU "Financial Identity Hub" (Gamified 9-part layout)
 *
 * Structure (top → bottom):
 *   1. Hero Card                    (ProfileHeroV2 — Top X%, Money Score, streak, coins)
 *   2. Progression Strip            (streak / badges / challenges chips)
 *   3. Challenges                   (WeeklyChallenge — active weekly mission)
 *   4. Insights Card                (AI-coded insight chips)
 *   5. Compact Leaderboard          (top 3 + view all)
 *   6. Rewards & Badges Preview     (AccordionSection wrapping RewardsHub + BadgesSection)
 *   7. Invite & Earn                (InviteEarnStrip)
 *   8. Premium Upsell               (PremiumUpsellInline)
 *   9. Collapsed Settings           (AccordionSections + logout + danger zone)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  Modal, FlatList, TextInput, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t, LANGUAGES } from '../../utils/i18n';
import api from '../../utils/api';
import { fetchUpi, fetchAvatar, updateProfile, uploadAvatar } from '../../services/user';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import Toast from 'react-native-toast-message';
import { shareSmart, copyToClipboard, shareImageSmart } from '../../utils/share';
import HelpSupport from '../../components/HelpSupport';
import AboutMintU from '../../components/AboutMintU';
import ShareScoreCard from '../../components/profile/ShareScoreCard';
import BadgesSection from '../../components/profile/BadgesSection';
import WeeklyChallenge from '../../components/profile/WeeklyChallenge';
import ProfileHeroV2 from '../../components/profile/ProfileHeroV2';
import ProgressionStrip from '../../components/profile/ProgressionStrip';
import InsightsCard from '../../components/profile/InsightsCard';
import CompactLeaderboard from '../../components/profile/CompactLeaderboard';
import InviteEarnStrip from '../../components/profile/InviteEarnStrip';
import PremiumUpsellInline from '../../components/profile/PremiumUpsellInline';
import ScoreBoostModal from '../../components/profile/ScoreBoostModal';
import AccordionSection from '../../components/profile/AccordionSection';
import ThemeToggle from '../../components/profile/ThemeToggle';
import FinancialSnapshot from '../../components/profile/FinancialSnapshot';
import PaymentMethodsV2 from '../../components/profile/PaymentMethodsV2';
import NotificationSettings from '../../components/profile/NotificationSettings';
import DeleteAccountSection from '../../components/profile/DeleteAccountSection';
import BudgetAchievements from '../../components/budget/BudgetAchievements';
import RewardsHub from '../../components/profile/RewardsHub';
import AuthTransitionOverlay from '../../components/auth/AuthTransitionOverlay';
import ReferralDashboard from '../../components/profile/ReferralDashboard';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { sendTestPush } from '../../hooks/usePushNotifications';
import TapTile from '../../components/ui/TapTile';

export default function ProfileScreen() {
  const s = useStyles();
  const { user, logout, avatar, setAvatar } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [referral, setReferral] = useState<any>(null);
  const [refExpanded, setRefExpanded] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [gamiStatus, setGamiStatus] = useState<any>(null);
  const [rewardsSummary, setRewardsSummary] = useState<any>(null);
  const [identity, setIdentity] = useState<any>(null);
  const [scoreBoostVisible, setScoreBoostVisible] = useState(false);
  const [logoutAnim, setLogoutAnim] = useState(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const scoreCardRef = useRef<View>(null);

  const loadData = useCallback(async () => {
    try {
      const [upiRes, avatarRes, refRes, statsRes, gamiRes, rewardsRes, identityRes] = await Promise.all([
        fetchUpi().then(data => ({ data })).catch(() => ({ data: {} })),
        fetchAvatar().then(data => ({ data })).catch(() => ({ data: {} })),
        api.get('/referral/enhanced-status').catch(() =>
          api.get('/referral/my-code').catch(() => ({ data: null }))
        ),
        api.get('/analytics/summary').catch(() => ({ data: null })),
        api.get('/gamification/status').catch(() => ({ data: null })),
        api.get('/rewards/summary').catch(() => ({ data: null })),
        api.get('/profile/identity').catch(() => ({ data: null })),
      ]);
      setUpiId(upiRes.data?.upi_id || '');
      if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
      if (refRes.data) setReferral(refRes.data);
      if (statsRes.data) setStats(statsRes.data);
      if (gamiRes.data) setGamiStatus(gamiRes.data);
      if (rewardsRes.data) setRewardsSummary(rewardsRes.data);
      if (identityRes.data) setIdentity(identityRes.data);
    } catch { /* noop */ } finally { setLoading(false); setRefreshing(false); }
  }, [setAvatar]);

  const realStats = React.useMemo(() => {
    if (!stats) return null;
    const income = Number(stats.total_income || 0);
    const expense = Number(stats.total_expense || 0);
    const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;
    const breakdown = stats.category_breakdown || {};
    const topCat = Object.entries(breakdown).sort((a: any, b: any) => b[1] - a[1])[0];
    return {
      monthlySpend: expense,
      topCategory: topCat ? { name: topCat[0], amount: Number(topCat[1]) } : null,
      savingsRate,
      transactionCount: Number(stats.transaction_count || 0),
      balance: Number(stats.balance || 0),
    };
  }, [stats]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(React.useCallback(() => { loadData(); }, [loadData]));

  const confirmThen = (title: string, msg: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) onYes();
      return;
    }
    Alert.alert(title, msg, [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('logout', lang), style: 'destructive', onPress: onYes },
    ]);
  };

  const handleLogout = () => confirmThen(
    t('logout', lang),
    t('logout_confirm', lang),
    async () => { setLogoutAnim(true); await logout(); },
  );

  const updateName = async () => {
    if (!editName.trim()) return;
    try {
      await updateProfile({ name: editName.trim() });
      Toast.show({ type: 'success', text1: 'Name Updated!' });
      setEditNameVisible(false);
    } catch { Toast.show({ type: 'error', text1: 'Error' }); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64);
      try { await uploadAvatar(b64); Toast.show({ type: 'success', text1: 'Photo Updated!' }); } catch { /* noop */ }
    }
  };

  const removeAvatar = () => Alert.alert('Remove Photo?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      await setAvatar('');
      try { await uploadAvatar(''); } catch { /* noop */ }
    } },
  ]);

  const copyCode = async () => {
    if (!referral?.referral_code) return;
    await copyToClipboard(referral.referral_code, `Code ${referral.referral_code} copied!`);
  };

  const shareWhatsApp = async () => {
    const text = referral?.whatsapp_text || referral?.share_text || '';
    await shareSmart({ message: text, title: 'MintU Referral', preferWhatsApp: true });
  };

  const shareGeneric = async () => {
    const text = referral?.share_text || `Join me on MintU and we both earn ₹50! ${referral?.referral_code ? `Code: ${referral.referral_code}` : ''}`;
    await shareSmart({ message: text, title: 'MintU' });
  };

  const openShareScoreCard = () => setShareCardVisible(true);

  const handleShareAsImage = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(scoreCardRef, {
        format: 'png', quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        ...(Platform.OS !== 'web' ? { pixelRatio: 3.2 } : {}),
      } as any);
      const score = user?.money_score || 0;
      const fallback = `🚀 My MintU Money Score is ${score}/100!\n\nTrack your expenses, split bills, and earn rewards.\nDownload: https://mintu.app ${referral?.referral_code ? `\nUse code: ${referral.referral_code}` : ''}`;
      await shareImageSmart({ uri, fallbackText: fallback, filename: `mintu-score-${score}.png` });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not create image', text2: 'Sharing text instead…' });
      const score = user?.money_score || 0;
      await shareSmart({
        message: `🚀 My MintU Money Score is ${score}/100! Try it: https://mintu.app`,
        title: 'My MintU Score',
      });
    } finally { setSharing(false); }
  };

  const handleShareAsText = async () => {
    try {
      const r = await api.get('/referral/money-score-card');
      await shareSmart({
        message: r.data?.share_text || r.data?.whatsapp_text || `My MintU Money Score: ${user?.money_score || 0}/100`,
        title: 'My MintU Score',
      });
    } catch {
      const score = user?.money_score || 0;
      await shareSmart({
        message: `🚀 My MintU Money Score is ${score}/100! Try it: https://mintu.app`,
        title: 'My MintU Score',
      });
    }
  };

  const currentLang = LANGUAGES.find(l => l.code === lang);
  const score = user?.money_score || 0;
  const tier =
    score >= 80 ? 'Elite Saver' :
    score >= 60 ? 'Smart Spender' :
    score >= 40 ? 'Growing Saver' : 'Just Starting';
  const tierEmoji = score >= 80 ? '🏆' : score >= 60 ? '💪' : score >= 40 ? '⚡' : '🌱';

  const streak = identity?.streak ?? gamiStatus?.streak ?? 0;
  const badgesEarned = identity?.badges_earned ?? gamiStatus?.badges_earned?.length ?? 0;
  const badgesTotal = identity?.badges_total ?? ((badgesEarned + (gamiStatus?.badges_available?.length || 0)) || 12);
  const coinsBalance = identity?.coins_balance ?? rewardsSummary?.coins_balance ?? (user as any)?.coins_balance ?? 0;
  const monthlyDelta = identity?.monthly_score_delta ?? (user as any)?.monthly_score_delta ?? (gamiStatus as any)?.monthly_delta ?? 0;
  const topPercent = identity?.top_percent;
  const isPro = !!(identity?.is_premium || (user as any)?.is_premium || (user as any)?.is_pro);

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.accent.primary}
          />
        }
      >
        {/* 1. HERO CARD — Financial Identity */}
        <ProfileHeroV2
          user={user}
          avatar={avatar}
          streak={streak}
          coins={coinsBalance}
          monthlyDelta={Number(monthlyDelta) || 0}
          topPercent={topPercent}
          onEditName={() => { setEditName(user?.name || ''); setEditNameVisible(true); }}
          onPickAvatar={pickAvatar}
          onRemoveAvatar={removeAvatar}
          onShareScore={openShareScoreCard}
          onImproveScore={() => setScoreBoostVisible(true)}
        />

        {/* 2. PROGRESSION STRIP */}
        <View style={s.stripWrap}>
          <ProgressionStrip
            streak={streak}
            streakTarget={Math.max(30, Math.ceil((streak + 7) / 10) * 10)}
            badgesEarned={badgesEarned}
            badgesTotal={badgesTotal}
            activeChallenges={gamiStatus?.weekly_challenge ? 1 : 0}
            challengeTitle={gamiStatus?.weekly_challenge?.title}
            onStreakPress={() => router.push('/(tabs)/rewards' as any)}
            onBadgesPress={() => router.push('/(tabs)/rewards' as any)}
            onChallengesPress={() => router.push('/(tabs)/rewards' as any)}
          />
        </View>

        {/* 3. CHALLENGES */}
        <WeeklyChallenge challenge={gamiStatus?.weekly_challenge} streak={streak} />

        {/* 4. INSIGHTS CARD */}
        <InsightsCard stats={realStats} score={score} />

        {/* Financial Snapshot — quick reference */}
        <FinancialSnapshot stats={realStats} />

        {/* 5. COMPACT LEADERBOARD */}
        <View style={{ marginBottom: 14 }}>
          <CompactLeaderboard />
        </View>

        {/* 6. REWARDS & BADGES PREVIEW (collapsed) */}
        <AccordionSection
          icon="gift"
          iconTint="#EC4899"
          title="Rewards & Badges"
          subtitle={`${badgesEarned} earned · ${coinsBalance.toLocaleString('en-IN')} coins`}
          badgeCount={badgesEarned}
        >
          <BadgesSection onStatusLoaded={setGamiStatus} />
          <View style={{ height: 10 }} />
          <RewardsHub />
        </AccordionSection>

        {/* 7. INVITE & EARN */}
        <InviteEarnStrip
          referralCount={referral?.referral_count || 0}
          referralCode={referral?.referral_code}
          onShare={shareGeneric}
          onOpenDashboard={() => setRefExpanded(true)}
        />

        {/* 8. PREMIUM UPSELL */}
        <View style={{ marginBottom: 16 }}>
          <PremiumUpsellInline isPro={isPro} />
        </View>

        {/* 9. COLLAPSED SETTINGS */}
        <Text style={s.secTitle}>Settings</Text>

        <AccordionSection
          icon="ribbon"
          iconTint="#F59E0B"
          title="Achievements"
          subtitle="Budget streaks & milestone badges"
        >
          <BudgetAchievements />
        </AccordionSection>

        <AccordionSection
          icon="flag"
          iconTint="#10B981"
          title="My Goals"
          subtitle="Savings goals with progress rings"
        >
          <TouchableOpacity
            style={s.inlineRow}
            onPress={() => router.push('/goals' as any)}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="flag" size={16} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>Open Goals Dashboard</Text>
              <Text style={s.inlineSub}>Create, edit & track savings goals</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </AccordionSection>

        <AccordionSection
          icon="card"
          iconTint="#10B981"
          title="Payment Methods"
          subtitle="UPI · Cards · Wallets · Net Banking"
        >
          <PaymentMethodsV2 />
        </AccordionSection>

        <AccordionSection
          icon="color-palette"
          iconTint="#8B5CF6"
          title="Preferences"
          subtitle="Theme & language"
        >
          <ThemeToggle />
          <TouchableOpacity
            style={s.inlineRow}
            onPress={() => setLangModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: COLORS.accent.primary + '1F' }]}>
              <Ionicons name="language" size={16} color={COLORS.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>{t('language', lang)}</Text>
              <Text style={[s.inlineSub, { color: COLORS.accent.primary }]}>{currentLang?.nativeName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </AccordionSection>

        <AccordionSection
          icon="notifications"
          iconTint="#F56E1E"
          title="Notifications"
          subtitle="Daily nudges & weekly reports"
        >
          <NotificationSettings />
          <TouchableOpacity
            style={s.inlineRow}
            onPress={async () => {
              const { sent, message } = await sendTestPush();
              Toast.show({ type: sent ? 'success' : 'info', text1: sent ? 'Test push sent!' : 'Push test', text2: message });
            }}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: '#F59E0B1F' }]}>
              <Ionicons name="send" size={16} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>Send test notification</Text>
              <Text style={s.inlineSub}>Verify push setup on your device</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </AccordionSection>

        <AccordionSection
          icon="link"
          iconTint="#EA4335"
          title="Connected Accounts"
          subtitle="Gmail auto-import · UPI"
        >
          <TouchableOpacity
            style={s.inlineRow}
            onPress={() => router.push('/gmail' as any)}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: '#EA433518' }]}>
              <Ionicons name="mail-outline" size={16} color="#EA4335" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>Gmail Auto-Import</Text>
              <Text style={s.inlineSub}>Auto-track bank transactions from inbox</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </AccordionSection>

        <AccordionSection
          icon="help-circle"
          iconTint="#0EA5E9"
          title="Help & About"
          subtitle="FAQs · feedback · app version"
        >
          <TouchableOpacity
            style={s.inlineRow}
            onPress={() => setHelpVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: '#38BDF81F' }]}>
              <Ionicons name="help-circle-outline" size={16} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>{t('help_support', lang)}</Text>
              <Text style={s.inlineSub}>FAQs, bug reports & feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.inlineRow}
            onPress={() => router.push('/about' as any)}
            activeOpacity={0.7}
          >
            <View style={[s.inlineIcon, { backgroundColor: '#8B5CF61F' }]}>
              <Ionicons name="information-circle-outline" size={16} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.inlineTitle}>About MintU</Text>
              <Text style={s.inlineSub}>Features · Why MintU · v1.0.0</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} />
          </TouchableOpacity>
        </AccordionSection>

        {/* Logout */}
        <TapTile style={s.logoutBtn} onPress={handleLogout} feedback="medium" testID="profile-logout">
          <Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} />
          <Text style={s.logoutText}>{t('logout', lang)}</Text>
        </TapTile>

        {/* Danger zone */}
        <DeleteAccountSection />

        {/* Trust Signals */}
        <View style={s.trustSignalsRow}>
          <View style={s.trustSig}>
            <Text style={s.trustSigEmoji}>🔒</Text>
            <Text style={s.trustSigText}>Bank-grade{'\n'}encryption</Text>
          </View>
          <View style={s.trustSig}>
            <Text style={s.trustSigEmoji}>🇮🇳</Text>
            <Text style={s.trustSigText}>Data stored{'\n'}in India</Text>
          </View>
          <View style={s.trustSig}>
            <Text style={s.trustSigEmoji}>✅</Text>
            <Text style={s.trustSigText}>RBI-aligned{'\n'}practices</Text>
          </View>
        </View>
        <View style={s.trustBox}>
          <Ionicons name="shield-checkmark" size={14} color="#10B981" />
          <Text style={s.trustText}>Aligned with RBI data localization guidelines · India servers</Text>
        </View>
        <Text style={s.version}>v1.0.0 · Made with ❤️ in India</Text>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Modals ── */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={s.mBg}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={s.sheetTitle}>{t('language', lang)}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <FlatList data={LANGUAGES} keyExtractor={i => i.code} renderItem={({ item }) => (
              <TouchableOpacity style={[s.langOpt, lang === item.code && s.langOn]} onPress={() => { setLang(item.code); setLangModalVisible(false); }}>
                <View>
                  <Text style={s.langNative}>{item.nativeName}</Text>
                  <Text style={s.langEn}>{item.name}</Text>
                </View>
                {lang === item.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.primary} />}
              </TouchableOpacity>
            )} />
          </View>
        </View>
      </Modal>

      <Modal visible={editNameVisible} animationType="fade" transparent>
        <View style={s.mBg}>
          <View style={[s.sheet, { maxHeight: 260 }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Edit Name</Text>
            <TextInput
              style={s.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor={COLORS.text.muted}
              autoFocus
            />
            <TouchableOpacity style={s.saveBtn} onPress={updateName}>
              <Text style={s.saveBtnT}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditNameVisible(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={helpVisible} animationType="slide"><HelpSupport onClose={() => setHelpVisible(false)} /></Modal>
      <Modal visible={aboutVisible} animationType="slide"><AboutMintU onClose={() => setAboutVisible(false)} /></Modal>

      {/* Referral dashboard modal */}
      <Modal visible={refExpanded} animationType="slide" onRequestClose={() => setRefExpanded(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg.primary }}>
          <View style={s.referralHeader}>
            <TouchableOpacity onPress={() => setRefExpanded(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
            <Text style={s.referralHeaderTitle}>Invite & Earn</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <ReferralDashboard
              referral={referral}
              expanded={true}
              onToggle={() => {}}
              onCopyCode={copyCode}
              onShareWhatsApp={shareWhatsApp}
              onShareGeneric={shareGeneric}
              onShareScoreCard={openShareScoreCard}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Share Score Card Image Preview */}
      <Modal
        visible={shareCardVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setShareCardVisible(false)}
      >
        <View style={s.shareBg}>
          <ScrollView contentContainerStyle={s.shareScroll} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={s.shareClose}
              onPress={() => setShareCardVisible(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <Text style={s.shareTitle}>Flex your score! 🔥</Text>
            <Text style={s.shareSub}>Share as image on WhatsApp, Instagram Story, or anywhere</Text>

            <ViewShot
              ref={scoreCardRef as any}
              options={{ format: 'png', quality: 1, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' }}
              style={{ marginTop: 16, marginBottom: 20 }}
            >
              <ShareScoreCard
                data={{
                  name: user?.name || 'User',
                  avatar: avatar || undefined,
                  score,
                  tier,
                  tierEmoji,
                  streak,
                  savingsRate: realStats?.savingsRate || 0,
                  coins: coinsBalance || badgesEarned * 10,
                  referralCode: referral?.referral_code,
                  monthlyDelta: Number(monthlyDelta) || 0,
                }}
              />
            </ViewShot>

            <TouchableOpacity
              style={[s.shareActionPrimary, sharing && { opacity: 0.7 }]}
              onPress={handleShareAsImage}
              disabled={sharing}
              activeOpacity={0.8}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="image" size={20} color="#fff" />
                  <Text style={s.shareActionPrimaryText}>Share as Image</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.shareActionSecondary}
              onPress={handleShareAsText}
              activeOpacity={0.8}
            >
              <Ionicons name="text" size={18} color="#fff" />
              <Text style={s.shareActionSecondaryText}>Share as Text instead</Text>
            </TouchableOpacity>

            <Text style={s.shareHint}>
              {Platform.OS === 'web'
                ? '💡 On web: image downloads to your device, then upload to WhatsApp/Instagram'
                : '💡 Opens your device share sheet — pick WhatsApp, Instagram, Photos, etc.'}
            </Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Score Boost Modal */}
      <ScoreBoostModal
        visible={scoreBoostVisible}
        onClose={() => setScoreBoostVisible(false)}
        currentScore={score}
      />

      {logoutAnim && (
        <AuthTransitionOverlay
          variant="locking"
          onDone={() => { setLogoutAnim(false); router.replace('/unlock'); }}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { padding: 16, paddingBottom: 140 },
  stripWrap: { marginHorizontal: -16, marginBottom: 14 },

  secTitle: { fontSize: 13, fontWeight: '800', color: c.text.muted, marginTop: 6, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },

  inlineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle,
    marginTop: 6,
  },
  inlineIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inlineTitle: { fontSize: 13.5, fontWeight: '700', color: c.text.primary },
  inlineSub: { fontSize: 11, color: c.text.muted, marginTop: 2, fontWeight: '600' },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent.moneyOut + '10', borderRadius: 999, paddingVertical: 16, marginTop: 12 },
  logoutText: { fontSize: 16, fontWeight: '600', color: c.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 11, color: c.text.muted, marginTop: 12 },

  trustBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#10B98110', borderRadius: 12, borderWidth: 1, borderColor: '#10B98125' },
  trustText: { fontSize: 11, fontWeight: '600', color: '#059669', flex: 0, textAlign: 'center' },
  trustSignalsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  trustSig: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 6, backgroundColor: 'rgba(26,26,36,0.85)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  trustSigEmoji: { fontSize: 22 },
  trustSigText: { fontSize: 10.5, fontWeight: '700', color: c.text.secondary, textAlign: 'center', lineHeight: 13 },

  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: c.bg.elevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: c.text.primary },
  editInput: { backgroundColor: c.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle, marginTop: 16, marginBottom: 16 },
  saveBtn: { backgroundColor: c.accent.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveBtnT: { fontSize: 16, fontWeight: '700', color: '#fff' },
  langOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 2 },
  langOn: { backgroundColor: c.accent.primary + '10' },
  langNative: { fontSize: 16, fontWeight: '600', color: c.text.primary },
  langEn: { fontSize: 11, color: c.text.muted, marginTop: 1 },

  referralHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.subtle },
  referralHeaderTitle: { fontSize: 17, fontWeight: '900', color: c.text.primary },

  shareBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  shareScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  shareClose: { position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  shareTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center' },
  shareSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 4 },
  shareActionPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 999, width: 280, marginBottom: 10 },
  shareActionPrimaryText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  shareActionSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  shareActionSecondaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  shareHint: { fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 14, maxWidth: 280 },
}));
