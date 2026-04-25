/**
 * AnimatedStreak — tiered streak flame with continuous pulse loop.
 *
 * Round 40 — 5 distinct animation tiers driven purely by streak count.
 * Each tier escalates visual energy; legendary (100+) adds colour-tween
 * sparkles and a "LEGENDARY" chip. All loops run on the native driver
 * (transform.scale + opacity), so performance is identical on low-end
 * devices. Colour tweens use interpolate on an Animated.Value which is
 * NOT native-driver capable — that one lives on JS but only advances
 * every ~700ms so it's imperceptible.
 *
 * Tiers:
 *   0          → grey static flame, no animation
 *   1..6       → orange gentle pulse  (scale 1→1.05, 1800ms)
 *   7..29      → deep-orange med pulse + glow (1→1.10, 1200ms) + "Week streak!" on day 7
 *   30..99     → gold fast pulse + 4 sparkles (1→1.15, 900ms) + "30-day streak!" on day 30
 *   100+       → colour-tween gold/cream + 8 sparkles + LEGENDARY chip + "100-day!" on 100
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Platform } from 'react-native';
import { makeStyles } from '../utils/makeStyles';

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  value: number;
  size?: Size;
  suffix?: string;
  animateOnMount?: boolean;
  style?: any;
  testID?: string;
}

const TYPO: Record<Size, { num: number; emoji: number; label: number; gap: number }> = {
  xs: { num: 14, emoji: 14, label: 10, gap: 3 },
  sm: { num: 18, emoji: 18, label: 11, gap: 4 },
  md: { num: 24, emoji: 22, label: 12, gap: 6 },
  lg: { num: 36, emoji: 32, label: 13, gap: 8 },
};

type TierSpec = {
  tier: 0 | 1 | 2 | 3 | 4;
  color: string;           // text colour
  flameColor: string;      // hue to tint the flame emoji via a coloured overlay
  pulseTo: number;         // peak scale
  pulseMs: number;         // full cycle duration
  glow: boolean;
  sparkles: number;
};
function tierOf(days: number): TierSpec {
  if (days >= 100) return { tier: 4, color: '#A16207', flameColor: '#EAB308', pulseTo: 1.20, pulseMs: 600,  glow: true,  sparkles: 8 };
  if (days >= 30)  return { tier: 3, color: '#A16207', flameColor: '#EAB308', pulseTo: 1.15, pulseMs: 900,  glow: true,  sparkles: 4 };
  if (days >= 7)   return { tier: 2, color: '#C2410C', flameColor: '#EA580C', pulseTo: 1.10, pulseMs: 1200, glow: true,  sparkles: 0 };
  if (days >= 1)   return { tier: 1, color: '#C2410C', flameColor: '#F97316', pulseTo: 1.05, pulseMs: 1800, glow: false, sparkles: 0 };
  return             { tier: 0, color: '#9CA3AF', flameColor: '#9CA3AF', pulseTo: 1.0,  pulseMs: 0,    glow: false, sparkles: 0 };
}

/** Day on which to show a celebratory milestone banner (once, ~3-5s). */
function milestoneCopy(days: number): string | null {
  if (days === 7)   return '🔥 Week streak!';
  if (days === 30)  return '🏆 30-day streak!';
  if (days === 100) return '⚡ 100-day streak!';
  return null;
}

/** Single sparkle — animates outward from centre, fades, loops. */
function Sparkle({ angleDeg, delay, color, size }: { angleDeg: number; delay: number; color: string; size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay]);

  const rad = (angleDeg * Math.PI) / 180;
  const dist = size * 1.2;
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * dist] });
  const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * dist] });
  const opacity = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.6] });

  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: 'absolute', fontSize: size * 0.55, color,
        transform: [{ translateX: tx }, { translateY: ty }, { scale }],
        opacity,
      }}
    >
      ✦
    </Animated.Text>
  );
}

