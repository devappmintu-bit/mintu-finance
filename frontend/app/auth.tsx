import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import api from '../utils/api';
import { sendOtp, verifyOtp } from '../services/user';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, ONBOARDING_IMAGES } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { LANGUAGES, LangCode } from '../utils/i18n';
import PinSetupModal from '../components/PinSetupModal';
import AuthTransitionOverlay from '../components/auth/AuthTransitionOverlay';
import Mascot from '../components/Mascot';
import MascotMoment from '../components/MascotMoment';
import { clearSessionState, recordCurrentUser } from '../utils/clearSessionState';

type AuthStep = 'phone' | 'otp' | 'name';

export default function AuthScreen() {
  const s = useStyles();
  const { lang, setLang } = useLangStore();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [welcomeAnim, setWelcomeAnim] = useState(false);
  const { setUser, setToken, setIsNewUserFlag } = useAuthStore();
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendTimer > 0) { const tm = setTimeout(() => setResendTimer(resendTimer - 1), 1000); return () => clearTimeout(tm); }
  }, [resendTimer]);

  const handleSendOTP = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) { Alert.alert(t('error', lang), 'Enter valid 10-digit number'); return; }
    // Round 33 audit fix — Indian mobile numbers must start with 6/7/8/9 per TRAI.
    // Prevents doomed OTP requests to landline / malformed numbers from burning
    // SMS quota and leaving the user waiting on a response that can never arrive.
    if (!/^[6-9]/.test(cleanPhone)) {
      Alert.alert(t('error', lang), 'Indian mobile numbers start with 6, 7, 8, or 9');
      return;
    }
    setLoading(true);
    try {
      const res = { data: await sendOtp(cleanPhone) };
      setIsNewUser(res.data.is_new_user);
      setStep('otp');
      setResendTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    } catch (err: any) { Alert.alert(t('error', lang), err.response?.data?.detail || 'Failed to send OTP'); }
    finally { setLoading(false); }
  };

  const handleOtpChange = (text: string, index: number) => {
    // Round 35 fix — support paste of full 6-digit OTP. If the user pastes
    // "123456" into any box (e.g. from SMS auto-fill or clipboard), the
    // onChangeText fires with the full string; previously we sliced to the
    // last char which threw away the other 5 digits.
    const digits = (text || '').replace(/\D/g, '');
    if (digits.length > 1) {
      const newOtp = [...otp];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newOtp[index + i] = digits[i];
      }
      setOtp(newOtp);
      const nextIdx = Math.min(index + digits.length, 5);
      otpRefs.current[nextIdx]?.focus();
      const full = newOtp.join('');
      if (full.length === 6) handleVerifyOTP(full);
      return;
    }
    const newOtp = [...otp]; newOtp[index] = digits; setOtp(newOtp);
    if (digits && index < 5) otpRefs.current[index + 1]?.focus();
    if (digits && index === 5) { const full = [...newOtp].join(''); if (full.length === 6) handleVerifyOTP(full); }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleVerifyOTP = async (otpCode?: string) => {
    const code = otpCode || otp.join('');
    if (code.length !== 6) { Alert.alert(t('error', lang), 'Enter all 6 digits'); return; }
    if (isNewUser) { setStep('name'); return; }
    setLoading(true);
    try {
      const res = { data: await verifyOtp(phone.replace(/\D/g, ''), code) };
      // ── CRITICAL: wipe ALL prior-session state BEFORE we set the new
      // token. This is the SECOND of two "every login" call sites; the
      // first is the cold-start safety net in _layout.tsx. Idempotent.
      // Even on same-user re-login this keeps the session deterministic
      // (no stale SWR cache leaking from a previous JWT).
      await clearSessionState();
      await setToken(res.data.token); setUser(res.data.user);
      setIsNewUserFlag(!!res.data.is_new_user);
      await recordCurrentUser(res.data.user.id);
      // Returning user — offer PIN setup if they've never set one (always
      // true now that clearSessionState wipes the PIN; this re-prompts on
      // every login as part of the security model).
      const { hasPin } = await import('../utils/lockManager');
      if (!(await hasPin())) { setPinSetupVisible(true); return; }
      setWelcomeAnim(true);
    } catch (err: any) { Alert.alert(t('error', lang), err.response?.data?.detail || 'Invalid OTP'); setOtp(['','','','','','']); otpRefs.current[0]?.focus(); }
    finally { setLoading(false); }
  };

  const handleNameSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert(t('error', lang), 'Enter your name'); return; }
    if (trimmed.length > 80) { Alert.alert(t('error', lang), 'Name too long (max 80)'); return; }
    setLoading(true);
    try {
      const res = { data: await api.post('/auth/verify-otp', { phone: phone.replace(/\D/g, ''), otp: otp.join(''), name: trimmed }).then(r => r.data) };
      // ── CRITICAL: same as handleVerifyOTP — wipe before setting new
      // token. The brand-new user MUST start with a clean slate.
      await clearSessionState();
      await setToken(res.data.token); setUser(res.data.user);
      setIsNewUserFlag(!!res.data.is_new_user);
      await recordCurrentUser(res.data.user.id);
      setPinSetupVisible(true); // fresh user → always prompt for PIN setup
    } catch (err: any) { Alert.alert(t('error', lang), err.response?.data?.detail || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try { await sendOtp(phone.replace(/\D/g, '')); setResendTimer(30); }
    catch (err: any) { Alert.alert(t('error', lang), err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  const renderPhoneStep = () => (
    <>
      {/* Language Selector at top */}
      <TouchableOpacity testID="auth-lang-picker" style={s.langToggle} onPress={() => setShowLangPicker(true)}>
        <Ionicons name="language" size={16} color={COLORS.accent.primary} />
        <Text style={s.langToggleText}>{LANGUAGES.find(l => l.code === lang)?.nativeName || 'English'}</Text>
        <Ionicons name="chevron-down" size={14} color={COLORS.text.muted} />
      </TouchableOpacity>

      <View style={s.header}>
        {/* Round 53l.2 — Login Personality Engine.
            Replaces the static mascot with a live, contextual moment.
            Renders the instant fallback at 0ms (offline-safe) and
            upgrades with the LLM in the background. The engine's text
            replaces the static "enter_phone / otp_subtitle" pair so
            the screen feels alive on every open. */}
        <MascotMoment mode="login" />
        <Text style={s.logoText}>MintU</Text>
      </View>
      <View style={s.phoneRow}>
        <View style={s.countryCode}><Text style={s.countryText}>+91</Text></View>
        <TextInput testID="auth-phone-input" style={s.phoneInput} placeholder="10-digit number" placeholderTextColor={COLORS.text.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} autoFocus returnKeyType="go" onSubmitEditing={handleSendOTP} />
      </View>
      <TouchableOpacity testID="send-otp-btn" style={[s.primaryBtn, loading && s.btnDisabled]} onPress={handleSendOTP} disabled={loading}>
        {loading ? <ActivityIndicator color={COLORS.text.inverse} /> : <><Text style={s.primaryBtnText}>{t('send_otp', lang)}</Text><Ionicons name="arrow-forward" size={18} color={COLORS.text.inverse} /></>}
      </TouchableOpacity>
      {/* Demo banner removed — cleaner first-impression for all builds. */}
    </>
  );

  const renderOtpStep = () => (
    <>
      <TouchableOpacity style={s.backBtn} onPress={() => { setStep('phone'); setOtp(['','','','','','']); }}><Ionicons name="arrow-back" size={22} color={COLORS.text.primary} /></TouchableOpacity>
      <View style={s.header}>
        <View style={s.mascotSmallWrap}>
          <Mascot size={72} variant="auto" />
        </View>
        <Text style={s.stepTitle}>{t('verify_otp', lang)}</Text>
        <Text style={s.stepSubtitle}>{t('verify_subtitle', lang)}{'\n'}<Text style={s.phoneHighlight}>+91 {phone}</Text></Text>
      </View>
      <View style={s.otpRow}>
        {otp.map((digit, i) => (
          <TextInput key={i} ref={(ref) => { otpRefs.current[i] = ref; }} testID={`otp-input-${i}`}
            style={[s.otpBox, digit ? s.otpBoxFilled : null]} value={digit}
            onChangeText={(text) => handleOtpChange(text, i)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
            keyboardType="number-pad" maxLength={6} selectTextOnFocus />
        ))}
      </View>
      <TouchableOpacity testID="verify-otp-btn" style={[s.primaryBtn, loading && s.btnDisabled]} onPress={() => handleVerifyOTP()} disabled={loading}>
        {loading ? <ActivityIndicator color={COLORS.text.inverse} /> : <Text style={s.primaryBtnText}>{t('verify_otp', lang)}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.resendBtn} onPress={handleResend} disabled={resendTimer > 0}>
        <Text style={[s.resendText, resendTimer > 0 && s.resendDisabled]}>{resendTimer > 0 ? `${t('resend_in', lang)} ${resendTimer}s` : t('resend_otp', lang)}</Text>
      </TouchableOpacity>
    </>
  );

  const renderNameStep = () => (
    <>
      <TouchableOpacity style={s.backBtn} onPress={() => setStep('otp')}><Ionicons name="arrow-back" size={22} color={COLORS.text.primary} /></TouchableOpacity>
      <View style={s.header}>
        <View style={s.mascotSmallWrap}>
          <Mascot size={72} variant="auto" />
        </View>
        <Text style={s.stepTitle}>{t('welcome_aboard', lang)}</Text>
        <Text style={s.stepSubtitle}>{t('what_name', lang)}</Text>
      </View>
      <View style={s.nameInputWrap}>
        <Ionicons name="person-outline" size={20} color={COLORS.text.muted} style={s.nameIcon} />
        <TextInput testID="auth-name-input" style={s.nameInput} placeholder={t('your_name', lang)} placeholderTextColor={COLORS.text.muted} value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
      </View>
      <TouchableOpacity testID="name-submit-btn" style={[s.primaryBtn, loading && s.btnDisabled]} onPress={handleNameSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color={COLORS.text.inverse} /> : <><Text style={s.primaryBtnText}>{t('lets_go', lang)}</Text><Ionicons name="rocket" size={18} color={COLORS.text.inverse} /></>}
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.keyboardView}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 'phone' && renderPhoneStep()}
          {step === 'otp' && renderOtpStep()}
          {step === 'name' && renderNameStep()}
        </ScrollView>
      </KeyboardAvoidingView>
      {/* PIN Setup Modal — shown after fresh signup or first returning OTP login */}
      <PinSetupModal
        visible={pinSetupVisible}
        onDone={() => { setPinSetupVisible(false); setWelcomeAnim(true); }}
        onSkip={() => { setPinSetupVisible(false); setWelcomeAnim(true); }}
      />

      {/* Post-login welcome transition — fades in a saffron overlay then routes to Home */}
      {welcomeAnim && (
        <AuthTransitionOverlay variant="unlocking" onDone={() => router.replace('/(tabs)')} />
      )}

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} animationType="slide" transparent>
        <View style={s.langModalBg}>
          <View style={s.langModalSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.langModalTitle}>{t('language', lang)}</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.langOption, lang === item.code && s.langOptionActive]} onPress={() => { setLang(item.code); setShowLangPicker(false); }}>
                  <View><Text style={s.langNative}>{item.nativeName}</Text><Text style={s.langEn}>{item.name}</Text></View>
                  {lang === item.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xxl },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xxl },
  header: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  mascotWrap: { marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  mascotSmallWrap: { marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
  logoSymbol: { fontSize: 34, fontWeight: '800', color: c.text.inverse },
  logoText: { fontSize: 34, fontWeight: '800', color: c.text.primary, marginBottom: 24 },
  otpIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.accent.moneyIn + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  stepTitle: { fontSize: 24, fontWeight: '800', color: c.text.primary, marginBottom: 8, textAlign: 'center' },
  stepSubtitle: { fontSize: 15, color: c.text.secondary, textAlign: 'center', lineHeight: 24 },
  phoneHighlight: { color: c.accent.primary, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.xxl },
  countryCode: { backgroundColor: c.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: c.border.subtle },
  countryText: { fontSize: 17, fontWeight: '600', color: c.text.primary },
  phoneInput: { flex: 1, backgroundColor: c.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: 18, fontSize: 18, fontWeight: '600', color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle, letterSpacing: 1 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: SPACING.xxxl },
  // Round 51e — uniform OTP box sizing across Android & iOS.
  // Previously the first box rendered visibly larger on Android because:
  //   • the OS applies its own default `paddingHorizontal` to focused
  //     TextInputs (the first box receives focus on mount), and
  //   • Android adds extra `includeFontPadding` to text rendering.
  // Fix: zero internal padding, disable font padding, set explicit
  // `lineHeight` + `textAlignVertical: 'center'`, and force `flexGrow: 0`
  // so flexbox can never widen one box to fill leftover space.
  otpBox: {
    width: 48,
    height: 56,
    minWidth: 48,
    maxWidth: 48,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: RADIUS.lg,
    backgroundColor: c.bg.secondary,
    borderWidth: 2,
    borderColor: c.border.subtle,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
    includeFontPadding: false,
    color: c.text.primary,
  },
  otpBoxFilled: { borderColor: c.accent.primary, backgroundColor: c.accent.primary + '08' },
  nameInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, borderWidth: 1, borderColor: c.border.subtle, marginBottom: SPACING.xxl },
  nameIcon: { marginRight: 12 },
  nameInput: { flex: 1, paddingVertical: 18, fontSize: 17, color: c.text.primary },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18 },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: c.text.inverse },
  secondaryBtn: { borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: c.border.subtle },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: c.text.primary },
  resendBtn: { alignItems: 'center', marginTop: SPACING.xxl },
  resendText: { fontSize: 15, fontWeight: '600', color: c.accent.primary },
  resendDisabled: { color: c.text.muted },
  switchLink: { alignItems: 'center', marginTop: SPACING.xxl },
  switchText: { fontSize: 14, color: c.accent.primary, fontWeight: '500' },
  mockBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent.primary + '10', borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.lg },
  mockBannerText: { fontSize: 13, color: c.accent.primary },
  passwordSection: { marginTop: SPACING.lg, gap: SPACING.md },
  textInput: { backgroundColor: c.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: 18, fontSize: 16, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle },
  // Language toggle
  langToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: c.bg.secondary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: c.border.subtle, marginBottom: SPACING.lg },
  langToggleText: { fontSize: 14, fontWeight: '600', color: c.text.primary },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  langModalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  langModalSheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '70%' },
  langModalTitle: { fontSize: 22, fontWeight: '700', color: c.text.primary, marginBottom: SPACING.lg, textAlign: 'center' },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: 4 },
  langOptionActive: { backgroundColor: c.accent.primary + '10' },
  langNative: { fontSize: 18, fontWeight: '600', color: c.text.primary },
  langEn: { fontSize: 12, color: c.text.muted, marginTop: 2 },
}));
