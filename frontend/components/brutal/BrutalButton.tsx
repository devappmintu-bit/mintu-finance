/**
 * BrutalButton — chunky tactile arcade-control button.
 *
 * Tones (BrutalTone): accent (yellow) | positive (lime) | premium (purple)
 *                     cool (cyan) | warm (peach) | ink (black)
 *                     paper (ghost) | danger | success | warning
 *
 * Sizes: sm | md (default) | lg | xl
 *
 * Press behavior: translateY-2 into the shadow + spring on release.
 * Loading: replaces label with three-dot pulse, disables press.
 * Disabled: 0.45 opacity, no shadow shift on press.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  BR_SHADOW,
  TONE_BG,
  TONE_FG,
  type BrutalTone,
} from '../../theme/brutal';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export type BrutalButtonProps = {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  tone?: BrutalTone;
  size?: Size;
  /** Ionicons name to render before the label */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Render icon AFTER label (e.g. arrow-forward) */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  uppercase?: boolean;
  /** Override letterSpacing on the label (default 1.2) */
  letterSpacing?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const SIZE_PADDING: Record<Size, { px: number; py: number }> = {
  sm: { px: 12, py: 8  },
  md: { px: 18, py: 12 },
  lg: { px: 22, py: 14 },
  xl: { px: 26, py: 16 },
};
const SIZE_FONT: Record<Size, number> = { sm: 11, md: 13, lg: 15, xl: 17 };
const SIZE_ICON: Record<Size, number> = { sm: 13, md: 15, lg: 17, xl: 19 };
const SIZE_SHADOW: Record<Size, ViewStyle> = {
  sm: BR_SHADOW.xs as ViewStyle,
  md: BR_SHADOW.md as ViewStyle,
  lg: BR_SHADOW.md as ViewStyle,
  xl: BR_SHADOW.lg as ViewStyle,
};

export default function BrutalButton({
  label,
  onPress,
  tone = 'accent',
  size = 'md',
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  uppercase = true,
  letterSpacing = 1.2,
  style,
  testID,
}: BrutalButtonProps) {
  const bg = TONE_BG[tone];
  const fg = TONE_FG[tone];
  const isInk = tone === 'ink' || tone === 'danger' || tone === 'success';
  const { px, py } = SIZE_PADDING[size];
  const fontSize = SIZE_FONT[size];
  const iconSize = SIZE_ICON[size];

  return (
    <Pressable
      testID={testID}
      onPress={loading || disabled ? undefined : onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          paddingHorizontal: px,
          paddingVertical: py,
        },
        SIZE_SHADOW[size],
        fullWidth && { alignSelf: 'stretch' },
        disabled && { opacity: 0.45 },
        pressed && !disabled && BR_SHADOW.pressShift,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={iconSize} color={fg} />}
          <Text
            style={[
              styles.label,
              {
                color: fg,
                fontSize,
                letterSpacing,
                textTransform: uppercase ? 'uppercase' : 'none',
              },
              isInk && { fontWeight: '900' },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailingIcon && <Ionicons name={trailingIcon} size={iconSize} color={fg} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontWeight: '900',
    textAlign: 'center',
  },
});
