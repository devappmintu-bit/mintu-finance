/**
 * MintuMascot — the soul of the brand, in component form.
 *
 * Why this exists
 * ---------------
 * The user shipped us a beautiful 1024×1024 robot mascot with a Rupee
 * shield. It works as a static app-icon, but it can do so much more
 * inside the running app. This component renders the same artwork with
 * a continuous, gentle "alive" loop (breathing + soft float + pulsing
 * glow) plus stateful transitions ("success" celebrates, "thinking"
 * breathes faster, "error" gives a single small shake).
 *
 * Design rules
 * ------------
 *   • Never distracting — idle motion peaks at ±4 % scale and ±3 px Y.
 *   • Always 60 fps — built on react-native-reanimated; runs on the UI
 *     thread, no JS bridge per frame.
 *   • No layout thrash — the mascot is wrapped in a fixed-size box so
 *     surrounding content never reflows when scale changes.
 *   • Respects reduce-motion users — when `disableMotion` is true, the
 *     mascot is fully still (regulatory-friendly, also useful for
 *     screenshots and snapshot tests).
 *   • One asset, many sizes — the PNG is shipped at 512 px so it stays
 *     crisp from 32 px (avatar) to 220 px (splash) without re-export.
 *
 * Usage
 * -----
 *     <MintuMascot size={120} state="thinking" />
 *     <MintuMascot size={64} disableMotion />
 *     <MintuMascot size={200} state="success" />
 *
 * Public API
 * ----------
 *   • size:  number — width/height in points (default 120).
 *   • state: 'idle' | 'thinking' | 'success' | 'error' (default 'idle').
 *   • disableMotion: bool — kill all animations.
 *   • style: ViewStyle — extra wrapper styling.
 */
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
// `expo-image` over `react-native`'s built-in <Image>:
//   • Native disk + memory cache by default (no flicker on revisit).
//   • Hardware decoding off the JS thread — frees frame budget while
//     scrolling lists that contain the mascot at avatar size.
//   • `recyclingKey` prop avoids re-decoding when the same source
//     re-mounts (e.g., re-renders during a phase change).
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Static asset — shipped at 512 px, scaled down at runtime by RN.
// Same PNG as `assets/images/icon-512.png`. We require() it so Metro
// can fingerprint and ship it with the bundle (no flicker on first paint).
const MASCOT_SOURCE = require('../assets/images/icon-512.png');

export type MintuMascotState = 'idle' | 'thinking' | 'success' | 'error';

interface MintuMascotProps {
  size?: number;
  state?: MintuMascotState;
  disableMotion?: boolean;
  style?: ViewStyle;
}

// Animation timing constants — pulled to the top so the values can be
// tweaked without hunting through useEffect callbacks.
const BREATHE_MS_IDLE = 3200;
const BREATHE_MS_THINKING = 1100;
const FLOAT_MS = 4000;
const SUCCESS_BOUNCE_MS = 360;
const ERROR_SHAKE_MS = 80;

export default function MintuMascot({
  size = 120,
  state = 'idle',
  disableMotion = false,
  style,
}: MintuMascotProps) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const glowOpacity = useSharedValue(0.4);

  // Drive the loop animations. Every state change cancels the running
  // tween and starts a fresh one — Reanimated handles cleanup atomically
  // so we never leak a worklet.
  useEffect(() => {
    if (disableMotion) {
      cancelAnimation(scale);
      cancelAnimation(translateY);
      cancelAnimation(translateX);
      cancelAnimation(glowOpacity);
      scale.value = 1;
      translateY.value = 0;
      translateX.value = 0;
      glowOpacity.value = 0.4;
      return;
    }

    // Reset transient transforms before applying state-specific loops.
    translateX.value = 0;

    switch (state) {
      case 'success': {
        // Quick celebratory scale-bounce, then settle into idle breath.
        scale.value = withSequence(
          withTiming(1.18, { duration: SUCCESS_BOUNCE_MS / 2, easing: Easing.out(Easing.cubic) }),
          withTiming(0.96, { duration: SUCCESS_BOUNCE_MS / 2, easing: Easing.inOut(Easing.cubic) }),
          withTiming(1.0, { duration: 200, easing: Easing.out(Easing.cubic) }),
          withRepeat(
            withSequence(
              withTiming(1.04, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
              withTiming(1.0, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            false,
          ),
        );
        glowOpacity.value = withSequence(
          withTiming(1, { duration: 250 }),
          withTiming(0.4, { duration: 600 }),
          withRepeat(
            withSequence(
              withTiming(0.6, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
              withTiming(0.4, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            false,
          ),
        );
        break;
      }

      case 'error': {
        // Single small head-shake, then resume idle breath.
        translateX.value = withSequence(
          withTiming(-6, { duration: ERROR_SHAKE_MS, easing: Easing.linear }),
          withTiming(6, { duration: ERROR_SHAKE_MS, easing: Easing.linear }),
          withTiming(-4, { duration: ERROR_SHAKE_MS, easing: Easing.linear }),
          withTiming(4, { duration: ERROR_SHAKE_MS, easing: Easing.linear }),
          withTiming(0, { duration: ERROR_SHAKE_MS, easing: Easing.linear }),
        );
        scale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.0, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        break;
      }

      case 'thinking': {
        // Faster breath = "concentration". No float — keeps focus tight.
        scale.value = withRepeat(
          withSequence(
            withTiming(1.06, { duration: BREATHE_MS_THINKING / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.0, { duration: BREATHE_MS_THINKING / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.7, { duration: BREATHE_MS_THINKING / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.3, { duration: BREATHE_MS_THINKING / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        break;
      }

      case 'idle':
      default: {
        // Calm breath + soft float. Phase-shift so they don't sync up
        // and look mechanical.
        scale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.0, { duration: BREATHE_MS_IDLE / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        translateY.value = withRepeat(
          withSequence(
            withTiming(-3, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.55, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.35, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
        break;
      }
    }

    // Cleanup on unmount or state change — required to avoid stuck loops
    // when navigating away mid-animation.
    return () => {
      cancelAnimation(scale);
      cancelAnimation(translateY);
      cancelAnimation(translateX);
      cancelAnimation(glowOpacity);
    };
  }, [state, disableMotion, scale, translateX, translateY, glowOpacity]);

  const mascotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* Soft brand-orange glow behind the mascot — gives it a "powered"
          feeling without distracting. Only renders on iOS/Android (web
          shadow performance is poor for animated shadows). */}
      {Platform.OS !== 'web' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            { width: size * 0.85, height: size * 0.85, borderRadius: size * 0.5, top: size * 0.075, left: size * 0.075 },
            glowStyle,
          ]}
        />
      )}
      <Animated.View style={[{ width: size, height: size }, mascotStyle]}>
        <Image
          source={MASCOT_SOURCE}
          style={{ width: size, height: size }}
          contentFit="contain"
          // Hint to the cache that this is the same image across all
          // mount points so disk cache hits regardless of `size`.
          recyclingKey="mintu-mascot-512"
          // Disable any cross-fade — the Reanimated scale handles
          // its own visual continuity.
          transition={0}
          // Cached on disk forever; mascot doesn't change in-session.
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: '#F56E1E',
    // Native shadow — much cheaper than a blur layer.
    shadowColor: '#F56E1E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 12, // Android — same idea via material elevation.
  },
});
