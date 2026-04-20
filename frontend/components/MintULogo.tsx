/**
 * MintULogo — brand mark v3.
 *
 * Replaced the SVG phone-with-bars mark with the official MintU mascot
 * (saffron robot on patterned kurta, uploaded Apr 2026). Rendered via
 * `expo-image` so it caches across the app and supports `contentFit="cover"`.
 *
 * Usage stays backward-compatible: pass `size`, `glow`, or `dark` and get
 * a perfectly round, shadowed mascot plate that drops into tab bars,
 * splash screens, modal headers, and onboarding.
 */
import React from 'react';
import { View, StyleSheet, ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';

interface Props {
  size?: number;
  /** Soft saffron glow halo around the mark (used on the floating tab button). */
  glow?: boolean;
  /** Reserved for future light/dark tile styling — keeps the old API. */
  dark?: boolean;
  /** Swap the asset if a caller needs a different source (very rare). */
  source?: ImageSourcePropType;
}

// Cache-once source — resolved at module load.
const DEFAULT_SRC = require('../assets/images/mintu-logo.png');

export default function MintULogo({ size = 96, glow = false, source }: Props) {
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
        source={source || DEFAULT_SRC}
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
    backgroundColor: '#F56E1E',
    opacity: 0.28,
    transform: [{ scale: 1.08 }],
  },
});
