import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/theme';

/**
 * Return landing hit by Razorpay Checkout after payment (success OR cancel).
 * On web: closes the popup tab.
 * On native: routes back to Profile via expo-web-browser dismissing the auth session.
 */
export default function PremiumActivated() {
  const { ok, reason } = useLocalSearchParams<{ ok?: string; reason?: string }>();
  const success = ok === '1';

  useEffect(() => {
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { window.close(); } catch {}
      }
      router.replace('/(tabs)/profile' as any);
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={s.wrap}>
      <Ionicons name={success ? 'diamond' : 'close-circle'} size={72} color={success ? '#F56E1E' : '#EF4444'} />
      <Text style={s.title}>{success ? 'Premium activated' : 'Payment cancelled'}</Text>
      <Text style={s.sub}>
        {success ? 'Welcome to MintU Premium 🎉' : (reason === 'cancelled' ? 'You closed the payment window' : 'Please try again')}
      </Text>
      <ActivityIndicator color="#F56E1E" size="small" style={{ marginTop: 18 }} />
      <Text style={s.hint}>Returning to app…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg.primary, padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary, marginTop: 14 },
  sub: { fontSize: 14, color: COLORS.text.muted, marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, color: COLORS.text.muted, marginTop: 8 },
});
