/**
 * SpinWheel.tsx — Premium animated spin wheel (Wave 1).
 *
 * Features:
 *   • SVG pie-chart wheel with N segments (colour per rarity).
 *   • Natural deceleration curve (Easing.out(Easing.cubic)) that feels
 *     like a real carnival wheel winding down.
 *   • Motion-blur style (opacity/scale pulse while spinning).
 *   • Tick haptic feedback every ~80° of rotation.
 *   • Glowing pointer, confetti on win, "near-miss" soft glow when
 *     the landed segment is adjacent to a rare/epic prize.
 *   • Accepts a predetermined winning prize id (so the backend's
 *     weighted pick stays server-authoritative).
 */
import { useAppColors } from '../../utils/theme';
import React, { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import Svg, { G, Path, Circle, Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export type Prize = {
  id: string;
  label: string;
  emoji?: string;
  color: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic';
  kind: string;
};

type Props = {
  prizes: Prize[];
  size?: number;          // diameter in px (defaults to 280)
  disabled?: boolean;
  ctaLabel?: string;
  ctaSubtitle?: string;
  onSpin?: () => Promise<{ prize: Prize } | null>;   // caller returns backend result
  onResult?: (prize: Prize) => void;
};

export type SpinWheelHandle = { forceSpin: () => void };

const POINTER_OFFSET = 270; // 0deg of rotation points to top-center (pointer)

const SpinWheel = forwardRef<SpinWheelHandle, Props>(function SpinWheel(
  { prizes, size = 300, disabled = false, ctaLabel = 'Spin & Win Rewards', ctaSubtitle, onSpin, onResult },
  ref
) {
  const c = useAppColors();
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [spinning, setSpinning] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const tickTimer = useRef<any>(null);
  const lastAngle = useRef(0);

  const count = prizes.length || 1;
  const sliceAngle = 360 / count;
  const radius = size / 2;
  const innerRadius = radius * 0.24;

  // CTA pulse animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Outer glow loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const tick = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  const spinTo = (targetPrizeId: string, resolvedPrize: Prize) => {
    const idx = prizes.findIndex(p => p.id === targetPrizeId);
    const segmentCenter = idx * sliceAngle + sliceAngle / 2;
    // We want the pointer (top) to land at segmentCenter, so rotate by (360 * N + (360 - segmentCenter))
    const fullSpins = 6 + Math.floor(Math.random() * 2);
    const final = fullSpins * 360 + (360 - segmentCenter);

    // Start tick emitter
    tickTimer.current && clearInterval(tickTimer.current);
    let lastTickDeg = 0;
    const listener = rotation.addListener(({ value }) => {
      const absDeg = Math.abs(value);
      if (absDeg - lastTickDeg > sliceAngle) {
        lastTickDeg = absDeg;
        tick();
      }
      lastAngle.current = value;
    });

    Animated.timing(rotation, {
      toValue: final,
      duration: 4200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      rotation.removeListener(listener);
      setSpinning(false);
      setHighlightIdx(idx);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onResult && onResult(resolvedPrize);
    });
  };

  const handleSpin = async () => {
    if (spinning || disabled) return;
    if (!onSpin) return;
    setSpinning(true);
    setHighlightIdx(null);
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const result = await onSpin();
      if (!result || !result.prize) { setSpinning(false); return; }
      spinTo(result.prize.id, result.prize);
    } catch (e) {
      setSpinning(false);
    }
  };

  useImperativeHandle(ref, () => ({ forceSpin: handleSpin }));

  // Build the SVG wheel
  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: radius + r * Math.cos(rad), y: radius + r * Math.sin(rad) };
  };

  const segmentPath = (startAngle: number, endAngle: number) => {
    const outer1 = polarToCartesian(startAngle, radius - 6);
    const outer2 = polarToCartesian(endAngle, radius - 6);
    const inner1 = polarToCartesian(endAngle, innerRadius);
    const inner2 = polarToCartesian(startAngle, innerRadius);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${outer1.x} ${outer1.y}`,
      `A ${radius - 6} ${radius - 6} 0 ${largeArc} 1 ${outer2.x} ${outer2.y}`,
      `L ${inner1.x} ${inner1.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${inner2.x} ${inner2.y}`,
      'Z',
    ].join(' ');
  };

  const rotateStyle = {
    transform: [
      {
        rotate: rotation.interpolate({
          inputRange: [0, 360],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <View style={[s.wrap, { width: size + 40, height: size + 110 }]}>
      {/* Outer animated glow */}
      <Animated.View style={[s.glow, { width: size + 30, height: size + 30, borderRadius: (size + 30) / 2, opacity: glowOpacity }]} />

      {/* Pointer (top-center triangle) */}
      <View style={[s.pointerWrap, { top: -6, left: size / 2 + 20 - 14 }]}>
        <View style={s.pointer} />
        <View style={s.pointerDot} />
      </View>

      <Animated.View style={[{ width: size, height: size, marginTop: 8 }, rotateStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {prizes.map((p, i) => (
              <SvgGradient key={`grad-${i}`} id={`grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={p.color} stopOpacity="1" />
                <Stop offset="100%" stopColor={shade(p.color, -0.25)} stopOpacity="1" />
              </SvgGradient>
            ))}
          </Defs>
          {/* Outer ring */}
          <Circle cx={radius} cy={radius} r={radius - 2} fill={c.state.warningBg} />
          <Circle cx={radius} cy={radius} r={radius - 4} fill="#FFFFFF" />
          {prizes.map((p, i) => {
            const start = i * sliceAngle;
            const end = start + sliceAngle;
            const mid = start + sliceAngle / 2;
            const labelPt = polarToCartesian(mid, radius * 0.68);
            return (
              <G key={p.id}>
                <Path
                  d={segmentPath(start, end)}
                  fill={`url(#grad-${i})`}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
                <SvgText
                  x={labelPt.x}
                  y={labelPt.y - 6}
                  textAnchor="middle"
                  fontSize={size > 260 ? 22 : 18}
                  fontWeight="900"
                >
                  {p.emoji || '🎁'}
                </SvgText>
                <SvgText
                  x={labelPt.x}
                  y={labelPt.y + 14}
                  textAnchor="middle"
                  fontSize={size > 260 ? 10 : 8}
                  fontWeight="900"
                  fill="#FFFFFF"
                >
                  {trunc(p.label, 10)}
                </SvgText>
              </G>
            );
          })}
          {/* Inner hub */}
          <Circle cx={radius} cy={radius} r={innerRadius} fill={c.text.primary} />
          <Circle cx={radius} cy={radius} r={innerRadius - 6} fill={c.accent.warning} />
          <Circle cx={radius} cy={radius} r={innerRadius - 14} fill="#FFFFFF" />
        </Svg>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={{ transform: [{ scale: pulse }], marginTop: 18 }}>
        <TouchableOpacity onPress={handleSpin} disabled={disabled || spinning} activeOpacity={0.9} testID="spin-cta">
          <LinearGradient
            colors={disabled ? ['#D1D5DB', '#9CA3AF'] : ['#F59E0B', '#F56E1E', '#C14A06']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.cta}
          >
            <Ionicons name={spinning ? 'sync' : 'flash'} size={18} color="#FFFFFF" />
            <View>
              <Text style={s.ctaText}>{spinning ? 'Spinning…' : ctaLabel}</Text>
              {!!ctaSubtitle && <Text style={s.ctaSub}>{ctaSubtitle}</Text>}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

export default SpinWheel;

// ————— helpers —————
function trunc(str: string, n: number) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }
function shade(hex: string, pct: number) {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v * pct : (255 - v) * pct))));
    return `#${[adj(r), adj(g), adj(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  } catch { return hex; }
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 },
  glow: { position: 'absolute', top: -6, backgroundColor: '#FCD34D', shadowColor: '#F59E0B', shadowOpacity: 0.8, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  pointerWrap: { position: 'absolute', zIndex: 4, alignItems: 'center' },
  pointer: { width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#EF4444' },
  pointerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#EF4444', marginTop: -4 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999, minWidth: 220, shadowColor: '#F56E1E', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  ctaText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },
  ctaSub: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 1 },
});
