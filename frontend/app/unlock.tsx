/**
 * Unlock screen (v2) — Gen-Z glow-up.
 *  • Hero FaceID/fingerprint puck front-and-centre with glow pulse
 *  • Chunky typography, orange primary, soft cream background
 *  • Biometric CTA prominent; PIN keypad collapsed behind a toggle
 *  • Auto-invokes biometric on mount AND on every app resume (see useAppLock)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import {
  biometricAvailable, tryBiometric, verifyPin, supportedBiometricLabel,
  hasPin, clearPin, isBiometricEnabled,
} from '../utils/lockManager';
import AuthTransitionOverlay from '../components/auth/AuthTransitionOverlay';

const ACCENT = '#F56E1E';
const ACCENT_DEEP = '#C14A06';

export default function UnlockScreen() {
  const { user, removeAccount, unlock } = useAuthStore();
  const { lang } = useLangStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [bioAvail, setBioAvail] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);

  // Pulse animation for the biometric puck
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const proceed = useCallback(async () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    await unlock();
    setUnlockAnim(true);
  }, [unlock]);

  const attemptBio = useCallback(async () => {
    if (attempting) return;
    setAttempting(true);
    try {
      const ok = await tryBiometric(`Unlock MintU, ${user?.name || 'bestie'}`);
      if (ok) proceed();
      else { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {} }
    } finally {
      setAttempting(false);
    }
  }, [attempting, proceed, user?.name]);

  useEffect(() => {
    (async () => {
      if (!(await hasPin()) && !(await biometricAvailable())) {
        proceed();
        return;
      }
      const [lbl, hwAvail, enabled] = await Promise.all([supportedBiometricLabel(), biometricAvailable(), isBiometricEnabled()]);
      setBioLabel(lbl);
      setBioAvail(hwAvail && enabled);
      if (hwAvail && enabled) attemptBio();
      else setShowPin(true);
    })();
  }, [attemptBio, proceed]);

  const press = async (d: string) => {
    if (pin.length >= 4) return;
    try { Haptics.selectionAsync(); } catch {}
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4) {
      const ok = await verifyPin(next);
      if (ok) { proceed(); return; }
      setError('Wrong PIN — try again');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setTimeout(() => setPin(''), 400);
    }
  };

  const back = () => { if (pin.length > 0) setPin(pin.slice(0, -1)); };

  const forgot = async () => {
    await clearPin();
    await removeAccount();
    router.replace('/auth' as any);
  };

  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });
  const ringScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const icon = bioLabel === 'Face ID' ? 'scan-outline' : bioLabel === 'Fingerprint' ? 'finger-print' : 'lock-closed';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        <View style={s.greetWrap}>
          <Text style={s.hey}>{getTimeGreeting()} 👋</Text>
          <Text style={s.name}>{user?.name || 'Welcome back'}</Text>
          <Text style={s.tag}>Tap to unlock with {bioAvail ? bioLabel : 'your PIN'}</Text>
        </View>

        {/* Biometric puck */}
        <View style={s.puckWrap}>
          <Animated.View pointerEvents="none" style={[s.puckRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
          <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
              style={s.puck}
              onPress={bioAvail ? attemptBio : () => setShowPin(true)}
              disabled={attempting}
              activeOpacity={0.85}
              testID="unlock-bio-puck"
            >
              {attempting ? <ActivityIndicator color="#fff" size="large" /> : <Ionicons name={icon as any} size={64} color="#fff" />}
            </TouchableOpacity>
          </Animated.View>
          <Text style={s.puckHint}>{attempting ? 'Authenticating…' : (bioAvail ? `Use ${bioLabel}` : 'Tap to enter PIN')}</Text>
        </View>

        {/* PIN entry (collapsible) */}
        {showPin && (
          <View style={s.pinArea}>
            <View style={s.dotsRow}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[s.dot, pin.length > i && s.dotFilled, !!error && s.dotErr]} />
              ))}
            </View>
            {!!error && <Text style={s.errorText}>{error}</Text>}
            <View style={s.keypad}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <TouchableOpacity key={d} style={s.key} onPress={() => press(d)} activeOpacity={0.55}>
                  <Text style={s.keyText}>{d}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.key} onPress={forgot} activeOpacity={0.55}><Text style={s.forgotText}>Forgot</Text></TouchableOpacity>
              <TouchableOpacity style={s.key} onPress={() => press('0')} activeOpacity={0.55}><Text style={s.keyText}>0</Text></TouchableOpacity>
              <TouchableOpacity style={s.key} onPress={back} activeOpacity={0.55}><Ionicons name="backspace-outline" size={24} color={'#1F0A02'} /></TouchableOpacity>
            </View>
          </View>
        )}

        {!showPin && bioAvail && (
          <TouchableOpacity style={s.usePin} onPress={() => setShowPin(true)} activeOpacity={0.75}>
            <Text style={s.usePinT}>Use PIN instead</Text>
          </TouchableOpacity>
        )}
      </View>

      {unlockAnim && (
        <AuthTransitionOverlay variant="unlocking" onDone={() => router.replace('/(tabs)' as any)} />
      )}
    </SafeAreaView>
  );
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Up late,';
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  if (h < 21) return 'Good evening,';
  return 'Hey night owl,';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7ED' },
  inner: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },

  greetWrap: { marginTop: 36, alignItems: 'center' },
  hey: { fontSize: 13, color: '#8A5A33', fontWeight: '700', letterSpacing: 0.3 },
  name: { fontSize: 30, fontWeight: '900', color: '#1F0A02', letterSpacing: -0.8, marginTop: 4 },
  tag: { fontSize: 13, color: '#6B3E1F', marginTop: 8, fontWeight: '600' },

  puckWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  puckRing: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: ACCENT,
  },
  puck: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT_DEEP, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.42, shadowRadius: 22, elevation: 16,
  },
  puckHint: { fontSize: 13, fontWeight: '800', color: '#7C2D12', marginTop: 8, letterSpacing: 0.3 },

  usePin: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, backgroundColor: 'rgba(245,110,30,0.08)' },
  usePinT: { fontSize: 13, fontWeight: '800', color: ACCENT_DEEP },

  pinArea: { alignItems: 'center', paddingBottom: 16 },
  dotsRow: { flexDirection: 'row', gap: 16, marginVertical: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: ACCENT + '66' },
  dotFilled: { backgroundColor: ACCENT, borderColor: ACCENT },
  dotErr: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 6, fontWeight: '700' },

  keypad: { width: '100%', maxWidth: 300, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 },
  key: { width: '33.33%', aspectRatio: 1.5, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontWeight: '800', color: '#1F0A02' },
  forgotText: { fontSize: 12, color: '#8A5A33', fontWeight: '800' },
});
