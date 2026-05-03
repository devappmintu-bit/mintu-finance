/**
 * BBlock — the atomic Brutalist container.
 *
 * A flat rectangle with a HARD ink border and (optionally) a flat 2D
 * offset drop shadow. No gradients, no blur, no rounded > 4px.
 *
 * Variants:
 *   • default      — white fill, 2px ink border
 *   • paper        — cream fill, 2px ink border
 *   • accent       — orange fill, 2px ink border, white-on-accent text
 *   • danger       — red fill, for destructive states
 *   • outline      — transparent fill, 2px ink border (ghost card)
 *
 * Props:
 *   stamp          — 'none' | 'sm' | 'md' | 'lg' (ink offset shadow)
 *   padding        — defaults to 16pt
 *   onPress        — makes it touchable with a clean active state
 */
import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle, PressableProps } from 'react-native';
import { BR_COLORS, BR_BORDER, BR_RADIUS, BR_SPACE, BR_STAMP } from '../../utils/brutalist';

type Variant = 'default' | 'paper' | 'accent' | 'danger' | 'outline' | 'ink';
type StampKey = 'none' | 'sm' | 'md' | 'lg' | 'accent';

interface BBlockProps extends Omit<PressableProps, 'style'> {
  variant?: Variant;
  stamp?: StampKey;
  padding?: number;
  border?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

const FILLS: Record<Variant, string> = {
  default: BR_COLORS.paper,
  paper:   BR_COLORS.paperAlt,
  accent:  BR_COLORS.accent,
  danger:  BR_COLORS.negative,
  outline: 'transparent',
  ink:     BR_COLORS.ink,
};

export default function BBlock({
  variant = 'default',
  stamp = 'none',
  padding = BR_SPACE.lg,
  border = BR_BORDER.bold,
  radius = BR_RADIUS.none,
  style,
  children,
  onPress,
  ...rest
}: BBlockProps) {
  const stampStyle =
    stamp === 'none' ? undefined :
    stamp === 'sm'   ? BR_STAMP.sm :
    stamp === 'md'   ? BR_STAMP.md :
    stamp === 'lg'   ? BR_STAMP.lg :
    BR_STAMP.accent;

  const boxStyle: ViewStyle = {
    backgroundColor: FILLS[variant],
    borderColor: BR_COLORS.ink,
    borderWidth: border,
    borderRadius: radius,
    padding,
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress} {...rest} style={({ pressed }) => [
        boxStyle,
        stampStyle,
        pressed && styles.pressed,
        style,
      ]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[boxStyle, stampStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Brutalist press: nudge toward the shadow to reinforce the 'stamp' feel.
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.95 },
});
