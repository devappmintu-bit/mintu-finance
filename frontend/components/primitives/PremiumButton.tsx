/**
 * PremiumButton — unified CTA with spring-press, haptics, gradient bg,
 * and optional leading/trailing icon.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Variants:
 *  - 'primary'    — filled brand gradient, white text, z3 shadow (CTA)
 *  - 'secondary'  — tonal brand-soft bg, brand text (alt-CTA)
 *  - 'ghost'      — transparent bg, brand text, hairline border
 *  - 'danger'     — filled crimson, white text
 *  - 'success'    — filled emerald, white text
 */
import React from 'react';
import { View, Text, StyleSheet, Platform, StyleProp, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { COLORS, RADIUS, TYPO, SPACE, ELEVATION } from '../../utils/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface PremiumButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ComponentProps<typeof Ionicons>['name'];
  iconRight?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

const HEIGHTS: Record<Size, number> = { sm: 40, md: 48, lg: 56 };
const FONTS: Record<Size, number> = { sm: 13, md: 15, lg: 17 };
const ICONSIZE: Record<Size, number> = { sm: 16, md: 18, lg: 22 };

function PremiumButtonImpl({
  label, onPress, variant = 'primary', size = 'md',
  iconLeft, iconRight, disabled, loading, fullWidth,
  style, labelStyle, testID,
}: PremiumButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onIn = () => {
    scale.value = withSpring(0.94, { damping: 14, stiffness: 320 });
    if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
  };
  const onOut = () => { scale.value = withSpring(1, { damping: 18, stiffness: 260 }); };

  const baseContainer: ViewStyle = {
    height: HEIGHTS[size],
    borderRadius: HEIGHTS[size] / 2,
    paddingHorizontal: size === 'sm' ? SPACE.md : SPACE.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.55 : 1,
  };

  // COLOR TREATMENT
  let bg: string | null = null;
  let gradient: [string, string] | null = null;
  let textColor = '#FFFFFF';
  let borderColor: string | null = null;
  let elevation: any = ELEVATION.z2;

  if (variant === 'primary') {
    gradient = [COLORS.accent.primary, COLORS.accent.primaryDark];
    elevation = ELEVATION.z3;
  } else if (variant === 'secondary') {
    bg = COLORS.accent.brandSoft;
    textColor = COLORS.accent.primaryDark;
    elevation = ELEVATION.z1;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    textColor = COLORS.accent.primary;
    borderColor = COLORS.accent.primary;
    elevation = ELEVATION.z0;
  } else if (variant === 'danger') {
    bg = COLORS.state.danger;
    elevation = ELEVATION.z2;
  } else if (variant === 'success') {
    bg = COLORS.state.success;
    elevation = ELEVATION.z2;
  }

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {iconLeft ? <Ionicons name={iconLeft} size={ICONSIZE[size]} color={textColor} /> : null}
          <Text
            style={[
              { ...TYPO.h3, fontSize: FONTS[size], color: textColor, fontWeight: '700' },
              labelStyle,
            ]}
          >
            {label}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={ICONSIZE[size]} color={textColor} /> : null}
        </>
      )}
    </>
  );

  return (
    <Animated.View style={[animStyle, fullWidth && { alignSelf: 'stretch' }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || loading}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        style={[
          baseContainer,
          elevation,
          borderColor ? { borderWidth: 1.5, borderColor } : null,
          bg ? { backgroundColor: bg } : null,
          style,
        ]}
      >
        {gradient ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A' }]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {content}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const PremiumButton = React.memo(PremiumButtonImpl);
PremiumButton.displayName = 'PremiumButton';
export default PremiumButton;
