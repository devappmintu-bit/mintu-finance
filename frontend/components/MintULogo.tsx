// MintU brand mark — v2. Phone silhouette with three ascending bars inside
// (rising finances) and a mint-green gradient. Pure SVG — scales crisply for
// tab icons, splash, and app-store launcher artwork.
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G } from 'react-native-svg';

interface Props {
  size?: number;
  /** Subtle saffron halo around the mark (used by the floating tab button). */
  glow?: boolean;
  /** true = darker phone frame (default). Set false for a light-on-dark usage. */
  dark?: boolean;
}

export default function MintULogo({ size = 96, glow = false, dark = true }: Props) {
  const frame = dark ? '#1A2A08' : '#FFFFFF';
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Defs>
        <LinearGradient id="mu_bars" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#65D546" />
          <Stop offset="55%" stopColor="#8BE24E" />
          <Stop offset="100%" stopColor="#C6F44A" />
        </LinearGradient>
        <LinearGradient id="mu_halo" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="rgba(245,110,30,0.0)" />
          <Stop offset="100%" stopColor="rgba(245,110,30,0.25)" />
        </LinearGradient>
      </Defs>

      {/* Optional saffron halo */}
      {glow && <Circle cx="120" cy="120" r="118" fill="url(#mu_halo)" />}

      {/* Phone silhouette (rounded rectangle with a speaker slot at top) */}
      <G>
        {/* Outer phone frame */}
        <Path
          d="
            M 78 30
            Q 66 30 66 46
            V 206
            Q 66 218 78 218
            H 162
            Q 174 218 174 206
            V 46
            Q 174 30 162 30
            Z
          "
          fill={frame}
        />
        {/* Speaker notch at top */}
        <Rect x="104" y="42" width="32" height="6" rx="3" fill="#0B1503" />
        {/* Inner bezel — where the screen is */}
        <Path
          d="
            M 80 58
            H 160
            V 198
            H 80
            Z
          "
          fill="url(#mu_bars)"
        />

        {/* Now carve out the bar chart by drawing background-colored spaces
            between the bars. We draw the phone's inner bezel color over
            everything, leaving only the three green bars exposed. */}
        <Path
          d="
            M 80 58
            H 160
            V 198
            H 80
            Z
            M 94 182
            V 145
            H 106
            V 182
            Z
            M 114 182
            V 110
            H 126
            V 182
            Z
            M 134 182
            V 128
            H 146
            V 182
            Z
          "
          fill={frame}
          fillRule="evenodd"
        />

        {/* Home indicator dot at bottom */}
        <Circle cx="120" cy="205" r="5" fill="#FFFFFF" />
      </G>
    </Svg>
  );
}
