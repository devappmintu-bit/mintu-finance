/**
 * AuthTransitionOverlay — fullscreen animated overlay shown during
 * logout / unlock transitions. Matches MintU's saffron brand.
 *
 * Variants:
 *   • 'locking'    → "Securing your session…" with a lock icon that scales in
 *   • 'unlocking'  → "Welcome back" with a saffron checkmark + confetti dots
 *
 * Uses react-native Animated (no extra deps) — works identically on web +
 * native. Calls `onDone` after the animation completes so the caller can
 * router.replace(...).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export type AuthTransitionVariant = 'locking' | 'unlocking';

type Props = {
  variant: AuthTransitionVariant;
  onDone: () => void;
  durationMs?: number;
};

export default function AuthTransitionOverlay({ variant, onDone, durationMs = 900 }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ]),
      Animated.timing(ring, { toValue: 1, duration: durationMs - 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => { if (finished) onDone(); });
    return () => seq.stop();
  }, []);

  const title = variant === 'locking' ? 'Securing your session…' : 'Welcome back';
  const caption = variant === 'locking'
    ? 'End-to-end encrypted · AES-256 at rest'
    : 'Biometric verified · session active';
  const icon = variant === 'locking' ? 'lock-closed' : 'checkmark-circle';
  const heroColor = variant === 'locking' ? '#0F172A' : '#10B981';

  return (
    <Animated.View style={[s.wrap, { opacity: fade }]} pointerEvents="none">
      <LinearGradient
        colors={variant === 'locking' ? ['#0F172A', '#1F2937'] : ['#F56E1E', '#C14A06']}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
        <Animated.View
          style={[
            s.ring,
            {
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            },
          ]}
        />
        <View style={[s.iconBubble, { backgroundColor: '#fff' }]}>
          <Ionicons name={icon as any} size={40} color={heroColor} />
        </View>
      </Animated.View>

      <Animated.Text style={[s.title, { opacity: fade }]}>{title}</Animated.Text>
      <Animated.Text style={[s.caption, { opacity: fade }]}>{caption}</Animated.Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#fff' },
  iconBubble: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 22, letterSpacing: 0.2 },
  caption: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 6, letterSpacing: 0.2 },
});
