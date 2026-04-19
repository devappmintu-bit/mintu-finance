/**
 * MintU Premium Hub — 3-plan pricing + gated Tax & Investment tabs
 * Matches warm app theme. Plan selection persists via utils/premium.ts.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../utils/api';
import { COLORS, shadowStyle } from '../utils/theme';
import {
  useActivePlan, PLAN_META, FEATURES, canAccess,
} from '../utils/premium';
import type { Plan } from '../utils/premium';
import Toast from 'react-native-toast-message';

type Tab = 'plans' | 'tax' | 'invest';

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; emoji: string; locked?: boolean }> = ({ label, active, onPress, emoji, locked }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
    <Text style={styles.chipEmoji}>{emoji}</Text>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    {locked ? <Ionicons name="lock-closed" size={10} color={active ? COLORS.accent.primary : COLORS.text.muted} /> : null}
  </TouchableOpacity>
);

/* ─────────── PLAN PICKER (main view) ─────────── */
function PlansView({ potentialSavings }: { potentialSavings: number }) {
  const [plan, setPlan] = useActivePlan();

  const buy = async (p: Plan) => {
    if (p === plan) return;
    Alert.alert(
      `Activate ${PLAN_META[p].label}?`,
      `${PLAN_META[p].price} ${PLAN_META[p].priceSub}\n\nDemo: no real payment. You'll unlock all ${PLAN_META[p].label} features immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            await setPlan(p);
            Toast.show({
              type: 'success',
              text1: `🎉 ${PLAN_META[p].label} activated!`,
              text2: 'All premium features unlocked',
              position: 'bottom',
            });
          },
        },
      ],
    );
  };

  const isActive = (p: Plan) => plan === p;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Hook */}
      <View style={styles.hookCard}>
        <Text style={styles.hookHeader}>
          You could have saved <Text style={{ color: COLORS.accent.moneyOut }}>{fmtINR(potentialSavings || 1275)}</Text> this month
        </Text>
        <Text style={styles.hookSub}>MintU Premium finds your hidden money leaks</Text>
      </View>

      {/* 3-plan pricing row */}
      <View style={styles.plansRow}>
        {/* Intro */}
        <TouchableOpacity
          style={[styles.planCard, isActive('intro') && styles.planCardActive]}
          onPress={() => buy('intro')}
          activeOpacity={0.9}
        >
          <Text style={styles.planLabel}>Intro</Text>
          <Text style={styles.planPrice}>₹29</Text>
          <Text style={styles.planSub}>first month</Text>
          {isActive('intro') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Yearly — highlighted */}
        <TouchableOpacity
          style={[styles.planCardBest, isActive('yearly') && styles.planCardBestActive]}
          onPress={() => buy('yearly')}
          activeOpacity={0.9}
        >
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planLabelWhite}>Yearly</Text>
          <Text style={styles.planPriceWhite}>₹499</Text>
          <Text style={styles.planSubWhite}>per year (58% off)</Text>
          {isActive('yearly') && <View style={styles.activeBadgeInv}><Text style={styles.activeBadgeInvText}>✓ ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Monthly */}
        <TouchableOpacity
          style={[styles.planCard, isActive('monthly') && styles.planCardActive]}
          onPress={() => buy('monthly')}
          activeOpacity={0.9}
        >
          <Text style={styles.planLabel}>Monthly</Text>
          <Text style={styles.planPrice}>₹99</Text>
          <Text style={styles.planSub}>per month</Text>
          {isActive('monthly') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>
      </View>

      <Text style={styles.mostPopular}>💡 Most users choose <Text style={{ color: COLORS.accent.primary, fontWeight: '800' }}>Yearly</Text> — saves ₹689/year</Text>

      {/* Free tier banner */}
      <TouchableOpacity
        style={[styles.freeBanner, isActive('free') && styles.freeBannerActive]}
        onPress={() => buy('free')}
        activeOpacity={0.8}
      >
        <View style={styles.freeBannerIcon}>
          <Text style={{ fontSize: 18 }}>🌱</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.freeBannerTitle}>Free Plan</Text>
          <Text style={styles.freeBannerSub}>Basic tracking · 5 AI msgs/day · 7-day insights</Text>
        </View>
        {isActive('free') ? (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.moneyIn} />
        ) : (
          <Text style={styles.freeBannerCta}>Continue Free</Text>
        )}
      </TouchableOpacity>

      {/* Feature comparison */}
      <Text style={styles.sectionTitle}>What you get</Text>
      {(['intro', 'monthly', 'yearly'] as Plan[]).map((p) => {
        const meta = PLAN_META[p];
        const active = isActive(p);
        return (
          <View key={p} style={[styles.featureCard, active && styles.featureCardActive]}>
            <View style={styles.featureHeader}>
              <Text style={styles.featureEmoji}>{meta.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{meta.label} · {meta.price} <Text style={styles.featureSub}>{meta.priceSub}</Text></Text>
              </View>
              {active && <View style={styles.activePill}><Text style={styles.activePillText}>YOUR PLAN</Text></View>}
            </View>
            {meta.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.accent.moneyIn} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        );
      })}

      {/* Trust strip */}
      <View style={styles.trustRow}>
        <View style={styles.trustSig}><Text style={styles.trustSigEmoji}>🔒</Text><Text style={styles.trustSigText}>Cancel{'\n'}anytime</Text></View>
        <View style={styles.trustSig}><Text style={styles.trustSigEmoji}>🇮🇳</Text><Text style={styles.trustSigText}>India{'\n'}servers</Text></View>
        <View style={styles.trustSig}><Text style={styles.trustSigEmoji}>💳</Text><Text style={styles.trustSigText}>UPI /{'\n'}Card / NetB</Text></View>
      </View>
      <Text style={styles.disclaimer}>*Demo mode: activates instantly without payment. Real billing coming soon.</Text>
    </ScrollView>
  );
}

/* ─────────── TAX CALCULATOR TAB (gated) ─────────── */
function TaxCalculator() {
  const [plan] = useActivePlan();
  const locked = !canAccess(FEATURES.TAX_CALCULATOR, plan);
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
      Toast.show({ type: 'error', text1: 'Could not calculate', text2: e?.response?.data?.detail || 'Try again' });
    } finally { setLoading(false); }
  };

  if (locked) {
    return <LockedState feature="Tax Calculator" desc="Estimate savings under Old vs New regime, with 80C/80D/HRA tools." minPlan="monthly" />;
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧾 Tax Estimator · FY 2025-26</Text>
        <Text style={styles.cardSub}>New Budget 2025 slabs. Compare Old vs New regime.</Text>

        <Text style={styles.label}>Annual Income (₹)</Text>
        <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="numeric" placeholder="e.g., 1200000" placeholderTextColor={COLORS.text.muted} />

        <Text style={styles.label}>80C Investments (ELSS/PPF/LIC) · Old regime only</Text>
        <TextInput style={styles.input} value={c80c} onChangeText={setC80c} keyboardType="numeric" placeholder="Max ₹1,50,000" placeholderTextColor={COLORS.text.muted} />

        <Text style={styles.label}>80D Health Insurance · Old regime only</Text>
        <TextInput style={styles.input} value={c80d} onChangeText={setC80d} keyboardType="numeric" placeholder="Max ₹75,000" placeholderTextColor={COLORS.text.muted} />

        <Text style={styles.label}>HRA Exemption · Old regime only</Text>
        <TextInput style={styles.input} value={hra} onChangeText={setHra} keyboardType="numeric" placeholder="Monthly × 12" placeholderTextColor={COLORS.text.muted} />

        <TouchableOpacity style={styles.primaryBtn} onPress={calculate} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={[COLORS.accent.primaryLight, COLORS.accent.primary]} style={styles.primaryBtnGrad}>
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
          <View style={[styles.card, styles.recCard]}>
            <View style={styles.recHeader}>
              <Text style={styles.recHeaderLabel}>RECOMMENDED · {result.recommendation?.regime?.toUpperCase() || ''}</Text>
              <View style={styles.recBadge}><Text style={styles.recBadgeText}>SAVE {fmtINR(result.recommendation?.savings || 0)}</Text></View>
            </View>
            <Text style={styles.recHeadline}>{result.recommendation?.reason}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Old vs New regime</Text>
            <View style={styles.compareGrid}>
              <View style={[styles.compareCol, result.recommendation?.regime === 'new' && styles.compareColWin]}>
                <Text style={styles.compareHead}>NEW</Text>
                <Text style={styles.compareBig}>{fmtINR(result.new_regime?.total_tax || 0)}</Text>
                <Text style={styles.compareSub}>total tax</Text>
                <Text style={styles.compareDetail}>Take-home: {fmtINR(result.new_regime?.take_home || 0)}</Text>
              </View>
              <View style={[styles.compareCol, result.recommendation?.regime === 'old' && styles.compareColWin]}>
                <Text style={styles.compareHead}>OLD</Text>
                <Text style={styles.compareBig}>{fmtINR(result.old_regime?.total_tax || 0)}</Text>
                <Text style={styles.compareSub}>total tax</Text>
                <Text style={styles.compareDetail}>Take-home: {fmtINR(result.old_regime?.take_home || 0)}</Text>
              </View>
            </View>
          </View>

          {result.optimization_suggestions?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💡 How to save more</Text>
              {result.optimization_suggestions.map((s: any, i: number) => (
                <View key={i} style={styles.sugRow}>
                  <View style={styles.sugIcon}><Ionicons name="bulb" size={14} color={COLORS.accent.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugTitle}>{s.title || s.section}</Text>
                    <Text style={styles.sugDetail}>{s.detail || s.description}</Text>
                  </View>
                  {s.potential_savings ? <Text style={styles.sugSave}>+{fmtINR(s.potential_savings)}</Text> : null}
                </View>
              ))}
            </View>
          )}
          <Text style={styles.disclaimer}>{result.disclaimer || 'Estimates only. Consult a CA for actual filing.'}</Text>
        </>
      )}
    </ScrollView>
  );
}

/* ─────────── INVESTMENT SUGGESTER TAB (gated) ─────────── */
function InvestmentSuggester() {
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

  if (locked) {
    return <LockedState feature="Investment Suggester" desc="Get a personalized portfolio split (equity, debt, gold) based on your income & risk profile." minPlan="monthly" />;
  }

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

/* ─────────── LOCKED STATE COMPONENT ─────────── */
function LockedState({ feature, desc, minPlan }: { feature: string; desc: string; minPlan: Plan }) {
  return (
    <View style={styles.lockedWrap}>
      <View style={styles.lockIconBox}>
        <Ionicons name="lock-closed" size={32} color={COLORS.accent.primary} />
      </View>
      <Text style={styles.lockedTitle}>{feature} is Premium</Text>
      <Text style={styles.lockedDesc}>{desc}</Text>
      <View style={styles.lockedPlanRow}>
        <Text style={styles.lockedPlanLabel}>Unlock with</Text>
        <View style={styles.lockedPlanPill}>
          <Text style={styles.lockedPlanPillText}>{PLAN_META[minPlan].emoji} {PLAN_META[minPlan].label} · {PLAN_META[minPlan].price}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.lockedCta}
        onPress={() => { /* switches to plans tab via parent; noop here since we're already inside this screen */ }}
        activeOpacity={0.8}
      >
        <Text style={styles.lockedCtaText}>👆 Tap "Plans" tab above to upgrade</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─────────── MAIN SCREEN ─────────── */
export default function PremiumHub() {
  const [tab, setTab] = useState<Tab>('plans');
  const [plan] = useActivePlan();
  const [savings, setSavings] = useState(1275);

  // Potential-savings hook — compute based on user's analytics summary if available.
  useEffect(() => {
    api.get('/analytics/summary').then((r) => {
      const total = Number(r.data?.total_expense || 0);
      // crude heuristic: assume 10% could be saved — but keep min 500 and cap at 10k
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

/* ─────────── STYLES (warm theme) ─────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.bg.elevated, borderWidth: 1, borderColor: COLORS.border.subtle },
  chipActive: { backgroundColor: COLORS.accent.primary + '15', borderColor: COLORS.accent.primary },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
  chipTextActive: { color: COLORS.accent.primary },

  // ────── PLANS VIEW ──────
  hookCard: { margin: 16, padding: 18, backgroundColor: COLORS.accent.moneyOut + '12', borderRadius: 16, borderWidth: 1, borderColor: COLORS.accent.moneyOut + '30' },
  hookHeader: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, lineHeight: 26 },
  hookSub: { fontSize: 13, color: COLORS.text.secondary, marginTop: 6 },

  plansRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  planCard: {
    flex: 1, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 10,
    backgroundColor: COLORS.bg.elevated, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border.subtle, position: 'relative', minHeight: 140,
  },
  planCardActive: { borderColor: COLORS.accent.primary, borderWidth: 2, backgroundColor: COLORS.accent.primary + '10' },
  planCardBest: {
    flex: 1.15, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 10,
    backgroundColor: COLORS.accent.primary, borderRadius: 16, position: 'relative', minHeight: 140,
    ...shadowStyle(COLORS.accent.primary, 4, 14, 0.35, 6),
  },
  planCardBestActive: { borderColor: '#FCD34D', borderWidth: 2 },
  planLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text.secondary },
  planLabelWhite: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 6 },
  planPrice: { fontSize: 28, fontWeight: '900', color: COLORS.text.primary, marginTop: 6 },
  planPriceWhite: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 2 },
  planSub: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted, marginTop: 4, textAlign: 'center' },
  planSubWhite: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center' },
  bestBadge: {
    position: 'absolute', top: -11, backgroundColor: '#FFD54F',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
  },
  bestBadgeText: { fontSize: 9, fontWeight: '900', color: '#3E2723', letterSpacing: 0.8 },
  activeBadge: {
    position: 'absolute', bottom: 8, backgroundColor: COLORS.accent.primary,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  activeBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  activeBadgeInv: {
    position: 'absolute', bottom: 8, backgroundColor: '#FFD54F',
    paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999,
  },
  activeBadgeInvText: { fontSize: 9, fontWeight: '900', color: '#3E2723', letterSpacing: 0.5 },

  mostPopular: { fontSize: 12, color: COLORS.text.secondary, textAlign: 'center', marginTop: 16, fontWeight: '600' },

  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border.card,
  },
  freeBannerActive: { borderColor: COLORS.accent.moneyIn, backgroundColor: COLORS.accent.moneyIn + '08' },
  freeBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg.elevated, justifyContent: 'center', alignItems: 'center' },
  freeBannerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary },
  freeBannerSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  freeBannerCta: { fontSize: 12, fontWeight: '700', color: COLORS.accent.primary },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, marginTop: 22, marginBottom: 10, marginLeft: 20, letterSpacing: 0.3 },

  featureCard: { marginHorizontal: 16, marginBottom: 10, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border.card },
  featureCardActive: { borderColor: COLORS.accent.primary, borderWidth: 2, backgroundColor: COLORS.accent.primary + '08' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  featureEmoji: { fontSize: 22 },
  featureTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary },
  featureSub: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted },
  activePill: { backgroundColor: COLORS.accent.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  activePillText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  featureText: { flex: 1, fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },

  trustRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 20 },
  trustSig: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border.card },
  trustSigEmoji: { fontSize: 22 },
  trustSigText: { fontSize: 10.5, fontWeight: '700', color: COLORS.text.secondary, textAlign: 'center', lineHeight: 13 },

  // ────── SHARED CARD STYLES ──────
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, margin: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border.card, ...shadowStyle(COLORS.text.primary, 2, 10, 0.05, 2) },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  cardSub: { fontSize: 12, color: COLORS.text.muted, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.text.secondary, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: COLORS.bg.elevated, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  primaryBtn: { marginTop: 18, borderRadius: 12, overflow: 'hidden' },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  recCard: { borderColor: COLORS.accent.moneyIn, borderWidth: 2, backgroundColor: COLORS.accent.moneyIn + '10' },
  recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  recHeaderLabel: { fontSize: 11, fontWeight: '800', color: COLORS.accent.moneyIn, letterSpacing: 0.8 },
  recBadge: { backgroundColor: COLORS.accent.moneyIn, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  recBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  recHeadline: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary, lineHeight: 20 },

  compareGrid: { flexDirection: 'row', gap: 10 },
  compareCol: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: COLORS.bg.elevated, borderWidth: 1, borderColor: COLORS.border.subtle },
  compareColWin: { backgroundColor: COLORS.accent.moneyIn + '15', borderColor: COLORS.accent.moneyIn },
  compareHead: { fontSize: 11, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 0.5 },
  compareBig: { fontSize: 20, fontWeight: '900', color: COLORS.text.primary, marginTop: 4 },
  compareSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  compareDetail: { fontSize: 11, color: COLORS.text.secondary, marginTop: 8, fontWeight: '500' },

  sugRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle, alignItems: 'flex-start' },
  sugIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center' },
  sugTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
  sugDetail: { fontSize: 11, color: COLORS.text.muted, marginTop: 2, lineHeight: 15 },
  sugSave: { fontSize: 12, fontWeight: '800', color: COLORS.accent.moneyIn },

  riskRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  riskBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border.subtle, backgroundColor: COLORS.bg.elevated, alignItems: 'center' },
  riskBtnActive: { borderColor: COLORS.accent.primary, backgroundColor: COLORS.accent.primary + '15' },
  riskText: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
  riskTextActive: { color: COLORS.accent.primary },
  snapshot3: { flexDirection: 'row', paddingVertical: 6 },
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
  allocPlatform: { fontSize: 11, color: COLORS.accent.primary, marginTop: 4, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: COLORS.text.muted, textAlign: 'center', padding: 16, fontStyle: 'italic', lineHeight: 16 },

  // Locked state
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lockedTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, marginBottom: 8, textAlign: 'center' },
  lockedDesc: { fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 19, maxWidth: 280, marginBottom: 20 },
  lockedPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  lockedPlanLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text.muted },
  lockedPlanPill: { backgroundColor: COLORS.accent.primary + '15', borderColor: COLORS.accent.primary, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  lockedPlanPillText: { fontSize: 12, fontWeight: '800', color: COLORS.accent.primary },
  lockedCta: { backgroundColor: COLORS.accent.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  lockedCtaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
