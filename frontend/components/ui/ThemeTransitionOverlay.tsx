/**
 * ThemeTransitionOverlay — smooth 300ms CrossFade when user flips themes.
 *
 * Mounts a full-screen opaque panel that fades in/out as the theme remount
 * happens. Without this, the Stack key-change shows a brief flash as React
 * unmounts and remounts 100 screens. With this overlay, the user sees a clean
 * fade-through.
 *
 * Drop this once at the root level (inside `_layout.tsx`, above the Stack).
 * It subscribes to the theme store and runs the fade sequence automatically.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { useThemePref } from '../../store/themeStore';
import Mascot from '../Mascot';

export default function ThemeTransitionOverlay() {
  const resolved = useThemePref((s) => s.resolved);
  const opacity = useRef(new Animated.Value(0)).current;
  const mountedOnce = useRef(false);

  useEffect(() => {
    if (!mountedOnce.current) {
      // Skip the very first mount — we don't want the splash to be overlaid.
      mountedOnce.current = true;
      return;
    }
    // Fast fade in, hold, fade out sequence (~300ms total)
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(60),
      Animated.timing(opacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [resolved, opacity]);

  const bgColor = resolved === 'light' ? '#FAFAF9' : '#0B0B12';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        styles.overlay,
        { backgroundColor: bgColor, opacity },
      ]}
    >
      <View style={styles.center}>
        <Mascot size={72} glow />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 9999, elevation: 9999 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
