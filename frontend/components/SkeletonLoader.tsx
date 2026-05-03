import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
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

      {/* Round 58b — Balance hero placeholder upgraded to glass to
          match the new BalanceHero. Single 4px brand strip at top, dark
          ink placeholders on translucent white. */}
      <View style={sk.heroGlass}>
        <View style={sk.heroAccentStrip} />
        <View style={sk.row}>
          <Skeleton width={90} height={20} borderRadius={10} />
          <View style={{ flex: 1 }} />
          <Skeleton width={70} height={20} borderRadius={10} />
        </View>
        <View style={{ height: 14 }} />
        <Skeleton width={80} height={10} />
        <View style={{ height: 6 }} />
        <Skeleton width={180} height={42} borderRadius={8} />
        <View style={{ height: 12 }} />
        <Skeleton width={'90%' as any} height={12} />
        <View style={{ height: 14 }} />
        <Skeleton width={170} height={32} borderRadius={999} />
      </View>

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
  heroGlass: {
    marginTop: 16, borderRadius: 0, padding: 18, paddingTop: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    position: 'relative',
  },
  heroAccentStrip: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
    backgroundColor: c.accent.primary,
  },
  txItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: c.bg.secondary, marginBottom: SPACING.sm },
  budgetCard: {
    marginTop: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.card, backgroundColor: c.bg.secondary,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.border.subtle,
  },
}));

/**
 * TransactionsSkeleton — 5 pill-shaped day groups + filter chips.
 * Mirrors the real transactions list layout with category icon + title+subtitle + amount.
 */
export const TransactionsSkeleton = () => {
  const sk = useStyles();
  return (
  <View style={sk.container}>
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Skeleton width={60} height={10} />
        <Skeleton width={160} height={24} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={36} height={36} borderRadius={18} />
    </View>

    {/* Filter chips row */}
    <View style={[sk.row, { marginTop: 14, gap: 8 }]}>
      <Skeleton width={72} height={32} borderRadius={999} />
      <Skeleton width={88} height={32} borderRadius={999} />
      <Skeleton width={64} height={32} borderRadius={999} />
      <Skeleton width={80} height={32} borderRadius={999} />
    </View>

    {/* Summary card (week total) */}
    <Skeleton height={90} borderRadius={RADIUS.card} style={{ marginTop: 14 }} />

    {/* Day header + 3 rows */}
    <Skeleton width={90} height={12} style={{ marginTop: 18 }} />
    {[1, 2, 3].map(i => (
      <View key={i} style={sk.txItem}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={'70%' as any} height={14} />
          <Skeleton width={'40%' as any} height={10} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={70} height={16} />
      </View>
    ))}

    {/* Second day header + 2 rows */}
    <Skeleton width={90} height={12} style={{ marginTop: 12 }} />
    {[1, 2].map(i => (
      <View key={i} style={sk.txItem}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={'60%' as any} height={14} />
          <Skeleton width={'30%' as any} height={10} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={70} height={16} />
      </View>
    ))}
  </View>
  );
};

/**
 * BudgetSkeleton — header + month scroller + 3 category budget cards with progress rings.
 */
export const BudgetSkeleton = () => {
  const sk = useStyles();
  return (
  <View style={sk.container}>
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Skeleton width={60} height={10} />
        <Skeleton width={120} height={22} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={36} height={36} borderRadius={18} />
    </View>

    {/* Month scroller chips */}
    <View style={[sk.row, { marginTop: 14, gap: 8 }]}>
      {[1,2,3,4,5].map(i => (
        <Skeleton key={i} width={56} height={32} borderRadius={999} />
      ))}
    </View>

    {/* Overall gradient budget hero */}
    <View
      style={[sk.hero, { backgroundColor: '#0A0A0A' }]}>
      <Skeleton width={100} height={10} onHero />
      <View style={{ height: 8 }} />
      <Skeleton width={180} height={36} borderRadius={6} onHero />
      <View style={{ height: 10 }} />
      <Skeleton height={10} borderRadius={5} onHero />
    </View>

    {/* 3 category budget cards */}
    {[1, 2, 3].map(i => (
      <View key={i} style={sk.budgetCard}>
        <View style={sk.row}>
          <Skeleton width={40} height={40} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width={'55%' as any} height={14} />
            <Skeleton width={'35%' as any} height={10} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={60} height={18} />
        </View>
        <Skeleton height={8} borderRadius={4} style={{ marginTop: 14 }} />
      </View>
    ))}
  </View>
  );
};

