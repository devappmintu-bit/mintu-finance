/**
 * BrutalProgress — chunky progress bar with hard fill.
 *
 * Brutalist rules:
 *   • no rounded fill, no inner gradient
 *   • track has 2px ink border
 *   • fill is solid accent color, drops directly into the corner
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_FONT,
  BR_RADIUS,
  BR_SHADOW,
  TONE_BG,
  type BrutalTone,
} from '../../theme/brutal';

export type BrutalProgressProps = {
  /** 0..1 */
  value: number;
  tone?: BrutalTone;
  height?: number;
  /** Optional caption rendered above the track */
  label?: string;
  /** Optional right-aligned caption (e.g. "4/10") */
  trailingLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function BrutalProgress({
  value,
  tone = 'positive',
  height = 14,
  label,
  trailingLabel,
  style,
  testID,
}: BrutalProgressProps) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={[style]} testID={testID}>
      {(label || trailingLabel) && (
        <View style={s.head}>
          {!!label && <Text style={s.headLbl}>{label}</Text>}
          <View style={{ flex: 1 }} />
          {!!trailingLabel && <Text style={s.headTrail}>{trailingLabel}</Text>}
        </View>
      )}
      <View style={[s.track, { height }, BR_SHADOW.xs]}>
        <View
          style={[
            s.fill,
            {
              width: `${pct * 100}%`,
              backgroundColor: TONE_BG[tone],
            },
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  headLbl: {
    ...BR_FONT.stampSm,
    color: BR_COLORS.textMuted,
  },
  headTrail: {
    ...BR_FONT.stampSm,
    color: BR_COLORS.text,
  },
  track: {
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.xs,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
