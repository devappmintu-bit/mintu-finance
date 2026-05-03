/**
 * NeonButton — gradient + glow primary CTA.
 *
 * Variants:
 *   • primary (neon orange gradient + orange glow)
 *   • success (green gradient + green glow)
 *   • ghost   (transparent bg, neon border + text)
 *
 * Features:
 *   • Haptic feedback on press (selection impact)
 *   • Press-in scale 0.97 spring
 *   • Pulse-glow animation when `pulse` prop is true (for urgency)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, GRADIENT, GLOW, RADIUS, FONT_FAMILY, MOTION } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Variant = 'primary' | 'success' | 'ghost';

type Props = {
  label: string;
  icon?: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  pulse?: boolean;
  testID?: string;
};

export default function NeonButton({ label, icon, onPress, disabled, variant = 'primary', size = 'md', style, pulse = false, testID }: Props) {
  const styles = useStyles();
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(pulse ? 0 : 1)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const press = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, ...MOTION.spring.quick }).start();
  const handlePress = () => {
    if (disabled) return;
    try { Haptics.selectionAsync(); } catch {}
    onPress?.();
  };

  const gradientStops = variant === 'success' ? GRADIENT.success : GRADIENT.neon;
  const glowStyle = variant === 'success' ? GLOW.success : variant === 'ghost' ? {} : GLOW.neon;

  const padV = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const padH = size === 'sm' ? 16 : size === 'lg' ? 28 : 22;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 15;

  const glowOpacity = pulse ? glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : 1;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        disabled={disabled}
        testID={testID}
      >
        {variant === 'ghost' ? (
          <View style={[styles.base, styles.ghost, { paddingVertical: padV, paddingHorizontal: padH }]}>
            {icon && <Ionicons name={icon as any} size={fontSize + 3} color={COLORS.accent.primary} />}
            <Text style={[styles.label, { fontSize, color: COLORS.accent.primary }]}>{label}</Text>
          </View>
        ) : (
          <Animated.View style={[glowStyle, { opacity: glowOpacity, borderRadius: RADIUS.full }]}>
            <View
              style={[styles.base, { paddingVertical: padV, paddingHorizontal: padH }, { backgroundColor: '#0A0A0A' }]}>
              {icon && <Ionicons name={icon as any} size={fontSize + 3} color="#fff" />}
              <Text style={[styles.label, { fontSize, color: '#fff' }]}>{label}</Text>
            </View>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.full,
  },
  ghost: {
    borderWidth: 1.5,
    borderColor: c.accent.primary,
    backgroundColor: 'rgba(255,107,26,0.08)',
  },
  label: {
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.2,
  },
}));
