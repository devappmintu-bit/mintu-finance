/**
 * MintU Premium Hub — tiny shell that hosts 3 tab views.
 * Each tab lives in /components/premium/ (PlansView, TaxCalculator, InvestmentSuggester).
 * Warm theme + gated access rules enforced via utils/premium.ts.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../utils/api';
import { COLORS } from '../utils/theme';
import { useActivePlan, FEATURES, canAccess } from '../utils/premium';
import { premiumStyles as styles } from '../components/premium/styles';
import { Chip } from '../components/premium/Shared';
import PlansView from '../components/premium/PlansView';
import TaxCalculator from '../components/premium/TaxCalculator';
import InvestmentSuggester from '../components/premium/InvestmentSuggester';

type Tab = 'plans' | 'tax' | 'invest';

export default function PremiumHub() {
  const [tab, setTab] = useState<Tab>('plans');
  const [plan] = useActivePlan();
  const [savings, setSavings] = useState(1275);

  // Potential-savings hook — compute based on user's analytics summary if available.
  useEffect(() => {
    api.get('/analytics/summary').then((r) => {
      const total = Number(r.data?.total_expense || 0);
      // Crude heuristic: assume 10% could be saved, floor ₹500 cap ₹10K.
      const guess = Math.max(500, Math.min(10000, Math.round(total * 0.1)));
      setSavings(guess || 1275);
    }).catch(() => {});
  }, []);

  const taxLocked = !canAccess(FEATURES.TAX_CALCULATOR, plan);
  const invLocked = !canAccess(FEATURES.INVESTMENT_SUGGESTER, plan);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MintU Premium</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.chipsRow}>
        <Chip emoji="💎" label="Plans" active={tab === 'plans'} onPress={() => setTab('plans')} />
        <Chip emoji="🧾" label="Tax" active={tab === 'tax'} onPress={() => setTab('tax')} locked={taxLocked} />
        <Chip emoji="💰" label="Invest" active={tab === 'invest'} onPress={() => setTab('invest')} locked={invLocked} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {tab === 'plans' && <PlansView potentialSavings={savings} />}
        {tab === 'tax' && <TaxCalculator />}
        {tab === 'invest' && <InvestmentSuggester />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
