import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../utils/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton = ({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: '#E8DDD2', opacity },
        style,
      ]}
    />
  );
};

export const HomeSkeleton = () => (
  <View style={sk.container}>
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Skeleton width={80} height={12} />
        <Skeleton width={160} height={24} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={52} height={52} borderRadius={26} />
    </View>
    <Skeleton height={160} borderRadius={RADIUS.card} style={{ marginTop: 16 }} />
    <View style={[sk.row, { marginTop: 16, gap: 8 }]}>
      <Skeleton width={'31%' as any} height={80} borderRadius={RADIUS.lg} />
      <Skeleton width={'31%' as any} height={80} borderRadius={RADIUS.lg} />
      <Skeleton width={'31%' as any} height={80} borderRadius={RADIUS.lg} />
    </View>
    <Skeleton height={100} borderRadius={RADIUS.card} style={{ marginTop: 16 }} />
    <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 12 }} />
    <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 8 }} />
    <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 8 }} />
  </View>
);

export const TransactionsSkeleton = () => (
  <View style={sk.container}>
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Skeleton width={140} height={28} />
        <Skeleton width={80} height={14} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={44} height={44} borderRadius={22} />
    </View>
    <Skeleton height={52} borderRadius={999} style={{ marginTop: 16 }} />
    <Skeleton height={80} borderRadius={RADIUS.card} style={{ marginTop: 16 }} />
    {[1, 2, 3, 4, 5].map(i => (
      <View key={i} style={[sk.row, { marginTop: 10, gap: 12 }]}>
        <Skeleton width={44} height={44} borderRadius={16} />
        <View style={{ flex: 1 }}>
          <Skeleton width={'70%' as any} height={16} />
          <Skeleton width={'40%' as any} height={12} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={60} height={18} />
      </View>
    ))}
  </View>
);

export const BudgetSkeleton = () => (
  <View style={sk.container}>
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Skeleton width={120} height={28} />
        <Skeleton width={60} height={14} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={44} height={44} borderRadius={22} />
    </View>
    {[1, 2, 3].map(i => (
      <View key={i} style={{ marginTop: 16 }}>
        <Skeleton height={160} borderRadius={RADIUS.card} />
      </View>
    ))}
  </View>
);

export const SplitSkeleton = () => (
  <View style={sk.container}>
    <View style={sk.row}>
      <Skeleton width={60} height={28} />
      <View style={{ flex: 1 }} />
      <Skeleton width={70} height={32} borderRadius={20} />
      <Skeleton width={44} height={44} borderRadius={22} />
    </View>
    <Skeleton height={90} borderRadius={20} style={{ marginTop: 16 }} />
    <Skeleton width={60} height={16} style={{ marginTop: 20 }} />
    {[1, 2, 3].map(i => (
      <View key={i} style={[sk.row, { marginTop: 10, gap: 12 }]}>
        <Skeleton width={44} height={44} borderRadius={14} />
        <View style={{ flex: 1 }}>
          <Skeleton width={'60%' as any} height={16} />
          <Skeleton width={'30%' as any} height={12} style={{ marginTop: 4 }} />
        </View>
        <Skeleton width={30} height={30} borderRadius={15} />
      </View>
    ))}
  </View>
);

const sk = StyleSheet.create({
  container: {},
  row: { flexDirection: 'row', alignItems: 'center' },
});
