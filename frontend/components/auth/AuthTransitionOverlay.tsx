/**
 * AuthTransitionOverlay — Round 89 Strike 2 refine v2.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FINAL UX CONTRACT (locked by user review):
 *
 *   Full-screen. Big mascot, centered. Insight only.
 *
 *   Structure (top-to-bottom, centered vertically):
 *     1. Large mascot tile (128×128, brutalist square)
 *     2. "Welcome back, NAME 👋"             (title)
 *     3. Tag pill from priority engine       (e.g. "HEALTHY" / "BUDGET HEAT")
 *     4. Insight headline (live number)
 *     5. Supporting why-line
 *
 *   NO CTA button — the user asked for insights-only.
 *   NO auto-dismiss button override — a tap-anywhere gesture skips.
 *   Auto-transitions to Home after 2200ms (enough to read).
 *
 * Data: the SAME usePriorityInsight() hook used by Home + Coach.
 * Continuity is the point — what they see here = what Home's TODAY
 * card will show them a second later.
 *
 * Brutalist: paper bg, ink text, orange accent tile for mascot.
 * No glass. No drop shadows. No rounded corners.
 * ═══════════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuthStore } from '../../store/authStore';
import { usePriorityInsight } from '../../hooks/usePriorityInsight';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';

export type AuthTransitionVariant = 'locking' | 'unlocking';

type Props = {
  variant: AuthTransitionVariant;
  onDone: () => void;
  /** Auto-transition delay in ms. Default 2200. */
  durationMs?: number;
};

export default function AuthTransitionOverlay({ variant, onDone, durationMs = 2200 }: Props) {
  if (variant === 'locking') return <LockingScene onDone={onDone} />;
  return <UnlockingScene onDone={onDone} durationMs={durationMs} />;
}

// ═════════════════════════════════════════════════════════════════════════
// Unlocking — FULL-SCREEN insight-first welcome.
// ═════════════════════════════════════════════════════════════════════════
function UnlockingScene({ onDone, durationMs }: { onDone: () => void; durationMs: number }) {
  const { user } = useAuthStore();
  const insight = usePriorityInsight();
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  // Subtle entrance: fade + mascot scale-in, staggered with text.
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const textY = useRef(new Animated.Value(10)).current;
  const doneCalled = useRef(false);

  const finish = () => {
    if (doneCalled.current) return;
    doneCalled.current = true;
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(() => onDone());
  };

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fade,  { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      ]),
      Animated.timing(textY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const t = setTimeout(finish, durationMs);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pressable
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel="Welcome screen. Tap anywhere to continue."
      style={styles.fullscreen}
    >
      <Animated.View style={[styles.inner, { opacity: fade }]} pointerEvents="none">
        {/* Big mascot, centered. Orange accent tile, ink border. */}
        <Animated.View style={[styles.mascotTile, { transform: [{ scale }] }]}>
          <Image
            source={require('../../assets/images/mintu-logo.png')}
            style={styles.mascotImg}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>

        {/* Text block — animated rise-in under mascot. */}
        <Animated.View style={[styles.textBlock, { transform: [{ translateY: textY }] }]}>
          <Text style={styles.welcome} numberOfLines={1}>
            Welcome back, {firstName} <Text style={{ fontSize: 22 }}>👋</Text>
          </Text>
          <View style={[styles.tagPill, { backgroundColor: toneBg(insight?.tone) }]}>
            <Text style={styles.tagTxt}>{insight?.tag || 'TODAY'}</Text>
          </View>
          <Text style={styles.headline} numberOfLines={3}>
            {insight?.headline || 'Here\'s what matters today.'}
          </Text>
          <Text style={styles.bodyLine} numberOfLines={3}>
            {insight?.body || 'You\'re signed in — everything is up to date.'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Tiny hint at the bottom — reinforces tap-to-continue.
          Low-weight typography; fades along with the overlay. */}
      <Animated.View style={[styles.hint, { opacity: fade }]} pointerEvents="none">
        <Text style={styles.hintTxt}>TAP ANYWHERE TO CONTINUE</Text>
      </Animated.View>
    </Pressable>
  );
}

function toneBg(tone: string | undefined): string {
  switch (tone) {
    case 'danger':  return BR_COLORS.negative;
    case 'warning': return BR_COLORS.warning;
    case 'success': return BR_COLORS.positive;
    case 'info':    return BR_COLORS.paperAlt;
    case 'neutral': return BR_COLORS.paperAlt;
    default:        return BR_COLORS.accent;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Locking — minimal, SSoT-free.
// ═════════════════════════════════════════════════════════════════════════
function LockingScene({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[styles.fullscreen, { opacity: fade, backgroundColor: BR_COLORS.ink }]} pointerEvents="auto">
      <View style={styles.inner}>
        <View style={[styles.mascotTile, { backgroundColor: BR_COLORS.paperAlt }]}>
          <Ionicons name="lock-closed" size={48} color={BR_COLORS.ink} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.welcome, { color: BR_COLORS.paper }]}>Securing your session…</Text>
          <Text style={[styles.bodyLine, { color: BR_COLORS.paper, opacity: 0.7 }]}>AES-256 end-to-end encrypted.</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Styles — FULL-SCREEN brutalist. No card, no modal-in-a-modal.
// ═════════════════════════════════════════════════════════════════════════
const MASCOT = 128;
const styles = StyleSheet.create({
  fullscreen: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: BR_COLORS.paper,
    zIndex: 9999,
    ...Platform.select({ web: { cursor: 'pointer' as any } }),
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: BR_SPACE.xl,
    gap: BR_SPACE.xl,
  },
  // Big mascot — the visual center of gravity.
  // Calm neutral paperAlt bg lets the mascot's own saturated fill
  // carry the energy without the tile fighting it.
  mascotTile: {
    width: MASCOT, height: MASCOT,
    backgroundColor: BR_COLORS.paperAlt,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 6, height: 6 } },
      android: { elevation: 0 },
      web:     { boxShadow: '6px 6px 0 0 #0A0A0A' as any },
    }),
  },
  mascotImg: { width: MASCOT - 16, height: MASCOT - 16 },
  // Text block — right under the mascot.
  textBlock: { alignItems: 'center', gap: BR_SPACE.sm, maxWidth: 340 },
  welcome: {
    fontSize: 22, fontWeight: '900',
    color: BR_COLORS.ink, letterSpacing: -0.4,
    textAlign: 'center',
  },
  tagPill: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 2, borderColor: BR_COLORS.ink,
    marginTop: BR_SPACE.sm,
  },
  tagTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: BR_COLORS.ink },
  headline: {
    ...BR_TYPE.h2,
    fontSize: 24, lineHeight: 28,
    color: BR_COLORS.ink,
    textAlign: 'center',
    marginTop: BR_SPACE.sm,
  },
  bodyLine: {
    ...BR_TYPE.sub,
    fontSize: 14, lineHeight: 20,
    color: BR_COLORS.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  hint: {
    position: 'absolute', bottom: 40, left: 0, right: 0,
    alignItems: 'center',
  },
  hintTxt: {
    fontSize: 10, fontWeight: '700',
    letterSpacing: 2, color: BR_COLORS.muted,
  },
});
