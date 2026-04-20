/**
 * ScreenHeader — unified header for tab screens.
 * Layout:  [<— back?]  Title                       [actions]
 *          subtitle (optional, below title)
 */
import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../utils/theme';
import { useHaptic } from '../../hooks/useHaptic';

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: ReactNode;
}

export default function ScreenHeader({ title, subtitle, showBack, onBack, rightActions }: Props) {
  const haptic = useHaptic();
  const handleBack = () => {
    haptic.light();
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
  };
  return (
    <View style={s.wrap}>
      {showBack && (
        <TouchableOpacity onPress={handleBack} style={s.back} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1, marginLeft: showBack ? 4 : 0 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.sub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {rightActions && <View style={s.rightRow}>{rightActions}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.5 },
  sub: { fontSize: 12.5, fontWeight: '600', color: COLORS.text.secondary, marginTop: 2 },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
