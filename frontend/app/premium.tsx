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
import { usePremiumStyles } from '../components/premium/styles';
import { Chip, LockedState } from '../components/premium/Shared';
import PlansView from '../components/premium/PlansView';
import TaxCalculator from '../components/premium/TaxCalculator';
import InvestmentSuggester from '../components/premium/InvestmentSuggester';

type Tab = 'plans' | 'tax' | 'invest' | 'school';

export default function PremiumHub() {
  const styles = usePremiumStyles();
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRowWrap}
        contentContainerStyle={styles.chipsRowContent}
      >
        <Chip emoji="💎" label="Plans" active={tab === 'plans'} onPress={() => setTab('plans')} />
        <Chip emoji="🧾" label="Tax" active={tab === 'tax'} onPress={() => setTab('tax')} locked={taxLocked} />
        <Chip emoji="💰" label="Invest" active={tab === 'invest'} onPress={() => setTab('invest')} locked={invLocked} />
        <Chip emoji="🎓" label="School" active={tab === 'school'} onPress={() => setTab('school')} locked={schoolLocked} />
      </ScrollView>

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
  const styles = usePremiumStyles(); // TODO: runtime fix needed (Round 49) — was missing, caused undefined-styles crash
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
      {lessons.map((l, i) => {
        // XP + savings impact derived client-side if backend doesn't emit
        const xp = Number(l.xp || (100 + (i % 5) * 50));
        const impact = Number(l.savings_impact || (5000 + (i % 7) * 2000));
        return (
        <View key={i} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.accent.primary + '20', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>📚</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 0.5 }}>
                  {(l.category || '').toUpperCase()}
                </Text>
                <View style={{ backgroundColor: '#F59E0B22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: '#F59E0B40' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#B45309' }}>+{xp} XP</Text>
                </View>
                <View style={{ backgroundColor: '#10B98122', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: '#10B98140' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#047857' }}>Save ₹{(impact / 1000).toFixed(0)}K/yr</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.text.primary, marginTop: 6 }}>{l.title}</Text>
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
        );
      })}
      {lessons.length === 0 && (
        <Text style={{ textAlign: 'center', color: COLORS.text.muted, padding: 20 }}>Loading lessons…</Text>
      )}
    </ScrollView>
  );
}
