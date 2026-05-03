/**
 * AppLockOverlay — Round 51d.
 *
 * Renders an opaque, full-screen overlay whenever the app is in a "locked"
 * state. Mounted in `_layout.tsx` ABOVE the Stack so it covers ALL route
 * content during the lock-→ unlock transition, eliminating the brief flash
 * where the previous screen would peek through during the
 * `router.replace('/unlock')` animation.
 *
 * Why we need this in addition to `/unlock`:
 *   • The Stack screen transition (even with `animation: 'fade'`) has a
 *     ~200ms window where the previous content is still composited.
 *   • When `lock()` is called via the AppState resume hook OR a 401
 *     interceptor, that previous content is exactly the screen the user
 *     was viewing — meaning sensitive financial data (balances, txns,
 *     PIN setup, etc.) is briefly visible to anyone holding the device.
 *
 * The overlay paints `bg.primary` + the MintU mark over the entire viewport
 * the moment `locked` flips to true, so there is ZERO frame in which the
 * caller's prior content is visible.
 *
 * Once the user is on `/unlock` and authenticates, the overlay fades out
 * naturally because `locked` is set back to false.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useAuthStore } from '../store/authStore';
import { useAppColors } from '../utils/theme';

export default function AppLockOverlay() {
  const locked = useAuthStore((s) => s.locked);
  const c = useAppColors();
  if (!locked) return null;
  return (
    <View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, styles.overlay, { backgroundColor: c.bg.primary }]}
      accessibilityLabel="Locked"
      accessibilityRole="alert"
    >
      <Image
        source={require('../assets/images/mintu-logo.png')}
        style={styles.mark}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <Text style={[styles.brand, { color: c.text.primary }]}>MINTU</Text>
      <Text style={[styles.sub, { color: c.text.muted }]}>Locked · unlock to continue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // zIndex must beat OfflineBanner (999) AND any modal/sheet so that
    // the moment `locked` flips, the user is presented with the lock
    // screen immediately, regardless of what's currently mounted.
    zIndex: 10_000,
    elevation: 10_000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...Platform.select({
      // On Android the elevation alone isn't always enough above modals;
      // use a subtle shadow so the overlay is visually distinct from the
      // route content even on transparent themes.
      android: { elevation: 16 },
      default: {},
    }),
  },
  mark: { width: 64, height: 64, borderRadius: 0, marginBottom: 4 },
  brand: { fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  sub: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
});
