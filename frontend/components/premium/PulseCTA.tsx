/**
 * PulseCTA — subtle breathing scale animation for primary CTAs.
 * Uses native driver for 60fps, loops indefinitely.
 */
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

type Props = { children: React.ReactNode; intensity?: number };

function PulseCTA({ children, intensity = 0.03 }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'web') return; // skip animation on web to avoid jank
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1 + intensity,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, intensity]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
}

export default memo(PulseCTA);
