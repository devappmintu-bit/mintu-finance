/**
 * MicroBarChart — 7-bar inline SVG sparkline.
 *
 * Wave 5.1 primitive. Renders a compact bar chart optimized for 36-80 pt
 * heights — perfect for home-screen sparklines and budget trend chips.
 * Bars animate up on mount with stagger; tallest bar gets brand highlight.
 *
 * Usage:
 *   <MicroBarChart
 *     data={[120, 340, 0, 890, 220, 450, 180]}
 *     labels="Mon Tue Wed Thu Fri Sat Sun".split(' ')
 *     height={56}
 *     highlightToday={true}
 *   />
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { COLORS, RADIUS, SPACE, TYPO } from '../../utils/theme';

export interface MicroBarChartProps {
  data: number[];                 // array of daily values
  labels?: string[];              // optional x-axis labels (same length as data)
  height?: number;                 // chart height in pt (default 56)
  barColor?: string;               // base bar color
  highlightColor?: string;         // tallest bar / today color
  highlightToday?: boolean;        // highlight the LAST bar (today) in brand
  showLabels?: boolean;
}

function Bar({
  pct, delay, color, isToday,
}: { pct: number; delay: number; color: string; isToday: boolean }) {
  const h = useSharedValue(0);
  React.useEffect(() => {
    h.value = withDelay(delay, withTiming(pct, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [pct, delay, h]);
  const style = useAnimatedStyle(() => ({
    height: `${Math.max(4, h.value)}%`,
  }));
  return (
    <Animated.View
      style={[
        {
          width: '72%',
          alignSelf: 'center',
          backgroundColor: color,
          borderRadius: RADIUS.sm,
          opacity: isToday ? 1 : 0.82,
        },
        style,
      ]}
    />
  );
}

function MicroBarChartImpl({
  data, labels, height = 56, barColor, highlightColor, highlightToday = true, showLabels = false,
}: MicroBarChartProps) {
  const max = useMemo(() => Math.max(1, ...data.map(v => Math.abs(v || 0))), [data]);
  const colors = {
    bar: barColor || 'rgba(232, 74, 12, 0.25)',
    hi: highlightColor || COLORS.accent.primary,
  };
  return (
    <View style={[styles.wrap, { height: height + (showLabels ? 14 : 0) }]}>
      <View style={[styles.row, { height }]}>
        {data.map((v, i) => {
          const pct = (Math.abs(v || 0) / max) * 100;
          const isLast = i === data.length - 1;
          const isHi = highlightToday && isLast;
          return (
            <View key={i} style={styles.col}>
              <Bar
                pct={pct}
                delay={i * 60}
                color={isHi ? colors.hi : colors.bar}
                isToday={isHi}
              />
            </View>
          );
        })}
      </View>
      {showLabels && labels ? (
        <View style={styles.labels}>
          {labels.map((l, i) => (
            <Text key={i} style={styles.label} numberOfLines={1}>{l}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const MicroBarChart = React.memo(MicroBarChartImpl);
MicroBarChart.displayName = 'MicroBarChart';
export default MicroBarChart;

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  col: { flex: 1, justifyContent: 'flex-end' },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.xs,
  },
  label: {
    ...TYPO.caption,
    flex: 1,
    textAlign: 'center',
    color: COLORS.text.muted,
    fontSize: 10,
  },
});
