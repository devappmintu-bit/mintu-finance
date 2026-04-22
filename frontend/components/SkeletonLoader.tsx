import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  /** When placed inside the orange hero, use a white-tinted bar instead. */
  onHero?: boolean;
}

export const Skeleton = ({ width = '100%', height = 16, borderRadius = 8, style, onHero = false }: SkeletonProps) => {
  const sk = useStyles();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        sk.bar,
        onHero && sk.barHero,
        { width: width as any, height, borderRadius, opacity },
        style,
      ]}
    />
  );
};

/**
 * HomeSkeleton — on-brand loading state that mirrors the live Home layout.
 * Dark/light/AMOLED adaptive via theme tokens.
 */
export const HomeSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      {/* Greeting row — username + avatar */}
      <View style={sk.row}>
        <View style={{ flex: 1 }}>
          <Skeleton width={80} height={10} />
          <Skeleton width={160} height={22} style={{ marginTop: 8 }} />
        </View>
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>

      {/* Balance hero — brand orange gradient placeholder with a fake score + CTA */}
      <LinearGradient
        colors={['#F56E1E', '#C14A06']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={sk.hero}
      >
        <Skeleton width={80} height={18} borderRadius={10} onHero />
        <View style={{ height: 12 }} />
        <Skeleton width={120} height={10} onHero />
        <View style={{ height: 6 }} />
        <Skeleton width={160} height={36} borderRadius={8} onHero />
        <View style={{ height: 12 }} />
        <Skeleton width={'90%' as any} height={12} onHero />
        <View style={{ height: 14 }} />
        <Skeleton width={150} height={36} borderRadius={999} onHero />
      </LinearGradient>

      {/* Quick action bar — 5 icons */}
      <View style={[sk.row, { marginTop: 14, gap: 8 }]}>
        {[1,2,3,4,5].map(i => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <Skeleton width={38} height={8} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* AI Coach insight card */}
      <Skeleton height={140} borderRadius={RADIUS.card} style={{ marginTop: 18 }} />

      {/* Transaction rows */}
      <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 14 }} />
      <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 8 }} />
      <Skeleton height={70} borderRadius={RADIUS.xl} style={{ marginTop: 8 }} />
    </View>
  );
};

export const TransactionSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.txItem}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width={140} height={14} />
        <Skeleton width={80} height={10} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={60} height={16} />
    </View>
  );
};

const useStyles = makeStyles((c) => ({
  container: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  bar: { backgroundColor: c.bg.card },
  barHero: { backgroundColor: 'rgba(255,255,255,0.35)' },
  hero: { marginTop: 16, borderRadius: RADIUS.card, padding: 18, overflow: 'hidden' },
  txItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: c.bg.secondary, marginBottom: SPACING.sm },
}));

export const TransactionsSkeleton = () => {
  const sk = useStyles();
  return (
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
};

export const BudgetSkeleton = () => {
  const sk = useStyles();
  return (
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
};

export const SplitSkeleton = () => {
  const sk = useStyles();
  return (
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
};
