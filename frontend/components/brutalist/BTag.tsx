/**
 * BTag — uppercase micro-label pill. Swiss editorial workhorse.
 * Example: <BTag>TIER · GOLD</BTag>
 */
import React from 'react';
import { Text, View, StyleSheet, ViewStyle } from 'react-native';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

type Tone = 'ink' | 'accent' | 'positive' | 'negative' | 'outline';

export default function BTag({
  children,
  tone = 'ink',
  style,
}: {
  children: React.ReactNode;
  tone?: Tone;
  style?: ViewStyle | ViewStyle[];
}) {
  const { bg, fg, border } = TONES[tone];
  return (
    <View style={[styles.base, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[BR_TYPE.labelSm, { color: fg }]}>{children}</Text>
    </View>
  );
}

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  ink:      { bg: BR_COLORS.ink,    fg: '#fff',              border: BR_COLORS.ink },
  accent:   { bg: BR_COLORS.accent, fg: BR_COLORS.accentInk, border: BR_COLORS.ink },
  positive: { bg: BR_COLORS.positive, fg: '#fff',            border: BR_COLORS.ink },
  negative: { bg: BR_COLORS.negative, fg: '#fff',            border: BR_COLORS.ink },
  outline:  { bg: 'transparent',    fg: BR_COLORS.ink,       border: BR_COLORS.ink },
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: BR_SPACE.sm,
    paddingVertical: 4,
    borderWidth: BR_BORDER.bold,
    alignSelf: 'flex-start',
  },
});