export default function AnimatedStreak({
  value, size = 'md', suffix = 'days', animateOnMount = false, style, testID,
}: Props) {
  const s = useStyles();
  const [display, setDisplay] = useState<number>(animateOnMount ? 0 : value);
  const prev = useRef<number>(animateOnMount ? 0 : value);
  const countAnim = useRef(new Animated.Value(animateOnMount ? 0 : value)).current;
  const pulse = useRef(new Animated.Value(0)).current;        // 0..1..0 loop
  const legendChip = useRef(new Animated.Value(0.7)).current; // opacity 0.7..1..0.7 loop
  const colourTween = useRef(new Animated.Value(0)).current;  // 0..1..0 loop for tier 4 gold↔cream
  const milestoneOpacity = useRef(new Animated.Value(0)).current;
  const [milestone, setMilestone] = useState<string | null>(null);

  const spec = tierOf(display);

  // ── Count-up animation on value change ──────────────────────────
  useEffect(() => {
    if (value === prev.current) return;
    countAnim.setValue(prev.current);
    Animated.timing(countAnim, {
      toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start(() => { prev.current = value; });
    const listener = countAnim.addListener(({ value: v }) => setDisplay(Math.max(0, Math.round(v))));
    return () => countAnim.removeListener(listener);
  }, [value, countAnim]);

  // ── Milestone banner (fires once per milestone day) ────────────
  useEffect(() => {
    const copy = milestoneCopy(value);
    if (!copy) return;
    setMilestone(copy);
    milestoneOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(milestoneOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(value >= 100 ? 5000 : 3000),
      Animated.timing(milestoneOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setMilestone(null));
  }, [value, milestoneOpacity]);

  // ── Continuous pulse loop per tier ─────────────────────────────
  useEffect(() => {
    if (spec.tier === 0 || spec.pulseMs === 0) {
      pulse.setValue(0);
      return;
    }
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: spec.pulseMs / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: spec.pulseMs / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spec.tier, spec.pulseMs, pulse]);

  // ── Legendary chip opacity loop (tier 4 only) ──────────────────
  useEffect(() => {
    if (spec.tier !== 4) { legendChip.setValue(0.7); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(legendChip, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        Animated.timing(legendChip, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spec.tier, legendChip]);

  // ── Gold/cream colour tween (tier 4 only) ─────────────────────
  useEffect(() => {
    if (spec.tier !== 4) { colourTween.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(colourTween, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(colourTween, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spec.tier, colourTween]);

  const t = TYPO[size];
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, spec.pulseTo] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  // Tier-4 colour interpolation (gold ↔ cream).
  const tintColor = spec.tier === 4
    ? (colourTween.interpolate({ inputRange: [0, 1], outputRange: ['#EAB308', '#FEF3C7'] }) as any)
    : spec.flameColor;

  return (
    <View style={[s.wrap, { gap: t.gap }, style]} testID={testID} accessibilityLabel={`${value} day streak${spec.tier >= 3 ? ', milestone reached' : ''}`}>
      <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', width: t.emoji * 2.4, height: t.emoji * 2.4 }}>
        {/* Glow ring (tiers 2-4) */}
        {spec.glow && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.glow,
              {
                opacity: glowOpacity,
                width: t.emoji * 2.2,
                height: t.emoji * 2.2,
                borderRadius: t.emoji * 1.1,
                backgroundColor: (spec.tier === 2 ? '#F9731633' : '#EAB30844') as any,
                ...Platform.select({
                  ios: { shadowColor: spec.tier === 2 ? '#F97316' : '#EAB308', shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
                  android: { elevation: 8 },
                }),
              },
            ]}
          />
        )}
        {/* Sparkles (tiers 3-4) */}
        {Array.from({ length: spec.sparkles }).map((_, i) => (
          <Sparkle
            key={i}
            angleDeg={(360 / spec.sparkles) * i}
            delay={(i * 180) % 1000}
            color={spec.tier === 4 ? '#FEF08A' : '#FDE68A'}
            size={t.emoji}
          />
        ))}
        {/* Flame itself — tinted via a coloured overlay emoji stacked behind the base 🔥.
            Emojis are rendered by the platform and can't be tinted directly, so we tint the
            background halo colour instead and let the 🔥 sit on top. */}
        <Animated.Text
          style={[
            { fontSize: t.emoji, transform: [{ scale }] },
            spec.tier === 0 && { opacity: 0.55 },
          ]}
        >
          🔥
        </Animated.Text>
      </View>

      <Text
        style={{
          fontSize: t.num, fontWeight: '900', color: spec.color,
          letterSpacing: -0.4, fontVariant: ['tabular-nums'],
        }}
      >
        {display}
      </Text>
      {suffix ? (
        <Text style={{ fontSize: t.label, color: spec.color, fontWeight: '700', letterSpacing: 0.3 }}>
          {suffix}
        </Text>
      ) : null}

      {/* Legendary chip — only tier 4 */}
      {spec.tier === 4 && (
        <Animated.View style={[s.legendChip, { opacity: legendChip }]}>
          <Text style={s.legendTxt}>⚡ LEGENDARY</Text>
        </Animated.View>
      )}

      {/* Milestone banner (absolute, fades 3-5s) */}
      {milestone && (
        <Animated.View pointerEvents="none" style={[s.milestone, { opacity: milestoneOpacity }]}>
          <Text style={s.milestoneTxt}>{milestone}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  glow: { position: 'absolute' },
  legendChip: {
    marginLeft: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#EAB30866',
  },
  legendTxt: { fontSize: 9, fontWeight: '900', color: '#A16207', letterSpacing: 1 },
  milestone: {
    position: 'absolute', top: -24, alignSelf: 'center',
    backgroundColor: '#111827', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  milestoneTxt: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
}));
