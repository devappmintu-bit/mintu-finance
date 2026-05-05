/**
 * /insights/[range] — Round 94 unified insights route.
 *
 * Replaces the previously separate `/spending-insights` and `/yearly`
 * screens with a single dynamic route. The two underlying surfaces
 * stay as components (no UX regression) but routing is now coherent:
 *
 *   /insights/month  → "This-month spend snapshot" view (was /spending-insights)
 *   /insights/year   → "12-month dashboard" view (was /yearly)
 *
 * Deep-linking to the legacy paths still works — they're thin redirects
 * (see /spending-insights.tsx and /yearly.tsx).
 *
 * Brutalist segment switcher at the top lets the user toggle without
 * leaving the screen, killing the "did I open the right page?" friction
 * that the audit flagged as cognitive overload.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import SpendingInsightsScreen from '../spending-insights';
import YearlyScreen from '../yearly';

type Range = 'month' | 'year';

function isValidRange(r: any): r is Range {
  return r === 'month' || r === 'year';
}

export default function InsightsByRange() {
  const params = useLocalSearchParams<{ range?: string }>();
  const range: Range = isValidRange(params.range) ? params.range : 'month';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Switcher header — Brutalist segment control */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => { try { router.back(); } catch { /* noop */ } }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <View style={styles.segWrap}>
          <Pressable
            onPress={() => router.replace('/insights/month' as any)}
            style={[styles.seg, range === 'month' && styles.segActive]}
          >
            <Text style={[styles.segTxt, range === 'month' && styles.segTxtActive]}>MONTH</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/insights/year' as any)}
            style={[styles.seg, range === 'year' && styles.segActive]}
          >
            <Text style={[styles.segTxt, range === 'year' && styles.segTxtActive]}>YEAR</Text>
          </Pressable>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Render the existing screen as a child component so behaviour
          stays identical to the legacy direct route. */}
      <View style={{ flex: 1 }}>
        {range === 'month' ? <SpendingInsightsScreen /> : <YearlyScreen />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BR_COLORS.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.sm,
    borderBottomWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  segWrap: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: BR_COLORS.ink,
  },
  seg: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  segActive: { backgroundColor: BR_COLORS.ink },
  segTxt: { ...BR_TYPE.label, color: BR_COLORS.ink, letterSpacing: 1.4 },
  segTxtActive: { color: BR_COLORS.paper },
});
