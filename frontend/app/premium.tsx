/**
 * MintU Premium — Brutalist CONVERSION ENGINE (not a comparison table).
 *
 * Round 77.9 · per master prompt v9 §1 ("Plan screen → conversion engine").
 *
 * Structure (flow-first, one decision per surface):
 *   1. HEADER          "Unlock MintU Pro" + close
 *   2. HERO VALUE      "You're leaking ₹X/month" (personalised from analytics)
 *   3. PLAN CARDS      3 brutalist tiles · Standard highlighted (MOST POPULAR)
 *   4. PRIMARY CTA     "CONTINUE → PAY ₹X" (opens CheckoutSheet directly)
 *   5. TRUST STRIP     inline only (Cancel anytime · Secure via Razorpay · …)
 *
 * Explicitly REMOVED (per spec):
 *   • Feature comparison matrix
 *   • Guarantee blocks
 *   • "Why not / useful / upgrading my life" fluff taglines
 *   • Free / demo fallback buttons
 *
 * On success: CheckoutSheet → `setActivePlan` → SuccessSheet (confetti).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { fetchAnalyticsSummary } from '../services/transactions';
import { PLAN_META, setActivePlan, useActivePlan } from '../utils/premium';
import type { Plan } from '../utils/premium';
import CheckoutSheet from '../components/premium/CheckoutSheet';
import SuccessSheet from '../components/premium/SuccessSheet';

import {
  BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP,
} from '../utils/brutalist';

const PAID_PLANS: Plan[] = ['intro', 'monthly', 'yearly'];

export default function PremiumScreen() {
  const [activePlan, setActive] = useActivePlan();
  const [leakage, setLeakage] = useState<number>(500);
  const [selected, setSelected] = useState<Plan>('monthly'); // Standard default
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successPlan, setSuccessPlan] = useState<Plan | null>(null);

  // Personalised leakage estimate from analytics summary.
  useEffect(() => {
    fetchAnalyticsSummary()
      .then((data) => {
        const total = Number((data || {})?.total_expense || 0);
        // ~10% of monthly spend, clamped to a credible range.
        const guess = Math.max(500, Math.min(10000, Math.round(total * 0.1)));
        if (guess) setLeakage(guess);
      })
      .catch(() => {});
  }, []);

  const amount = useMemo(() => priceFor(selected), [selected]);

  const onContinue = () => {
    if (!selected) return;
    setCheckoutPlan(selected);
    setCheckoutOpen(true);
  };

  const onCheckoutSuccess = async () => {
    if (!checkoutPlan) return;
    setCheckoutOpen(false);
    await new Promise<void>((r) => setTimeout(r, 180));
    await setActivePlan(checkoutPlan);
    await setActive(checkoutPlan);
    setSuccessPlan(checkoutPlan);
    setSuccessOpen(true);
  };

  const onDemoFallback = async (p: Plan) => {
    setCheckoutOpen(false);
    await new Promise<void>((r) => setTimeout(r, 120));
    await setActivePlan(p);
    await setActive(p);
    setSuccessPlan(p);
    setSuccessOpen(true);
  };

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      {/* ══════ 1. HEADER ══════ */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>UNLOCK MINTU PRO</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ══════ 2. HERO VALUE (personalised · sharp, not vague) ══════ */}
        <View style={[styles.hero, BR_STAMP.md]}>
          <View style={styles.heroTagRow}>
            <View style={styles.heroRule} />
            <Text style={styles.heroTag}>THIS MONTH</Text>
          </View>
          <Text style={styles.heroHeadline}>
            You're leaking
          </Text>
          <Text style={styles.heroAmount}>
            ₹{leakage.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.heroSub}>
            Fix it with MintU Pro — unlimited AI coach, waste detector, smart alerts.
          </Text>
        </View>

        {/* ══════ 3. PLAN CARDS (Micro · Standard · Premium) ══════ */}
        <View style={styles.plansRow}>
          {PAID_PLANS.map((plan) => {
            const meta = PLAN_META[plan];
            const isSelected = selected === plan;
            const isPopular = plan === 'monthly';
            return (
              <Pressable
                key={plan}
                onPress={() => setSelected(plan)}
                testID={`plan-${plan}`}
                style={({ pressed }) => [
                  styles.planCard,
                  isSelected && styles.planCardSelected,
                  isPopular && !isSelected && styles.planCardPopular,
                  pressed && { opacity: 0.92 },
                ]}
              >
                {isPopular ? (
                  <View style={[styles.popPill, isSelected && { backgroundColor: '#fff' }]}>
                    <Text style={[styles.popPillText, isSelected && { color: BR_COLORS.accent }]}>
                      MOST POPULAR
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>
                  {meta.label.toUpperCase()}
                </Text>
                <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                  {meta.price}
                </Text>
                <Text style={[styles.planSub, isSelected && styles.planSubSelected]}>
                  / MONTH
                </Text>
                {isSelected ? (
                  <View style={styles.checkMark}>
                    <Ionicons name="checkmark" size={14} color={BR_COLORS.accent} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Thin feature-hook line — 3 concrete wins for the selected plan.
            Not a comparison table; just a lazy-user confidence anchor. */}
        <View style={styles.hookRow}>
          {(PLAN_META[selected].features.slice(0, 3)).map((f, i) => (
            <View key={i} style={styles.hookItem}>
              <Ionicons name="checkmark" size={12} color={BR_COLORS.ink} />
              <Text style={styles.hookText} numberOfLines={1}>{f}</Text>
            </View>
          ))}
        </View>

        {/* ══════ 4. PRIMARY CTA ══════ */}
        <Pressable
          onPress={onContinue}
          testID="continue-pay"
          disabled={activePlan === selected}
          style={({ pressed }) => [
            styles.cta,
            BR_STAMP.md,
            (pressed || activePlan === selected) && styles.ctaPressed,
          ]}
        >
          <Text style={styles.ctaText}>
            {activePlan === selected ? 'ACTIVE' : `CONTINUE — PAY ₹${amount}`}
          </Text>
          {activePlan !== selected ? (
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          ) : null}
        </Pressable>

        {/* ══════ 5. TRUST STRIP (inline text only) ══════ */}
        <Text style={styles.trust}>
          ✓ Cancel anytime   ✓ Secure via Razorpay   ✓ No hidden fees
        </Text>
      </ScrollView>

      {/* Payment sheets */}
      <CheckoutSheet
        visible={checkoutOpen}
        plan={checkoutPlan}
        potentialSavings={leakage}
        onClose={() => setCheckoutOpen(false)}
        onSuccessActivate={onCheckoutSuccess}
        onDemoFallback={onDemoFallback}
      />
      <SuccessSheet
        visible={successOpen}
        plan={successPlan}
        onDismiss={() => { setSuccessOpen(false); setSuccessPlan(null); router.back(); }}
      />
    </SafeAreaView>
  );
}

function priceFor(plan: Plan): number {
  const m = (PLAN_META[plan].price.match(/\d+/g) || ['0']).join('');
  return parseInt(m, 10) || 0;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },

  // 1 HEADER
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
    borderBottomWidth: BR_BORDER.hair, borderColor: BR_COLORS.line,
  },
  close: {
    width: 36, height: 36,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '900',
    letterSpacing: 2, color: BR_COLORS.ink,
  },

  scroll: { paddingHorizontal: BR_SPACE.lg, paddingVertical: BR_SPACE.lg, paddingBottom: 120 },

  // 2 HERO
  hero: {
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    marginBottom: BR_SPACE.xl,
  },
  heroTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroRule: { width: 12, height: BR_BORDER.heavy, backgroundColor: BR_COLORS.accent },
  heroTag: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
    color: BR_COLORS.accent,
  },
  heroHeadline: {
    fontSize: 20, fontWeight: '800', color: '#fff',
    marginTop: BR_SPACE.sm, letterSpacing: -0.3,
  },
  heroAmount: {
    fontFamily: 'Menlo',
    fontSize: 64, lineHeight: 64,
    fontWeight: '900', letterSpacing: -3,
    color: '#fff', marginTop: 4,
  },
  heroSub: {
    fontSize: 13, lineHeight: 18, fontWeight: '500',
    color: 'rgba(255,255,255,0.85)', marginTop: BR_SPACE.md,
  },

  // 3 PLAN CARDS
  plansRow: { flexDirection: 'row', gap: BR_SPACE.md, marginBottom: BR_SPACE.md },
  planCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    paddingVertical: BR_SPACE.lg, paddingHorizontal: BR_SPACE.md,
    minHeight: 140,
    alignItems: 'flex-start',
    position: 'relative',
  },
  planCardPopular: { backgroundColor: BR_COLORS.paperAlt },
  planCardSelected: { backgroundColor: BR_COLORS.accent, borderColor: BR_COLORS.ink, ...BR_STAMP.md },

  popPill: {
    position: 'absolute', top: -10, left: BR_SPACE.md,
    backgroundColor: BR_COLORS.accent,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
  },
  popPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: '#fff' },

  planLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: BR_COLORS.ink, marginTop: BR_SPACE.sm },
  planLabelSelected: { color: '#fff' },
  planPrice: {
    fontFamily: 'Menlo',
    fontSize: 28, fontWeight: '900', letterSpacing: -1,
    color: BR_COLORS.ink, marginTop: 6,
  },
  planPriceSelected: { color: '#fff' },
  planSub: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: BR_COLORS.muted, marginTop: 2 },
  planSubSelected: { color: 'rgba(255,255,255,0.85)' },
  checkMark: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20,
    backgroundColor: '#fff',
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },

  // hook row
  hookRow: { marginTop: BR_SPACE.md, marginBottom: BR_SPACE.xl },
  hookItem: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6, gap: 8,
  },
  hookText: { fontSize: 13, fontWeight: '500', color: BR_COLORS.ink, flex: 1 },

  // 4 PRIMARY CTA
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    paddingVertical: 18, paddingHorizontal: BR_SPACE.lg,
  },
  ctaPressed: { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.95 },
  ctaText: {
    color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2,
  },

  // 5 TRUST
  trust: {
    marginTop: BR_SPACE.md,
    textAlign: 'center',
    fontSize: 11, fontWeight: '600',
    letterSpacing: 1, color: BR_COLORS.muted,
  },
});
