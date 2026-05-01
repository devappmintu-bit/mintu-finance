/**
 * HomeHero — Wave 5.1 revamp.
 *
 * Replaces the legacy stack of BalanceHero + MoneyScoreCard +
 * QuickActionBar above-the-fold on the home tab. Follows the design
 * system's north-star: ONE primary CTA, hero number + sparkline, and
 * ≤ 3 seconds to "how am I doing?".
 *
 * Renders inside a full-width glassy card with:
 *   • Greeting row (hidden — parent screen owns the header)
 *   • Giant MTD-saved money number (animated count-up)
 *   • Sub-headline: pace text + projection
 *   • 7-bar MicroBarChart sparkline (today's bar highlighted)
 *   • ONE primary CTA → /premium-reports (or /spending-insights)
 *   • Three secondary quick-action chips: + Expense · Scan SMS · Budget
 *
 * Perf: wrapped in React.memo. All derived values memoized. Animations
 * run on the UI thread via Reanimated. No network I/O inside — pure
 * presentation from the parent's /home/bundle data.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACE, TYPO, ELEVATION, GRADIENT } from '../../utils/theme';
import { MoneyNumber } from '../primitives/MoneyNumber';
import { MicroBarChart } from '../primitives/MicroBarChart';
import { ROUTES } from '../../constants/routes';

export interface HomeHeroProps {
  // From /home/bundle → snapshot slice
  mtdSpend: number;         // cumulative MTD expense
  mtdIncome: number;        // cumulative MTD credit
  projectedMonthEnd: number; // pace-projected end-of-month spend
  sparkline: Array<{ day: string; amount: number }>; // last 7 days
  topCategory?: { name?: string; amount?: number; emoji?: string } | null;
  paceEmoji?: string;       // '🟢' / '🟠' / '🔴' from server
  paceHeadline?: string;    // server-suggested one-liner
  // Branching / CTA routing
  onSeeWhy?: () => void;
}

function haptic() {
  if (Platform.OS !== 'web') {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
  }
}

function HomeHeroImpl({
  mtdSpend = 0,
  mtdIncome = 0,
  projectedMonthEnd = 0,
  sparkline = [],
  topCategory,
  paceEmoji = '🟢',
  paceHeadline,
  onSeeWhy,
}: HomeHeroProps) {
  // ── Derived values (stable) ────────────────────────────────────────
  const saved = useMemo(() => Math.max(0, mtdIncome - mtdSpend), [mtdIncome, mtdSpend]);

  const sparkData = useMemo(
    () => (sparkline.length === 7 ? sparkline.map(d => d.amount || 0) : [0, 0, 0, 0, 0, 0, 0]),
    [sparkline]
  );
  const sparkLabels = useMemo(
    () => (sparkline.length === 7 ? sparkline.map(d => (d.day || '').slice(0, 1)) : 'MTWTFSS'.split('')),
    [sparkline]
  );

  const headline = useMemo(() => {
    if (paceHeadline) return paceHeadline;
    if (saved > 0 && projectedMonthEnd > 0) {
      return `on pace for ₹${Math.round(projectedMonthEnd).toLocaleString('en-IN')} spend`;
    }
    if (saved > 0) return 'saved so far this month';
    return 'Track today to unlock insights';
  }, [paceHeadline, saved, projectedMonthEnd]);

  const handleCTA = React.useCallback(() => {
    haptic();
    if (onSeeWhy) return onSeeWhy();
    try { router.push('/spending-insights' as any); } catch { /* noop */ }
  }, [onSeeWhy]);

  const goAdd = React.useCallback(() => {
    haptic();
    try { router.push(ROUTES.TRANSACTIONS); } catch { /* noop */ }
  }, []);
  const goScan = React.useCallback(() => {
    haptic();
    try { router.push('/gmail' as any); } catch { /* noop */ }
  }, []);
  const goBudget = React.useCallback(() => {
    haptic();
    try { router.push('/(tabs)/budget' as any); } catch { /* noop */ }
  }, []);

  return (
    <View style={[styles.hero, ELEVATION.z2]}>
      <LinearGradient
        colors={['rgba(232,74,12,0.06)', 'rgba(232,74,12,0.00)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* TOP ROW — pace chip + topCategory micro */}
      <View style={styles.row}>
        <View style={styles.paceChip}>
          <Text style={styles.paceEmoji}>{paceEmoji}</Text>
          <Text style={styles.paceLabel}>This month</Text>
        </View>
        {topCategory?.name ? (
          <View style={styles.topCat}>
            <Text style={styles.topCatEmoji}>{topCategory.emoji || '💸'}</Text>
            <Text style={styles.topCatText} numberOfLines={1}>
              Top: {topCategory.name}
            </Text>
          </View>
        ) : null}
      </View>

      {/* HERO NUMBER */}
      <View style={styles.numberRow}>
        <MoneyNumber
          value={saved > 0 ? saved : mtdSpend}
          prefix="₹"
          style={styles.number}
          duration={800}
        />
        <Text style={styles.numberLabel}>
          {saved > 0 ? 'saved' : 'spent'}
        </Text>
      </View>

      {/* HEADLINE */}
      <Text style={styles.headline} numberOfLines={2}>{headline}</Text>

      {/* SPARKLINE */}
      <View style={styles.sparkWrap}>
        <MicroBarChart
          data={sparkData}
          labels={sparkLabels}
          height={52}
          highlightToday
          showLabels
        />
      </View>

      {/* PRIMARY CTA */}
      <Pressable
        onPress={handleCTA}
        style={({ pressed }) => [
          styles.cta,
          pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="See spending insights"
      >
        <LinearGradient
          colors={GRADIENT.neon as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaBg}
        />
        <Text style={styles.ctaText}>See why</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFF" />
      </Pressable>

      {/* QUICK ACTIONS */}
      <View style={styles.chipRow}>
        <Chip icon="add-circle-outline" label="Expense" onPress={goAdd} testID="hero-chip-expense" />
        <Chip icon="scan-outline" label="Scan" onPress={goScan} testID="hero-chip-scan" />
        <Chip icon="pie-chart-outline" label="Budget" onPress={goBudget} testID="hero-chip-budget" />
      </View>
    </View>
  );
}

function ChipImpl({
  icon, label, onPress, testID,
}: { icon: any; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.96 }], opacity: 0.88 }]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={COLORS.accent.primary} />
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}
const Chip = React.memo(ChipImpl);