/**
 * SplitSkeleton — header + net balance card + tabs + group rows.
 */
export const SplitSkeleton = () => {
  const sk = useStyles();
  return (
  <View style={sk.container}>
    <View style={sk.row}>
      <Skeleton width={70} height={24} />
      <View style={{ flex: 1 }} />
      <Skeleton width={68} height={30} borderRadius={999} />
      <View style={{ width: 8 }} />
      <Skeleton width={36} height={36} borderRadius={18} />
    </View>

    {/* Net balance hero (orange gradient) */}
    <View
      style={[sk.hero, { backgroundColor: '#0A0A0A' }]}>
      <Skeleton width={90} height={10} onHero />
      <View style={{ height: 6 }} />
      <Skeleton width={160} height={30} borderRadius={6} onHero />
      <View style={{ height: 10 }} />
      <View style={sk.row}>
        <Skeleton width={72} height={28} borderRadius={999} onHero />
        <View style={{ width: 8 }} />
        <Skeleton width={72} height={28} borderRadius={999} onHero />
      </View>
    </View>

    {/* Tabs */}
    <View style={[sk.row, { marginTop: 14, gap: 10 }]}>
      <Skeleton width={80} height={14} />
      <Skeleton width={80} height={14} />
      <Skeleton width={80} height={14} />
    </View>

    {/* Group / expense rows */}
    {[1, 2, 3, 4].map(i => (
      <View key={i} style={sk.txItem}>
        <Skeleton width={44} height={44} borderRadius={14} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={'55%' as any} height={14} />
          <Skeleton width={'35%' as any} height={10} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={30} height={30} borderRadius={15} />
      </View>
    ))}
  </View>
  );
};


/**
 * LeaderboardSkeleton — header + scope toggles + your-rank hero +
 * podium top-3 + full list rows. Mirrors /leaderboard layout.
 */
export const LeaderboardSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      <View style={sk.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={140} height={18} />
        </View>
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>

      {/* Scope toggle */}
      <View style={[sk.row, { marginTop: 14, gap: 6 }]}>
        <Skeleton width={'33%' as any} height={34} borderRadius={999} />
        <Skeleton width={'33%' as any} height={34} borderRadius={999} />
        <Skeleton width={'33%' as any} height={34} borderRadius={999} />
      </View>

      {/* Your-rank hero (gradient) */}
      <View
        style={[sk.hero, { backgroundColor: '#0A0A0A' }]}>
        <Skeleton width={70} height={10} onHero />
        <View style={{ height: 10 }} />
        <View style={sk.row}>
          <Skeleton width={56} height={56} borderRadius={28} onHero />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Skeleton width={120} height={20} borderRadius={6} onHero />
            <Skeleton width={80} height={12} style={{ marginTop: 6 }} onHero />
          </View>
          <Skeleton width={64} height={26} borderRadius={999} onHero />
        </View>
      </View>

      {/* Podium row (top 3) */}
      <View style={[sk.row, { marginTop: 16, alignItems: 'flex-end', gap: 10 }]}>
        {[64, 86, 56].map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Skeleton width={42} height={42} borderRadius={21} />
            <Skeleton width={'70%' as any} height={10} />
            <Skeleton width={'100%' as any} height={h} borderRadius={10} />
          </View>
        ))}
      </View>

      {/* List rows */}
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={sk.txItem}>
          <Skeleton width={28} height={20} borderRadius={6} />
          <View style={{ width: 12 }} />
          <Skeleton width={36} height={36} borderRadius={18} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Skeleton width={'55%' as any} height={14} />
            <Skeleton width={'30%' as any} height={10} style={{ marginTop: 5 }} />
          </View>
          <Skeleton width={56} height={18} />
        </View>
      ))}
    </View>
  );
};

/**
 * MysteryBoxSkeleton — hero "open box" CTA + reward log. Matches the
 * mystery-box screen layout so the swap is invisible.
 */
