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
        <Text style={styles.hookSub}>MintU Premium finds your hidden money leaks</Text>
      </View>

      {/* 3-plan pricing row */}
      <View style={styles.plansRow}>
        {/* Intro */}
        <TouchableOpacity style={[styles.planCard, isActive('intro') && styles.planCardActive]} onPress={() => buy('intro')} activeOpacity={0.9}>
          <Text style={styles.planLabel}>Intro</Text>
          <Text style={styles.planPrice}>₹29</Text>
          <Text style={styles.planSub}>first month</Text>
          {isActive('intro') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Yearly — highlighted */}
        <TouchableOpacity style={[styles.planCardBest, isActive('yearly') && styles.planCardBestActive]} onPress={() => buy('yearly')} activeOpacity={0.9}>
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planLabelWhite}>Yearly</Text>
          <Text style={styles.planPriceWhite}>₹499</Text>
          <Text style={styles.planSubWhite}>per year (58% off)</Text>
          {isActive('yearly') && <View style={styles.activeBadgeInv}><Text style={styles.activeBadgeInvText}>✓ ACTIVE</Text></View>}
        </TouchableOpacity>

        {/* Monthly */}
        <TouchableOpacity style={[styles.planCard, isActive('monthly') && styles.planCardActive]} onPress={() => buy('monthly')} activeOpacity={0.9}>
          <Text style={styles.planLabel}>Monthly</Text>
          <Text style={styles.planPrice}>₹99</Text>
          <Text style={styles.planSub}>per month</Text>
          {isActive('monthly') && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
        </TouchableOpacity>
      </View>

      <Text style={styles.mostPopular}>💡 Most users choose <Text style={{ color: COLORS.accent.primary, fontWeight: '800' }}>Yearly</Text> — saves ₹689/year</Text>

      {/* Free tier banner */}
      <TouchableOpacity style={[styles.freeBanner, isActive('free') && styles.freeBannerActive]} onPress={() => buy('free')} activeOpacity={0.8}>
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
