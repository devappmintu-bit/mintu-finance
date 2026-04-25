/**
 * Round 40 — persistent offline banner.
 *
 * Slides in from the top when connectivity drops; shows a brief green
 * "✓ Back online" flash on reconnect, then slides out.
 *
 * Implementation notes:
 *   • Uses `translateY` + `opacity` (native-driver-friendly) rather than
 *     animating `height` (which can't run on the native driver).
 *   • Mounted inside `_layout.tsx` BEFORE the Stack navigator so it's
 *     always at the top of the z-stack, above route content.
 *   • Banner height (32px) is accounted for via a spacer View so content
 *     is never visually pushed around — the banner overlays, it doesn't
 *     reflow the layout (which would cause flicker on slow devices).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '../hooks/useIsOnline';

const HEIGHT = 32;
const ANIM_MS = 220;
const BACK_ONLINE_MS = 1400;

export default function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-HEIGHT - 20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<'hidden' | 'offline' | 'back'>('hidden');
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the first render — we don't want a "Back online" flash on boot
    // when we transition from the default (true) to the measured true.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (!online) {
      // Slide in the grey offline bar.
      setMode('offline');
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
      ]).start();
      return;
    }

    // Online transition: flash green "Back online", then slide out.
    setMode('back');
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: -HEIGHT - 20, duration: ANIM_MS, useNativeDriver: true }),
          Animated.timing(opacity,    { toValue: 0,            duration: ANIM_MS, useNativeDriver: true }),
        ]).start(() => setMode('hidden'));
      }, BACK_ONLINE_MS);
    });
  }, [online, translateY, opacity]);

  if (mode === 'hidden') return null;

  const bg = mode === 'offline' ? '#374151' : '#059669';
  const msg = mode === 'offline'
    ? '📡 No internet — some features may not work'
    : '✓ Back online';

  return (
    <Animated.View
      pointerEvents="none"  // banner shouldn't swallow taps; purely informational
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        s.banner,
        { backgroundColor: bg, paddingTop: insets.top, transform: [{ translateY }], opacity },
      ]}
    >
      <View style={s.inner}>
        <Text style={s.txt} numberOfLines={1}>{msg}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 999, elevation: 999,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6 },
      android: {},
    }),
  },
  inner: { height: HEIGHT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  txt: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
