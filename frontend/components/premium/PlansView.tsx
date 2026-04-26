// Plans view — 3-tier pricing + feature comparison.
//
// Round 51d — Tier selection hardening.
//
// Real-device testing reported "tapping Micro/Standard/Premium does
// nothing". Three independent reasons:
//   1. The card tap opened an Alert.alert → many testers cancelled or
//      didn't see the alert (autofill / OS overlay). With the alert
//      cancelled, the card NEVER changed visually so it felt unresponsive.
//   2. When the backend admin hadn't configured RAZORPAY_PLAN_ID_*, the
//      first activation attempt would 503 and silently demo-activate.
//      Subsequent taps still went through Alert.alert.
//   3. There was no "selected" visual state — only `isActive(p)` (which
//      requires a successful subscription change) drives the highlight.
//
// Fixes here:
//   • New `selectedTier` local state — set on EVERY tap, drives a clear
//     border/glow highlight independent of the actual subscribed plan.
//   • New `demoMode` flag — set the moment we get a 503 from the
//     subscription API (or after the first mock activation). Once true,
//     tier taps skip the Alert and demo-activate directly with a
//     "Demo mode — preview" toast. No more dead-end tap.
//   • Each card carries a "Demo mode · tap to preview" caption when
//     `demoMode` is true so users understand why payment isn't required.
//   • `buy()` short-circuits the "p === plan" no-op so re-tapping a
//     currently-active card still gives haptic + visual feedback.
import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { useActivePlan, PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { usePremiumStyles, fmtINR } from './styles';
import api from '../../utils/api';

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
  // configured (Razorpay 503), or after a manual mockActivate. Once true
  // we skip the Alert.alert flow and demo-activate directly.
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const inFlightRef = useRef(false);

  // UPI AutoPay flow — creates a Razorpay subscription and opens the hosted
  // mandate-authorisation page. If the admin hasn't configured plan_ids in
  // Razorpay Dashboard (.env has empty RAZORPAY_PLAN_ID_*), the backend returns
  // 503 and we silently fall back to demo-activate.
  const startAutoPay = async (p: Plan) => {
    const tier = PLAN_TO_TIER[p];
    if (!tier) return false;
    try {
      const r = await api.post('/premium/create-subscription', { tier, total_count: 12 });
      if (r.data?.short_url) {
        await WebBrowser.openBrowserAsync(r.data.short_url);
        Toast.show({
          type: 'info',
          text1: 'UPI AutoPay mandate opened',
          text2: 'Complete authorisation to activate ' + PLAN_META[p].label,
          position: 'bottom',
        });
        return true;
      }
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 503) {
        // Plan not yet configured — silent fallback to demo activation
        // and remember so future taps go straight to demo mode.
        setDemoMode(true);
        await mockActivate(p, /* silent */ false);
        return true;
      }
      const detail = e?.response?.data?.detail || '';
      Toast.show({ type: 'error', text1: 'Could not start AutoPay', text2: detail || 'Please try again' });
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

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Hook */}
      <View style={styles.hookCard}>
        <Text style={styles.hookHeader}>
          You could have saved <Text style={{ color: COLORS.accent.moneyOut }}>{fmtINR(potentialSavings || 1275)}</Text> this month
        </Text>
        <Text style={styles.hookSub}>MintU Premium finds your hidden money leaks · All tiers ≤ ₹150/month</Text>
      </View>

      {/* India-Hack 3-paid-tier pricing row (Free shown separately below) */}
      <View style={styles.plansRow}>
        {/* Micro — ₹29 "Why not?" */}
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

        {/* Standard — ₹99 "Useful" — highlighted as best-seller */}
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

        {/* Premium — ₹149 "Upgrade your life" */}
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
          💡 Most users pick <Text style={{ color: COLORS.accent.primary, fontWeight: '800' }}>Standard</Text> — best balance of features &amp; price
        </Text>
      )}

      {/* Payment methods trust bar — India-first familiarity */}
      <View style={styles.payTrust}>
        <View style={styles.payTrustHeader}>
          <Ionicons name="shield-checkmark" size={14} color={COLORS.accent.moneyIn} />
          <Text style={styles.payTrustTitle}>Pay with what you already use</Text>
        </View>
        <View style={styles.payLogosRow}>
          <View style={[styles.payPill, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.payLogoTxt, { color: '#1A73E8' }]}>G</Text>
            <Text style={[styles.payLogoTxt, { color: '#EA4335' }]}>P</Text>
            <Text style={[styles.payLogoTxt, { color: '#FBBC04' }]}>a</Text>
            <Text style={[styles.payLogoTxt, { color: '#34A853' }]}>y</Text>
          </View>
          <View style={[styles.payPill, { backgroundColor: '#5F259F' }]}>
            <Text style={styles.payPillWhiteTxt}>PhonePe</Text>
          </View>
          <View style={[styles.payPill, { backgroundColor: '#02B9F1' }]}>
            <Text style={styles.payPillWhiteTxt}>Paytm</Text>
          </View>
          <View style={[styles.payPill, { backgroundColor: '#0F1E36' }]}>
            <Ionicons name="card-outline" size={12} color="#fff" />
            <Text style={[styles.payPillWhiteTxt, { marginLeft: 3 }]}>Cards</Text>
          </View>
          <View style={[styles.payPill, { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#2E7D32' }]}>
            <Ionicons name="phone-portrait-outline" size={12} color="#2E7D32" />
            <Text style={[styles.payLogoTxt, { color: '#2E7D32', marginLeft: 3, fontSize: 11 }]}>UPI</Text>
          </View>
        </View>
        <Text style={styles.payFootnote}>UPI AutoPay · Instant · Secured by Razorpay 🇮🇳</Text>
      </View>

      {/* Free tier banner */}
      <TouchableOpacity style={[styles.freeBanner, isActive('free') && styles.freeBannerActive]} onPress={() => buy('free')} activeOpacity={0.8} testID="tier-free">
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

      {/* Feature comparison — Micro / Standard / Premium */}
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
      <Text style={styles.disclaimer}>
        {demoMode
          ? '*Demo mode active: tier activates instantly without payment. Production billing engages once admin configures Razorpay plan IDs.'
          : '*Demo mode: activates instantly without payment. Real billing coming soon.'}
      </Text>
    </ScrollView>
  );
}
