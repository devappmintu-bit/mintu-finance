/**
 * ErrorState — friendly error view with retry CTA.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from './PrimaryButton';
import { COLORS } from '../../utils/theme';

interface Props {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorState({
  title = 'Something went wrong',
  subtitle = 'Check your connection and try again.',
  onRetry,
  retryLabel = 'Retry',
}: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={40} color={COLORS.state.danger} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>
      {onRetry && (
        <View style={{ marginTop: 16, width: '60%' }}>
          <PrimaryButton label={retryLabel} onPress={onRetry} variant="tonal" icon="refresh" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.state.dangerBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' },
  subtitle: { fontSize: 13, fontWeight: '500', color: COLORS.text.secondary, textAlign: 'center', marginTop: 6, maxWidth: 280 },
});
