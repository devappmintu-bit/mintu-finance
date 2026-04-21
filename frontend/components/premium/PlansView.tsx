// Plans view — 3-tier pricing + feature comparison.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { useActivePlan, PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { premiumStyles as styles, fmtINR } from './styles';

export default function PlansView({ potentialSavings }: { potentialSavings: number }) {
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
        <Text style={styles.hookSub}>MintU Premium finds your hidden money leaks · All tiers ≤ ₹150/month</Text>
      </View>

      {/* India-Hack 3-paid-tier pricing row (Free shown separately below) */}
      <View style={styles.plansRow}>
        {/* Micro — ₹29 "Why not?" */}
        <TouchableOpacity style={[styles.planCard, isActive('intro') && styles.planCardActive]} onPress={() => buy('intro')} activeOpacity={0.9}>
          <Text style={styles.planLabel}>Micro</Text>
          <Text style={styles.planPrice}>₹29</Text>
          <Text style={styles.planSub}>Why not?</Text>
          {isActive('intro') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Standard — ₹99 "Useful" — highlighted as best-seller */}
        <TouchableOpacity style={[styles.planCardBest, isActive('monthly') && styles.planCardBestActive]} onPress={() => buy('monthly')} activeOpacity={0.9}>
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planLabelWhite}>Standard</Text>
          <Text style={styles.planPriceWhite}>₹99</Text>
          <Text style={styles.planSubWhite}>Useful</Text>
          {isActive('monthly') && <View style={styles.activeBadgeInv}><Text style={styles.activeBadgeInvText}>✓ ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Premium — ₹149 "Upgrade your life" */}
        <TouchableOpacity style={[styles.planCard, isActive('yearly') && styles.planCardActive]} onPress={() => buy('yearly')} activeOpacity={0.9}>
          <Text style={styles.planLabel}>Premium</Text>
          <Text style={styles.planPrice}>₹149</Text>
          <Text style={styles.planSub}>Upgrade life</Text>
          {isActive('yearly') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>
      </View>

      <Text style={styles.mostPopular}>💡 Most users pick <Text style={{ color: COLORS.accent.primary, fontWeight: '800' }}>Standard</Text> — best balance of features & price</Text>

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
      <TouchableOpacity style={[styles.freeBanner, isActive('free') && styles.freeBannerActive]} onPress={() => buy('free')} activeOpacity={0.8}>
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
      <Text style={styles.disclaimer}>*Demo mode: activates instantly without payment. Real billing coming soon.</Text>
    </ScrollView>
  );
}
