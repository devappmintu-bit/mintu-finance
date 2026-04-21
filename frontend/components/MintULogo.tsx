/**
 * MintULogo — brand mark v3 (theme-aware).
 *
 * Automatically swaps between light-shield and dark-shield mascot variants
 * based on the user's resolved theme (via `useResolvedTheme()`). Still
 * accepts an explicit `source` for custom use-cases. Caller can also force
 * a variant via `variant="light"` or `variant="dark"`.
 */
import React from 'react';
import { View, StyleSheet, ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { useResolvedTheme } from '../store/themeStore';

interface Props {
  size?: number;
  /** Soft saffron glow halo around the mark (used on the floating tab button). */
  glow?: boolean;
  /** Reserved for future light/dark tile styling — keeps the old API. */
  dark?: boolean;
  /** Swap the asset if a caller needs a different source (very rare). */
  source?: ImageSourcePropType;
  /** Force a theme variant. Default 'auto' follows user's theme preference. */
  variant?: 'auto' | 'light' | 'dark';
}

// Cache-once sources — resolved at module load.
const LIGHT_SRC = require('../assets/images/mintu-logo-light.png');
const DARK_SRC  = require('../assets/images/mintu-logo-dark.png');

export default function MintULogo({ size = 96, glow = false, source, variant = 'auto' }: Props) {
  const resolved = useResolvedTheme();
  const picked = variant === 'auto' ? resolved : variant;
  const themedSrc = picked === 'light' ? LIGHT_SRC : DARK_SRC;

  const halo = size * 1.18;
  return (
    <View style={[styles.wrap, { width: halo, height: halo }]}>
      {glow && (
        <View
          style={[
            styles.glow,
            { width: halo, height: halo, borderRadius: halo / 2 },
          ]}
        />
      )}
      <Image
        source={source || themedSrc}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    backgroundColor: '#FF6B1A',
    opacity: 0.32,
    transform: [{ scale: 1.08 }],
  },
});
