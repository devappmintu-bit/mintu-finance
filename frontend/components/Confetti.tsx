/**
 * MintU 2.0 — Lightweight Confetti (no new deps)
 * 30 animated particles bursting from a center point using Reanimated.
 * Usage: <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { makeStyles } from '../utils/makeStyles';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const COLORS = ['#10B981', '#F59E0B', '#E65100', '#EF4444', '#3B82F6', '#EC4899', '#06B6D4', '#FBBF24'];
const PARTICLE_COUNT = 28;
const { width: W, height: H } = Dimensions.get('window');

type Props = {
  trigger: boolean;
  onDone?: () => void;
  originX?: number;
  originY?: number;
};

const Particle: React.FC<{ index: number; trigger: boolean; originX: number; originY: number }> = React.memo(({ index, trigger, originX, originY }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  // Random target in upper half + slight gravity effect
  const angle = (Math.PI * 2 * index) / PARTICLE_COUNT + (Math.random() * 0.5 - 0.25);
  const dist = 120 + Math.random() * 180;
  const endX = Math.cos(angle) * dist;
  const endY = Math.sin(angle) * dist - 40; // slight upward bias
  const finalY = endY + 240 + Math.random() * 80; // gravity fall
  const color = COLORS[index % COLORS.length];
  const sizeW = 6 + Math.random() * 6;
  const sizeH = sizeW * (Math.random() > 0.5 ? 1 : 1.6);
  const delay = Math.random() * 80;

  useEffect(() => {
    if (trigger) {
      opacity.value = 1;
      scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
      tx.value = withDelay(delay, withTiming(endX, { duration: 900, easing: Easing.out(Easing.quad) }));
      ty.value = withDelay(delay, withSequence(
        withTiming(endY, { duration: 400, easing: Easing.out(Easing.quad) }),
        withTiming(finalY, { duration: 1000, easing: Easing.in(Easing.quad) }),
      ));
      rotate.value = withTiming(Math.random() * 720 - 360, { duration: 1400 });
      opacity.value = withDelay(delay + 900, withTiming(0, { duration: 500 }));
    } else {
      tx.value = 0; ty.value = 0; opacity.value = 0; scale.value = 0;
    }
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: originX - sizeW / 2, top: originY - sizeH / 2, width: sizeW, height: sizeH, backgroundColor: color, borderRadius: 2 },
        style,
      ]}
    />
  );
});

export default function Confetti({ trigger, onDone, originX, originY }: Props) {
  const styles = useStyles();
  const origX = originX ?? W / 2;
  const origY = originY ?? H / 3;

  useEffect(() => {
    if (trigger && onDone) {
      const t = setTimeout(() => onDone(), 1700);
      return () => clearTimeout(t);
    }
  }, [trigger, onDone]);

  if (!trigger) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} trigger={trigger} originX={origX} originY={origY} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'none' },
}));
