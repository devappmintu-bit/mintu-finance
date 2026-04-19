// Investment suggester — AI-powered portfolio allocation based on risk profile.
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import { useActivePlan, FEATURES, canAccess } from '../../utils/premium';
import { premiumStyles as styles, fmtINR } from './styles';
import { LockedState } from './Shared';

export default function InvestmentSuggester() {
  const [plan] = useActivePlan();
  const locked = !canAccess(FEATURES.INVESTMENT_SUGGESTER, plan);
  const [risk, setRisk] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [income, setIncome] = useState('100000');
  const [expenses, setExpenses] = useState('60000');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const suggest = async () => {
    setLoading(true);
    try {
      const res = await api.post('/premium/investment-suggester', {
        monthly_income: Number(income) || 0,
        monthly_expenses: Number(expenses) || 0,
        risk_tolerance: risk,
      });
      setResult(res.data);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not compute', text2: e?.response?.data?.detail || 'Try again' });
    } finally { setLoading(false); }
  };

  if (locked) return <LockedState feature="Investment Suggester" desc="Get a personalized portfolio split (equity, debt, gold) based on your income & risk profile." minPlan="monthly" />;

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰 Investment Suggester</Text>
        <Text style={styles.cardSub}>Get a smart asset allocation based on your income & risk.</Text>
        <Text style={styles.label}>Monthly income (₹)</Text>
        <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholderTextColor={COLORS.text.muted} />
        <Text style={styles.label}>Monthly expenses (₹)</Text>
        <TextInput style={styles.input} value={expenses} onChangeText={setExpenses} keyboardType="numeric" placeholderTextColor={COLORS.text.muted} />
        <Text style={styles.label}>Risk tolerance</Text>
        <View style={styles.riskRow}>
          {(['conservative', 'moderate', 'aggressive'] as const).map((r) => (
            <TouchableOpacity key={r} style={[styles.riskBtn, risk === r && styles.riskBtnActive]} onPress={() => setRisk(r)}>
              <Text style={[styles.riskText, risk === r && styles.riskTextActive]}>{r[0].toUpperCase() + r.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={suggest} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={[COLORS.accent.primaryLight, COLORS.accent.primary]} style={styles.primaryBtnGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="trending-up" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Get Suggestion</Text></>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {result && (
        <>
          <View style={styles.card}>
            <View style={styles.snapshot3}>
              <View style={styles.snapshotCol}>
                <Text style={styles.snapshotV}>{fmtINR(result.investible_monthly)}</Text>
                <Text style={styles.snapshotL}>Investible/mo</Text>
              </View>
              <View style={styles.snapshotDiv} />
              <View style={styles.snapshotCol}>
                <Text style={styles.snapshotV}>{fmtINR(result.annual_investment)}</Text>
                <Text style={styles.snapshotL}>Annual</Text>
              </View>
              <View style={styles.snapshotDiv} />
              <View style={styles.snapshotCol}>
                <Text style={[styles.snapshotV, { color: COLORS.accent.moneyIn }]}>{fmtINR(result.projected_10yr)}</Text>
                <Text style={styles.snapshotL}>10yr target</Text>
              </View>
            </View>
          </View>
          {result.allocations?.map((alloc: any) => (
            <View key={alloc.id} style={styles.card}>
              <View style={styles.allocHead}>
                <View style={[styles.allocIcon, { backgroundColor: alloc.color + '20' }]}>
                  <Ionicons name={alloc.icon as any} size={20} color={alloc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.allocTitle}>{alloc.title}</Text>
                  <Text style={styles.allocWhy}>{alloc.why}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.allocAmt, { color: alloc.color }]}>{fmtINR(alloc.amount)}</Text>
                  <Text style={styles.allocPct}>{alloc.pct}%</Text>
                </View>
              </View>
              <View style={styles.allocProducts}>
                <Text style={styles.allocProductsLabel}>Examples</Text>
                <Text style={styles.allocProductsList}>{alloc.products?.join(' · ')}</Text>
                <Text style={styles.allocPlatform}>Platform: {alloc.platform}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.disclaimer}>{result.disclaimer}</Text>
        </>
      )}
    </ScrollView>
  );
}
