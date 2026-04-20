import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/theme';

/**
 * Landing route hit by Google OAuth redirect after consent.
 * On web: closes the popup window (or redirects back into /gmail).
 * On native: routed via expo-web-browser close — but if deep-linked into
 * the app shell directly, we navigate to /gmail which shows the connected state.
 */
export default function GmailConnected() {
  const { success, email, error } = useLocalSearchParams<{ success?: string; email?: string; error?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        try { window.close(); } catch {}
      }
      // Always navigate back into the Gmail screen so the app reflects the new status
      router.replace('/gmail' as any);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  const ok = success === '1' && !error;
  return (
    <View style={s.wrap}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={64} color={ok ? '#10B981' : '#EF4444'} />
      <Text style={s.title}>{ok ? 'Gmail connected' : 'Connection failed'}</Text>
      {!!email && <Text style={s.sub}>{email}</Text>}
      {!!error && <Text style={s.err}>{error}</Text>}
      <ActivityIndicator color="#F56E1E" size="small" style={{ marginTop: 18 }} />
      <Text style={s.hint}>Returning to app…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg.primary, padding: 24 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, marginTop: 14 },
  sub: { fontSize: 14, color: COLORS.text.muted, marginTop: 6 },
  err: { fontSize: 12, color: '#EF4444', marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, color: COLORS.text.muted, marginTop: 8 },
});
