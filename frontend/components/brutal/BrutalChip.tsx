/**
 * BrutalChip — small selectable / informational pill.
 *
 * Modes:
 *   • static   — non-interactive label
 *   • toggle   — selectable (selected state inverts to ink fill)
 *   • action   — onPress, looks like a tiny button
 *
 * Tones mirror BrutalButton.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  BR_SHADOW,
  PALETTE,
  TONE_BG,
  TONE_FG,
  type BrutalTone,
} from '../../theme/brutal';

export type BrutalChipProps = {
  label: string;
  tone?: BrutalTone;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Tighter padding for inline ledger-style chips. */
  size?: 'sm' | 'md';
};

export default function BrutalChip({
  label,
  tone = 'paper',
  selected = false,
  onPress,
  icon,
  style,
  testID,
  size = 'md',
}: BrutalChipProps) {
  // Selected toggle inverts the fill regardless of tone.
  const bg = selected ? PALETTE.ink : TONE_BG[tone];
  const fg = selected ? '#FFFFFF' : TONE_FG[tone];
  const px = size === 'sm' ? 8 : 12;
  const py = size === 'sm' ? 4 : 6;
  const fontSize = size === 'sm' ? 10 : 11;
  const iconSize = size === 'sm' ? 11 : 13;
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress as any}
      testID={testID}
      style={({ pressed }: any) => [
        styles.chip,
        {
          backgroundColor: bg,
          paddingHorizontal: px,
          paddingVertical: py,
        },
        BR_SHADOW.xs,
        onPress && pressed && BR_SHADOW.pressShift,
        style,
      ] as any}
    >
      <View style={styles.row}>
        {icon && <Ionicons name={icon} size={iconSize} color={fg} />}
        <Text style={[styles.label, { color: fg, fontSize }]}>{label}</Text>
      </View>
    </Wrap>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.xs,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
