/**
 * ProfileScreen — PILOT of the Brutalist + Swiss design system.
 *
 * Round 77 pivot: the entire visual layer below the header is now rendered
 * by `BrutalistProfileView` (components/brutalist/profile/*) using the
 * tokens in `utils/brutalist.ts`. All data fetching, modal state, and
 * auth/biometric logic is unchanged — only the presentation rebuilds.
 *
 * If sign-off fails, revert this file only; none of the legacy
 * components (ProfileIdentityCard, MoneyScoreCard, ProgressInline,
 * BoostCarousel, MissionsEngine, etc.) have been deleted — they remain
 * available under `components/profile/*` for other screens or rollback.
 */
import React, { useState, useCallback } from 'react';
import { View, Modal } from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';

import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { LANGUAGES } from '../../utils/i18n';

// Shared hooks (unchanged)
import { useProfileData } from '../../hooks/useProfileData';
import { useBiometricSettings } from '../../hooks/useBiometricSettings';
import { sendTestPush } from '../../hooks/usePushNotifications';

// Modals / sheets (kept as-is; only page chrome turns brutalist)
import ScoreBreakdownModal from '../../components/profile/ScoreBreakdownModal';
import ScoreBoostModal from '../../components/profile/ScoreBoostModal';
import LogoutConfirmSheet from '../../components/profile/LogoutConfirmSheet';
import ProfilePhotoSheet from '../../components/profile/ProfilePhotoSheet';
import ShareWeeklyWinModal from '../../components/profile/ShareWeeklyWinModal';
import { deriveWin } from '../../components/profile/WeeklyWinCard';
import SubScreenModal from '../../components/profile/SubScreenModal';
import EditNameSheet from '../../components/profile/EditNameSheet';
import LanguageSheet from '../../components/profile/LanguageSheet';
import BudgetAchievements from '../../components/budget/BudgetAchievements';
import PaymentMethodsV2 from '../../components/profile/PaymentMethodsV2';
import NotificationSettings from '../../components/profile/NotificationSettings';
import HelpSupport from '../../components/HelpSupport';
import PinSetupModal from '../../components/PinSetupModal';
import AuthTransitionOverlay from '../../components/auth/AuthTransitionOverlay';
import { SettingsList, SettingsListItem } from '../../components/profile/SettingsList';

// ─── Brutalist visual layer ──────────────────────────────────────────
import BrutalistProfileView from '../../components/brutalist/profile/BrutalistProfileView';
import MoreSettingsSheet from '../../components/brutalist/MoreSettingsSheet';
import ProfileSheet from '../../components/brutalist/profile/ProfileSheet';
import { useAIPrompt } from '../../store/aiPromptStore';