export const HomeHero = React.memo(HomeHeroImpl);
HomeHero.displayName = 'HomeHero';
export default HomeHero;

const styles = StyleSheet.create({
  hero: {
    backgroundColor: COLORS.bg.card,
    borderRadius: RADIUS['3xl'],
    padding: SPACE.xl,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  paceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent.brandSoft,
  },
  paceEmoji: { fontSize: 12 },
  paceLabel: { ...TYPO.micro, color: COLORS.accent.primaryDark, fontSize: 10 },
  topCat: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'flex-end' },
  topCatEmoji: { fontSize: 14 },
  topCatText: { ...TYPO.caption, color: COLORS.text.muted, flexShrink: 1 },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  number: {
    ...TYPO.display,
    color: COLORS.text.primary,
    lineHeight: 52,
  },
  numberLabel: {
    ...TYPO.h3,
    color: COLORS.text.muted,
    marginBottom: 4,
    fontWeight: '600',
  },
  headline: {
    ...TYPO.body,
    color: COLORS.text.secondary,
    marginBottom: SPACE.lg,
  },
  sparkWrap: {
    marginBottom: SPACE.lg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    marginBottom: SPACE.md,
  },
  ctaBg: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS.pill },
  ctaText: { ...TYPO.h3, color: '#FFFFFF', fontWeight: '700' },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,74,12,0.12)',
  },
  chipLabel: { ...TYPO.bodySm, color: COLORS.accent.primaryDark, fontWeight: '600' },
});
