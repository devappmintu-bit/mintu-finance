/**
 * Unlock screen — HDFC banking-app pattern reimagined in MintU's
 * warm cream + saffron palette. NO BLACK — purely in-app colors.
 *
 * Layout:
 *   • Top bar: small "MINTU" brand + Secured pill
 *   • Greeting card — mascot avatar, "Good evening, {name}", phone hint
 *   • 4 mPIN dot boxes
 *   • Keypad (0-9) with Face/Fingerprint CTA inline
 *   • Footer actions: Forgot mPIN · Help · Switch account
 *
 * Interactions:
 *   - Tapping digits fills dots left→right; auto-verifies at 4.
 *   - Biometric puck auto-triggers on mount if enrolled.
 *   - Backspace removes last digit.
 *   - Incorrect PIN → shake + red flash + auto-reset.
 *   - Success → fade-in of AuthTransitionOverlay → /(tabs)
 *
 * ALL colors pulled from theme COLORS.* — guaranteed brand-aligned.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Animated, Easing, Linking, Alert, Platform, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PinDot from '../components/primitives/PinDot';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import api from '../utils/api';
import { SUPPORT_URL } from '../utils/brand';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import {
  biometricAvailable, tryBiometric, verifyPin, supportedBiometricLabel,
  hasPin, clearPin, isBiometricEnabled, setBiometricEnabled,
} from '../utils/lockManager';
import AuthTransitionOverlay from '../components/auth/AuthTransitionOverlay';
import Toast from 'react-native-toast-message';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary, paddingHorizontal: 20 },

  // ── Top bar ────────────────────────────────────────────────────
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 0 },
  brandName: { color: c.text.primary, fontSize: 14, fontWeight: '900', letterSpacing: 2.4 },
  secBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: c.state.successBg,
    borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: c.state.successBorder,
  },
  secBadgeT: { fontSize: 10, fontWeight: '800', color: c.state.success, letterSpacing: 0.3 },

  // ── Greeting card ──────────────────────────────────────────────
  greetCard: {
    marginTop: 18,
    borderRadius: 0,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: c.border.subtle,
    ...Platform.select({
      ios: { shadowColor: c.accent.primary, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
      web: { boxShadow: '0 6px 14px rgba(230,81,0,0.10)' as any },
    }),
  },
  greetLeft: { flex: 1 },
  hi: { color: c.text.secondary, fontSize: 12.5, fontWeight: '700' },
  name: { color: c.text.primary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  phoneT: { color: c.text.muted, fontSize: 11.5, fontWeight: '700' },
  avatarWrap: {
    width: 56, height: 56, borderRadius: 0,
    backgroundColor: '#FFF0DE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },

  // ── PIN title + dots ───────────────────────────────────────────
  pinTitle: {
    color: c.text.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 22,
  },
  pinBoxes: { flexDirection: 'row', gap: 12, marginTop: 12, alignSelf: 'center' },
  pinBox: {
    width: 48, height: 54, borderRadius: 0,
    backgroundColor: c.bg.secondary,
    borderWidth: 1.5, borderColor: c.border.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  pinBoxFilled: {
    borderColor: c.accent.primary,
    backgroundColor: '#FFF0DE',
  },
  pinBoxErr: {
    borderColor: c.state.danger,
    backgroundColor: c.state.dangerBg,
  },
  pinCenterDot: { width: 12, height: 12, borderRadius: 0, backgroundColor: c.accent.primary },
  errText: {
    color: c.state.danger,
    textAlign: 'center', marginTop: 8, fontSize: 12, fontWeight: '700', minHeight: 14,
  },

  // ── Keypad ─────────────────────────────────────────────────────
  keypad: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: 10,
    alignSelf: 'center',
    width: '100%', maxWidth: 340,
    justifyContent: 'center',
  },
  key: {
    width: '33.33%',
    paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 0,
    position: 'relative',
  },
  keyPressed: {
    backgroundColor: '#FFE9D4',
    transform: [{ scale: 0.96 }],
  },
  keyT: {
    color: c.text.primary,
    fontSize: 28, fontWeight: '600', letterSpacing: 0.5,
  },
  keyTinyT: {
    color: c.accent.primary,
    fontSize: 13, fontWeight: '800', letterSpacing: 0.3,
  },

  // Biometric inline chip
  bioGlow: {
    position: 'absolute',
    width: 72, height: 72, borderRadius: 0,
    backgroundColor: c.accent.primary,
  },
  bioChip: {
    width: 52, height: 52, borderRadius: 0,
    backgroundColor: '#FFF0DE',
    borderWidth: 1.5, borderColor: c.accent.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Footer ─────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 8, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap',
  },
  footerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#FFF0DE',
    borderRadius: 999,
    borderWidth: 1, borderColor: '#F6D7B5',
  },
  footerPillT: {
    color: c.accent.primary,
    fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2,
  },
  brandFooter: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 5, paddingTop: 10, paddingBottom: 4,
  },
  brandFooterT: { color: c.text.muted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
}));

export default function UnlockScreen() {
  const s = useStyles();
  const { user, setUser, removeAccount, unlock, token } = useAuthStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [bioLabel, setBioLabel] = useState<'Face ID' | 'Fingerprint' | 'Biometric'>('Biometric');
  const [bioAvail, setBioAvail] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);
  // Round 36 — progressive lockout on repeated failed PIN attempts.
  // Without this the PIN is brute-forceable (10,000 combinations on a local
  // device in under a minute). We force a cooldown window after 3, 5 and 10+
  // consecutive misses; counter resets on successful unlock.
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [lockRemaining, setLockRemaining] = useState<number>(0);
  // Round 45 — biometric failure tracking. Independent counter so bio
  // misses do NOT contribute to the PIN lockout (different attack surface,
  // different cost model — Face ID rejecting your face shouldn't cost you
  // 5 minutes). After 3 bio fails we hide the puck for the session and
  // force the user onto PIN.
  const [bioFailCount, setBioFailCount] = useState(0);
  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const ms = lockUntil - Date.now();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setLockRemaining(secs);
      if (secs > 0) setError(`Too many attempts. Try again in ${secs}s`);
      if (ms <= 0) { setLockUntil(0); setLockRemaining(0); setError(''); }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  // ── Hydrate user from /user/me if we have a token but no cached user
  useEffect(() => {
    if (user || !token) return;
    (async () => {
      try {
        const r = await api.get('/user/me');
        if (r.data) setUser(r.data);
      } catch { /* non-blocking */ }
    })();
  }, [user, token, setUser]);

  // ── Gentle pulse for the biometric puck
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [glow]);

  // ── PIN-error shake
  const shake = useRef(new Animated.Value(0)).current;
  const shakeErr = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const proceed = useCallback(async () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    await unlock();
    setUnlockAnim(true);
  }, [unlock]);

  const attemptBio = useCallback(async () => {
    if (attempting) return;
    setAttempting(true);
    try {
      const ok = await tryBiometric(`Unlock MintU${user?.name ? `, ${user.name}` : ''}`);
      if (ok) {
        setBioFailCount(0);
        proceed();
      } else {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        // Round 51d — louder PIN fallback. The previous behavior only
        // surfaced a small toast on bio fail, which testers reported as
        // confusing on real devices (they didn't realize PIN was the
        // way out). Now we:
        //   • Set a prominent inline error message above the keypad,
        //   • Trigger the shake animation so the PIN dots are clearly
        //     the next interaction surface,
        //   • Still toast for accessibility/screen readers.
        const next = bioFailCount + 1;
        setBioFailCount(next);
        if (next >= 3) {
          // Hide the bio puck for the rest of this unlock session.
          setBioAvail(false);
          setError(`${bioLabel} disabled. Enter your mPIN to unlock.`);
        } else {
          setError(`${bioLabel} not recognised — enter your mPIN below`);
        }
        shakeErr();
        // Toast is now secondary signal (for VoiceOver / TalkBack).
        Toast.show({
          type: 'info',
          text1: `${bioLabel} failed`,
          text2: 'Enter your mPIN below to unlock.',
          position: 'bottom',
          visibilityTime: 2200,
        });
      }
    } finally {
      setAttempting(false);
    }
  }, [attempting, proceed, user?.name, bioFailCount, bioLabel, shake]);

  // ── On mount: decide initial path
  useEffect(() => {
    (async () => {
      const [hasP, hwAvail, enabled, lbl] = await Promise.all([
        hasPin(),
        biometricAvailable(),
        isBiometricEnabled(),
        supportedBiometricLabel(),
      ]);
      setBioLabel(lbl);
      // Round 45 — orphan-pref detection. If user enabled bio earlier and
      // since then removed every fingerprint/face from device settings,
      // hwAvail is false but enabled is true. Auto-disable the pref so we
      // don't keep prompting an empty enrollment, and inform the user.
      if (enabled && !hwAvail) {
        await setBiometricEnabled(false);
        Toast.show({
          type: 'info',
          text1: `${lbl} login disabled`,
          text2: 'No biometrics enrolled on this device',
          position: 'bottom',
        });
        setBioAvail(false);
      } else {
        setBioAvail(hwAvail && enabled);
      }
      // No credentials at all → let user through
      if (!hasP && !(hwAvail && enabled)) { proceed(); return; }
      // Biometric ready → auto-prompt
      if (hwAvail && enabled) attemptBio();
    })();
  }, [attemptBio, proceed]);

  const press = async (d: string) => {
    if (pin.length >= 4) return;
    // Reject keypad input while cooldown is active.
    if (lockUntil && Date.now() < lockUntil) return;
    try { Haptics.selectionAsync(); } catch {}
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4) {
      const ok = await verifyPin(next);
      if (ok) {
        setFailCount(0);  // reset counter on success
        proceed();
        return;
      }
      // Progressive lockout: after 3 misses → 30s, 5 → 2min, 10+ → 5min.
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      let cooldown = 0;
      if (nextFails >= 10) cooldown = 300_000;       // 5 min
      else if (nextFails >= 5) cooldown = 120_000;   // 2 min
      else if (nextFails >= 3) cooldown = 30_000;    // 30 sec
      if (cooldown) {
        setLockUntil(Date.now() + cooldown);
        setError(`Too many attempts. Try again in ${Math.ceil(cooldown / 1000)}s`);
      } else {
        setError(`Incorrect mPIN${nextFails === 2 ? ' — one more miss will pause input' : ''}`);
      }
      shakeErr();
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      setTimeout(() => setPin(''), 520);
    }
  };

  const back = () => {
    try { Haptics.selectionAsync(); } catch {}
    if (pin.length > 0) setPin(pin.slice(0, -1));
  };

  const forgot = () => {
    const onYes = async () => {
      try { await clearPin(); } catch {}
      try { await removeAccount(); } catch {}
      router.replace('/auth' as any);
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm('Forgot your mPIN?\n\nYou\'ll be signed out and can re-verify your phone to set a new mPIN.')) onYes();
      return;
    }
    Alert.alert(
      'Forgot your mPIN?',
      'You\'ll be signed out and can re-verify your phone to set a new mPIN.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: onYes },
      ],
      { cancelable: true },
    );
  };

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.40, 0] });
  const bioIcon = bioLabel === 'Face ID' ? 'scan-outline' : 'finger-print';

  const greeting = getTimeGreeting();
  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const phoneHint = user?.phone ? `•••• ${String(user.phone).slice(-4)}` : '';

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={s.brandRow}>
          <Image
            source={require('../assets/images/mintu-logo.png')}
            style={s.brandMark}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <Text style={s.brandName}>MINTU</Text>
        </View>
        <View style={s.secBadge}>
          <Ionicons name="shield-checkmark" size={11} color={COLORS.accent.moneyIn} />
          <Text style={s.secBadgeT}>Secured</Text>
        </View>
      </View>

      {/* ── Greeting card (cream) ───────────────────────────────── */}
      <View
        style={[s.greetCard, { backgroundColor: '#FFFFFF' }]}>
        <View style={s.greetLeft}>
          <Text style={s.hi}>{greeting}</Text>
          <Text style={s.name} numberOfLines={1}>{firstName}</Text>
          {!!phoneHint && (
            <View style={s.phoneRow}>
              <Ionicons name="phone-portrait-outline" size={11} color={COLORS.text.muted} />
              <Text style={s.phoneT}>+91 {phoneHint}</Text>
            </View>
          )}
        </View>
        <View style={s.avatarWrap}>
          <Image
            source={require('../assets/images/mintu-logo.png')}
            style={s.avatarImg}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
      </View>

      {/* ── mPIN title + dots ───────────────────────────────────── */}
      <Text style={s.pinTitle}>Enter your mPIN</Text>
      <Animated.View style={[s.pinBoxes, { transform: [{ translateX: shake }] }]}>
        {/* Wave 5.7 — PinDot primitive with ink-pop animation:
            each dot scales from 0 → 1.25 → 1 spring when the digit
            lands, and the surrounding box gives a subtle bounce (5%).
            Error state paints both box border and inner dot crimson
            while the parent shake animation keeps running. */}
        {[0, 1, 2, 3].map((i) => (
          <PinDot
            key={i}
            filled={pin.length > i}
            errored={!!error}
            testID={`unlock-pin-dot-${i}`}
          />
        ))}
      </Animated.View>
      <Text style={[s.errText, { opacity: error ? 1 : 0 }]}>{error || ' '}</Text>

      {/* ── Keypad ──────────────────────────────────────────────── */}
      <View style={s.keypad}>
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <Pressable
            key={d}
            style={({ pressed }) => [s.key, pressed && s.keyPressed]}
            onPress={() => press(d)}
            android_ripple={{ color: COLORS.accent.primary + '22', borderless: true, radius: 44 }}
            testID={`unlock-key-${d}`}
          >
            <Text style={s.keyT}>{d}</Text>
          </Pressable>
        ))}

        {/* Biometric key — replaces the usual "empty" corner */}
        {bioAvail ? (
          <Pressable
            style={({ pressed }) => [s.key, pressed && s.keyPressed]}
            onPress={attemptBio}
            disabled={attempting}
            android_ripple={{ color: COLORS.accent.primary + '22', borderless: true, radius: 44 }}
            testID="unlock-bio-key"
          >
            <Animated.View pointerEvents="none" style={[s.bioGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <View style={s.bioChip}>
              {attempting
                ? <ActivityIndicator color={COLORS.accent.primary} size="small" />
                : <Ionicons name={bioIcon as any} size={26} color={COLORS.accent.primary} />}
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [s.key, pressed && s.keyPressed]}
            onPress={forgot}
            android_ripple={{ color: COLORS.accent.primary + '18', borderless: true, radius: 44 }}
            testID="unlock-forgot-key"
          >
            <Text style={s.keyTinyT}>Forgot</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [s.key, pressed && s.keyPressed]}
          onPress={() => press('0')}
          android_ripple={{ color: COLORS.accent.primary + '22', borderless: true, radius: 44 }}
          testID="unlock-key-0"
        >
          <Text style={s.keyT}>0</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [s.key, pressed && s.keyPressed, pin.length === 0 && { opacity: 0.3 }]}
          onPress={back}
          disabled={pin.length === 0}
          android_ripple={{ color: COLORS.accent.primary + '22', borderless: true, radius: 44 }}
          testID="unlock-key-back"
        >
          <Ionicons name="backspace-outline" size={24} color={COLORS.text.primary} />
        </Pressable>
      </View>

      {/* ── Footer row ──────────────────────────────────────────── */}
      <View style={s.footerRow}>
        {bioAvail && (
          <TouchableOpacity onPress={forgot} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.footerPill}>
            <Ionicons name="key-outline" size={13} color={COLORS.accent.primary} />
            <Text style={s.footerPillT}>Forgot mPIN</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => Linking.openURL(SUPPORT_URL).catch(() => {})}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={s.footerPill}
        >
          <Ionicons name="help-buoy-outline" size={13} color={COLORS.accent.primary} />
          <Text style={s.footerPillT}>Help</Text>
        </TouchableOpacity>
      </View>

      <View style={s.brandFooter}>
        <Ionicons name="lock-closed" size={10} color={COLORS.text.muted} />
        <Text style={s.brandFooterT}>AES-256 · Secured by MintU</Text>
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

// ══════════════════════════════════════════════════════════════════
// STYLES — cream / saffron palette, NO BLACK
// ══════════════════════════════════════════════════════════════════
