// MintU — Bespoke brand mark.
// Concept: A saffron coin whose negative space forms a stylised ₹.
// A mint-green sprout rises from the top-right, and a tiny spark dots the ₹'s
// second horizontal bar — representing "smart money that grows".
// Pure SVG, no PNG — renders crisply at any size and works as tab/app icon.
import React from 'react';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Circle, Path, G } from 'react-native-svg';

interface Props {
  size?: number;
  /** When true, adds a subtle halo — good for the floating tab button. */
  glow?: boolean;
}

export default function MintULogo({ size = 64, glow = false }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Defs>
        {/* Main saffron gradient — warm, premium */}
        <LinearGradient id="mu_coin" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FF8A3D" />
          <Stop offset="55%" stopColor="#F56E1E" />
          <Stop offset="100%" stopColor="#C14A06" />
        </LinearGradient>
        {/* Inner highlight */}
        <RadialGradient id="mu_highlight" cx="35%" cy="30%" r="55%">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </RadialGradient>
        {/* Mint leaf */}
        <LinearGradient id="mu_leaf" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#6EE7B7" />
          <Stop offset="100%" stopColor="#10B981" />
        </LinearGradient>
        {/* Halo for floating tab usage */}
        <RadialGradient id="mu_glow" cx="50%" cy="50%" r="50%">
          <Stop offset="60%" stopColor="rgba(245,110,30,0)" />
          <Stop offset="100%" stopColor="rgba(245,110,30,0.35)" />
        </RadialGradient>
      </Defs>

      {glow && <Circle cx="120" cy="120" r="118" fill="url(#mu_glow)" />}

      {/* Coin disc */}
      <Circle cx="120" cy="120" r="104" fill="url(#mu_coin)" />
      {/* Inner ring */}
      <Circle cx="120" cy="120" r="92" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
      {/* Top-left highlight */}
      <Circle cx="120" cy="120" r="104" fill="url(#mu_highlight)" />

      {/* Stylised ₹ (rupee) inside — white, custom-crafted strokes */}
      {/* Top horizontal bar */}
      <Path d="M 88 74 L 158 74" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none" />
      {/* Second horizontal bar with a subtle notch on the right (for the spark) */}
      <Path d="M 88 100 L 148 100" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none" />
      {/* Curved stem: C-shape that loops back — this is the ₹ character core */}
      <Path d="M 96 82 Q 150 82 150 122 Q 150 156 108 156 L 96 156"
            stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Diagonal down-stroke ending at bottom */}
      <Path d="M 108 128 L 170 188" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none" />

      {/* Spark-dot on the second bar — accent moment */}
      <Circle cx="158" cy="100" r="5.5" fill="#FFE08A" stroke="#FFFFFF" strokeWidth="1.5" />

      {/* Mint-green sprout ascending from top-right */}
      <G>
        {/* Stem */}
        <Path d="M 176 60 Q 182 45 190 38" stroke="#10B981" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Left leaf */}
        <Path d="M 190 38 Q 180 24 170 30 Q 172 42 188 42 Z" fill="url(#mu_leaf)" />
        {/* Right leaf */}
        <Path d="M 190 38 Q 202 26 214 32 Q 210 46 192 44 Z" fill="url(#mu_leaf)" />
      </G>
    </Svg>
  );
}
