import React, { useRef } from 'react';
import { StyleSheet, TouchableOpacity, Platform, Dimensions, Animated, PanResponder } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, RadialGradient, Rect } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');
const SIZE = 58;

const MintULogo = () => (
  <Svg width={30} height={30} viewBox="0 0 240 240">
    <Defs>
      <LinearGradient id="mbg" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#0D1535" />
        <Stop offset="100%" stopColor="#060A1E" />
      </LinearGradient>
      <LinearGradient id="mfill" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#00F5A0" />
        <Stop offset="55%" stopColor="#00E0C8" />
        <Stop offset="100%" stopColor="#00C8FF" />
      </LinearGradient>
    </Defs>
    <Rect x="10" y="10" width="220" height="220" rx="52" fill="url(#mbg)" stroke="rgba(0,245,160,0.25)" strokeWidth="3" />
    <Path
      d="M 62 145 C 62 145, 62 78, 64 72 C 66 66, 70 64, 76 68 C 82 72, 94 95, 102 108 C 108 118, 114 126, 120 126 C 126 126, 132 118, 138 108 C 146 95, 158 72, 164 68 C 170 64, 174 66, 176 72 C 178 78, 178 145, 178 145 C 176 149, 172 150, 168 148 C 166 146, 166 102, 164 92 C 162 86, 158 80, 154 84 C 148 90, 136 114, 128 124 C 124 130, 122 133, 120 133 C 118 133, 116 130, 112 124 C 104 114, 92 90, 86 84 C 82 80, 78 86, 76 92 C 74 102, 74 146, 72 148 C 68 150, 64 149, 62 145 Z"
      fill="url(#mfill)"
    />
    <Circle cx="120" cy="124" r="6" fill="#0B0F2F" stroke="#00F5A0" strokeWidth="2" />
    <Circle cx="120" cy="124" r="2.5" fill="#00F5A0" />
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
        // Snap to nearest horizontal edge
        const snapX = newX + SIZE / 2 < SW / 2 ? 14 : SW - SIZE - 14;

        Animated.spring(pan, { toValue: { x: snapX, y: newY }, useNativeDriver: false, friction: 7 }).start();
        lastPos.current = { x: snapX, y: newY };

        // If barely moved, treat as tap
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
      <MintULogo />
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
    backgroundColor: '#0B0F2F',
    borderWidth: 2,
    borderColor: 'rgba(0,245,160,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
    zIndex: 9999,
  },
});
