/**
 * NBSticker — decorative shape primitives for Memphis chaos.
 *
 * Drop these around hero surfaces for that "glued-on collage" energy:
 *   <NBSticker shape="zigzag" color="pink" rotate="tilt5" top={-12} right={20} />
 *   <NBSticker shape="asterisk" color="lime" tilt="spin1" />
 *   <NBSticker shape="squiggle" color="yellow" />
 *
 * Pure decoration — always pointerEvents=none. Never interactive.
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNeoPalette } from '../../store/neoTheme';
import { NB_ROTATE } from '../../utils/neoBrutalism';

type Shape = 'zigzag' | 'asterisk' | 'squiggle' | 'circle' | 'plus' | 'dot';
type ColorKey = 'lime' | 'yellow' | 'coral' | 'purple' | 'sky' | 'pink' | 'mint' | 'ink';

type Props = {
  shape?: Shape;
  color?: ColorKey;
  size?: number;
  rotate?: keyof typeof NB_ROTATE;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  style?: ViewStyle;
};

export default function NBSticker({
  shape = 'asterisk', color = 'yellow', size = 28, rotate = 'tilt2',
  top, right, bottom, left, style,
}: Props) {
  const palette = useNeoPalette();
  const fill = palette[color] || palette.yellow;
  const stroke = palette.ink;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        { width: size, height: size, top, right, bottom, left, transform: [{ rotateZ: NB_ROTATE[rotate] }] },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {shape === 'zigzag' && (
          <Path d="M2 12 L7 6 L11 14 L15 6 L19 14 L22 8" stroke={stroke} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {shape === 'asterisk' && (
          <Path d="M12 3 L12 21 M3 12 L21 12 M5 5 L19 19 M19 5 L5 19" stroke={fill} strokeWidth={3.5} strokeLinecap="round" />
        )}
        {shape === 'squiggle' && (
          <Path d="M3 14 Q6 6 9 14 T15 14 T21 14" stroke={fill} strokeWidth={3} fill="none" strokeLinecap="round" />
        )}
        {shape === 'circle' && (
          <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={3} fill={fill} />
        )}
        {shape === 'dot' && (
          <Circle cx={12} cy={12} r={6} fill={fill} stroke={stroke} strokeWidth={2} />
        )}
        {shape === 'plus' && (
          <Path d="M12 4 L12 20 M4 12 L20 12" stroke={fill} strokeWidth={4} strokeLinecap="round" />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
