/**
 * /premium-activated — R113 brutal convergence.
 * Landing hit by Razorpay Checkout after payment (success OR cancel).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import {
  BrutalCard,
  BR_COLORS,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';
import Confetti from '../components/Confetti';

export default function PremiumActivated() {
  const { ok, reason } = useLocalSearchParams<{ ok?: string; reason?: string }>();
  const success = ok === '1';
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (success) {
      setConfetti(true);
      try {
        Toast.show({
          type: 'success',
          text1: '🎉 Welcome to Premium',
          text2: 'All features unlocked. Check your profile.',
          position: 'bottom',
          visibilityTime: 3200,
        });
      } catch {}
    }
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { window.close(); } catch {}
      }
      router.replace('/(tabs)/profile' as any);
    }, success ? 2200 : 1000);
    return () => clearTimeout(t);
  }, [success]);

  return (
    <View style={s.wrap}>
      <Confetti trigger={confetti} onDone={() => setConfetti(false)} />
      <BrutalCard variant={success ? 'purple' : 'peach'} style={s.card}>
        <Ionicons
          name={success ? 'diamond' : 'close-circle'}
          size={72}
          color={BR_COLORS.ink}
        />
        <Text style={s.title}>
          {success ? 'PREMIUM ACTIVATED' : 'PAYMENT CANCELLED'}
        </Text>
        <Text style={s.sub}>
          {success
            ? 'Welcome to MintU Premium 🎉'
            : reason === 'cancelled'
              ? 'You closed the payment window'
              : 'Please try again'}
        </Text>
        <ActivityIndicator color={PALETTE.brand} size="small" style={{ marginTop: BR_SPACE['4'] }} />
        <Text style={s.hint}>Returning to app…</Text>
      </BrutalCard>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BR_COLORS.bg, padding: BR_SPACE['5'] },
  card: { alignItems: 'center', paddingVertical: BR_SPACE['7'], paddingHorizontal: BR_SPACE['5'], minWidth: 300 },
  title: { ...BR_FONT.h2, fontSize: 20, color: BR_COLORS.ink, marginTop: BR_SPACE['3'], textAlign: 'center', letterSpacing: 0.5 },
  sub: { fontSize: 14, color: BR_COLORS.text, fontWeight: '600', marginTop: BR_SPACE['2'], textAlign: 'center' },
  hint: { ...BR_FONT.caption, fontSize: 11, color: BR_COLORS.textMuted, marginTop: 8 },
});
