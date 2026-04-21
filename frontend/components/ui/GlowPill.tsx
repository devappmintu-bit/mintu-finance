/**
 * GlowPill — small urgency/status chip with optional pulse animation.
 *
 * Usage:
 *   <GlowPill label="LIVE" tone="danger" pulse />
 *   <GlowPill label="+12% this week" tone="success" />
 *   <GlowPill label="PRO" tone="premium" />
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, RADIUS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'premium' | 'neon';

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'rgba(255,255,255,0.08)', fg: COLORS.text.secondary, border: 'rgba(255,255,255,0.12)' },
  success: { bg: COLORS.state.successBg,   fg: COLORS.state.success,  border: COLORS.state.successBorder },
  warning: { bg: COLORS.state.warningBg,   fg: COLORS.state.warning,  border: COLORS.state.warningBorder },
  danger:  { bg: COLORS.state.dangerBg,    fg: COLORS.state.danger,   border: COLORS.state.dangerBorder },
  premium: { bg: 'rgba(192,38,211,0.14)',  fg: '#E879F9',             border: 'rgba(192,38,211,0.4)' },
  neon:    { bg: 'rgba(255,107,26,0.14)',  fg: COLORS.accent.primary, border: 'rgba(255,107,26,0.4)' },
};

type Props = {
  label: string;
  tone?: Tone;
  icon?: string;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function GlowPill({ label, tone = 'neutral', icon, pulse = false, style }: Props) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const t = tones[tone];

  return (
    <Animated.View style={[styles.base, { backgroundColor: t.bg, borderColor: t.border, opacity }, style]}>
      {pulse && (
        <View style={[styles.dot, { backgroundColor: t.fg }]} />
      )}
      {icon && !pulse && <Ionicons name={icon as any} size={11} color={t.fg} />}
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  label: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
}));
