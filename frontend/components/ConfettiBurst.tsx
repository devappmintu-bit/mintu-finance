/**
 * ConfettiBurst — lightweight emoji-particle burst using Reanimated 3.
 *
 * Renders N particles that spring outward from the center with random angles,
 * rotating + fading as they fly. One-shot — auto re-fires whenever the
 * `trigger` prop changes.
 *
 * No new dependencies; uses the Reanimated 3 already in the app.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import { makeStyles } from '../utils/makeStyles';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, Easing,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const EMOJIS = ['🎉', '✨', '💰', '🪙', '⭐', '🔥', '🚀', '💸', '🎊', '💫'];

type ParticleProps = { emoji: string; angle: number; dist: number; delay: number; duration: number };

function Particle({ emoji, angle, dist, delay, duration }: ParticleProps) {
  const s = useStyles();
  const p = useSharedValue(0);     // 0 → 1 travel progress
  const rot = useSharedValue(0);   // rotation in deg
  const op = useSharedValue(0);    // opacity

  useEffect(() => {
    // Reset-then-run so changing `trigger` upstream re-animates
    p.value = 0;
    rot.value = 0;
    op.value = 0;
    p.value   = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    rot.value = withDelay(delay, withTiming((Math.random() > 0.5 ? 1 : -1) * 540, { duration }));
    op.value  = withDelay(delay, withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(1, { duration: duration - 400 }),
      withTiming(0, { duration: 280 }),
    ));
  }, []);

  const style = useAnimatedStyle(() => {
    const dx = Math.cos(angle) * dist * p.value;
    const dy = Math.sin(angle) * dist * p.value + 120 * p.value * p.value; // gravity curve
    const scale = 0.5 + 0.6 * Math.min(1, p.value * 3);
    return {
      opacity: op.value,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${rot.value}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[s.particle, style]}>
      <Text style={s.emoji}>{emoji}</Text>
    </Animated.View>
  );
}

export default function ConfettiBurst({ trigger, particles = 28 }: { trigger: number | boolean; particles?: number }) {
  const s = useStyles();
  // Each trigger mounts a fresh particle key set, guaranteeing a re-burst.
  const key = `burst-${trigger}`;
  return (
    <View pointerEvents="none" style={s.host}>
      {Array.from({ length: particles }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / particles + (Math.random() * 0.35 - 0.18);
        const dist = 140 + Math.random() * 110;
        const delay = Math.random() * 120;
        const duration = 1200 + Math.random() * 700;
        const emoji = EMOJIS[i % EMOJIS.length];
        return <Particle key={`${key}-${i}`} emoji={emoji} angle={angle} dist={dist} delay={delay} duration={duration} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  host: {
    position: 'absolute',
    left: width / 2 - 12,
    top: height * 0.26,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  particle: { position: 'absolute' },
  emoji: { fontSize: 22 },
}));
