/**
 * /pulse — R111 redirect to Money Pulse v2.
 *
 * The legacy Instagram-story Pulse used LLM-fabricated headlines.
 * Per the R111 master prompt ("Inshorts for Personal Finance,
 * verified sources, real-time, personalized"), we redirect every
 * legacy entry-point to the new pulse-v2 surface so existing
 * deep-links + Home tiles light up the new experience without
 * requiring a coordinated frontend re-wire.
 */
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

export default function PulseRedirect() {
  useEffect(() => {
    // replace() so the legacy URL doesn't sit on the back stack —
    // user back-tap should leave Pulse entirely, not loop here.
    const t = setTimeout(() => {
      try { router.replace('/pulse-v2' as any); } catch { /* noop */ }
    }, 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF6EE' }}>
      <ActivityIndicator size="small" color="#0A0A0A" />
    </View>
  );
}
