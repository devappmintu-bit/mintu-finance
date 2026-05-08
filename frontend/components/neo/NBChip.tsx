/**
 * NBChip — chunky pill chip / tag.
 *
 * Replaces the Swiss hairline chips with bordered pill chips that read
 * from across the room. Theme-aware, role-driven.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNeoPalette } from '../../store/neoTheme';
import { NB_BORDER, NB_RADIUS, NB_SPACE, NeoRole, roleColor } from '../../utils/neoBrutalism';

type Props = {
  label: string;
  role?: NeoRole;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  active?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md';
};

export default function NBChip({ label, role = 'neutral', icon, onPress, active, style, size = 'md' }: Props) {
  const palette = useNeoPalette();
  const r = roleColor(palette, role);
  const padX = size === 'sm' ? 10 : 14;
  const padY = size === 'sm' ? 4 : 6;
  const fontSize = size === 'sm' ? 11 : 13;

  const Container: any = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }: any) => [
        styles.chip,
        {
          backgroundColor: active ? r.bg : palette.surface,
          borderColor: palette.ink,
          borderWidth: NB_BORDER.thin,
          borderRadius: NB_RADIUS.pill,
          paddingHorizontal: padX,
          paddingVertical: padY,
        },
        onPress && pressed ? { transform: [{ translateY: 1 }] } : null,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={fontSize + 2} color={active ? r.ink : palette.ink} style={{ marginRight: NB_SPACE.xs }} /> : null}
      <Text style={{ fontSize, fontWeight: '900', color: active ? r.ink : palette.ink, letterSpacing: 0.3 }} numberOfLines={1}>
        {label}
      </Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