export const MysteryBoxSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      <View style={sk.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={150} height={18} />
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Hero box CTA */}
      <View
        style={[sk.hero, { alignItems: 'center', paddingVertical: 28 }, { backgroundColor: '#0A0A0A' }]}>
        <Skeleton width={96} height={96} borderRadius={20} onHero />
        <View style={{ height: 14 }} />
        <Skeleton width={180} height={18} borderRadius={6} onHero />
        <View style={{ height: 10 }} />
        <Skeleton width={160} height={42} borderRadius={999} onHero />
      </View>

      {/* Streak / coin counters */}
      <View style={[sk.row, { marginTop: 14, gap: 10 }]}>
        <Skeleton width={'48%' as any} height={70} borderRadius={14} />
        <Skeleton width={'48%' as any} height={70} borderRadius={14} />
      </View>

      {/* Recent rewards list */}
      <Skeleton width={140} height={12} style={{ marginTop: 18 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={sk.txItem}>
          <Skeleton width={36} height={36} borderRadius={10} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width={'60%' as any} height={14} />
            <Skeleton width={'35%' as any} height={10} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={56} height={16} />
        </View>
      ))}
    </View>
  );
};

/**
 * YearlySkeleton — month tiles grid + summary chips for the
 * year-in-review screen.
 */
export const YearlySkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      <View style={sk.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={160} height={18} />
        </View>
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>

      {/* Year hero */}
      <View
        style={[sk.hero, { backgroundColor: '#0A0A0A' }]}>
        <Skeleton width={100} height={12} onHero />
        <View style={{ height: 10 }} />
        <Skeleton width={200} height={36} borderRadius={6} onHero />
        <View style={{ height: 14 }} />
        <View style={sk.row}>
          <Skeleton width={'48%' as any} height={48} borderRadius={12} onHero />
          <View style={{ width: 8 }} />
          <Skeleton width={'48%' as any} height={48} borderRadius={12} onHero />
        </View>
      </View>

      {/* Month grid (3×4) */}
      <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={{ width: '31.5%' }}>
            <Skeleton height={86} borderRadius={14} />
          </View>
        ))}
      </View>

      {/* Insights cards */}
      <Skeleton height={120} borderRadius={RADIUS.card} style={{ marginTop: 16 }} />
      <Skeleton height={120} borderRadius={RADIUS.card} style={{ marginTop: 10 }} />
    </View>
  );
};

/**
 * PremiumHubSkeleton — premium status hero + entitlement chips +
 * reports list. Used while /premium/status loads.
 */
export const PremiumHubSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      <View style={sk.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={120} height={18} />
        </View>
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>

      {/* Pro hero */}
      <View
        style={[sk.hero, { backgroundColor: '#0A0A0A' }]}>
        <View style={[sk.row, { alignItems: 'center' }]}>
          <Skeleton width={60} height={60} borderRadius={30} onHero />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Skeleton width={140} height={18} borderRadius={6} onHero />
            <Skeleton width={100} height={12} style={{ marginTop: 8 }} onHero />
          </View>
        </View>
        <View style={{ height: 14 }} />
        <Skeleton height={42} borderRadius={999} onHero />
      </View>

      {/* Entitlement chips row */}
      <View style={[sk.row, { marginTop: 14, gap: 8 }]}>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} width={70} height={28} borderRadius={999} />
        ))}
      </View>

      {/* Reports list cards */}
      {[1, 2, 3].map(i => (
        <Skeleton key={i} height={90} borderRadius={RADIUS.card} style={{ marginTop: 12 }} />
      ))}
    </View>
  );
};

/**
 * GoalsSkeleton — header + KPI strip + 3 goal cards.
 */
export const GoalsSkeleton = () => {
  const sk = useStyles();
  return (
    <View style={sk.container}>
      <View style={sk.row}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={100} height={18} />
        </View>
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>

      {/* KPI strip */}
      <View style={[sk.row, { marginTop: 14, gap: 10 }]}>
        <Skeleton width={'31%' as any} height={70} borderRadius={12} />
        <Skeleton width={'31%' as any} height={70} borderRadius={12} />
        <Skeleton width={'31%' as any} height={70} borderRadius={12} />
      </View>

      {/* Goal cards */}
      {[1, 2, 3].map(i => (
        <View key={i} style={sk.budgetCard}>
          <View style={sk.row}>
            <Skeleton width={42} height={42} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width={'60%' as any} height={14} />
              <Skeleton width={'35%' as any} height={10} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={50} height={16} />
          </View>
          <Skeleton height={8} borderRadius={4} style={{ marginTop: 12 }} />
        </View>
      ))}
    </View>
  );
};

