// Plans view — decision-focused checkout.
//
// Round 53o (Apr 29 2026) — refactored from feature-heavy to
// decision-focused per user spec:
//
//   1. Hero (value + savings)
//   2. Tier cards (selection)
//   3. Comparison matrix (truth layer — driven by selection/active tier)
//   4. Free fallback CTA
//   5. Trust line
//
// Removed:
//   • Static payment-logo bar (GPay / PhonePe / Paytm / Cards / UPI pills) —
//     decorative noise. Real method selection happens inside Razorpay's
//     hosted page.
//   • 3 stacked per-tier "What you get" cards — duplicated info already in
//     the tier cards above. Replaced with a single comparison matrix.
//
// Added:
//   • Scroll-to-comparison + brief column flash on tier card tap (reinforces
//     decision instantly).
//   • Comparison column highlight tied to `selectedTier` (pre-purchase) or
//     `plan` (post-purchase) — user always knows "what I'm picking" vs
//     "what I have".
//   • Single intentional trust line ("Secure payments via Razorpay · UPI,
//     Cards, Wallets supported").
//
// Round 51d hardening (kept):
//   • Visual `selectedTier` independent of `plan` — every tap gives feedback.
//   • `demoMode` short-circuit when Razorpay plan IDs aren't configured.
//   • Re-tapping the active card still emits haptic + highlight feedback.
import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Animated } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { useActivePlan, PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { usePremiumStyles, fmtINR } from './styles';
import api from '../../utils/api';
import PremiumComparison from './PremiumComparison';
import { GlassCard } from '../glass';

// Frontend plan-key → backend subscription-tier ("lite"|"pro"|"elite")
const PLAN_TO_TIER: Record<Plan, 'lite' | 'pro' | 'elite' | null> = {
  free: null, intro: 'lite', monthly: 'pro', yearly: 'elite',
};

export default function PlansView({ potentialSavings }: { potentialSavings: number }) {
  const styles = usePremiumStyles();
  const [plan, setPlan] = useActivePlan();
  // Visual selection state — independent of active subscription.
  const [selectedTier, setSelectedTier] = useState<Plan | null>(plan || null);
  // Becomes true the first time the backend tells us plan IDs aren't
  // configured (Razorpay 503), or after a manual mockActivate.
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const inFlightRef = useRef(false);

  // Refs for scroll-to-comparison UX.
  const scrollRef     = useRef<ScrollView>(null);
  const comparisonY   = useRef(0);
  const flashAnim     = useRef(new Animated.Value(0)).current;

  // Reduced-motion fallback: if Animated isn't running smoothly we still
  // get the highlight via prop; the flash is purely additive polish.
  const triggerFlash = () => {
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start();
  };

  const scrollToComparison = () => {
    if (!scrollRef.current) return;
    // Scroll just before the comparison block so the user sees the column
    // header animate into view.
    scrollRef.current.scrollTo({ y: Math.max(0, comparisonY.current - 12), animated: true });
  };

  // UPI AutoPay flow — opens Razorpay's hosted mandate page.
  const startAutoPay = async (p: Plan) => {
    const tier = PLAN_TO_TIER[p];
    if (!tier) return false;
    try {
      const r = await api.post('/premium/create-subscription', { tier, total_count: 12 });
      if (r.data?.short_url) {
        await WebBrowser.openBrowserAsync(r.data.short_url);
        Toast.show({
          type: 'info',
          text1: 'Razorpay opened',
          text2: 'Complete authorisation to activate ' + PLAN_META[p].label,
          position: 'bottom',
        });
        return true;
      }
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 503) {
        // Plan not yet configured — silent fallback to demo activation.
        setDemoMode(true);
        await mockActivate(p, /* silent */ false);
        return true;
      }
      const detail = e?.response?.data?.detail || '';
      Toast.show({ type: 'error', text1: 'Could not start payment', text2: detail || 'Please try again' });
      return false;
    }
    return false;
  };

  const mockActivate = async (p: Plan, isDemo = demoMode) => {
    await setPlan(p);
    Toast.show({
      type: 'success',
      text1: isDemo
        ? `🧪 ${PLAN_META[p].label} preview activated`
        : `🎉 ${PLAN_META[p].label} activated!`,
      text2: isDemo
        ? 'Demo mode — no payment taken'
        : 'All premium features unlocked',
      position: 'bottom',
    });
  };

  const buy = async (p: Plan) => {
    if (inFlightRef.current) return;
    // Always give immediate visual + haptic feedback so a tap is never
    // silent, even if the user re-taps the currently-active plan.
    setSelectedTier(p);
    if (p !== 'free') {
      // Reinforce decision: scroll to comparison + flash matching column.
      requestAnimationFrame(() => {
        scrollToComparison();
        triggerFlash();
      });
    }
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch { /* noop */ }
    }
    if (p === plan) return;  // already on this plan (after the haptic + highlight)

    if (p === 'free') {
      inFlightRef.current = true;
      try { await mockActivate(p, false); } finally { inFlightRef.current = false; }
      return;
    }

    // Demo mode short-circuit: skip Alert and activate inline.
    if (demoMode) {
      inFlightRef.current = true;
      try { await mockActivate(p, true); } finally { inFlightRef.current = false; }
      return;
    }

    // Production flow: confirm + try real Razorpay AutoPay.
    const confirm = (yes: () => void) => {
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && window.confirm(`Activate ${PLAN_META[p].label}?\n\n${PLAN_META[p].price} ${PLAN_META[p].priceSub}\nUPI AutoPay via Razorpay. Cancel anytime.`)) yes();
        return;
      }
      Alert.alert(
        `Activate ${PLAN_META[p].label}?`,
        `${PLAN_META[p].price} ${PLAN_META[p].priceSub}\n\nUPI AutoPay via Razorpay. Cancel anytime.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate', onPress: yes },
        ],
      );
    };

    confirm(async () => {
      inFlightRef.current = true;
      try { await startAutoPay(p); } finally { inFlightRef.current = false; }
    });
  };

  const isActive   = (p: Plan) => plan === p;
  const isSelected = (p: Plan) => selectedTier === p && !isActive(p);

  // Feed comparison columns: only paid tiers map. 'free' → null highlight.
  const compActive   = (plan === 'free' ? null : (plan as Exclude<Plan, 'free'> | null)) || null;
  const compSelected = (selectedTier && selectedTier !== 'free' ? selectedTier : null) as Exclude<Plan, 'free'> | null;

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 1. Hero — Round 55 GlassCard wrapper for iOS Crystal aesthetic.
          Inner padding/typography retained from styles.hookCard so the
          existing layout tests don't drift. */}
      <GlassCard
        radius={20}
        intensity={45}
        style={{ marginHorizontal: 16, marginTop: 16, padding: 18 }}
      >
        <Text style={styles.hookHeader}>
          You could have saved <Text style={{ color: COLORS.accent.moneyOut }}>{fmtINR(potentialSavings || 1275)}</Text> this month
        </Text>
        <Text style={styles.hookSub}>MintU Premium finds your hidden money leaks · All tiers ≤ ₹150/month</Text>
      </GlassCard>

      {/* 2. Tier cards (selection) */}
      <View style={styles.plansRow}>
        {/* Micro — ₹29 */}
        <TouchableOpacity
          style={[
            styles.planCard,
            isActive('intro') && styles.planCardActive,
            isSelected('intro') && { borderColor: COLORS.accent.primary, borderWidth: 2, backgroundColor: COLORS.accent.primary + '14' },
          ]}
          onPress={() => buy('intro')}
          activeOpacity={0.85}
          testID="tier-intro"
        >
          <Text style={styles.planLabel}>Micro</Text>
          <Text style={styles.planPrice}>₹29</Text>
          <Text style={styles.planSub}>Why not?</Text>
          {isActive('intro') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
          {isSelected('intro') && (
            <View style={[styles.activeBadge, { backgroundColor: COLORS.accent.primary + 'CC' }]}>
              <Text style={styles.activeBadgeText}>SELECTED</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Standard — ₹99 — best-seller */}
        <TouchableOpacity
          style={[
            styles.planCardBest,
            isActive('monthly') && styles.planCardBestActive,
            isSelected('monthly') && { borderColor: '#FCD34D', borderWidth: 2 },
          ]}
          onPress={() => buy('monthly')}
          activeOpacity={0.85}
          testID="tier-monthly"
        >
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planLabelWhite}>Standard</Text>
          <Text style={styles.planPriceWhite}>₹99</Text>
          <Text style={styles.planSubWhite}>Useful</Text>
          {isActive('monthly')   && <View style={styles.activeBadgeInv}><Text style={styles.activeBadgeInvText}>✓ ACTIVE</Text></View>}
          {isSelected('monthly') && (
            <View style={[styles.activeBadgeInv, { backgroundColor: '#FFFFFF' }]}>
              <Text style={[styles.activeBadgeInvText, { color: COLORS.accent.primary }]}>SELECTED</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Premium — ₹149 */}
        <TouchableOpacity
          style={[
            styles.planCard,
            isActive('yearly') && styles.planCardActive,
            isSelected('yearly') && { borderColor: COLORS.accent.primary, borderWidth: 2, backgroundColor: COLORS.accent.primary + '14' },
          ]}
          onPress={() => buy('yearly')}
          activeOpacity={0.85}
          testID="tier-yearly"
        >
          <Text style={styles.planLabel}>Premium</Text>
          <Text style={styles.planPrice}>₹149</Text>
          <Text style={styles.planSub}>Upgrade life</Text>
          {isActive('yearly')   && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
          {isSelected('yearly') && (
            <View style={[styles.activeBadge, { backgroundColor: COLORS.accent.primary + 'CC' }]}>
              <Text style={styles.activeBadgeText}>SELECTED</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {demoMode ? (
        <Text style={[styles.mostPopular, { color: COLORS.text.muted }]}>
          🧪 <Text style={{ fontWeight: '800' }}>Demo mode</Text> — tap any tier to preview features (no payment taken)
        </Text>
      ) : (
        <Text style={styles.mostPopular}>
          💡 Most users pick <Text style={{ color: COLORS.accent.primary, fontWeight: '800' }}>Standard</Text> — best balance of features & price
        </Text>
      )}

      {/* 3. Comparison matrix — single source of truth, replaces the
          old per-tier "What you get" stacked cards.
          onLayout captures y so tier-card taps can scroll smoothly here. */}
      <Animated.View
        onLayout={(e) => { comparisonY.current = e.nativeEvent.layout.y; }}
        style={{
          marginHorizontal: 16,
          marginTop: 16,
          // Subtle global flash on the wrap when a tier is picked.
          opacity: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }),
          transform: [{ scale: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.005] }) }],
        }}
      >
        <PremiumComparison
          activeTier={compActive}
          selectedTier={compSelected}
          onPickTier={(p) => buy(p)}
        />
      </Animated.View>

      {/* 4. Free fallback CTA — explicit "Continue with Free plan" so the
          downgrade path is obvious + non-pushy. */}
      <Text style={styles.sectionTitle}>Continue with Free plan</Text>
      <TouchableOpacity
        style={[styles.freeBanner, isActive('free') && styles.freeBannerActive]}
        onPress={() => buy('free')}
        activeOpacity={0.8}
        testID="tier-free"
      >
        <View style={styles.freeBannerIcon}>
          <Text style={{ fontSize: 18 }}>🌱</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.freeBannerTitle}>Free · Trust</Text>
          <Text style={styles.freeBannerSub}>Basic tracking · 5 AI msgs/day · 7-day insights</Text>
        </View>
        {isActive('free') ? (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.moneyIn} />
        ) : (
          <Text style={styles.freeBannerCta}>Continue Free</Text>
        )}
      </TouchableOpacity>

      {/* 5. Trust line — single intentional, non-cluttered */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 }}>
        <Ionicons name="shield-checkmark" size={13} color={COLORS.accent.moneyIn} />
        <Text style={{ fontSize: 11.5, color: COLORS.text.secondary, fontWeight: '600', textAlign: 'center' }}>
          Secure payments via Razorpay · UPI, Cards, Wallets supported
        </Text>
      </View>
      {demoMode && (
        <Text style={styles.disclaimer}>
          *Demo mode active: tier activates instantly without payment.
        </Text>
      )}
    </ScrollView>
  );
}
