/**
 * BrutalToast — floating reward / status banner with Animated fade.
 *
 * Hoisted out of AICoachChat (R102C) into a reusable primitive so the
 * Split, Budget, and Onboarding screens can fire celebrations with the
 * same vocabulary.
 *
 * Usage:
 *   const [reward, setReward] = useState<string|null>(null);
 *   <BrutalToast message={reward} onDismiss={() => setReward(null)} />
 *
 * The component auto-fades 200 ms in / 2.2 s hold / 250 ms out, then
 * calls onDismiss so the parent can clear state.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BR_BORDER,
  BR_COLORS,
  BR_RADIUS,
  BR_SHADOW,
  TONE_BG,
  TONE_FG,
  type BrutalTone,
} from '../../theme/brutal';

export type BrutalToastProps = {
  /** When non-null, show the toast. When null, render nothing. */
  message: string | null;
  onDismiss?: () => void;
  tone?: BrutalTone;
  /** Override the top offset (default 56). */
  top?: number;
  /** Hold duration in ms (default 2200). */
  hold?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function BrutalToast({
  message,
  onDismiss,
  tone = 'accent',
  top = 56,
  hold = 2200,
  style,
  testID = 'brutal-toast',
}: BrutalToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(hold),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss?.());
  }, [message, hold, opacity, onDismiss]);
  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        s.toast,
        {
          top,
          backgroundColor: TONE_BG[tone],
          opacity,
        },
        BR_SHADOW.md,
        style,
      ]}
    >
      <Text style={[s.txt, { color: TONE_FG[tone] }]}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.sm,
    zIndex: 80,
    maxWidth: '85%',
  },
  txt: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
