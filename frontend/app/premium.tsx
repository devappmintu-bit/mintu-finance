/**
 * MintU 2.0 — Premium Features Hub
 * Single screen with 3 tabs: Tax Calculator, Investment Suggester, Premium Catalog
 * No external API keys needed — pure backend calculation.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../utils/api';
import { COLORS, shadowStyle } from '../utils/theme';

type Tab = 'tax' | 'invest' | 'features';

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; emoji: string }> = ({ label, active, onPress, emoji }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
    <Text style={styles.chipEmoji}>{emoji}</Text>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/* ─────────── TAX CALCULATOR TAB ─────────── */
function TaxCalculator() {
  const [income, setIncome] = useState('1200000');
  const [c80c, setC80c] = useState('');
  const [c80d, setC80d] = useState('');
  const [hra, setHra] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/premium/tax-calculator', {
        annual_income: Number(income) || 0,
        section_80c: Number(c80c) || 0,
        section_80d: Number(c80d) || 0,
        hra_exempt: Number(hra) || 0,
      });
      setResult(res.data);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Could not calculate');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 Tax Estimator · FY 2025-26</Text>
        <Text style={styles.cardSub}>New Budget 2025 slabs. Compare Old vs New regime.</Text>

        <Text style={styles.label}>Annual Income (₹)</Text>
        <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholder="e.g., 1200000" />

        <Text style={styles.label}>80C Investments (ELSS/PPF/LIC) · Old regime only</Text>
        <TextInput style={styles.input} value={c80c} onChangeText={setC80c} keyboardType="numeric" placeholder="Max ₹1,50,000" />

        <Text style={styles.label}>80D Health Insurance · Old regime only</Text>
        <TextInput style={styles.input} value={c80d} onChangeText={setC80d} keyboardType="numeric" placeholder="Max ₹75,000" />

        <Text style={styles.label}>HRA Exemption · Old regime only</Text>
        <TextInput style={styles.input} value={hra} onChangeText={setHra} keyboardType="numeric" placeholder="Monthly × 12" />

        <TouchableOpacity style={styles.primaryBtn} onPress={calculate} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={['#8B5CF6', '#6366F1']} style={styles.primaryBtnGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="calculator" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Calculate Tax</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {result && (
        <>
          <View style={[styles.card, result.recommended_regime === 'new' ? styles.recCard : null]}>
            <View style={styles.recHeader}>
              <Text style={styles.recHeaderLabel}>RECOMMENDED</Text>
              <View style={styles.recBadge}>
                <Text style={styles.recBadgeText}>{result.recommended_regime.toUpperCase()} REGIME</Text>
              </View>
            </View>
            <Text style={styles.recHeadline}>
              Save {fmtINR(result.savings_by_choosing_recommended)} by choosing the {result.recommended_regime} regime
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Side-by-side</Text>
            <View style={styles.compareGrid}>
              <View style={[styles.compareCol, result.recommended_regime === 'new' && styles.compareColWin]}>
                <Text style={styles.compareHead}>New Regime</Text>
                <Text style={styles.compareBig}>{fmtINR(result.new_regime.total_tax)}</Text>
                <Text style={styles.compareSub}>{result.new_regime.effective_rate_pct}% effective</Text>
                <Text style={styles.compareDetail}>Taxable: {fmtINR(result.new_regime.taxable_income)}</Text>
                <Text style={styles.compareDetail}>Cess: {fmtINR(result.new_regime.cess_4pct)}</Text>
              </View>
              <View style={[styles.compareCol, result.recommended_regime === 'old' && styles.compareColWin]}>
                <Text style={styles.compareHead}>Old Regime</Text>
                <Text style={styles.compareBig}>{fmtINR(result.old_regime.total_tax)}</Text>
                <Text style={styles.compareSub}>{result.old_regime.effective_rate_pct}% effective</Text>
                <Text style={styles.compareDetail}>Taxable: {fmtINR(result.old_regime.taxable_income)}</Text>
                <Text style={styles.compareDetail}>Deductions: {fmtINR(result.old_regime.total_deductions)}</Text>
              </View>
            </View>
          </View>

          {result.suggestions?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💡 Suggestions to save more</Text>
              {result.suggestions.map((sug: any, i: number) => (
                <View key={i} style={styles.sugRow}>
                  <View style={styles.sugIcon}><Ionicons name={sug.icon} size={16} color="#8B5CF6" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugTitle}>{sug.title}</Text>
                    <Text style={styles.sugDetail}>{sug.detail}</Text>
                  </View>
                  <Text style={styles.sugSave}>Save {fmtINR(sug.savings)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.disclaimer}>{result.disclaimer}</Text>
        </>
      )}
    </ScrollView>
  );
}

/* ─────────── INVESTMENT SUGGESTER TAB ─────────── */
function InvestmentSuggester() {
  const [income, setIncome] = useState('75000');
  const [age, setAge] = useState('28');
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/premium/investment-suggest', {
        monthly_income: Number(income) || 0,
        age: Number(age) || 28,
        risk,
      });
      setResult(res.data);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Could not calculate');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰 Investment Planner</Text>
        <Text style={styles.cardSub}>Smart allocation based on income, age, and risk.</Text>

        <Text style={styles.label}>Monthly Income (₹)</Text>
        <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholder="e.g., 75000" />

        <Text style={styles.label}>Age</Text>
        <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="e.g., 28" />

        <Text style={styles.label}>Risk Appetite</Text>
        <View style={styles.riskRow}>
          {(['low', 'medium', 'high'] as const).map((r) => (
            <TouchableOpacity key={r} style={[styles.riskBtn, risk === r && styles.riskBtnActive]} onPress={() => setRisk(r)}>
              <Text style={[styles.riskText, risk === r && styles.riskTextActive]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={calculate} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={['#10B981', '#059669']} style={styles.primaryBtnGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="trending-up" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Get Allocation</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {result && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 {result.headline}</Text>
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
                <Text style={[styles.snapshotV, { color: '#10B981' }]}>{fmtINR(result.projected_10yr)}</Text>
                <Text style={styles.snapshotL}>10yr target</Text>
              </View>
            </View>
          </View>

          {result.allocations.map((alloc: any) => (
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
                <Text style={styles.allocProductsList}>{alloc.products.join(' · ')}</Text>
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

/* ─────────── FEATURES CATALOG TAB ─────────── */
function FeaturesCatalog() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get('/premium/features-catalog').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} color="#8B5CF6" />;

  return (
    <ScrollView style={{ flex: 1 }}>
      <LinearGradient colors={data.is_premium ? ['#F59E0B', '#FB923C'] : ['#8B5CF6', '#6366F1']} style={styles.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroBadge}>{data.is_premium ? '🏆 PREMIUM' : '✨ FREE'}</Text>
          <Text style={styles.heroTitle}>{data.cta_highlight}</Text>
          {!data.is_premium && (
            <Text style={styles.heroPrice}>₹{data.price.monthly}/mo · ₹{data.price.annual}/yr (save {data.price.annual_savings_pct}%)</Text>
          )}
        </View>
      </LinearGradient>

      {data.sections.map((sec: any) => (
        <View key={sec.id} style={styles.card}>
          <Text style={styles.cardTitle}>{sec.emoji} {sec.title}</Text>
          {sec.features.map((f: any, i: number) => (
            <View key={i} style={styles.featRow}>
              <Ionicons name={f.premium && !f.free ? 'lock-closed' : 'checkmark-circle'} size={16} color={f.premium && !f.free ? '#8B5CF6' : '#10B981'} />
              <Text style={[styles.featText, !f.free && { fontWeight: '700' }]}>{f.name}</Text>
              {f.badge && <View style={styles.proBadge}><Text style={styles.proBadgeText}>{f.badge}</Text></View>}
            </View>
          ))}
        </View>
      ))}

      {!data.is_premium && (
        <TouchableOpacity style={styles.upgradeBtn} activeOpacity={0.85}>
          <LinearGradient colors={['#F59E0B', '#EF4444']} style={styles.upgradeGrad}>
            <Ionicons name="rocket" size={18} color="#fff" />
            <Text style={styles.upgradeText}>Upgrade to Premium · ₹{data.price.monthly}/mo</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/* ─────────── MAIN SCREEN ─────────── */
export default function PremiumHub() {
  const [tab, setTab] = useState<Tab>('tax');

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
        <Chip emoji="🧾" label="Tax" active={tab === 'tax'} onPress={() => setTab('tax')} />
        <Chip emoji="💰" label="Invest" active={tab === 'invest'} onPress={() => setTab('invest')} />
        <Chip emoji="🏆" label="Features" active={tab === 'features'} onPress={() => setTab('features')} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {tab === 'tax' && <TaxCalculator />}
        {tab === 'invest' && <InvestmentSuggester />}
        {tab === 'features' && <FeaturesCatalog />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.bg.subtle, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipActive: { backgroundColor: '#8B5CF615', borderColor: '#8B5CF6' },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
  chipTextActive: { color: '#8B5CF6' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, margin: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border.card, ...shadowStyle('#2E1F1A', 2, 10, 0.05, 2) },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  cardSub: { fontSize: 12, color: COLORS.text.muted, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.text.secondary, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: COLORS.bg.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  primaryBtn: { marginTop: 18, borderRadius: 12, overflow: 'hidden' },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Recommendation card
  recCard: { borderColor: '#10B981', borderWidth: 2, backgroundColor: '#ECFDF5' },
  recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  recHeaderLabel: { fontSize: 11, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
  recBadge: { backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  recBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  recHeadline: { fontSize: 14, fontWeight: '700', color: '#064E3B', lineHeight: 20 },
  // Compare
  compareGrid: { flexDirection: 'row', gap: 10 },
  compareCol: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: COLORS.bg.subtle, borderWidth: 1, borderColor: COLORS.border.subtle },
  compareColWin: { backgroundColor: '#ECFDF5', borderColor: '#10B98180' },
  compareHead: { fontSize: 11, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 0.5 },
  compareBig: { fontSize: 20, fontWeight: '900', color: COLORS.text.primary, marginTop: 4 },
  compareSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  compareDetail: { fontSize: 11, color: COLORS.text.secondary, marginTop: 8, fontWeight: '500' },
  // Suggestions
  sugRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, alignItems: 'flex-start' },
  sugIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#8B5CF615', justifyContent: 'center', alignItems: 'center' },
  sugTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
  sugDetail: { fontSize: 11, color: COLORS.text.muted, marginTop: 2, lineHeight: 15 },
  sugSave: { fontSize: 12, fontWeight: '800', color: '#10B981' },
  // Investment
  riskRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  riskBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border.subtle, backgroundColor: COLORS.bg.subtle, alignItems: 'center' },
  riskBtnActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  riskText: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
  riskTextActive: { color: '#10B981' },
  snapshot3: { flexDirection: 'row', marginTop: 8, paddingVertical: 10 },
  snapshotCol: { flex: 1, alignItems: 'center' },
  snapshotV: { fontSize: 15, fontWeight: '800', color: COLORS.text.primary },
  snapshotL: { fontSize: 10, fontWeight: '600', color: COLORS.text.muted, marginTop: 2 },
  snapshotDiv: { width: 1, backgroundColor: COLORS.border.subtle },
  allocHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  allocIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  allocTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary },
  allocWhy: { fontSize: 11, color: COLORS.text.muted, marginTop: 2, lineHeight: 15 },
  allocAmt: { fontSize: 16, fontWeight: '900' },
  allocPct: { fontSize: 11, fontWeight: '700', color: COLORS.text.muted },
  allocProducts: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  allocProductsLabel: { fontSize: 10, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 0.6 },
  allocProductsList: { fontSize: 12, fontWeight: '600', color: COLORS.text.primary, marginTop: 4, lineHeight: 17 },
  allocPlatform: { fontSize: 11, color: '#8B5CF6', marginTop: 4, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: COLORS.text.muted, textAlign: 'center', padding: 16, fontStyle: 'italic', lineHeight: 16 },
  // Features Catalog
  heroCard: { margin: 12, padding: 20, borderRadius: 18, flexDirection: 'row', alignItems: 'center', ...shadowStyle('#8B5CF6', 6, 16, 0.3, 6) },
  heroBadge: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 },
  heroPrice: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '700', marginTop: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  featText: { flex: 1, fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
  proBadge: { backgroundColor: '#8B5CF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  proBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  upgradeBtn: { margin: 16, borderRadius: 14, overflow: 'hidden', ...shadowStyle('#F59E0B', 4, 12, 0.3, 4) },
  upgradeGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  upgradeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
