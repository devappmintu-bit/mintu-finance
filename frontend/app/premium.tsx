/**
 * MintU Premium Hub — single-page scroll (matches v2 design reference).
 *
 * Layout: fixed header + "You could have saved ₹X" hero + 3-tier pricing row
 * + feature comparison cards + Money School (yearly-only).
 * Saffron theme throughout. Hidden tabs (Tax / Invest) still accessible via
 * compact chip row at top for upgraded users.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../utils/api';
import { COLORS } from '../utils/theme';
import { useActivePlan, FEATURES, canAccess, PLAN_META } from '../utils/premium';
import type { Plan } from '../utils/premium';
import { premiumStyles as styles } from '../components/premium/styles';
import { Chip, LockedState } from '../components/premium/Shared';
import PlansView from '../components/premium/PlansView';
import TaxCalculator from '../components/premium/TaxCalculator';
import InvestmentSuggester from '../components/premium/InvestmentSuggester';

type Tab = 'plans' | 'tax' | 'invest' | 'school';

export default function PremiumHub() {
  const [tab, setTab] = useState<Tab>('plans');
  const [plan] = useActivePlan();
  const [savings, setSavings] = useState(1275);

  useEffect(() => {
    api.get('/analytics/summary').then((r) => {
      const total = Number(r.data?.total_expense || 0);
      const guess = Math.max(500, Math.min(10000, Math.round(total * 0.1)));
      setSavings(guess || 1275);
    }).catch(() => {});
  }, []);

  const taxLocked = !canAccess(FEATURES.TAX_CALCULATOR, plan);
  const invLocked = !canAccess(FEATURES.INVESTMENT_SUGGESTER, plan);
  const schoolLocked = !canAccess(FEATURES.MONEY_SCHOOL, plan);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Go Premium</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.chipsRow}>
        <Chip emoji="💎" label="Plans" active={tab === 'plans'} onPress={() => setTab('plans')} />
        <Chip emoji="🧾" label="Tax" active={tab === 'tax'} onPress={() => setTab('tax')} locked={taxLocked} />
        <Chip emoji="💰" label="Invest" active={tab === 'invest'} onPress={() => setTab('invest')} locked={invLocked} />
        <Chip emoji="🎓" label="School" active={tab === 'school'} onPress={() => setTab('school')} locked={schoolLocked} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {tab === 'plans' && <PlansView potentialSavings={savings} />}
        {tab === 'tax' && <TaxCalculator />}
        {tab === 'invest' && <InvestmentSuggester />}
        {tab === 'school' && (
          schoolLocked ? (
            <LockedState
              feature="Money School"
              desc="15 in-depth lessons on SIPs, PPF, insurance, tax saving & more — taught in Indian context."
              minPlan="yearly"
            />
          ) : (
            <MoneySchoolView />
          )
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Inline Money School view — available to yearly subscribers only.
function MoneySchoolView() {
  const [lessons, setLessons] = useState<any[]>([]);
  useEffect(() => {
    api.get('/money-school/lessons').then(r => setLessons(r.data?.lessons || [])).catch(() => {});
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎓 Money School</Text>
        <Text style={styles.cardSub}>Your yearly perk: full financial education library.</Text>
      </View>
      {lessons.map((l, i) => (
        <View key={i} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.accent.primary + '20', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>📚</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 0.5 }}>
                {(l.category || '').toUpperCase()}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.text.primary, marginTop: 2 }}>{l.title}</Text>
              <Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 19, marginTop: 6 }}>{l.content}</Text>
              {l.tip && (
                <View style={{ marginTop: 10, padding: 10, backgroundColor: COLORS.accent.moneyIn + '12', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.accent.moneyIn }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.accent.moneyIn, letterSpacing: 0.5, marginBottom: 3 }}>💡 TIP</Text>
                  <Text style={{ fontSize: 12, color: COLORS.text.primary, lineHeight: 17 }}>{l.tip}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ))}
      {lessons.length === 0 && (
        <Text style={{ textAlign: 'center', color: COLORS.text.muted, padding: 20 }}>Loading lessons…</Text>
      )}
    </ScrollView>
  );
}
