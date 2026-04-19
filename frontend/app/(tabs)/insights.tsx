/**
 * AI Coach tab screen — thin wrapper around the shared <AICoachChat /> component.
 *
 * Previously ~324 lines that duplicated the modal AICoachChat.tsx implementation
 * (welcome, smart fallback, context fetch, message state, bubbles, styles).
 * Now reuses the single source of truth.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AICoachChat from '../../components/AICoachChat';
import { COLORS } from '../../utils/theme';

export default function InsightsScreen() {
  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <View style={s.content}>
        <AICoachChat onClose={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg.primary },
  content: { flex: 1 },
});
