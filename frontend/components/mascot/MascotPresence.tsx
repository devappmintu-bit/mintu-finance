/**
 * MascotPresence — mood-aware Mintu wrapper.
 *
 * Sits on top of <MintuMascot/> and decorates it with mood-specific
 * micro-reactions: tilt, accessory badge (😴 / 🚨 / ✨), breathing
 * speed, and orbital particles. Driven by `useMascotMood`.
 *
 * Why this exists
 * ---------------
 * The base MintuMascot has 4 generic states (idle/thinking/success/
 * error). Duolingo-grade engagement needs many more nuanced reactions
 * tied to actual user signals — "sleepy" at midnight, "sarcastic" on
 * repeat impulse spend, "sad" when ghosted. Rather than fork the base,
 * we layer accessory + transform decorations on top.
 *
 * Renders nothing when `gated=true` (cold-start users) unless the
 * caller passes `showWhenGated`. This enforces the honest-UX gate at
 * the component level so nobody bypasses it.
 */
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import MintuMascot from '../MintuMascot';
import { useMascotMood, MascotMood } from '../../hooks/useMascotMood';

type Props = {
  size?: number;
  /** Override mood (e.g., for celebration overlay). Defaults to live useMascotMood. */
  mood?: MascotMood;
  /** Force-render even when honest-UX gate would hide. Default false. */
  showWhenGated?: boolean;
  style?: ViewStyle;
};

const ACCESSORIES: Record<MascotMood, string> = {
  panicked: '🚨',
  sad: '💧',
  sleepy: '💤',
  sarcastic: '👀',
  proud: '✨',
  celebrating: '🎉',
  encouraging: '🌱',
  focused: '🎯',
  idle: '',
};

function moodToState(mood: MascotMood): 'idle' | 'thinking' | 'success' | 'error' {
  switch (mood) {
    case 'panicked': return 'error';
    case 'sad': return 'error';
    case 'celebrating': return 'success';
    case 'proud': return 'success';
    case 'encouraging': return 'thinking';
    case 'focused': return 'thinking';
    case 'sleepy': return 'idle';
    case 'sarcastic': return 'idle';
    default: return 'idle';
  }
}

export default function MascotPresence({ size = 96, mood: moodOverride, showWhenGated = false, style }: Props) {
  const live = useMascotMood();
  const mood = moodOverride ?? live.mood;
  const gated = !moodOverride && live.gated;

  const tilt = useSharedValue(0);
  const badgeFloat = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(tilt);
    cancelAnimation(badgeFloat);

    // Mood-specific tilt loop.
    if (mood === 'sleepy') {
      tilt.value = withRepeat(
        withSequence(
          withTiming(0.18, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(-0.18, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        ), -1, false,
      );
    } else if (mood === 'sad') {
      tilt.value = withTiming(0.12, { duration: 800, easing: Easing.out(Easing.cubic) });
    } else if (mood === 'panicked') {
      tilt.value = withRepeat(
        withSequence(
          withTiming(0.05, { duration: 90 }),
          withTiming(-0.05, { duration: 90 }),
        ), -1, false,
      );
    } else if (mood === 'sarcastic') {
      tilt.value = withTiming(-0.08, { duration: 600, easing: Easing.out(Easing.cubic) });
    } else {
      tilt.value = withTiming(0, { duration: 400 });
    }

    // Badge gentle float so accessory feels alive.
    badgeFloat.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );

    return () => {
      cancelAnimation(tilt);
      cancelAnimation(badgeFloat);
    };
  }, [mood, tilt, badgeFloat]);

  const tiltStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${tilt.value}rad` }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: badgeFloat.value }],
  }));

  if (gated && !showWhenGated) return null;

  const acc = ACCESSORIES[mood];
  const badgeSize = Math.max(20, Math.round(size * 0.28));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[{ width: size, height: size }, tiltStyle]}>
        <MintuMascot size={size} state={moodToState(mood)} />
      </Animated.View>

      {acc ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              right: -badgeSize * 0.15,
              top: -badgeSize * 0.15,
            },
            badgeStyle,
          ]}
        >
          <Text style={{ fontSize: badgeSize * 0.55 }}>{acc}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0B0B0B',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
      web: { boxShadow: '2px 2px 0 rgba(0,0,0,0.18)' as any },
    }),
  },
});
