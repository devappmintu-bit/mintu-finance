/**
 * SmoothEnter.tsx — R117 "shared element"-style spatial continuity.
 *
 * Web-friendly fallback for react-native-reanimated's SharedTransition,
 * which is unstable on web today. Wraps a child screen / card in a
 * tightly-tuned fade + lift entrance animation that runs the moment
 * the wrapper mounts. Combined with the motion.ts duration ladder,
 * this gives the feel of a card "rising" into the detail view
 * without requiring a tag-pair shared-element setup.
 *
 * Usage:
 *   <SmoothEnter delay={40}><DetailContent/></SmoothEnter>
 *
 * Honors the global reduced-motion setting via motion.applyMotion().
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { applyMotion, DURATION, EASING } from '../utils/motion';

interface Props {
  children: React.ReactNode;
  /** Optional ms delay before the animation kicks. */
  delay?: number;
  /** Initial vertical translate (px). Higher = more "rise". */
  rise?: number;
  /** Override the duration; defaults to DURATION.normal. */
  duration?: number;
}

export default function SmoothEnter({
  children,
  delay = 0,
  rise = 16,
  duration = DURATION.normal,
}: Props) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(rise)).current;

  useEffect(() => {
    const dur = applyMotion(duration);
    if (dur === 0) {
      opacity.setValue(1);
      translate.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: dur,
        delay,
        useNativeDriver: true,
        easing: EASING.emphasized as unknown as (v: number) => number,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: dur,
        delay,
        useNativeDriver: true,
        easing: EASING.decelerate as unknown as (v: number) => number,
      }),
    ]).start();
  }, [duration, delay, opacity, translate]);

  return (
    <Animated.View style={[styles.fill, { opacity, transform: [{ translateY: translate }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
