/**
 * PrimaryButton — unified CTA across the app (Pass 1 interaction integrity + Pass 2 consistency).
 *
 * Variants:
 *   • solid  — saffron gradient, white text (default)
 *   • ghost  — transparent bg, saffron text, saffron border
 *   • danger — red gradient
 *   • tonal  — cream/accent-dim bg, saffron text
 *
 * Sizes: sm | md (default) | lg
 *
 * Features baked in:
 *   - Haptic feedback on press (medium)
 *   - Scale-down micro-animation on press
 *   - Proper disabled state (opacity 0.4, no haptic)
 *   - Loading spinner replaces label when `loading=true`
 *   - Minimum 44pt touch target per Apple HIG
 */
import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Animated, Easing, ViewStyle, TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useHaptic } from '../../hooks/useHaptic';

type Variant = 'solid' | 'ghost' | 'danger' | 'tonal';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  fullWidth?: boolean;
  testID?: string;
}

const PAD: Record<Size, { v: number; h: number; font: number; icon: number }> = {
  sm: { v: 10, h: 14, font: 13, icon: 16 },
  md: { v: 14, h: 18, font: 15, icon: 18 },
  lg: { v: 17, h: 22, font: 17, icon: 20 },
};

export default function PrimaryButton({
  label, onPress, variant = 'solid', size = 'md',
  loading = false, disabled = false, icon, iconRight,
  style, labelStyle, fullWidth = true, testID,
}: Props) {
  const haptic = useHaptic();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.timing(scale, { toValue: 0.96, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const handlePress = () => {
    if (disabled || loading) return;
    haptic.medium();
    onPress();
  };

  const p = PAD[size];
  const isDark = variant === 'solid' || variant === 'danger';
  const fg = isDark ? '#FFFFFF' : (variant === 'ghost' ? '#F56E1E' : '#C14A06');

  const content = (
    <View style={[s.inner, { paddingVertical: p.v, paddingHorizontal: p.h }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={p.icon} color={fg} style={{ marginRight: 8 }} />}
          <Text style={[{ color: fg, fontSize: p.font, fontWeight: '800', letterSpacing: 0.2 }, labelStyle]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={p.icon} color={fg} style={{ marginLeft: 8 }} />}
        </>
      )}
    </View>
  );

  const base: ViewStyle = {
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 44,
    opacity: disabled ? 0.4 : 1,
    width: fullWidth ? '100%' : undefined,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, base, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        testID={testID}
        android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
      >
        {variant === 'solid' && (
          <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {content}
          </LinearGradient>
        )}
        {variant === 'danger' && (
          <LinearGradient colors={['#EF4444', '#B91C1C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {content}
          </LinearGradient>
        )}
        {variant === 'ghost' && (
          <View style={[s.ghostBg]}>{content}</View>
        )}
        {variant === 'tonal' && (
          <View style={[s.tonalBg]}>{content}</View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ghostBg: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#F56E1E', borderRadius: 14 },
  tonalBg: { backgroundColor: '#FFF0E3', borderRadius: 14 },
});
