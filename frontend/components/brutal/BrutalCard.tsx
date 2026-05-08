/**
 * BrutalCard — the foundational layered card primitive.
 *
 * Variants:
 *   • base     — paper bg, 2px ink border, sm stamp shadow (default)
 *   • hero     — paper bg, 3px ink border, lg stamp shadow (key sections)
 *   • warm     — parchment bg (cream-yellow tint)
 *   • lavender — premium feel
 *   • accent   — yellow fill, ink border (CTA-callout cards)
 *   • lime / purple / peach / cyan — vibrant accent fills
 *   • ghost    — transparent paper, dashed border (placeholder / empty)
 *
 * The card never blurs its shadow — that's the whole point of
 * neo-brutalism. `pressable` makes the card itself a tap target with
 * a translateY-2 "into the shadow" effect on press. Optional `tilt`
 * adds a tiny rotation for sticker-like layering.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  BR_SHADOW,
  PALETTE,
} from '../../theme/brutal';

type Variant =
  | 'base'
  | 'hero'
  | 'warm'
  | 'lavender'
  | 'accent'    // mascot orange (PRIMARY)
  | 'highlight' // yellow (secondary)
  | 'lime'
  | 'purple'
  | 'peach'
  | 'cyan'
  | 'ghost';

export type BrutalCardProps = React.PropsWithChildren<{
  variant?: Variant;
  pressable?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Decorative tilt in degrees, e.g. -2. Applied on idle, removed on press. */
  tilt?: number;
  /** Disable the stamp shadow — for inner-stack cards that don't need depth. */
  flat?: boolean;
  /** Override the radius if the screen wants pillier corners. */
  radius?: number;
  testID?: string;
}>;

const VARIANT_STYLE: Record<Variant, ViewStyle> = {
  base:      { backgroundColor: BR_COLORS.card,         borderWidth: BR_BORDER.base },
  hero:      { backgroundColor: BR_COLORS.card,         borderWidth: BR_BORDER.thick },
  warm:      { backgroundColor: BR_COLORS.cardWarm,     borderWidth: BR_BORDER.base },
  lavender:  { backgroundColor: BR_COLORS.cardLavender, borderWidth: BR_BORDER.base },
  accent:    { backgroundColor: PALETTE.brand,          borderWidth: BR_BORDER.thick },
  highlight: { backgroundColor: PALETTE.yellow,         borderWidth: BR_BORDER.thick },
  lime:      { backgroundColor: PALETTE.lime,           borderWidth: BR_BORDER.thick },
  purple:    { backgroundColor: PALETTE.purple,         borderWidth: BR_BORDER.thick },
  peach:     { backgroundColor: PALETTE.peach,          borderWidth: BR_BORDER.thick },
  cyan:      { backgroundColor: PALETTE.cyan,           borderWidth: BR_BORDER.thick },
  ghost:     { backgroundColor: 'transparent',          borderWidth: BR_BORDER.fine, borderStyle: 'dashed' },
};

const SHADOW_BY_VARIANT: Record<Variant, ViewStyle> = {
  base: BR_SHADOW.sm as ViewStyle,
  hero: BR_SHADOW.lg as ViewStyle,
  warm: BR_SHADOW.sm as ViewStyle,
  lavender: BR_SHADOW.sm as ViewStyle,
  accent: BR_SHADOW.md as ViewStyle,
  highlight: BR_SHADOW.md as ViewStyle,
  lime: BR_SHADOW.md as ViewStyle,
  purple: BR_SHADOW.md as ViewStyle,
  peach: BR_SHADOW.md as ViewStyle,
  cyan: BR_SHADOW.md as ViewStyle,
  ghost: BR_SHADOW.none as ViewStyle,
};

export default function BrutalCard({
  children,
  variant = 'base',
  pressable = false,
  onPress,
  style,
  tilt,
  flat = false,
  radius,
  testID,
}: BrutalCardProps) {
  const baseStyle: StyleProp<ViewStyle> = [
    styles.card,
    VARIANT_STYLE[variant],
    !flat && SHADOW_BY_VARIANT[variant],
    radius != null && { borderRadius: radius },
    tilt != null && { transform: [{ rotate: `${tilt}deg` }] },
    style,
  ];

  if (pressable || onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          baseStyle,
          pressed && BR_SHADOW.pressShift,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={baseStyle}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    padding: 16,
  },
});
