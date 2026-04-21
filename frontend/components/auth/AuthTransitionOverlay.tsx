/**
 * AuthTransitionOverlay — full-screen animated welcome / lock-out overlay.
 *
 * Mascot-powered playful version (v2). Each render picks ONE of five random
 * mascot "actions" to keep repeat logins feeling fresh:
 *
 *   • bounce   — the mascot springs up & down on an invisible trampoline
 *   • wave     — it leans + rocks side-to-side waving hello
 *   • thumbsUp — quick pop-in + tiny rotation
 *   • float    — gentle levitate with soft breathe
 *   • spin     — full 360° spin with ease-out
 *
 * Around the mascot we fire 10 coloured confetti bits + a saffron halo ring
 * that expands and fades. Matches the Toing-style mascot bounce reference.
 *
 * Variants:
 *   • 'unlocking' — "Welcome back, {name}" warm saffron background (default)
 *   • 'locking'   — "Securing your session…" muted dark tone with lock
 *
 * Zero new deps: uses RN Animated + expo-linear-gradient + expo-image.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useAuthStore } from '../../store/authStore';

export type AuthTransitionVariant = 'locking' | 'unlocking';

type Props = {
  variant: AuthTransitionVariant;
  onDone: () => void;
  durationMs?: number;
};

type Action = 'bounce' | 'wave' | 'thumbsUp' | 'float' | 'spin';

const ACTIONS: Action[] = ['bounce', 'wave', 'thumbsUp', 'float', 'spin'];

export default function AuthTransitionOverlay({ variant, onDone, durationMs = 1500 }: Props) {
  const { user } = useAuthStore();
  const action = useMemo<Action>(() => ACTIONS[Math.floor(Math.random() * ACTIONS.length)], []);

  // Shared anim values
  const fade      = useRef(new Animated.Value(0)).current;
  const scaleIn   = useRef(new Animated.Value(0.5)).current;
  const halo      = useRef(new Animated.Value(0)).current;
  const actionAnim = useRef(new Animated.Value(0)).current;
  const confetti  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // 1) Fade-in + pop in mascot
      Animated.parallel([
        Animated.timing(fade,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scaleIn, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      ]),
      // 2) Play the random action + halo + confetti concurrently
      Animated.parallel([
        Animated.timing(halo,     { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(confetti, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
        actionSequence(action, actionAnim),
      ]),
      // 3) Fade out
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Map the action anim to transforms
  const mascotTransform = useMemo(() => buildTransform(action, actionAnim), [action, actionAnim]);

  const title = variant === 'locking'
    ? 'Securing your session…'
    : `Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋`;
  const caption = variant === 'locking'
    ? 'AES-256 end-to-end encrypted'
    : 'Biometric verified · session active';

  const haloScale   = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <Animated.View style={[s.wrap, { opacity: fade }]} pointerEvents="auto">
      <LinearGradient
        colors={variant === 'locking' ? ['#2E1F1A', '#4A2F22'] : ['#F56E1E', '#C14A06']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Confetti dots */}
      {variant === 'unlocking' && <ConfettiDots anim={confetti} />}

      {/* Halo ring expanding out */}
      <Animated.View style={[s.halo, { transform: [{ scale: haloScale }], opacity: haloOpacity }]} />

      {/* Mascot + pedestal */}
      <Animated.View style={[s.mascotWrap, { transform: [{ scale: scaleIn }] }]}>
        {variant === 'unlocking' ? (
          <>
            <Animated.View style={[s.mascotTile, mascotTransform]}>
              <Image
                source={require('../../assets/images/mintu-logo.png')}
                style={s.mascotImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Animated.View>
            {/* Trampoline pedestal — a soft cream puck */}
            <View style={s.pedestal} />
          </>
        ) : (
          <View style={s.lockBubble}>
            <Ionicons name="lock-closed" size={40} color="#E65100" />
          </View>
        )}
      </Animated.View>

      {/* Action label e.g. "Bouncing in…" */}
      {variant === 'unlocking' && (
        <Animated.Text style={[s.actionTag, { opacity: fade }]}>
          {actionCaption(action)}
        </Animated.Text>
      )}

      <Animated.Text style={[s.title, { opacity: fade }]}>{title}</Animated.Text>
      <Animated.Text style={[s.caption, { opacity: fade }]}>{caption}</Animated.Text>
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Per-action animation sequences & transforms
// ═════════════════════════════════════════════════════════════════════════
function actionSequence(a: Action, v: Animated.Value) {
  switch (a) {
    case 'bounce':
      // up-down-up-down
      return Animated.sequence([
        Animated.timing(v, { toValue: 1,   duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0,   duration: 240, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.6, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0,   duration: 200, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      ]);
    case 'wave':
      return Animated.sequence([
        Animated.timing(v, { toValue:  1, duration: 180, useNativeDriver: true }),
        Animated.timing(v, { toValue: -1, duration: 220, useNativeDriver: true }),
        Animated.timing(v, { toValue:  1, duration: 220, useNativeDriver: true }),
        Animated.timing(v, { toValue:  0, duration: 180, useNativeDriver: true }),
      ]);
    case 'thumbsUp':
      return Animated.sequence([
        Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.7, duration: 180, useNativeDriver: true }),
        Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]);
    case 'float':
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        { iterations: 2 },
      );
    case 'spin':
      return Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true });
  }
}

