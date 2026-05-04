/**
 * MoneyNumber — animated ₹-amount count-up.
 *
 * Wave 5.1 primitive. Renders a monetary value that animates from 0
 * (or from the previous value) to the new value over ~800 ms with an
 * ease-out-quart curve. Pure Reanimated 2 — runs on the UI thread so
 * it stays smooth even during list re-renders.
 *
 * Usage:
 *   <MoneyNumber value={23450} prefix="₹" style={{ fontSize: TYPE.xl3 }} />
 *
 * Props:
 *   value     — target number to count up to
 *   prefix    — optional ("₹", "$", "+", "-")
 *   duration  — default 800 ms
 *   format    — optional custom formatter (default: Indian comma grouping)
 *   style     — RN TextStyle
 */
import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { TextInput, TextStyle } from 'react-native';
import { COLORS } from '../../utils/theme';

Animated.addWhitelistedNativeProps?.({ text: true });
const AText = Animated.createAnimatedComponent(TextInput);

function indianFormat(n: number): string {
  // Indian grouping: 1,23,456.78 (rounded to whole rupees for the display usage)
  const whole = Math.round(n);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  const s = String(abs);
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  // Group the rest in 2s (Indian style): e.g. 1,23,45,678
  const grouped = rest.replace(/(\d)(?=(\d\d)+$)/g, '$1,');
  return `${sign}${grouped},${last3}`;
}

export interface MoneyNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: TextStyle | TextStyle[];
  format?: (n: number) => string;
  testID?: string;
}

function MoneyNumberImpl({
  value,
  prefix = '',
  suffix = '',
  duration = 800,
  style,
  format = indianFormat,
  testID,
}: MoneyNumberProps) {
  const shared = useSharedValue(0);

  useEffect(() => {
    shared.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.quad),
    });
  }, [value, duration, shared]);

  const animatedProps = useAnimatedProps(() => ({
    text: `${prefix}${format(shared.value)}${suffix}`,
    defaultValue: `${prefix}${format(shared.value)}${suffix}`,
  })) as any;

  return (
    <AText
      editable={false}
      underlineColorAndroid="transparent"
      testID={testID}
      pointerEvents="none"
      style={[
        { color: COLORS.text.primary, padding: 0, margin: 0 } as TextStyle,
        style as any,
      ]}
      animatedProps={animatedProps}
    />
  );
}

export const MoneyNumber = React.memo(MoneyNumberImpl);
MoneyNumber.displayName = 'MoneyNumber';
export default MoneyNumber;
