/**
 * ParallaxHeader — collapsible, parallax-scroll header that fades the
 * greeting sub-line and shrinks the title as the user scrolls.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Built on a shared Reanimated scrollY SharedValue so the effect runs
 * 100% on the UI thread (zero JS bridge traffic).
 *
 * Usage:
 *   <ParallaxHeader
 *     title="Good morning"
 *     subtitle="Ready to track?"
 *     right={<Avatar />}
 *     scrollY={scrollY}
 *   />
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolation, SharedValue } from 'react-native-reanimated';
import { COLORS, SPACE, TYPO } from '../../utils/theme';

export interface ParallaxHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  scrollY: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  /** How far the user must scroll before the header fully collapses. */
  collapseAt?: number;
}

function ParallaxHeaderImpl({
  title,
  subtitle,
  right,
  left,
  scrollY,
  style,
  collapseAt = 60,
}: ParallaxHeaderProps) {
  // Subtitle fades out as the user scrolls.
  const subStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, collapseAt * 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{
      translateY: interpolate(scrollY.value, [0, collapseAt], [0, -8], Extrapolation.CLAMP),
    }],
  }));

  // Title shrinks subtly and slides up.
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrollY.value, [0, collapseAt], [1, 0.86], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollY.value, [0, collapseAt], [0, -6], Extrapolation.CLAMP) },
    ],
    // shift leftward so title aligns tighter to the icons when collapsed
    marginLeft: interpolate(scrollY.value, [0, collapseAt], [0, -4], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.wrap, style]}>
      {left}
      <View style={{ flex: 1 }}>
        <Animated.View style={[subStyle]}>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </Animated.View>
        <Animated.Text style={[styles.title, titleStyle as any]} numberOfLines={1}>
          {title}
        </Animated.Text>
      </View>
      <View style={styles.rightWrap}>{right}</View>
    </View>
  );
}

export const ParallaxHeader = React.memo(ParallaxHeaderImpl);
ParallaxHeader.displayName = 'ParallaxHeader';
export default ParallaxHeader;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
    gap: SPACE.md,
  },
  sub: { ...TYPO.caption, color: COLORS.text.muted, marginBottom: 2 },
  title: { ...TYPO.h0, color: COLORS.text.primary, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  rightWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
