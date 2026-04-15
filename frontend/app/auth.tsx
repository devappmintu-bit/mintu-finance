import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

type AuthStep = 'phone' | 'otp' | 'name';

export default function AuthScreen() {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [password, setPassword] = useState('');

  const { setUser, setToken } = useAuthStore();
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleSendOTP = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/send-otp', { phone: cleanPhone });
      setIsNewUser(res.data.is_new_user);
      setStep('otp');
      setResendTimer(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (text && index === 5) {
      const fullOtp = [...newOtp].join('');
      if (fullOtp.length === 6) {
        handleVerifyOTP(fullOtp);
      }
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async (otpCode?: string) => {
    const code = otpCode || otp.join('');
    if (code.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter all 6 digits');
      return;
    }

    if (isNewUser) {
      setStep('name');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone: phone.replace(/\D/g, ''),
        otp: code,
      });
      await setToken(res.data.token);
      setUser(res.data.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone: phone.replace(/\D/g, ''),
        otp: otp.join(''),
        name: name.trim(),
      });
      await setToken(res.data.token);
      setUser(res.data.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!phone || !password) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { phone: phone.replace(/\D/g, ''), password });
      await setToken(res.data.token);
      setUser(res.data.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      await api.post('/auth/resend-otp', { phone: phone.replace(/\D/g, '') });
      setResendTimer(30);
      Alert.alert('Sent!', 'A new OTP has been sent to your phone');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };

  // ─── PHONE STEP ───
  const renderPhoneStep = () => (
    <>
      <View style={styles.header}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoSymbol}>{'\u20B9'}</Text>
        </View>
        <Text style={styles.logoText}>MintU</Text>
        <Text style={styles.stepTitle}>Enter your phone number</Text>
        <Text style={styles.stepSubtitle}>We'll send you an OTP to verify</Text>
      </View>

      <View style={styles.phoneRow}>
        <View style={styles.countryCode}>
          <Text style={styles.countryText}>+91</Text>
        </View>
        <TextInput
          testID="auth-phone-input"
          style={styles.phoneInput}
          placeholder="10-digit phone number"
          placeholderTextColor={COLORS.text.muted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
          autoFocus
        />
      </View>

      <TouchableOpacity
        testID="send-otp-btn"
        style={[styles.primaryBtn, loading && styles.btnDisabled]}
        onPress={handleSendOTP}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.bg.primary} />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Send OTP</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.bg.primary} />
          </>
        )}
      </TouchableOpacity>

      <View style={styles.mockBanner}>
        <Ionicons name="information-circle" size={16} color={COLORS.accent.secondary} />
        <Text style={styles.mockBannerText}>Demo mode: OTP is always 123456</Text>
      </View>

      <TouchableOpacity
        testID="toggle-password-login"
        style={styles.switchLink}
        onPress={() => setShowPasswordLogin(!showPasswordLogin)}
      >
        <Text style={styles.switchText}>
          {showPasswordLogin ? 'Login with OTP' : 'Login with password instead'}
        </Text>
      </TouchableOpacity>

      {showPasswordLogin && (
        <View style={styles.passwordSection}>
          <TextInput
            testID="auth-password-input"
            style={styles.textInput}
            placeholder="Password"
            placeholderTextColor={COLORS.text.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            testID="password-login-btn"
            style={styles.secondaryBtn}
            onPress={handlePasswordLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.text.primary} />
            ) : (
              <Text style={styles.secondaryBtnText}>Login with Password</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  // ─── OTP STEP ───
  const renderOtpStep = () => (
    <>
      <TouchableOpacity testID="otp-back-btn" style={styles.backBtn} onPress={() => { setStep('phone'); setOtp(['','','','','','']); }}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text.primary} />
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.otpIconWrap}>
          <Ionicons name="shield-checkmark" size={40} color={COLORS.accent.primary} />
        </View>
        <Text style={styles.stepTitle}>Verify OTP</Text>
        <Text style={styles.stepSubtitle}>
          Enter the 6-digit code sent to{'\n'}
          <Text style={styles.phoneHighlight}>+91 {phone}</Text>
        </Text>
      </View>

      <View style={styles.otpRow}>
        {otp.map((digit, i) => (
          <TextInput
            key={i}
            ref={(ref) => { otpRefs.current[i] = ref; }}
            testID={`otp-input-${i}`}
            style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
            value={digit}
            onChangeText={(text) => handleOtpChange(text.slice(-1), i)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      <TouchableOpacity
        testID="verify-otp-btn"
        style={[styles.primaryBtn, loading && styles.btnDisabled]}
        onPress={() => handleVerifyOTP()}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.bg.primary} />
        ) : (
          <Text style={styles.primaryBtnText}>Verify</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        testID="resend-otp-btn"
        style={styles.resendBtn}
        onPress={handleResend}
        disabled={resendTimer > 0}
      >
        <Text style={[styles.resendText, resendTimer > 0 && styles.resendDisabled]}>
          {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
        </Text>
      </TouchableOpacity>
    </>
  );

  // ─── NAME STEP ───
  const renderNameStep = () => (
    <>
      <TouchableOpacity testID="name-back-btn" style={styles.backBtn} onPress={() => setStep('otp')}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text.primary} />
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.otpIconWrap}>
          <Ionicons name="person-add" size={40} color={COLORS.accent.primary} />
        </View>
        <Text style={styles.stepTitle}>Welcome aboard!</Text>
        <Text style={styles.stepSubtitle}>What should we call you?</Text>
      </View>

      <View style={styles.nameInputWrap}>
        <Ionicons name="person-outline" size={20} color={COLORS.text.muted} style={styles.nameIcon} />
        <TextInput
          testID="auth-name-input"
          style={styles.nameInput}
          placeholder="Your name"
          placeholderTextColor={COLORS.text.muted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
        />
      </View>

      <TouchableOpacity
        testID="name-submit-btn"
        style={[styles.primaryBtn, loading && styles.btnDisabled]}
        onPress={handleNameSubmit}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.bg.primary} />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Let's Go!</Text>
            <Ionicons name="rocket" size={18} color={COLORS.bg.primary} />
          </>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 'phone' && renderPhoneStep()}
          {step === 'otp' && renderOtpStep()}
          {step === 'name' && renderNameStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xxl },

  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg.secondary,
    borderWidth: 1, borderColor: COLORS.border.subtle, justifyContent: 'center',
    alignItems: 'center', marginBottom: SPACING.xxl,
  },

  header: { alignItems: 'center', marginBottom: 40 },
  logoIcon: {
    width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.accent.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  logoSymbol: { fontSize: 32, fontWeight: '800', color: COLORS.bg.primary },
  logoText: { fontSize: 32, fontWeight: '800', color: COLORS.text.primary, marginBottom: 24 },
  otpIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '18',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  stepTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text.primary, marginBottom: 8, textAlign: 'center' },
  stepSubtitle: { fontSize: 15, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 22 },
  phoneHighlight: { color: COLORS.accent.primary, fontWeight: '600' },

  // Phone input
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.xxl },
  countryCode: {
    backgroundColor: COLORS.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: 16,
    justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  countryText: { fontSize: 17, fontWeight: '600', color: COLORS.text.primary },
  phoneInput: {
    flex: 1, backgroundColor: COLORS.bg.secondary, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingVertical: 18, fontSize: 18,
    fontWeight: '600', color: COLORS.text.primary, borderWidth: 1,
    borderColor: COLORS.border.subtle, letterSpacing: 1,
  },

  // OTP boxes
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: SPACING.xxxl },
  otpBox: {
    width: 48, height: 56, borderRadius: RADIUS.lg, backgroundColor: COLORS.bg.secondary,
    borderWidth: 2, borderColor: COLORS.border.subtle, textAlign: 'center',
    fontSize: 22, fontWeight: '700', color: COLORS.text.primary,
  },
  otpBoxFilled: { borderColor: COLORS.accent.primary, backgroundColor: COLORS.accent.primary + '10' },

  // Name input
  nameInputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.secondary,
    borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, borderWidth: 1,
    borderColor: COLORS.border.subtle, marginBottom: SPACING.xxl,
  },
  nameIcon: { marginRight: 12 },
  nameInput: { flex: 1, paddingVertical: 18, fontSize: 17, color: COLORS.text.primary },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent.primary, borderRadius: RADIUS.full, paddingVertical: 18,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: COLORS.bg.primary },

  secondaryBtn: {
    borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.text.primary },

  resendBtn: { alignItems: 'center', marginTop: SPACING.xxl },
  resendText: { fontSize: 15, fontWeight: '600', color: COLORS.accent.primary },
  resendDisabled: { color: COLORS.text.muted },

  switchLink: { alignItems: 'center', marginTop: SPACING.xxl },
  switchText: { fontSize: 14, color: COLORS.accent.primary, fontWeight: '500' },

  mockBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent.secondary + '12', borderRadius: RADIUS.lg,
    padding: SPACING.md, marginTop: SPACING.lg,
  },
  mockBannerText: { fontSize: 13, color: COLORS.accent.secondary },

  passwordSection: { marginTop: SPACING.lg, gap: SPACING.md },
  textInput: {
    backgroundColor: COLORS.bg.secondary, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg,
    paddingVertical: 18, fontSize: 16, color: COLORS.text.primary, borderWidth: 1,
    borderColor: COLORS.border.subtle,
  },
});
