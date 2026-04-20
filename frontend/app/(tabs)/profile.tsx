import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  Modal, FlatList, TextInput, Image, RefreshControl, Platform,
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
import { COLORS, shadowStyle } from '../../utils/theme';
import Toast from 'react-native-toast-message';
import { shareSmart, copyToClipboard, shareImageSmart } from '../../utils/share';
import HelpSupport from '../../components/HelpSupport';
import AboutMintU from '../../components/AboutMintU';
import ShareScoreCard from '../../components/profile/ShareScoreCard';
import BadgesSection from '../../components/profile/BadgesSection';
import WeeklyChallenge from '../../components/profile/WeeklyChallenge';
import ProfileHero from '../../components/profile/ProfileHero';
import FinancialSnapshot from '../../components/profile/FinancialSnapshot';
import PaymentMethods from '../../components/profile/PaymentMethods';
import RewardsHub from '../../components/profile/RewardsHub';
import AuthTransitionOverlay from '../../components/auth/AuthTransitionOverlay';
import PremiumExpandable from '../../components/profile/PremiumExpandable';
import ReferralDashboard from '../../components/profile/ReferralDashboard';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { sendTestPush } from '../../hooks/usePushNotifications';

export default function ProfileScreen() {
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
  const [gamiExpanded, setGamiExpanded] = useState(false);
  const [logoutAnim, setLogoutAnim] = useState(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const scoreCardRef = useRef<View>(null);

  const loadData = useCallback(async () => {
    try {
      const [upiRes, avatarRes, refRes, statsRes] = await Promise.all([
        fetchUpi().then(data => ({ data })).catch(() => ({ data: {} })),
        fetchAvatar().then(data => ({ data })).catch(() => ({ data: {} })),
        api.get('/referral/enhanced-status').catch(() => ({ data: null })),
        api.get('/analytics/summary').catch(() => ({ data: null })),
      ]);
      setUpiId(upiRes.data?.upi_id || '');
      if (avatarRes.data?.avatar) setAvatar(avatarRes.data.avatar);
      if (refRes.data) setReferral(refRes.data);
      if (statsRes.data) setStats(statsRes.data);
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

  // Auto-refresh on tab focus (e.g., user returns from Premium / Yearly dashboard)
  useFocusEffect(
    React.useCallback(() => { loadData(); }, [loadData])
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  // Cross-platform confirm: Alert.alert works on native; use window.confirm on web.
  const confirmThen = (title: string, msg: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
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
    async () => {
      setLogoutAnim(true);
      await logout();
      // Overlay animates for ~900ms then calls onDone which routes to /unlock
    },
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
    const text = referral?.share_text || '';
    await shareSmart({ message: text, title: 'MintU' });
  };

  const openShareScoreCard = () => setShareCardVisible(true);

  const handleShareAsImage = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(scoreCardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
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
    } finally {
      setSharing(false);
    }
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
        <ProfileHero
          user={user}
          avatar={avatar}
          referralCount={referral?.referral_count || 0}
          onEditName={() => { setEditName(user?.name || ''); setEditNameVisible(true); }}
          onPickAvatar={pickAvatar}
          onRemoveAvatar={removeAvatar}
          onOpenReferrals={() => setRefExpanded(true)}
          onOpenYearly={() => router.push('/yearly' as any)}
          onShareScore={openShareScoreCard}
        />

        {/* Weekly Challenge + Badges */}
        <View style={s.gamiCard}>
          <TouchableOpacity style={s.gamiHeader} onPress={() => setGamiExpanded(!gamiExpanded)} activeOpacity={0.7}>
            <View style={s.gamiIconBox}><Ionicons name="trophy" size={20} color={COLORS.accent.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.gamiTitle}>Challenges & Achievements</Text>
              <Text style={s.gamiSub}>
                {gamiStatus?.streak || 0}-day streak · {gamiStatus?.badges_earned?.length || 0} badges earned
              </Text>
            </View>
            <Ionicons name={gamiExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
          {gamiExpanded && (
            <View style={s.gamiBody}>
              <WeeklyChallenge challenge={gamiStatus?.weekly_challenge} streak={gamiStatus?.streak || 0} />
              <BadgesSection onStatusLoaded={setGamiStatus} />
            </View>
          )}
          {!gamiExpanded && (
            <View style={{ height: 0, overflow: 'hidden', opacity: 0 }} pointerEvents="none">
              <BadgesSection onStatusLoaded={setGamiStatus} />
            </View>
          )}
        </View>

        <FinancialSnapshot stats={realStats} />

        {/* All rewards earned across the app — consolidated here per design ask */}
        <RewardsHub />

        <PaymentMethods upiId={upiId} />

        {/* PREMIUM payment card lives here — Home only shows the feature list */}
        <PremiumExpandable onExplore={() => router.push('/premium' as any)} />

        <ReferralDashboard
          referral={referral}
          expanded={refExpanded}
          onToggle={() => setRefExpanded(!refExpanded)}
          onCopyCode={copyCode}
          onShareWhatsApp={shareWhatsApp}
          onShareGeneric={shareGeneric}
          onShareScoreCard={openShareScoreCard}
        />

        {/* Settings */}
        <Text style={s.secTitle}>Settings</Text>
        <TouchableOpacity style={s.menuItem} onPress={() => router.push('/gmail' as any)}>
          <Ionicons name="mail-outline" size={20} color="#EA4335" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.menuText}>Gmail Auto-Import</Text>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Auto-track bank transactions from your inbox</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setLangModalVisible(true)}>
          <Ionicons name="language" size={20} color="#E65100" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.menuText}>{t('language', lang)}</Text>
            <Text style={{ fontSize: 11, color: '#E65100' }}>{currentLang?.nativeName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.menuItem}
          onPress={async () => {
            const { sent, message } = await sendTestPush();
            Toast.show({ type: sent ? 'success' : 'info', text1: sent ? 'Test push sent!' : 'Push test', text2: message });
          }}
        >
          <Ionicons name="notifications-outline" size={20} color={COLORS.accent.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.menuText}>{t('notifications', lang)}</Text>
            <Text style={{ fontSize: 11, color: COLORS.text.muted }}>Tap to send a test notification</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setHelpVisible(true)}>
          <Ionicons name="help-circle-outline" size={20} color={COLORS.accent.warning} />
          <Text style={[s.menuText, { marginLeft: 12 }]}>{t('help_support', lang)}</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setAboutVisible(true)}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.accent.primary} />
          <Text style={[s.menuText, { marginLeft: 12 }]}>About MintU</Text>
          <Text style={s.menuHint}>Privacy · Terms · Data</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} />
          <Text style={s.logoutText}>{t('logout', lang)}</Text>
        </TouchableOpacity>

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
        <View style={s.transparencyBox}>
          <Ionicons name="information-circle-outline" size={13} color="#475569" />
          <Text style={s.transparencyText}>MintU does not auto-sync bank data. Updates happen on refresh.</Text>
        </View>
        <Text style={s.version}>v1.0.0 · Made with ❤️ in India</Text>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Modals ──────────────────────────────────────────────────── */}
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
                  streak: gamiStatus?.streak || 0,
                  savingsRate: realStats?.savingsRate || 0,
                  coins: (user as any)?.coins_balance || (gamiStatus?.total_badges || 0) * 10,
                  referralCode: referral?.referral_code,
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

      {/* Animated logout transition — "Securing your session…" with lock pulse */}
      {logoutAnim && (
        <AuthTransitionOverlay
          variant="locking"
          onDone={() => { setLogoutAnim(false); router.replace('/unlock'); }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: 16, paddingBottom: 140 },
  // Gamification combined card (kept inline — small and tightly coupled)
  gamiCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border.card },
  gamiHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gamiIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  gamiTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary },
  gamiSub: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  gamiBody: { marginTop: 12 },
  // Settings
  secTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.muted, marginTop: 8, marginBottom: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(238,221,204,0.5)' },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  menuHint: { fontSize: 10, color: COLORS.text.muted, marginRight: 6, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '10', borderRadius: 999, paddingVertical: 16, marginTop: 16 },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 11, color: COLORS.text.muted, marginTop: 12 },
  // Trust
  trustBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#10B98110', borderRadius: 12, borderWidth: 1, borderColor: '#10B98125' },
  trustText: { fontSize: 11, fontWeight: '600', color: '#059669', flex: 0, textAlign: 'center' },
  trustSignalsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  trustSig: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 6, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border.card },
  trustSigEmoji: { fontSize: 22 },
  trustSigText: { fontSize: 10.5, fontWeight: '700', color: COLORS.text.secondary, textAlign: 'center', lineHeight: 13 },
  transparencyBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 10 },
  transparencyText: { flex: 1, fontSize: 10.5, color: '#475569', fontWeight: '600', lineHeight: 14 },
  // Modals
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  editInput: { backgroundColor: COLORS.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginTop: 16, marginBottom: 16 },
  saveBtn: { backgroundColor: COLORS.accent.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveBtnT: { fontSize: 16, fontWeight: '700', color: '#fff' },
  langOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 2 },
  langOn: { backgroundColor: COLORS.accent.primary + '10' },
  langNative: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  langEn: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  // Share score card modal
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
});
