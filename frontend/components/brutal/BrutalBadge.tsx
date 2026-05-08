/**
 * BrutalBadge — small sticker-style label that overlaps cards.
 * Common uses: "NEW", "3D", "PRO", "₹" indicator pills.
 *
 * Designed to be position-absolute on the corner of a BrutalCard.
 * Includes a default tilt so it feels physically applied.
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  BR_SHADOW,
  TONE_BG,
  TONE_FG,
  type BrutalTone,
} from '../../theme/brutal';

export type BrutalBadgeProps = {
  label: string;
  tone?: BrutalTone;
  /** Tilt in degrees, default -4 for sticker feel. Set 0 to disable. */
  tilt?: number;
  /** Tighter padding when used inline, not absolute. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export default function BrutalBadge({
  label,
  tone = 'accent',
  tilt = -4,
  size = 'sm',
  style,
}: BrutalBadgeProps) {
  const px = size === 'sm' ? 7 : 10;
  const py = size === 'sm' ? 3 : 5;
  const fs = size === 'sm' ? 9 : 11;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: TONE_BG[tone],
          paddingHorizontal: px,
          paddingVertical: py,
          transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
        },
        BR_SHADOW.xs,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: TONE_FG[tone], fontSize: fs },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.xs,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
