// Unlock screen — prompts for biometric first, falls back to a 4-digit PIN
// keypad. Shown when the app relaunches and the user has already registered.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from '../utils/i18n';
import { COLORS, SPACING, RADIUS } from '../utils/theme';
import { biometricAvailable, tryBiometric, verifyPin, supportedBiometricLabel, hasPin, clearPin, isBiometricEnabled } from '../utils/lockManager';
import MintULogo from '../components/MintULogo';
import AuthTransitionOverlay from '../components/auth/AuthTransitionOverlay';

export default function UnlockScreen() {
  const { user, removeAccount, unlock } = useAuthStore();
  const { lang } = useLangStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [bioAvail, setBioAvail] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);

  const proceed = useCallback(async () => {
    await unlock();
    setUnlockAnim(true);
  }, [unlock]);

  const attemptBio = useCallback(async () => {
    if (attempting) return;
    setAttempting(true);
    try {
      const ok = await tryBiometric(`Unlock MintU, ${user?.name || 'there'}`);
      if (ok) proceed();
    } finally {
      setAttempting(false);
    }
  }, [attempting, proceed, user?.name]);

  useEffect(() => {
    (async () => {
      // If the user never set up a PIN/biometric (e.g. fresh install), don't block — go in.
      if (!(await hasPin()) && !(await biometricAvailable())) {
        proceed();
        return;
      }
      const lbl = await supportedBiometricLabel();
      const avail = await biometricAvailable();
      const enabled = await isBiometricEnabled();
      setBioLabel(lbl);
      setBioAvail(avail && enabled);
      // Auto-prompt biometric if hardware available AND user hasn't opted out.
      if (avail && enabled) attemptBio();
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
      setError(t('error', lang) + ' — wrong PIN');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setTimeout(() => setPin(''), 400);
    }
  };

  const back = () => { if (pin.length > 0) setPin(pin.slice(0, -1)); };

  const forgot = async () => {
    await clearPin();
    await removeAccount();
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        <View style={s.logoWrap}><MintULogo size={92} glow /></View>
        <Text style={s.title}>{t('welcome_back', lang)}</Text>
        <Text style={s.name}>{user?.name || ''}</Text>

        <View style={s.dotsRow}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[s.dot, pin.length > i && s.dotFilled, !!error && s.dotErr]} />
          ))}
        </View>
        {!!error && <Text style={s.errorText}>{error}</Text>}

        {bioAvail && (
          <TouchableOpacity style={s.bioBtn} onPress={attemptBio} disabled={attempting}>
            {attempting
              ? <ActivityIndicator color={COLORS.accent.primary} />
              : <>
                  <Ionicons name={bioLabel === 'Face ID' ? 'scan-outline' : 'finger-print'} size={22} color={COLORS.accent.primary} />
                  <Text style={s.bioBtnText}>Use {bioLabel}</Text>
                </>
            }
          </TouchableOpacity>
        )}

        <View style={s.keypad}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <TouchableOpacity key={d} style={s.key} onPress={() => press(d)} activeOpacity={0.6}>
              <Text style={s.keyText}>{d}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.key} onPress={forgot} activeOpacity={0.6}>
            <Text style={s.forgotText}>Forgot</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.key} onPress={() => press('0')} activeOpacity={0.6}>
            <Text style={s.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.key} onPress={back} activeOpacity={0.6}>
            <Ionicons name="backspace-outline" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {unlockAnim && (
        <AuthTransitionOverlay
          variant="unlocking"
          onDone={() => router.replace('/(tabs)')}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  inner: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl },
  logoWrap: { marginTop: SPACING.xl, marginBottom: SPACING.lg },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  name: { fontSize: 15, color: COLORS.text.muted, marginBottom: SPACING.xl },
  dotsRow: { flexDirection: 'row', gap: 18, marginVertical: SPACING.lg },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: COLORS.accent.primary + '55' },
  dotFilled: { backgroundColor: COLORS.accent.primary, borderColor: COLORS.accent.primary },
  dotErr: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
  errorText: { color: '#EF4444', fontSize: 13, marginTop: 4 },
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent.primary + '15',
    marginTop: SPACING.lg, marginBottom: SPACING.md,
  },
  bioBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.accent.primary },
  keypad: {
    marginTop: SPACING.lg,
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  key: {
    width: '33.33%',
    aspectRatio: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 26, fontWeight: '600', color: COLORS.text.primary },
  forgotText: { fontSize: 12, color: COLORS.text.muted, fontWeight: '600' },
});
