import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import { sendOtp, verifyOtpWithDevice } from '../services/user';
import { saveTokens } from '../utils/tokenStore';
import { getDeviceContext } from '../utils/deviceContext';
import { biometricAvailable, tryBiometric, setBiometricEnabled, supportedBiometricLabel } from '../utils/lockManager';
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
  // Round 99G — perceived-perf fix. The phone→OTP transition was
  // taking 4-6s of frozen-spinner time on Indian mobile networks
  // because we waited for the SMS provider before unblocking the UI.
  // Now we OPTIMISTICALLY swap to the OTP screen the instant the user
  // taps Send OTP, render the input boxes in a disabled+pulsing state
  // with "Sending code…" copy, and only enable them when the API
  // confirms. Failed sends snap back to the phone step with an alert.
  const [otpSending, setOtpSending] = useState(false);
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
    // Round 99G — switch to OTP screen IMMEDIATELY (optimistic).
    // The user sees disabled boxes + "Sending code…" copy in <100ms
    // instead of a 5s frozen orange button. Massive perceived-speed win.
    setOtpSending(true);
    setStep('otp');
    setResendTimer(0);   // we'll set it after the API confirms
    setLoading(true);
    try {
      const res = { data: await sendOtp(cleanPhone) };
      setIsNewUser(res.data.is_new_user);
      setOtpSending(false);
      setResendTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    } catch (err: any) {
      // Snap back to phone step on failure — never leave the user on
      // an OTP screen that will never receive a code.
      setStep('phone');
      setOtpSending(false);
      Alert.alert(t('error', lang), err.response?.data?.detail || 'Failed to send OTP');
    }
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
      // Round 88 — send device context so backend mints refresh token
      // and trusts this device for silent re-auth.
      const device = await getDeviceContext();
      const data = await verifyOtpWithDevice(phone.replace(/\D/g, ''), code, device);
      // ── CRITICAL: wipe ALL prior-session state BEFORE we set the new
      // token. This is the SECOND of two "every login" call sites; the
      // first is the cold-start safety net in _layout.tsx. Idempotent.
      // Even on same-user re-login this keeps the session deterministic
      // (no stale SWR cache leaking from a previous JWT).
      await clearSessionState();
      // Round 88 — V2 token storage. Prefer the 15m access_token as the
      // bearer (silent refresh kicks in on 401); persist the 30d
      // refresh_token to SecureStore. Fall back to legacy `token` if
      // the backend didn't return a V2 pair (shouldn't happen now that
      // we always send device_id, but defensive).
      const accessToken = data.access_token || data.token;
      await saveTokens({ access: accessToken, refresh: data.refresh_token });
      await setToken(accessToken); setUser(data.user);
      setIsNewUserFlag(!!data.is_new_user);
      await recordCurrentUser(data.user.id);
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
      // Round 88 — V2 verify with device context for new-user signup too.
      const device = await getDeviceContext();
      const data = await verifyOtpWithDevice(phone.replace(/\D/g, ''), otp.join(''), device, trimmed);
      // ── CRITICAL: same as handleVerifyOTP — wipe before setting new
      // token. The brand-new user MUST start with a clean slate.
      await clearSessionState();
      const accessToken = data.access_token || data.token;
      await saveTokens({ access: accessToken, refresh: data.refresh_token });
      await setToken(accessToken); setUser(data.user);
      setIsNewUserFlag(!!data.is_new_user);
      await recordCurrentUser(data.user.id);
      setPinSetupVisible(true); // fresh user → always prompt for PIN setup
    } catch (err: any) { Alert.alert(t('error', lang), err.response?.data?.detail || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  /** Round 88 — Mandatory biometric enrollment moment.
   *  Called after PIN setup completes (or is skipped). If the device has
   *  enrolled biometrics, we prompt for one successful authentication
   *  to lock biometric UNLOCK on by default. Cancelling falls back to
   *  PIN-only — non-blocking by design (we can't hold a fintech app
   *  hostage on a feature the OS-level enrollment refuses to confirm).
   */
  const promptBiometricEnrollment = async (): Promise<void> => {
    try {
      if (!(await biometricAvailable())) {
        await setBiometricEnabled(false);
        return;
      }
      const label = await supportedBiometricLabel();
      const ok = await tryBiometric(`Enable ${label} for instant unlock`);
      await setBiometricEnabled(!!ok);
    } catch {
      // Never block the welcome flow on biometric plumbing.
      try { await setBiometricEnabled(false); } catch { /* noop */ }
    }
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
        {/* R100U — Brand reconciliation. The soft 3D mascot was clashing
            with the brutalist hard-shadow / black-on-paper aesthetic of
            every other brutalist surface (Profile, Home Hero, Split,
            Budget). On confidence-critical screens (auth, settings,
            score cards) we now lead with the wordmark + a brutalist
            ink rule, not the cuddly mascot. The mascot still owns
            playful surfaces (rewards, onboarding interstitials, AI
            mascot moments) where character is the point. */}
        <View style={s.brandRule} />
        <Text style={s.logoText}>MintU</Text>
        <Text style={s.authTagline}>Money, simplified.</Text>
        <Text style={s.authTrust}>Bank-grade · Data stays in India</Text>
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
        <Text style={s.stepSubtitle}>
          {/* Round 99G — perceived-perf copy. While the OTP is in flight
              (otpSending=true) we say "Sending code to ...". The instant
              the API confirms, copy flips to the steady-state "Code sent
              to ...". This converts dead air into anticipation. */}
          {otpSending
            ? <>Sending code to{'\n'}<Text style={s.phoneHighlight}>+91 {phone}</Text></>
            : <>{t('verify_subtitle', lang)}{'\n'}<Text style={s.phoneHighlight}>+91 {phone}</Text></>}
        </Text>
      </View>
      <View style={s.otpRow}>
        {otp.map((digit, i) => (
          <TextInput
            key={i}
            ref={(ref) => { otpRefs.current[i] = ref; }}
            testID={`otp-input-${i}`}
            style={[
              s.otpBox,
              digit ? s.otpBoxFilled : null,
              // Round 99G — visibly disabled while sending. Halves
              // opacity so the user grasps "boxes are not interactive
              // yet" without reading copy.
              otpSending && { opacity: 0.4 },
            ]}
            value={digit}
            onChangeText={(text) => handleOtpChange(text, i)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
            editable={!otpSending}
            keyboardType="number-pad"
            maxLength={6}
            selectTextOnFocus
          />
        ))}
      </View>
      <TouchableOpacity testID="verify-otp-btn" style={[s.primaryBtn, (loading || otpSending) && s.btnDisabled]} onPress={() => handleVerifyOTP()} disabled={loading || otpSending}>
        {(loading || otpSending) ? <ActivityIndicator color={COLORS.text.inverse} /> : <Text style={s.primaryBtnText}>{t('verify_otp', lang)}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.resendBtn} onPress={handleResend} disabled={otpSending || resendTimer > 0}>
        <Text style={[s.resendText, (otpSending || resendTimer > 0) && s.resendDisabled]}>
          {otpSending
            ? 'Sending code…'
            : (resendTimer > 0 ? `${t('resend_in', lang)} ${resendTimer}s` : t('resend_otp', lang))}
        </Text>
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
        onDone={async () => {
          setPinSetupVisible(false);
          // Round 88 — mandatory biometric enrollment moment after PIN is set.
          // Triggers Face ID / fingerprint prompt if hardware is available.
          await promptBiometricEnrollment();
          setWelcomeAnim(true);
        }}
        onSkip={async () => {
          setPinSetupVisible(false);
          await promptBiometricEnrollment();
          setWelcomeAnim(true);
        }}
      />

      {/* Post-login welcome transition — fades in a saffron overlay then routes to Home */}
      {welcomeAnim && (
        <AuthTransitionOverlay
          variant="unlocking"
          onDone={() => {
            // Round 98 — TTFV<45s mandate. NEW users (signup just now)
            // get the single-slider income screen, which seeds their
            // coach context + starter cards before Home renders.
            // Returning users skip straight to /(tabs).
            const dest = isNewUser ? '/onboarding/income' : '/(tabs)';
            router.replace(dest as any);
          }}
        />
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
  backBtn: { width: 44, height: 44, borderRadius: 0, backgroundColor: c.bg.secondary, borderWidth: 2, borderColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xxl },
  header: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 72, height: 72, borderRadius: 0, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#0A0A0A' },
  mascotWrap: { marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  mascotSmallWrap: { marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
  logoSymbol: { fontSize: 34, fontWeight: '800', color: c.text.inverse },
  logoText: { fontSize: 34, fontWeight: '900', color: c.text.primary, marginBottom: 4, letterSpacing: -1 },
  // R100U — Brutalist brand mark replaces the soft mascot on auth screen.
  brandRule: {
    width: 56,
    height: 6,
    backgroundColor: c.text.primary,
    marginBottom: 18,
  },
  // R100S — confident static tagline (replaces randomized MascotMoment)
  authTagline: { fontSize: 15, fontWeight: '600', color: c.text.muted, marginBottom: 6, textAlign: 'center' },
  authTrust: { fontSize: 11, fontWeight: '700', color: c.text.muted, letterSpacing: 1.4, marginBottom: 24, textTransform: 'uppercase' as const, textAlign: 'center' },
  otpIconWrap: { width: 80, height: 80, borderRadius: 0, backgroundColor: c.accent.moneyIn + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#0A0A0A' },
  stepTitle: { fontSize: 26, fontWeight: '900', color: c.text.primary, marginBottom: 8, textAlign: 'center', letterSpacing: -0.8 },
  stepSubtitle: { fontSize: 15, color: c.text.secondary, textAlign: 'center', lineHeight: 24 },
  phoneHighlight: { color: c.accent.primary, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.xxl },
  countryCode: { backgroundColor: c.bg.secondary, borderRadius: 0, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 2, borderColor: '#0A0A0A' },
  countryText: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  phoneInput: { flex: 1, backgroundColor: c.bg.secondary, borderRadius: 0, paddingHorizontal: SPACING.lg, paddingVertical: 18, fontSize: 18, fontWeight: '700', color: c.text.primary, borderWidth: 2, borderColor: '#0A0A0A', letterSpacing: 1 },
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
    borderRadius: 0,
    backgroundColor: c.bg.secondary,
    borderWidth: 2,
    borderColor: '#0A0A0A',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    fontSize: 22,
    fontWeight: '900',
    // Round 87 — Profile-grade brutalist signature: mono numerals on
    // the OTP boxes. Same visual cadence as Profile's Money Score
    // metric. `Menlo` is the canonical mono everywhere in the app.
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 26,
    includeFontPadding: false,
    color: c.text.primary,
  },
  otpBoxFilled: { borderColor: c.accent.primary, backgroundColor: c.accent.primary + '12' },
  nameInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.secondary, borderRadius: 0, paddingHorizontal: SPACING.lg, borderWidth: 2, borderColor: '#0A0A0A', marginBottom: SPACING.xxl },
  nameIcon: { marginRight: 12 },
  nameInput: { flex: 1, paddingVertical: 18, fontSize: 17, color: c.text.primary, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent.primary, borderRadius: 0, paddingVertical: 18, borderWidth: 2, borderColor: '#0A0A0A' },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: '900', color: c.text.inverse, letterSpacing: 1 },
  secondaryBtn: { borderRadius: 0, paddingVertical: 16, alignItems: 'center', borderWidth: 2, borderColor: '#0A0A0A', backgroundColor: '#fff' },
  secondaryBtnText: { fontSize: 14, fontWeight: '900', color: c.text.primary, letterSpacing: 1 },
  resendBtn: { alignItems: 'center', marginTop: SPACING.xxl },
  resendText: { fontSize: 13, fontWeight: '900', color: c.accent.primary, letterSpacing: 1 },
  resendDisabled: { color: c.text.muted },
  switchLink: { alignItems: 'center', marginTop: SPACING.xxl },
  switchText: { fontSize: 13, color: c.accent.primary, fontWeight: '800', letterSpacing: 0.5 },
  mockBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent.primary + '15', borderRadius: 0, padding: SPACING.md, marginTop: SPACING.lg, borderWidth: 1, borderColor: c.accent.primary },
  mockBannerText: { fontSize: 12, color: c.accent.primary, fontWeight: '800', letterSpacing: 0.5 },
  passwordSection: { marginTop: SPACING.lg, gap: SPACING.md },
  textInput: { backgroundColor: c.bg.secondary, borderRadius: 0, paddingHorizontal: SPACING.lg, paddingVertical: 18, fontSize: 16, color: c.text.primary, borderWidth: 2, borderColor: '#0A0A0A', fontWeight: '700' },
  // Language toggle
  langToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: c.bg.secondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0, borderWidth: 2, borderColor: '#0A0A0A', marginBottom: SPACING.lg },
  langToggleText: { fontSize: 12, fontWeight: '900', color: c.text.primary, letterSpacing: 1 },
  sheetHandle: { width: 48, height: 3, borderRadius: 0, backgroundColor: '#0A0A0A', alignSelf: 'center', marginBottom: SPACING.lg },
  langModalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  langModalSheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: SPACING.xxl, maxHeight: '70%', borderTopWidth: 3, borderColor: '#0A0A0A' },
  langModalTitle: { fontSize: 22, fontWeight: '900', color: c.text.primary, marginBottom: SPACING.lg, textAlign: 'center', letterSpacing: -0.5 },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: SPACING.lg, borderRadius: 0, marginBottom: 4, borderBottomWidth: 1, borderColor: '#E4E2DB' },
  langOptionActive: { backgroundColor: c.accent.primary + '15' },
  langNative: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  langEn: { fontSize: 11, color: c.text.muted, marginTop: 2, fontWeight: '600', letterSpacing: 0.5 },
}));
