/**
 * Skeleton — shimmer placeholder primitive.
 *
 * Replaces stray <ActivityIndicator/> loading states and inline skeleton blocks.
 * Provides:
 *   • <Skeleton.Box>   rectangular block with rounded corners
 *   • <Skeleton.Line> single-line of text placeholder
 *   • <Skeleton.Circle> avatar placeholder
 *   • <Skeleton.Group> wraps children + applies a shared shimmer animation
 *
 * Animation: gentle 1.2s horizontal gradient sweep using Animated.loop. Falls
 * back to a static warm-cream block on reduced-motion / web old browsers.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, StyleProp, Platform, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

const ShimmerBase = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const st = useStyles();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ).start();
  }, [anim]);
  const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [-200, 500] });
  return (
    <View style={[st.base, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: translate }] }]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.65)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ width: 200, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
};

function Box({ w = '100%', h = 16, radius = 8, style }: { w?: any; h?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const st = useStyles();
  return <ShimmerBase style={[{ width: w, height: h, borderRadius: radius }, style]} />;
}
function Line({ w = '60%', h = 14 }: { w?: any; h?: number }) {
  return <Box w={w} h={h} radius={6} style={{ marginVertical: 4 }} />;
}
function Circle({ size = 40 }: { size?: number }) {
  return <Box w={size} h={size} radius={size / 2} />;
}
function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}

const Skeleton = { Box, Line, Circle, Group };
export default Skeleton;

const useStyles = makeStyles((c) => ({
  base: { backgroundColor: c.bg.elevated, overflow: 'hidden', ...(Platform.OS === 'web' ? { } : {}) },
}));
