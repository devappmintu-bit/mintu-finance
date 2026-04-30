import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import Confetti from '../components/Confetti';

/**
 * Return landing hit by Razorpay Checkout after payment (success OR cancel).
 * Round 56 — Polish: fires a confetti burst + success toast on `ok=1` so the
 * user gets an emotional reward before the auto-return. On web, closes the
 * popup tab; on native, routes back to Profile.
 */
export default function PremiumActivated() {
  const s = useStyles();
  const { ok, reason } = useLocalSearchParams<{ ok?: string; reason?: string }>();
  const success = ok === '1';
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (success) {
      // Trigger confetti immediately and show a success toast.
      setConfetti(true);
      try {
        Toast.show({
          type: 'success',
          text1: '🎉 Welcome to Premium',
          text2: 'All features unlocked. Check your profile.',
          position: 'bottom',
          visibilityTime: 3200,
        });
      } catch { /* noop */ }
    }
    // Give the confetti a moment to animate before we auto-navigate away.
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { window.close(); } catch { /* noop */ }
      }
      router.replace('/(tabs)/profile' as any);
    }, success ? 2200 : 1000);
    return () => clearTimeout(t);
  }, [success]);

  return (
    <View style={s.wrap}>
      <Confetti trigger={confetti} onDone={() => setConfetti(false)} />
      <Ionicons
        name={success ? 'diamond' : 'close-circle'}
        size={72}
        color={success ? COLORS.accent.brand : COLORS.state.danger}
      />
      <Text style={s.title}>{success ? 'Premium activated' : 'Payment cancelled'}</Text>
      <Text style={s.sub}>
        {success
          ? 'Welcome to MintU Premium 🎉'
          : reason === 'cancelled'
            ? 'You closed the payment window'
            : 'Please try again'}
      </Text>
      <ActivityIndicator color={COLORS.accent.brand} size="small" style={{ marginTop: 18 }} />
      <Text style={s.hint}>Returning to app…</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.primary, padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: c.text.primary, marginTop: 14 },
  sub: { fontSize: 14, color: c.text.muted, marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, color: c.text.muted, marginTop: 8 },
}));
