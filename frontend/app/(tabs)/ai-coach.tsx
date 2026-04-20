/**
 * AI Coach tab screen.
 * Lives at /app/(tabs)/ai-coach so it shows up as a regular tab in the tab-bar.
 * The actual chat UI is rendered by the existing <AICoachChat/> component.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AICoachChat from '../../components/AICoachChat';
import { COLORS } from '../../utils/theme';

export default function AICoachTab() {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.inner}>
        {/* When opened as a tab, there's no modal to close. We pass a no-op. */}
        <AICoachChat onClose={() => {}} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg.primary },
  inner: { flex: 1 },
});
