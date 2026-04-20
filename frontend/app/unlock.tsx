/**
 * Unlock screen — banking-app pattern (HDFC style) with MintU orange palette.
 *
 * Layout from top to bottom:
 *   • Small header with app name + security badge
 *   • 4 square PIN boxes (filled on digit tap, orange highlight)
 *   • Prominent "Login with Fingerprint" CTA (orange gradient)
 *   • "Or, login with mPIN"  (opens keypad)  |  "Forgot mPIN?"  (wipes PIN)
 *   • Optional number keypad when PIN mode is active
 *   • Footer: Maintenance · Reach Us · Secured by MintU
 *
 * Biometric flow auto-fires on mount (OS dialog handles its own UI).
 * Per-resume lock is handled by hooks/useAppLock.ts.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../store/authStore';
import {
  biometricAvailable, tryBiometric, verifyPin, supportedBiometricLabel,
  hasPin, clearPin, isBiometricEnabled,
} from '../utils/lockManager';
import AuthTransitionOverlay from '../components/auth/AuthTransitionOverlay';

const ACCENT = '#F56E1E';
const ACCENT_DEEP = '#C14A06';
const BG = '#0F0A06';         // deep espresso — banking-app serious tone
const BG_SOFT = '#1A120A';
const TEXT = '#F8F1EA';
const TEXT_DIM = '#B8A393';

export default function UnlockScreen() {
  const { user, removeAccount, unlock } = useAuthStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [bioAvail, setBioAvail] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);

  // Soft-glow pulse behind the fingerprint icon
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
      const ok = await tryBiometric(`Unlock MintU, ${user?.name || 'welcome back'}`);
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
      const [lbl, hwAvail, enabled] = await Promise.all([
        supportedBiometricLabel(),
        biometricAvailable(),
        isBiometricEnabled(),
      ]);
      setBioLabel(lbl);
      setBioAvail(hwAvail && enabled);
      if (hwAvail && enabled) attemptBio();
      else setPinMode(true);
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
      setError('Incorrect mPIN. Try again.');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setTimeout(() => setPin(''), 450);
    }
  };

  const back = () => { if (pin.length > 0) setPin(pin.slice(0, -1)); };

  const forgot = async () => {
    await clearPin();
    await removeAccount();
    router.replace('/auth' as any);
  };

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const fpIcon = bioLabel === 'Face ID' ? 'scan-outline' : 'finger-print';

  return (
    <SafeAreaView style={s.container}>
      {/* ─── Top bar: app name + security badge ─── */}
      <View style={s.topBar}>
        <View style={s.brandRow}>
          <View style={s.brandDot} />
          <Text style={s.brandName}>MintU</Text>
        </View>
        <View style={s.secBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#86EFAC" />
          <Text style={s.secBadgeT}>Secured</Text>
        </View>
      </View>

      {/* ─── Greeting ─── */}
      <View style={s.greet}>
        <Text style={s.hi}>{getTimeGreeting()}</Text>
        <Text style={s.name} numberOfLines={1}>{user?.name || 'Welcome'}</Text>
      </View>

      {/* ─── PIN dot boxes (always visible — banking-app style) ─── */}
      <View style={s.pinBoxes}>
        {[0, 1, 2, 3].map((i) => {
          const filled = pin.length > i;
          const errored = !!error;
          return (
            <View
              key={i}
              style={[
                s.pinBox,
                filled && s.pinBoxFilled,
                errored && s.pinBoxErr,
              ]}
            >
              {filled && <View style={s.pinCenterDot} />}
            </View>
          );
        })}
      </View>
      {!!error && <Text style={s.errText}>{error}</Text>}

      {/* ─── Fingerprint centerpiece ─── */}
      <View style={s.fpWrap}>
        <Animated.View pointerEvents="none" style={[s.fpGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <TouchableOpacity
          onPress={bioAvail ? attemptBio : () => setPinMode(true)}
          disabled={attempting}
          activeOpacity={0.85}
          style={s.fpPuck}
          testID="unlock-bio-puck"
        >
          {attempting
            ? <ActivityIndicator color="#fff" size="large" />
            : <Ionicons name={fpIcon as any} size={54} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* ─── Primary CTA ─── */}
      <TouchableOpacity
        style={s.ctaWrap}
        activeOpacity={0.88}
        onPress={bioAvail ? attemptBio : () => setPinMode(true)}
        disabled={attempting}
      >
        <LinearGradient
          colors={[ACCENT, ACCENT_DEEP]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.cta}
        >
          <Ionicons name={fpIcon as any} size={18} color="#fff" />
          <Text style={s.ctaT}>
            {attempting ? 'Authenticating…' : bioAvail ? `Login with ${bioLabel}` : 'Login with mPIN'}
          </Text>
          <Ionicons name={fpIcon as any} size={18} color="#fff" style={{ opacity: 0.6 }} />
        </LinearGradient>
      </TouchableOpacity>

      {/* ─── mPIN link row ─── */}
      <View style={s.linksRow}>
        <TouchableOpacity onPress={() => setPinMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.link}>Or, login with mPIN</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={forgot} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.link}>Forgot mPIN?</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Keypad (collapsible) ─── */}
      {pinMode && (
        <View style={s.keypad}>
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <TouchableOpacity key={d} style={s.key} onPress={() => press(d)} activeOpacity={0.55}>
              <Text style={s.keyT}>{d}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.key} onPress={() => { if (bioAvail) attemptBio(); else setPinMode(false); }} activeOpacity={0.55}>
            <Ionicons name={fpIcon as any} size={22} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity style={s.key} onPress={() => press('0')} activeOpacity={0.55}>
            <Text style={s.keyT}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.key} onPress={back} activeOpacity={0.55}>
            <Ionicons name="backspace-outline" size={22} color={TEXT} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Footer ─── */}
      <View style={s.footer}>
        <TouchableOpacity onPress={() => Linking.openURL('https://mintu.app/support').catch(() => {})}>
          <View style={s.footItem}>
            <Ionicons name="construct-outline" size={13} color={TEXT_DIM} />
            <Text style={s.footT}>Maintenance</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:help@mintu.app').catch(() => {})}>
          <View style={s.footItem}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={TEXT_DIM} />
            <Text style={s.footT}>Reach Us</Text>
          </View>
        </TouchableOpacity>
        <View style={s.footItem}>
          <Ionicons name="shield-checkmark" size={13} color="#86EFAC" />
          <Text style={[s.footT, { color: '#86EFAC' }]}>Secured by MintU</Text>
        </View>
      </View>

      {unlockAnim && (
        <AuthTransitionOverlay variant="unlocking" onDone={() => router.replace('/(tabs)' as any)} />
      )}
    </SafeAreaView>
  );
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Hey, night owl';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  brandName: { color: TEXT, fontSize: 15, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  secBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(134,239,172,0.1)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(134,239,172,0.3)' },
  secBadgeT: { fontSize: 10.5, fontWeight: '800', color: '#86EFAC', letterSpacing: 0.3 },

  greet: { marginTop: 22 },
  hi: { color: TEXT_DIM, fontSize: 13, fontWeight: '700' },
  name: { color: TEXT, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },

  pinBoxes: { flexDirection: 'row', gap: 12, marginTop: 26, alignSelf: 'center' },
  pinBox: {
    width: 52, height: 58, borderRadius: 14,
    backgroundColor: BG_SOFT,
    borderWidth: 1.5, borderColor: 'rgba(248,241,234,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  pinBoxFilled: { borderColor: ACCENT, backgroundColor: 'rgba(245,110,30,0.12)' },
  pinBoxErr: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  pinCenterDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT },
  errText: { color: '#FCA5A5', textAlign: 'center', marginTop: 10, fontSize: 12.5, fontWeight: '700' },

  fpWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 24 },
  fpGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: ACCENT },
  fpPuck: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT_DEEP, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 16,
  },

  ctaWrap: { borderRadius: 16, overflow: 'hidden' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16 },
  ctaT: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.4, flex: 1, textAlign: 'center' },

  linksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  link: { color: ACCENT, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, alignSelf: 'center', width: '100%', maxWidth: 320 },
  key: { width: '33.33%', aspectRatio: 1.5, alignItems: 'center', justifyContent: 'center' },
  keyT: { color: TEXT, fontSize: 26, fontWeight: '700' },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingVertical: 16 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footT: { color: TEXT_DIM, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
});