function ProfileScreen() {
  const { user, logout, avatar } = useAuthStore();
  const { lang } = useLangStore();

  const {
    identity, rewardsSummary, gamiStatus, weekly, gmailStatus,
    refreshing, setRefreshing, loadData,
    handleAvatarPicked, handleAvatarRemoved,
  } = useProfileData();

  const {
    bioHwAvail, bioOn, bioLabel, appLockOn, hasPinSet, pinModalVisible,
    setHasPinSet, setPinModalVisible,
    onToggleBio, onToggleAppLock, onChangePin,
  } = useBiometricSettings();

  // Modal/sheet state
  const [scoreBreakdownVisible, setScoreBreakdownVisible] = useState(false);
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
  const [moreSettingsVisible, setMoreSettingsVisible] = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === lang);

  const streak = identity?.streak ?? gamiStatus?.streak ?? 0;
  const badgesEarned = identity?.badges_earned ?? (gamiStatus?.badges_earned?.length ?? 0);
  const badgesTotal = identity?.badges_total ?? 12;
  const coinsBalance = identity?.coins_balance ?? rewardsSummary?.coins_balance ?? 0;
  const isPro = !!(identity?.is_premium || (user as any)?.is_premium);

  // Derive gmail status string
  const gmailText = React.useMemo(() => {
    if (!gmailStatus || !gmailStatus.connected) return 'NOT LINKED';
    const last = gmailStatus.last_synced_at || gmailStatus.last_sync;
    if (gmailStatus.error || gmailStatus.status === 'error') return 'FIX AUTH';
    if (!last) return 'SYNCING';
    try {
      const diffMin = Math.round((Date.now() - new Date(last).getTime()) / 60000);
      if (diffMin < 60) return `SYNC ${diffMin || '<1'}M`;
      if (diffMin < 1440) return `SYNC ${Math.round(diffMin / 60)}H`;
      return `SYNC ${Math.round(diffMin / 1440)}D`;
    } catch { return 'LINKED'; }
  }, [gmailStatus]);

  // ─ Callbacks ────────────────────────────────────────────────────
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData, setRefreshing]);
  const handleLogout = useCallback(async () => {
    setLogoutSheet(false); setLogoutAnim(true); await logout();
  }, [logout]);

  const openEditAvatar = useCallback(() => setPhotoSheetVisible(true), []);
  const openEditName = useCallback(() => setEditNameVisible(true), []);
  const openScoreBreakdown = useCallback(() => setScoreBreakdownVisible(true), []);
  const openScoreBoost = useCallback(() => {
    // Route Score Boost through the SAME AI flow per master v9 §Bonus:
    // v10 mode-aware: carry `score_boost` so the brain tailors the plan.
    useAIPrompt.getState().set('Help me boost my money score. What should I fix today?', 'score_boost', 'profile');
    try { router.push('/(tabs)/ai-coach' as any); } catch {}
  }, []);
  const openShareWin = useCallback(() => setShareWinVisible(true), []);
  const openAICoach = useCallback(() => {
    // v10 mode-aware: BUILD MY PLAN → plan_build (AI brain picks context).
    useAIPrompt.getState().set('Build my 5-minute money plan — start by analyzing my spending.', 'plan_build', 'profile');
    try { router.push('/(tabs)/ai-coach' as any); } catch {}
  }, []);
  const openPremium = useCallback(() => { try { router.push('/premium' as any); } catch {} }, []);
  const goGoals = useCallback(() => { try { router.push('/goals' as any); } catch {} }, []);
  const openAchievements = useCallback(() => setAchievementsModalVisible(true), []);
  const goLeaderboard = useCallback(() => { try { router.push('/leaderboard' as any); } catch {} }, []);
  const openPaymentMethods = useCallback(() => setPaymentMethodsVisible(true), []);
  const openPreferences = useCallback(() => setPreferencesVisible(true), []);
  const openNotifs = useCallback(() => setNotifsVisible(true), []);
  const goGmail = useCallback(() => { try { router.push('/gmail' as any); } catch {} }, []);
  const openHelp = useCallback(() => setHelpVisible(true), []);
  const goAbout = useCallback(() => { try { router.push('/about' as any); } catch {} }, []);
  const openLogout = useCallback(() => setLogoutSheet(true), []);
  const goDeleteAccount = useCallback(() => { try { router.push('/profile/delete-account' as any); } catch {} }, []);

  const openLangFromPrefs = useCallback(() => {
    setPreferencesVisible(false);
    setTimeout(() => setLangModalVisible(true), 300);
  }, []);

  const goRewards = useCallback(() => { try { router.push('/(tabs)/rewards' as any); } catch {} }, []);
  const openMoreSettings = useCallback(() => setMoreSettingsVisible(true), []);
  const onLogExpense = useCallback(() => { try { router.push('/(tabs)/transactions' as any); } catch {} }, []);

  const onSendTestPush = useCallback(async () => {
    const { sent, message } = await sendTestPush();
    Toast.show({ type: sent ? 'success' : 'info', text1: sent ? 'Test push sent' : 'Push test', text2: message });
  }, []);

  return (
    <>
      <BrutalistProfileView
        name={user?.name}
        phone={user?.phone}
        avatar={avatar}
        score={identity?.money_score || (user as any)?.money_score || 0}
        percentile={typeof identity?.percentile === 'number' ? identity.percentile : null}
        weeklyDelta={typeof weekly?.score_delta === 'number' ? weekly.score_delta : null}
        tierLabel={identity?.tier_label}
        tierEmoji={identity?.tier_emoji}
        streak={streak}
        badgesEarned={badgesEarned}
        badgesTotal={badgesTotal}
        coins={coinsBalance}
        weeklyPctBetter={weekly?.pct_better ?? null}
        weeklyCommentary={weekly?.commentary ?? null}
        weeklyThis={weekly?.this_week ?? null}
        weeklyLast={weekly?.last_week ?? null}
        isPro={isPro}
        gmailText={gmailText}
        bioLabel={bioLabel}
        bioHwAvail={bioHwAvail}
        bioOn={bioOn}
        hasPinSet={hasPinSet}
        appLockOn={appLockOn}
        langLabel={currentLang?.nativeName}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEditAvatar={openEditAvatar}
        onEditName={openEditName}
        onOpenScoreBreakdown={openScoreBreakdown}
        onOpenScoreBoost={openScoreBoost}
        onShareWin={openShareWin}
        onOpenAICoach={openAICoach}
        onOpenPremium={openPremium}
        onGoGoals={goGoals}
        onOpenAchievements={openAchievements}
        onGoLeaderboard={goLeaderboard}
        onOpenPaymentMethods={openPaymentMethods}
        onToggleBio={bioHwAvail ? onToggleBio : undefined}
        onChangePin={onChangePin}
        onToggleAppLock={onToggleAppLock}
        onOpenPreferences={openPreferences}
        onOpenNotifs={openNotifs}
        onGoGmail={goGmail}
        onOpenHelp={openHelp}
        onGoAbout={goAbout}
        onLogout={openLogout}
        onGoDeleteAccount={goDeleteAccount}
        onOpenMoreSettings={openMoreSettings}
        onGoRewards={goRewards}
        onLogExpense={onLogExpense}
        onOpenProfileSheet={() => setProfileSheetVisible(true)}
      />

      {/* ── Modals / Sheets (unchanged) ─────────────────────────── */}
      <LogoutConfirmSheet
        visible={logoutSheet}
        onCancel={() => setLogoutSheet(false)}
        onConfirm={handleLogout}
      />

      <ScoreBreakdownModal
        visible={scoreBreakdownVisible}
        onClose={() => setScoreBreakdownVisible(false)}
        fallbackScore={identity?.money_score || (user as any)?.money_score || 0}
      />

      <ScoreBoostModal
        visible={scoreBoostVisible}
        onClose={() => setScoreBoostVisible(false)}
        currentScore={identity?.money_score || (user as any)?.money_score || 0}
      />

      <EditNameSheet
        visible={editNameVisible}
        currentName={user?.name || ''}
        onClose={() => setEditNameVisible(false)}
      />

      <LanguageSheet visible={langModalVisible} onClose={() => setLangModalVisible(false)} />

      <Modal visible={helpVisible} animationType="slide"><HelpSupport onClose={() => setHelpVisible(false)} /></Modal>

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
        title="Language"
        onClose={() => setPreferencesVisible(false)}
      >
        <SettingsList header="Language">
          <SettingsListItem
            icon="language-outline"
            label="Language"
            value={currentLang?.nativeName}
            onPress={openLangFromPrefs}
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
          <SettingsListItem icon="send-outline" label="Send test notification" onPress={onSendTestPush} />
        </SettingsList>
      </SubScreenModal>

      {logoutAnim && (
        <AuthTransitionOverlay variant="locking" onDone={() => { setLogoutAnim(false); router.replace('/unlock'); }} />
      )}

      <ProfilePhotoSheet
        visible={photoSheetVisible}
        hasAvatar={!!avatar}
        onClose={() => setPhotoSheetVisible(false)}
        onPicked={handleAvatarPicked}
        onRemoved={handleAvatarRemoved}
      />

      {weekly ? (
        <ShareWeeklyWinModal
          visible={shareWinVisible}
          onClose={() => setShareWinVisible(false)}
          cardProps={deriveWin({
            userName: user?.name,
            score: identity?.money_score ?? (user as any)?.money_score,
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

      <PinSetupModal
        visible={pinModalVisible}
        onDone={async () => {
          setPinModalVisible(false);
          setHasPinSet(true);
          Toast.show({ type: 'success', text1: 'mPIN updated', position: 'bottom' });
        }}
        onSkip={() => setPinModalVisible(false)}
      />

      {/* Brutalist v9 — Avatar = Identity Control Node */}
      <ProfileSheet
        visible={profileSheetVisible}
        onClose={() => setProfileSheetVisible(false)}
        name={user?.name}
        phone={user?.phone}
        avatar={avatar}
        onEditName={openEditName}
        onChangeAvatar={openEditAvatar}
        onLogout={openLogout}
      />

      {/* Brutalist v4 — collapsed Plan/Security/App/Support sub-sheet */}
      <SubScreenModal
        visible={moreSettingsVisible}
        title="Settings"
        onClose={() => setMoreSettingsVisible(false)}
      >
        <MoreSettingsSheet
          isPro={isPro}
          bioLabel={bioLabel}
          bioHwAvail={bioHwAvail}
          bioOn={bioOn}
          hasPinSet={hasPinSet}
          appLockOn={appLockOn}
          langLabel={currentLang?.nativeName}
          gmailText={gmailText}
          gmailConnected={!!gmailStatus?.connected}
          onOpenPremium={openPremium}
          onToggleBio={bioHwAvail ? onToggleBio : undefined}
          onChangePin={onChangePin}
          onToggleAppLock={onToggleAppLock}
          onOpenPreferences={openPreferences}
          onOpenNotifs={openNotifs}
          onGoGmail={goGmail}
          onOpenHelp={openHelp}
          onGoAbout={goAbout}
        />
      </SubScreenModal>
    </>
  );
}

import { withTabBoundary as _wrapTab_ProfileScreen } from '../../components/withTabBoundary';
export default _wrapTab_ProfileScreen(ProfileScreen, 'Profile');
