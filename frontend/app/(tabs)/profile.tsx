/**
 * ProfileScreen — Round 89 "Control Center" redesign.
 *
 * Profile is now strictly a control surface. Money Score, AI Coach CTAs,
 * badges/streak, and premium upsell all moved OUT (to Home, Coach, Rewards).
 * This screen owns: identity edits, security, money connections,
 * preferences, help, danger zone.
 *
 * Data hooks and modals are preserved — only the presentation layer +
 * rewiring shrinks.
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

// Modals / sheets
import LogoutConfirmSheet from '../../components/profile/LogoutConfirmSheet';
import ProfilePhotoSheet from '../../components/profile/ProfilePhotoSheet';
import SubScreenModal from '../../components/profile/SubScreenModal';
import EditNameSheet from '../../components/profile/EditNameSheet';
import LanguageSheet from '../../components/profile/LanguageSheet';
import PaymentMethodsV2 from '../../components/profile/PaymentMethodsV2';
import NotificationSettings from '../../components/profile/NotificationSettings';
import HelpSupport from '../../components/HelpSupport';
import PinSetupModal from '../../components/PinSetupModal';
import AuthTransitionOverlay from '../../components/auth/AuthTransitionOverlay';
import { SettingsList, SettingsListItem } from '../../components/profile/SettingsList';

// Brutalist visual layer
import BrutalistProfileView from '../../components/brutalist/profile/BrutalistProfileView';
import ProfileSheet from '../../components/brutalist/profile/ProfileSheet';
import TrustedDevicesSheet from '../../components/brutalist/TrustedDevicesSheet';

function ProfileScreen() {
  const { user, logout, avatar } = useAuthStore();
  const { lang } = useLangStore();

  const {
    gmailStatus,
    refreshing, setRefreshing, loadData,
    handleAvatarPicked, handleAvatarRemoved,
  } = useProfileData();

  const {
    bioHwAvail, bioOn, bioLabel, appLockOn, hasPinSet, pinModalVisible,
    setHasPinSet, setPinModalVisible,
    onToggleBio, onToggleAppLock, onChangePin,
  } = useBiometricSettings();

  // Modal/sheet state
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [paymentMethodsVisible, setPaymentMethodsVisible] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [notifsVisible, setNotifsVisible] = useState(false);
  const [logoutSheet, setLogoutSheet] = useState(false);
  const [logoutAnim, setLogoutAnim] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [trustedDevicesVisible, setTrustedDevicesVisible] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === lang);

  // Derive gmail status string (compact single row — spec)
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
  const goGoals = useCallback(() => { try { router.push('/goals' as any); } catch {} }, []);
  const goRewards = useCallback(() => { try { router.push('/(tabs)/rewards' as any); } catch {} }, []);
  const openPaymentMethods = useCallback(() => setPaymentMethodsVisible(true), []);
  const openPreferences = useCallback(() => setPreferencesVisible(true), []);
  const openNotifs = useCallback(() => setNotifsVisible(true), []);
  const goGmail = useCallback(() => { try { router.push('/gmail' as any); } catch {} }, []);
  const openHelp = useCallback(() => setHelpVisible(true), []);
  const goAbout = useCallback(() => { try { router.push('/about' as any); } catch {} }, []);
  const openLogout = useCallback(() => setLogoutSheet(true), []);
  const goDeleteAccount = useCallback(() => { try { router.push('/profile/delete-account' as any); } catch {} }, []);
  const openTrustedDevices = useCallback(() => setTrustedDevicesVisible(true), []);

  const openLangFromPrefs = useCallback(() => {
    setPreferencesVisible(false);
    setTimeout(() => setLangModalVisible(true), 300);
  }, []);

  const onSendTestPush = useCallback(async () => {
    const { sent, message } = await sendTestPush();
    Toast.show({ type: sent ? 'success' : 'info', text1: sent ? 'Test push sent' : 'Push test', text2: message });
  }, []);

  return (
    <>
      <BrutalistProfileView
        name={user?.name}
        phone={user?.phone}
        email={(user as any)?.email || null}
        avatar={avatar}
        bioLabel={bioLabel}
        bioHwAvail={bioHwAvail}
        bioOn={bioOn}
        hasPinSet={hasPinSet}
        appLockOn={appLockOn}
        langLabel={currentLang?.nativeName}
        gmailText={gmailText}
        gmailConnected={!!gmailStatus?.connected}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEditAvatar={openEditAvatar}
        onEditName={openEditName}
        onOpenProfileSheet={() => setProfileSheetVisible(true)}
        onOpenPaymentMethods={openPaymentMethods}
        onGoGoals={goGoals}
        onGoRewards={goRewards}
        onOpenTrustedDevices={openTrustedDevices}
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
      />

      {/* ── Modals / Sheets ─────────────────────────────────────── */}
      <LogoutConfirmSheet
        visible={logoutSheet}
        onCancel={() => setLogoutSheet(false)}
        onConfirm={handleLogout}
      />

      <EditNameSheet
        visible={editNameVisible}
        currentName={user?.name || ''}
        onClose={() => setEditNameVisible(false)}
      />

      <LanguageSheet visible={langModalVisible} onClose={() => setLangModalVisible(false)} />

      <Modal visible={helpVisible} animationType="slide">
        <HelpSupport onClose={() => setHelpVisible(false)} />
      </Modal>

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

      <SubScreenModal
        visible={trustedDevicesVisible}
        title="Trusted devices"
        onClose={() => setTrustedDevicesVisible(false)}
      >
        <TrustedDevicesSheet />
      </SubScreenModal>

      {logoutAnim && (
        <AuthTransitionOverlay
          variant="locking"
          onDone={() => { setLogoutAnim(false); router.replace('/unlock'); }}
        />
      )}

      <ProfilePhotoSheet
        visible={photoSheetVisible}
        hasAvatar={!!avatar}
        onClose={() => setPhotoSheetVisible(false)}
        onPicked={handleAvatarPicked}
        onRemoved={handleAvatarRemoved}
      />

      <PinSetupModal
        visible={pinModalVisible}
        onDone={async () => {
          setPinModalVisible(false);
          setHasPinSet(true);
          Toast.show({ type: 'success', text1: 'mPIN updated', position: 'bottom' });
        }}
        onSkip={() => setPinModalVisible(false)}
      />

      {/* Avatar-tap entry point for Identity Control Node */}
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
    </>
  );
}

import { withTabBoundary as _wrapTab_ProfileScreen } from '../../components/withTabBoundary';
export default _wrapTab_ProfileScreen(ProfileScreen, 'Profile');
