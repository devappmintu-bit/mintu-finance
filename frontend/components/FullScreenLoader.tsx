/**
 * FullScreenLoader — on-brand loading screen shown in place of the
 * bare `ActivityIndicator` pattern that was scattered across ~50
 * screens after Round 30h frontend audit.
 *
 * Behaviour
 * ---------
 *   • Mounts an animated MintU logo (breathing pulse).
 *   • Shows an optional tagline that fades in after 400 ms so quick
 *     loads never get a flash of text.
 *   • Theme-reactive via useAppColors.
 *
 * Usage
 * -----
 *   if (loading) return <FullScreenLoader tagline="Loading your groups…" />;
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, useAppColors, SPACING } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

type Props = {
  /** Short 1-line caption shown under the logo after 400 ms. */
  tagline?: string;
};

export default function FullScreenLoader({ tagline }: Props) {
  const s = useStyles();
  const C = useAppColors();

  // Breathing scale + opacity on the logo orb
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;
  const textFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1.0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.88,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.45,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    if (tagline) {
      Animated.timing(textFade, {
        toValue: 1,
        delay: 400,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.center}>
        <Animated.View
          style={[
            s.orb,
            { backgroundColor: C.accent.primary, transform: [{ scale }], opacity },
          ]}
        />
        {tagline ? (
          <Animated.Text style={[s.tagline, { color: C.text.secondary, opacity: textFade }]}>
            {tagline}
          </Animated.Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.bg.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 0,
    shadowColor: COLORS.accent.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  tagline: {
    marginTop: SPACING.lg,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
}));
