/**
 * ProfileScreen — MintU Financial Identity + Progress Engine.
 *
 * Top-to-bottom structure:
 *   1. Hero (ProfileHeroV4)          — Samsung-Health avatar, score ring, predictive insight
 *   2. Missions Engine               — daily gamified tasks (refresh timer, XP/coin totals)
 *   3. Progress row                  — streak · badges · coins
 *   4. Beat Last Week (+ Share)      — viral shareable weekly win
 *   5. AI Coach 1-tap                — contextual nudge to /ai-coach
 *   6. Premium funnel                — MintU Pro upsell
 *   7. Settings (list-style)         — Financial / App / Support / Account
 *
 * Sheets:
 *   • ProfilePhotoSheet  — avatar CUD (take / gallery / remove)
 *   • ShareWeeklyWinModal — react-native-view-shot capture for viral share
 *   • LogoutConfirmSheet / ScoreBreakdownModal / ScoreBoostModal
 *   • Inline modals (kept for now): edit-name, language, achievements,
 *     payment methods, preferences, notifications. Candidates for extraction
 *     in a follow-up refactor.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t, LANGUAGES } from '../../utils/i18n';
import api from '../../utils/api';
import { fetchAvatar, uploadAvatar, deleteAvatar } from '../../services/user';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import Toast from 'react-native-toast-message';
import { shareSmart } from '../../utils/share';
import HelpSupport from '../../components/HelpSupport';

// New minimal profile components
import ProfileHeroV4 from '../../components/profile/ProfileHeroV4';
import MissionsEngine, { type Mission } from '../../components/profile/MissionsEngine';
import ProgressInline from '../../components/profile/ProgressInline';
import BeatLastWeek from '../../components/profile/BeatLastWeek';
import AICoachOneTap from '../../components/profile/AICoachOneTap';
import PremiumConversionFunnel from '../../components/profile/PremiumConversionFunnel';
import ScoreBreakdownModal from '../../components/profile/ScoreBreakdownModal';
import { SettingsList, SettingsListItem } from '../../components/profile/SettingsList';
import SmartStatusRow, { type RowStatus } from '../../components/profile/SmartStatusRow';
import LogoutConfirmSheet from '../../components/profile/LogoutConfirmSheet';
import ScoreBoostModal from '../../components/profile/ScoreBoostModal';
import ProfilePhotoSheet from '../../components/profile/ProfilePhotoSheet';
import ShareWeeklyWinModal from '../../components/profile/ShareWeeklyWinModal';
import { deriveWin } from '../../components/profile/WeeklyWinCard';
import SubScreenModal from '../../components/profile/SubScreenModal';
import EditNameSheet from '../../components/profile/EditNameSheet';
import LanguageSheet from '../../components/profile/LanguageSheet';
import ProfileSkeleton from '../../components/profile/ProfileSkeleton';

// Retained sub-screens (opened only via explicit settings tap)
import BudgetAchievements from '../../components/budget/BudgetAchievements';
import PaymentMethodsV2 from '../../components/profile/PaymentMethodsV2';
import NotificationSettings from '../../components/profile/NotificationSettings';
import ThemeToggle from '../../components/profile/ThemeToggle';
import AuthTransitionOverlay from '../../components/auth/AuthTransitionOverlay';
import { sendTestPush } from '../../hooks/usePushNotifications';

export default function ProfileScreen() {
  const s = useStyles();
  const { user, logout, avatar, setAvatar } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [stats, setStats] = useState<any>(null);
  const [gamiStatus, setGamiStatus] = useState<any>(null);
  const [rewardsSummary, setRewardsSummary] = useState<any>(null);
  const [identity, setIdentity] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [missionsData, setMissionsData] = useState<{ missions: Mission[]; seconds_to_refresh: number; total_xp: number; total_coins: number } | null>(null);
  const [scoreBreakdownVisible, setScoreBreakdownVisible] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<any>(null);

  // Modals / sheets
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [achievementsModalVisible, setAchievementsModalVisible] = useState(false);
  const [paymentMethodsVisible, setPaymentMethodsVisible] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [notifsVisible, setNotifsVisible] = useState(false);
  const [scoreBoostVisible, setScoreBoostVisible] = useState(false);
  const [logoutSheet, setLogoutSheet] = useState(false);
  const [logoutAnim, setLogoutAnim] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [shareWinVisible, setShareWinVisible] = useState(false);

  // Today tasks are fetched from /api/profile/missions now
  const todayMissions = missionsData?.missions || [];

  const [initialLoading, setInitialLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [avatarRes, statsRes, gamiRes, rewardsRes, identityRes, breakdownRes, weeklyRes, missionsRes, gmailRes] = await Promise.all([
        fetchAvatar().then(data => ({ data })).catch(() => ({ data: {} })),
        api.get('/analytics/summary').catch(() => ({ data: null })),
        api.get('/gamification/status').catch(() => ({ data: null })),
        api.get('/rewards/summary').catch(() => ({ data: null })),
        api.get('/profile/identity').catch(() => ({ data: null })),
        api.get('/profile/score-breakdown').catch(() => ({ data: null })),
        api.get('/profile/weekly-comparison').catch(() => ({ data: null })),
        api.get('/profile/missions').catch(() => ({ data: null })),
        api.get('/gmail/status').catch(() => ({ data: null })),
      ]);
      if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
      if (statsRes.data) setStats(statsRes.data);
      if (gamiRes.data) setGamiStatus(gamiRes.data);
      if (rewardsRes.data) setRewardsSummary(rewardsRes.data);
      if (identityRes.data) setIdentity(identityRes.data);
      if (breakdownRes.data) setBreakdown(breakdownRes.data);
      if (weeklyRes.data) setWeekly(weeklyRes.data);
      if (missionsRes.data) setMissionsData(missionsRes.data);
      if (gmailRes.data) setGmailStatus(gmailRes.data);
    } catch { /* noop */ } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [setAvatar]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(React.useCallback(() => { loadData(); }, [loadData]));

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

  const handleLogout = async () => {
    setLogoutSheet(false);
    setLogoutAnim(true);
    await logout();
  };

  const handleAvatarPicked = async (base64DataUri: string) => {
    await setAvatar(base64DataUri);
    try {
      await uploadAvatar(base64DataUri);
      Toast.show({ type: 'success', text1: 'Profile photo updated' });
    } catch {
      Toast.show({ type: 'error', text1: 'Couldn\'t save photo', text2: 'Try again in a moment.' });
    }
  };

  const handleAvatarRemoved = async () => {
    await setAvatar('');
    try {
      await deleteAvatar();
      Toast.show({ type: 'success', text1: 'Profile photo removed' });
    } catch {
      Toast.show({ type: 'info', text1: 'Removed locally' });
    }
  };

  const onMissionPress = (m: Mission) => {
    try { router.push(m.route as any); } catch { /* noop */ }
  };

  const onEarnAll = () => {
    // Navigate to first incomplete mission
    const next = todayMissions.find(m => !m.done);
    if (next) { try { router.push(next.route as any); } catch {} }
  };

  const currentLang = LANGUAGES.find(l => l.code === lang);

  const streak = identity?.streak ?? gamiStatus?.streak ?? 0;
  const badgesEarned = identity?.badges_earned ?? gamiStatus?.badges_earned?.length ?? 0;
  const badgesTotal = identity?.badges_total ?? 12;
  const coinsBalance = identity?.coins_balance ?? rewardsSummary?.coins_balance ?? 0;
  const isPro = !!(identity?.is_premium || (user as any)?.is_premium);

  // Derive Gmail status for SmartStatusRow
  const gmailRow = React.useMemo(() => {
    if (!gmailStatus || !gmailStatus.connected) {
      return { status: 'idle' as RowStatus, text: 'Not connected · tap to set up' };
    }
    const last = gmailStatus.last_synced_at || gmailStatus.last_sync;
    const hasError = gmailStatus.error || gmailStatus.status === 'error';
    if (hasError) return { status: 'error' as RowStatus, text: 'Sync failed · fix auth' };
    if (!last) return { status: 'syncing' as RowStatus, text: 'First sync in progress' };
    try {
      const diffMin = Math.round((Date.now() - new Date(last).getTime()) / 60000);
      if (diffMin < 60) return { status: 'ok' as RowStatus, text: `Synced ${diffMin || '<1'}m ago` };
      if (diffMin < 1440) return { status: 'ok' as RowStatus, text: `Synced ${Math.round(diffMin / 60)}h ago` };
      return { status: 'warn' as RowStatus, text: `Last sync ${Math.round(diffMin / 1440)}d ago` };
    } catch {
      return { status: 'ok' as RowStatus, text: 'Connected' };
    }
  }, [gmailStatus]);

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.accent.primary}
          />
        }
      >
        {/* Top bar with Profile title */}
        <View style={s.topBar}>
          <Text style={s.topBarTitle}>Profile</Text>
        </View>

        {/* Initial load skeleton — shown once, never on refresh */}
        {initialLoading && !identity ? (
          <ProfileSkeleton />
        ) : (
        <>
        {/* 1. HERO — Living Financial Identity */}
        <ProfileHeroV4
          user={user}
          avatar={avatar}
          statusRing={breakdown?.status_ring}
          predictiveInsight={breakdown?.predictive_insight}
          nextReward={breakdown?.next_tier ? { label: breakdown.next_tier, at: (identity?.money_score || 0) + (breakdown.points_to_next || 0) } : null}
          onEditName={() => setEditNameVisible(true)}
          onEditAvatar={() => setPhotoSheetVisible(true)}
          onLevelUp={() => setScoreBoostVisible(true)}
          onTapScore={() => setScoreBreakdownVisible(true)}
        />

        {/* 2. MISSIONS ENGINE */}
        {missionsData ? (
          <MissionsEngine
            missions={todayMissions}
            secondsToRefresh={missionsData.seconds_to_refresh || 0}
            totalXp={missionsData.total_xp || 0}
            totalCoins={missionsData.total_coins || 0}
            onMissionPress={onMissionPress}
            onEarnAll={onEarnAll}
          />
        ) : null}

        {/* 3. PROGRESS merged */}
        <ProgressInline
          streak={streak}
          badgesEarned={badgesEarned}
          badgesTotal={badgesTotal}
          coins={coinsBalance}
          onPressViewProgress={() => router.push('/(tabs)/rewards' as any)}
        />

        {/* 4. BEAT YOUR LAST WEEK */}
        {weekly ? (
          <BeatLastWeek
            thisWeek={weekly.this_week}
            lastWeek={weekly.last_week}
            pctBetter={weekly.pct_better || 0}
            commentary={weekly.commentary || ''}
            tone={weekly.tone || 'info'}
            rewardPreview={weekly.reward_preview}
            onPress={() => router.push('/yearly' as any)}
            onShare={() => setShareWinVisible(true)}
          />
        ) : null}

        {/* 5. AI COACH — 1-tap contextual */}
        <AICoachOneTap stats={realStats} score={identity?.money_score || user?.money_score || 0} />

        {/* 6. PREMIUM conversion funnel */}
        <PremiumConversionFunnel isPro={isPro} />

        {/* 7. SETTINGS (list-style, no card blocks) */}
        <SettingsList header="Financial">
          <SettingsListItem icon="flag-outline" label="My Goals" onPress={() => router.push('/goals' as any)} />
          <SettingsListItem icon="ribbon-outline" label="Achievements" onPress={() => setAchievementsModalVisible(true)} />
          <SettingsListItem icon="trophy-outline" label="Leaderboard" onPress={() => router.push('/leaderboard' as any)} />
          <SettingsListItem icon="card-outline" label="Payment methods" onPress={() => setPaymentMethodsVisible(true)} />
        </SettingsList>

        <SettingsList header="App">
          <SettingsListItem
            icon="color-palette-outline"
            label="Theme & language"
            value={currentLang?.nativeName}
            onPress={() => setPreferencesVisible(true)}
          />
          <SettingsListItem icon="notifications-outline" label="Notifications" onPress={() => setNotifsVisible(true)} />
          <SmartStatusRow
            icon="logo-google"
            label="Gmail auto-import"
            status={gmailRow.status}
            statusText={gmailRow.text}
            onPress={() => router.push('/gmail' as any)}
            onFixNow={() => router.push('/gmail' as any)}
          />
        </SettingsList>

        <SettingsList header="Support">
          <SettingsListItem icon="help-circle-outline" label={t('help_support', lang)} onPress={() => setHelpVisible(true)} />
          <SettingsListItem icon="information-circle-outline" label="About MintU" onPress={() => router.push('/about' as any)} />
        </SettingsList>

        <SettingsList header="Account">
          <SettingsListItem
            icon="log-out-outline"
            label={t('logout', lang)}
            danger
            onPress={() => setLogoutSheet(true)}
            testID="profile-logout"
          />
          <SettingsListItem
            icon="trash-outline"
            label="Delete account"
            danger
            onPress={() => router.push('/profile/delete-account' as any)}
            testID="profile-delete-account"
          />
        </SettingsList>

        <View style={s.footer}>
          <Ionicons name="shield-checkmark-outline" size={12} color={COLORS.text.muted} />
          <Text style={s.footerTxt}>Bank-grade encryption · Data in India</Text>
        </View>
        <Text style={s.version}>v1.0.0</Text>
        <View style={{ height: 40 }} />
        </>
        )}
      </ScrollView>

      {/* ── Modals / Sheets ── */}

      <LogoutConfirmSheet
        visible={logoutSheet}
        onCancel={() => setLogoutSheet(false)}
        onConfirm={handleLogout}
      />

      <ScoreBreakdownModal
        visible={scoreBreakdownVisible}
        onClose={() => setScoreBreakdownVisible(false)}
        fallbackScore={identity?.money_score || user?.money_score || 0}
      />

      <ScoreBoostModal
        visible={scoreBoostVisible}
        onClose={() => setScoreBoostVisible(false)}
        currentScore={identity?.money_score || user?.money_score || 0}
      />

      {/* Edit name — extracted component */}
      <EditNameSheet
        visible={editNameVisible}
        currentName={user?.name || ''}
        onClose={() => setEditNameVisible(false)}
      />

      {/* Language — extracted bottom sheet */}
      <LanguageSheet
        visible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
      />

      <Modal visible={helpVisible} animationType="slide"><HelpSupport onClose={() => setHelpVisible(false)} /></Modal>

      {/* Sub-screens launched from settings list — all use shared SubScreenModal */}
      <SubScreenModal
        visible={achievementsModalVisible}
        title="Achievements"
        onClose={() => setAchievementsModalVisible(false)}
      >
        <BudgetAchievements />
      </SubScreenModal>

      <SubScreenModal
        visible={paymentMethodsVisible}
        title="Payment methods"
        onClose={() => setPaymentMethodsVisible(false)}
      >
        <PaymentMethodsV2 />
      </SubScreenModal>

      <SubScreenModal
        visible={preferencesVisible}
        title="Theme & language"
        onClose={() => setPreferencesVisible(false)}
      >
        <ThemeToggle />
        <View style={{ height: 16 }} />
        <SettingsList header="Language">
          <SettingsListItem
            icon="language-outline"
            label={t('language', lang)}
            value={currentLang?.nativeName}
            onPress={() => { setPreferencesVisible(false); setTimeout(() => setLangModalVisible(true), 300); }}
          />
        </SettingsList>
      </SubScreenModal>

      <SubScreenModal
        visible={notifsVisible}
        title="Notifications"
        onClose={() => setNotifsVisible(false)}
      >
        <NotificationSettings />
        <View style={{ height: 8 }} />
        <SettingsList header="Debug">
          <SettingsListItem
            icon="send-outline"
            label="Send test notification"
            onPress={async () => {
              const { sent, message } = await sendTestPush();
              Toast.show({ type: sent ? 'success' : 'info', text1: sent ? 'Test push sent' : 'Push test', text2: message });
            }}
          />
        </SettingsList>
      </SubScreenModal>

      {logoutAnim && (
        <AuthTransitionOverlay
          variant="locking"
          onDone={() => { setLogoutAnim(false); router.replace('/unlock'); }}
        />
      )}

      {/* Profile photo CUD sheet — Samsung Health style */}
      <ProfilePhotoSheet
        visible={photoSheetVisible}
        hasAvatar={!!avatar}
        onClose={() => setPhotoSheetVisible(false)}
        onPicked={handleAvatarPicked}
        onRemoved={handleAvatarRemoved}
      />

      {/* Weekly Win share card — viral loop */}
      {weekly ? (
        <ShareWeeklyWinModal
          visible={shareWinVisible}
          onClose={() => setShareWinVisible(false)}
          cardProps={deriveWin({
            userName: user?.name,
            score: identity?.money_score ?? user?.money_score,
            tierLabel: identity?.tier_label
              ? `${identity?.tier_emoji || ''} ${identity.tier_label}`.trim()
              : undefined,
            pctBetter: weekly?.pct_better || 0,
            thisWeek: weekly?.this_week || null,
            lastWeek: weekly?.last_week || null,
            rewardBadge: weekly?.reward_preview?.badge || null,
          })}
        />
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { padding: 16, paddingBottom: 100 },

  topBar: { paddingVertical: 4, marginBottom: 10 },
  topBarTitle: { fontSize: 26, fontWeight: '800', color: c.text.primary, letterSpacing: -0.6 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingVertical: 6 },
  footerTxt: { fontSize: 11, fontWeight: '500', color: c.text.muted },
  version: { textAlign: 'center', fontSize: 10.5, color: c.text.muted, marginTop: 4, fontWeight: '500' },
}));
