/**
 * NBButton — the heart of Neo-Brutalist tactility.
 *
 * 4 sizes × 8 roles × light/dark = visible everywhere with one prop.
 * Each press compresses the hard shadow + scales the surface 0.97 —
 * the user can FEEL the button click, not just see it.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNeoPalette } from '../../store/neoTheme';
import { NB_BORDER, NB_RADIUS, NB_SPACE, NB_TYPE, nbShadow, NeoRole, roleColor } from '../../utils/neoBrutalism';

type Props = {
  label: string;
  role?: NeoRole;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Variant: 'solid' | 'outline' | 'ghost' */
  variant?: 'solid' | 'outline' | 'ghost';
  haptic?: boolean;
};

export default function NBButton({
  label, role = 'primary', size = 'md', icon, onPress, disabled, fullWidth,
  style, variant = 'solid', haptic = true,
}: Props) {
  const palette = useNeoPalette();
  const role_ = roleColor(palette, role);

  const dims = useMemo(() => {
    switch (size) {
      case 'sm': return { padX: 14, padY: 8,  font: NB_TYPE.cta,   icon: 14, shadow: 'sm' as const };
      case 'lg': return { padX: 22, padY: 16, font: NB_TYPE.ctaLg, icon: 18, shadow: 'md' as const };
      case 'xl': return { padX: 28, padY: 20, font: NB_TYPE.ctaLg, icon: 22, shadow: 'lg' as const };
      default:   return { padX: 18, padY: 12, font: NB_TYPE.cta,   icon: 16, shadow: 'md' as const };
    }
  }, [size]);

  const offset = dims.shadow === 'sm' ? 3 : dims.shadow === 'md' ? 5 : 7;
  const offsetPress = dims.shadow === 'sm' ? 1 : dims.shadow === 'md' ? 2 : 3;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);

  const onIn = () => {
    if (disabled) return;
    if (haptic) Haptics.selectionAsync().catch(() => {});
    tx.value = withSpring(offset - offsetPress, { damping: 20, stiffness: 320 });
    ty.value = withSpring(offset - offsetPress, { damping: 20, stiffness: 320 });
    sx.value = withTiming(1, { duration: 90 });
  };
  const onOut = () => {
    tx.value = withSpring(0, { damping: 14, stiffness: 220 });
    ty.value = withSpring(0, { damping: 14, stiffness: 220 });
    sx.value = withTiming(0, { duration: 160 });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: 1 - sx.value * 0.025 }],
  }));

  // Variant resolution: solid uses the role color, outline keeps role
  // ink as border + transparent fill, ghost is borderless.
  const surfaceBg = variant === 'solid'
    ? (disabled ? palette.muted : role_.bg)
    : (variant === 'outline' ? 'transparent' : 'transparent');
  const labelInk = variant === 'solid' ? role_.ink : palette.ink;
  const borderColor = palette.ink;
  const showShadow = variant !== 'ghost';

  return (
    <View style={[fullWidth && { alignSelf: 'stretch' }, style]}>
      {/* Static "shadow plate" sits behind the button so press compress
          looks like the surface drops onto its own shadow.  We use an
          absolute box so the press transform doesn't move the shadow. */}
      {showShadow && !disabled ? (
        <View
          pointerEvents="none"
          style={[
            styles.shadowPlate,
            {
              backgroundColor: borderColor,
              borderRadius: NB_RADIUS.md,
              left: offset, top: offset, right: -offset, bottom: -offset,
            },
          ]}
        />
      ) : null}

      <Animated.View style={animStyle}>
        <Pressable
          onPress={() => { if (!disabled) onPress?.(); }}
          onPressIn={onIn}
          onPressOut={onOut}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          style={[
            styles.surface,
            {
              backgroundColor: surfaceBg,
              borderColor,
              borderWidth: variant === 'ghost' ? 0 : NB_BORDER.medium,
              borderRadius: NB_RADIUS.md,
              paddingHorizontal: dims.padX,
              paddingVertical: dims.padY,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
        >
          {icon ? <Ionicons name={icon} size={dims.icon} color={labelInk} style={{ marginRight: NB_SPACE.sm }} /> : null}
          <Text style={[dims.font as TextStyle, { color: labelInk }]} numberOfLines={1}>{label}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowPlate: { position: 'absolute' },
  surface: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
