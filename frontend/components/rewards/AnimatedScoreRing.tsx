/**
 * components/rewards/AnimatedScoreRing.tsx — Round 73.
 *
 * Replaces the static "Money Score" tile with an animated circular
 * progress ring + count-up number + tap-to-explain handler.
 *
 * Uses react-native-svg + react-native-reanimated for native-feel
 * performance. The ring animates from previous score → new score
 * whenever the prop changes (so a freshly-completed action that
 * bumps the score gets a satisfying live update).
 *
 * Tap behaviour: parent passes `onPress` and we wrap the whole
 * card in a Pressable. Subtle scale-down on press for affordance.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../utils/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  score: number;             // 0–100
  size?: number;             // px diameter
  stroke?: number;           // ring thickness
  urgencyText?: string | null; // e.g. "You can reach 60 by tonight"
  onPress?: () => void;      // tap → score breakdown
}

const SIZE_DEFAULT = 168;
const STROKE_DEFAULT = 11;

export default function AnimatedScoreRing({
  score, size = SIZE_DEFAULT, stroke = STROKE_DEFAULT, urgencyText, onPress,
}: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animated values
  const progress = useRef(new Animated.Value(0)).current;
  const counter = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  // Live count for the number readout
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(progress, {
        toValue: Math.max(0, Math.min(100, score)) / 100,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,  // strokeDashoffset isn't native-drivable
      }),
      Animated.timing(counter, {
        toValue: Math.max(0, Math.min(100, score)),
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [score, progress, counter]);

  // Subscribe to the counter value once and keep React state in sync.
  useEffect(() => {
    const id = counter.addListener(({ value }) => setDisplayValue(Math.round(value)));
    return () => counter.removeListener(id);
  }, [counter]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, friction: 6, tension: 110 }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 110 }).start();
  };

  // Color scale: red < 40, amber 40–69, green 70+
  const tone = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Money Score ${score} of 100. Tap for breakdown.`}
      testID="score-ring"
    >
      <Animated.View style={[styles.wrap, { transform: [{ scale: pressScale }] }]}>
        <View style={[styles.ringWrap, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Defs>
              <SvgGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={tone} stopOpacity="0.95" />
                <Stop offset="1" stopColor={tone} stopOpacity="0.55" />
              </SvgGradient>
            </Defs>
            {/* Track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(15,23,42,0.08)"
              strokeWidth={stroke}
              fill="transparent"
            />
            {/* Active arc */}
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="url(#ringGrad)"
              strokeWidth={stroke}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset as any}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>

          {/* Centered number block */}
          <View style={styles.centerBlock} pointerEvents="none">
            <Text style={styles.kicker}>MONEY SCORE</Text>
            <View style={styles.numRow}>
              <Text style={[styles.bigNum, { color: tone }]}>{displayValue}</Text>
              <Text style={styles.outOf}>/100</Text>
            </View>
            <View style={styles.tapHint}>
              <Ionicons name="information-circle-outline" size={11} color={COLORS.text.muted} />
              <Text style={styles.tapHintTxt}>Tap for breakdown</Text>
            </View>
          </View>
        </View>

        {urgencyText ? (
          <View style={styles.urgencyChip}>
            <Ionicons name="flash" size={11} color={COLORS.accent.primary} />
            <Text style={styles.urgencyTxt}>{urgencyText}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  centerBlock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 9.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: COLORS.text.muted,
    marginBottom: 2,
  },
  numRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  bigNum: {
    fontSize: 48,
    fontFamily: FONT_FAMILY.black,
    letterSpacing: -1.5,
    lineHeight: 50,
  },
  outOf: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.muted,
    letterSpacing: -0.3,
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  tapHintTxt: {
    fontSize: 9.5,
    fontWeight: '600',
    color: COLORS.text.muted,
    letterSpacing: 0.2,
  },
  urgencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accent.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,74,12,0.30)',
  },
  urgencyTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.accent.primaryDark,
    letterSpacing: 0.1,
  },
});