function buildTransform(a: Action, v: Animated.Value): any {
  switch (a) {
    case 'bounce':
      return { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) }] };
    case 'wave':
      return { transform: [{ rotate: v.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-12deg', '0deg', '12deg'] }) }] };
    case 'thumbsUp':
      return { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.1] }) }] };
    case 'float':
      return { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] };
    case 'spin':
      return { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] };
  }
}

function actionCaption(a: Action): string {
  switch (a) {
    case 'bounce':   return '🚀 Back in action';
    case 'wave':     return '👋 Hey there';
    case 'thumbsUp': return '👍 Locked and loaded';
    case 'float':    return '✨ Smooth sailing';
    case 'spin':     return '🎉 Let\'s go';
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Decorative confetti dots
// ═════════════════════════════════════════════════════════════════════════
const DOT_COLORS = ['#FFD166', '#FFB300', '#FEE2CD', '#FFECD3', '#E0F7FA'];
function ConfettiDots({ anim }: { anim: Animated.Value }) {
  // 10 pre-computed positions so animation is deterministic per mount
  const dots = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => ({
      dx: (Math.random() - 0.5) * 260,
      dy: 60 + Math.random() * 80,
      color: DOT_COLORS[i % DOT_COLORS.length],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 0.3,
    }));
  }, []);
  return (
    <>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            s.dot,
            {
              backgroundColor: d.color,
              width: d.size, height: d.size,
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy] }) },
              ],
              opacity: anim.interpolate({ inputRange: [0, 0.2 + d.delay, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            },
          ]}
        />
      ))}
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  halo: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' },
  mascotWrap: { alignItems: 'center' },
  mascotTile: {
    width: 120, height: 120, borderRadius: 34,
    backgroundColor: '#FFF0DE',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3, borderColor: '#fff',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 14 },
      web:     { boxShadow: '0 10px 22px rgba(0,0,0,0.22)' as any },
    }),
  },
  mascotImg: { width: '100%', height: '100%' },
  pedestal: {
    marginTop: 8,
    width: 100, height: 8, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  lockBubble: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  actionTag: {
    color: '#fff',
    fontSize: 13, fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 28,
    opacity: 0.95,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 10, letterSpacing: -0.2 },
  caption: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '700', marginTop: 4, letterSpacing: 0.2 },
  dot: {
    position: 'absolute',
    borderRadius: 100,
  },
});
