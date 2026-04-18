import React, { useRef } from 'react';
import { StyleSheet, Dimensions, Animated, PanResponder } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Ellipse, Rect } from 'react-native-svg';
import { shadowStyle } from '../utils/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const SIZE = 58;

const MintULogoLight = () => (
  <Svg width={34} height={34} viewBox="0 0 240 240">
    <Defs>
      <LinearGradient id="iconBgL" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FFFFFF" />
        <Stop offset="100%" stopColor="#D8FFF3" />
      </LinearGradient>
      <LinearGradient id="mFillL" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#00C48A" />
        <Stop offset="55%" stopColor="#009EAA" />
        <Stop offset="100%" stopColor="#0082CC" />
      </LinearGradient>
    </Defs>
    <Ellipse cx="120" cy="120" rx="120" ry="120" fill="rgba(0,196,138,0.06)" />
    <Rect x="10" y="10" width="220" height="220" rx="52" fill="url(#iconBgL)" stroke="rgba(0,180,130,0.25)" strokeWidth="2.5" />
    <Path d="M52 11 Q120 8 188 11 Q210 11 220 30 L220 70 Q120 45 20 70 L20 30 Q20 11 52 11Z" fill="rgba(255,255,255,0.6)" />
    <Path
      d="M 62 145 C 62 145, 62 78, 64 72 C 66 66, 70 64, 76 68 C 82 72, 94 95, 102 108 C 108 118, 114 126, 120 126 C 126 126, 132 118, 138 108 C 146 95, 158 72, 164 68 C 170 64, 174 66, 176 72 C 178 78, 178 145, 178 145 C 176 149, 172 150, 168 148 C 166 146, 166 102, 164 92 C 162 86, 158 80, 154 84 C 148 90, 136 114, 128 124 C 124 130, 122 133, 120 133 C 118 133, 116 130, 112 124 C 104 114, 92 90, 86 84 C 82 80, 78 86, 76 92 C 74 102, 74 146, 72 148 C 68 150, 64 149, 62 145 Z"
      fill="url(#mFillL)"
    />
    <Path d="M 67 82 C 68 76, 72 70, 78 74 C 82 78, 92 98, 100 112 C 104 120, 108 128, 110 130 C 106 125, 96 102, 86 88 C 80 80, 74 76, 70 78 Z" fill="rgba(255,255,255,0.4)" />
    <Circle cx="120" cy="124" r="5" fill="white" stroke="#00C48A" strokeWidth="1.5" />
    <Circle cx="120" cy="124" r="2" fill="#00C48A" />
  </Svg>
);

interface Props {
  onPress: () => void;
}

export default function DraggableAIBubble({ onPress }: Props) {
  const pan = useRef(new Animated.ValueXY({ x: SW - SIZE - 14, y: SH - 200 })).current;
  const lastPos = useRef({ x: SW - SIZE - 14, y: SH - 200 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => {
        pan.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        pan.flattenOffset();
        const newX = lastPos.current.x + gs.dx;
        const newY = Math.max(60, Math.min(lastPos.current.y + gs.dy, SH - 160));
        const snapX = newX + SIZE / 2 < SW / 2 ? 14 : SW - SIZE - 14;

        Animated.spring(pan, { toValue: { x: snapX, y: newY }, useNativeDriver: false, friction: 7 }).start();
        lastPos.current = { x: snapX, y: newY };

        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          onPress();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[styles.bubble, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
      {...panResponder.panHandlers}
    >
      <MintULogoLight />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderColor: 'rgba(0,196,138,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadowStyle('#00C48A', 4, 12, 0.3, 15),
    zIndex: 9999,
  },
});
