/**
 * MintULogo — brand mark (single canonical mascot, theme-invariant).
 *
 * Per product decision, the mascot now looks identical across all themes.
 * This component keeps the legacy API (`size`, `glow`, `dark`, `source`,
 * `variant`) intact so existing call sites don't break, but always renders
 * the same artwork.
 */
import React from 'react';
import { View, StyleSheet, ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { makeStyles } from '../utils/makeStyles';

interface Props {
  size?: number;
  /** Soft saffron glow halo around the mark (used on the floating tab button). */
  glow?: boolean;
  /** No-op, kept for back-compat. */
  dark?: boolean;
  /** Override source (very rare). */
  source?: ImageSourcePropType;
  /** No-op, kept for back-compat. */
  variant?: 'auto' | 'light' | 'dark';
}

const MASCOT_SRC = require('../assets/images/mintu-logo.png');

export default function MintULogo({ size = 96, glow = false, source }: Props) {
  const styles = useStyles();
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
        source={source || MASCOT_SRC}
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

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    backgroundColor: '#FF6B1A',
    opacity: 0.32,
    transform: [{ scale: 1.08 }],
  },
}));
