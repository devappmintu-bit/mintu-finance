/**
 * /gmail-connected — R113 brutal convergence.
 * Landing route hit by Google OAuth redirect after consent.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  BrutalCard,
  BR_COLORS,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';

export default function GmailConnected() {
  const { success, email, error } = useLocalSearchParams<{ success?: string; email?: string; error?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { window.close(); } catch {}
      }
      router.replace('/gmail' as any);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  const ok = success === '1' && !error;
  return (
    <View style={s.wrap}>
      <BrutalCard variant={ok ? 'lime' : 'peach'} style={s.card}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={64}
          color={BR_COLORS.ink}
        />
        <Text style={s.title}>{ok ? 'GMAIL CONNECTED' : 'CONNECTION FAILED'}</Text>
        {!!email && <Text style={s.sub}>{email}</Text>}
        {!!error && <Text style={s.err}>{error}</Text>}
        <ActivityIndicator color={PALETTE.brand} size="small" style={{ marginTop: BR_SPACE['4'] }} />
        <Text style={s.hint}>Returning to app…</Text>
      </BrutalCard>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BR_COLORS.bg, padding: BR_SPACE['5'] },
  card: { alignItems: 'center', paddingVertical: BR_SPACE['7'], paddingHorizontal: BR_SPACE['5'], minWidth: 280 },
  title: { ...BR_FONT.h2, fontSize: 18, color: BR_COLORS.ink, marginTop: BR_SPACE['3'], textAlign: 'center' },
  sub: { fontSize: 13, color: BR_COLORS.text, fontWeight: '600', marginTop: 6 },
  err: { fontSize: 12, color: PALETTE.danger, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  hint: { ...BR_FONT.caption, fontSize: 11, color: BR_COLORS.textMuted, marginTop: 8 },
});
