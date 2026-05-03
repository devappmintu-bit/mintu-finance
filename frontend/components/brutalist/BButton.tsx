/**
 * BButton — decisive Brutalist button.
 * Variants: accent (orange), ink (black), outline, danger.
 * Full-width by default. Tap shifts the stamp shadow into the button
 * for a satisfying physical feedback.
 */
import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';

type Variant = 'accent' | 'ink' | 'outline' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  stamp?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const tone = {
  accent:  { bg: BR_COLORS.accent,   fg: BR_COLORS.accentInk },
  ink:     { bg: BR_COLORS.ink,      fg: '#fff' },
  outline: { bg: 'transparent',      fg: BR_COLORS.ink },
  danger:  { bg: BR_COLORS.negative, fg: '#fff' },
};

export default function BButton({ label, onPress, variant = 'accent', stamp = true, style, testID }: Props) {
  const t = tone[variant];
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: t.bg },
        stamp && BR_STAMP.md,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[BR_TYPE.label, { color: t.fg, letterSpacing: 2 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    paddingVertical: 14,
    paddingHorizontal: BR_SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.95 },
});
