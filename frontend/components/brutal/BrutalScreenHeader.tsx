/**
 * BrutalScreenHeader — R113 convergence helper.
 *
 * Standardises the brutal back-tile + stamp-title pattern used across
 * every secondary screen post-R113. Drop-in replacement for the legacy
 * "TouchableOpacity chevron + bold title" pattern.
 *
 * Usage:
 *   <BrutalScreenHeader title="MONEY SCHOOL" subtitle="60-second lessons" right={<BrutalBadge .../>} />
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useSmartBack from '../../hooks/useSmartBack';
import {
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
} from '../../theme/brutal';

export type BrutalScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
};

export default function BrutalScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  testID,
}: BrutalScreenHeaderProps) {
  const smartBack = useSmartBack();
  const handleBack = onBack ?? smartBack;

  return (
    <View style={s.header} testID={testID}>
      <Pressable
        onPress={handleBack}
        hitSlop={10}
        style={s.headerBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={BR_COLORS.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>
      {right ?? <View style={{ width: 36 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
    gap: BR_SPACE['3'],
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 14,
  },
  headerSub: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
});
