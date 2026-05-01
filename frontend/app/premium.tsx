/**
 * MintU Premium Hub — single-purpose decision screen.
 *
 * Round 53o (Apr 29 2026) — decision-focused refactor.
 *
 * Was: 4 tabs (Plans / Tax / Invest / School) competing for attention,
 * payment-logo soup, and 3 stacked "What you get" cards duplicating the
 * info already encoded in the tier cards above.
 *
 * Now: a single linear flow that mirrors how users actually decide:
 *
 *   1. Hero (value + savings)
 *   2. Tier cards (selection)
 *   3. Comparison matrix (truth layer — driven by selection/active tier)
 *   4. Free fallback CTA
 *   5. Trust line
 *
 * Tax / Invest / School aren't gone — they're reachable from their
 * native entry points (AI Coach paywalls, /money-school route, Profile
 * funnel). This screen is now strictly about pricing decision.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../utils/api';
import { fetchAnalyticsSummary } from '../services/transactions';
import { COLORS } from '../utils/theme';
import { usePremiumStyles } from '../components/premium/styles';
import PlansView from '../components/premium/PlansView';

export default function PremiumHub() {
  const styles = usePremiumStyles();
  const [savings, setSavings] = useState(1275);

  useEffect(() => {
    // Phase 3 consolidation: route through services/transactions layer
    // instead of calling api.get('/analytics/summary') directly.
    fetchAnalyticsSummary().then((data) => {
      const total = Number((data || {})?.total_expense || 0);
      const guess = Math.max(500, Math.min(10000, Math.round(total * 0.1)));
      setSavings(guess || 1275);
    }).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Start saving today</Text>
          {savings > 500 && (
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.accent.primaryLight, letterSpacing: 0.5, marginTop: 1 }}>
              You could have saved ₹{savings.toLocaleString('en-IN')} last month
            </Text>
          )}
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <PlansView potentialSavings={savings} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
