import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ImageBackground } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, ONBOARDING_IMAGES, shadowStyle } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { hasPin, biometricAvailable } from '../utils/lockManager';
import MintULogo from '../components/MintULogo';
import { STORAGE } from '../constants/storage';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary, justifyContent: 'center', alignItems: 'center' },
  glowCircle: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: c.accent.secondary, opacity: 0.08 },
  logoContainer: { alignItems: 'center' },
  logoIcon: {
    width: 96, height: 96, borderRadius: 0, backgroundColor: c.accent.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    ...shadowStyle(c.accent.primary, 8, 20, 0.3, 12),
  },
  logoEmoji: { fontSize: 46, fontWeight: '800', color: c.text.inverse },
  logoText: { fontSize: 48, fontWeight: '800', color: c.text.primary, letterSpacing: -1 },
  tagline: { fontSize: 16, color: c.text.secondary, marginTop: 12 },
}));

export default function SplashIndex() {
  const styles = useStyles();
  const { token, isLoading } = useAuthStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
      Animated.timing(subtitleFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(async () => {
      if (isLoading) return;
      if (token) {
        // Route through the unlock screen if PIN or biometric is enabled.
        const needsUnlock = (await hasPin()) || (await biometricAvailable());
        router.replace(needsUnlock ? '/unlock' : '/(tabs)');
      } else {
        const seen = await AsyncStorage.getItem(STORAGE.ONBOARDING_SEEN);
        router.replace(seen ? '/auth' : '/onboarding');
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [isLoading, token]);

  return (
    <View testID="splash-screen" style={styles.container}>
      <View style={styles.glowCircle} />
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <MintULogo size={120} glow />
        <Text style={styles.logoText}>MintU</Text>
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: subtitleFade }]}>
        Smart Money, Simple Life
      </Animated.Text>
    </View>
  );
}

