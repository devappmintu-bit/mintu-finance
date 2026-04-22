// Shared helpers for premium tabs: Chip button + LockedState view.
// Phase Δ: LockedState now rendered via SoftPaywall — instantly upgrades
// every locked surface (Tax · Invest · School) to the insight-first paywall.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../utils/theme';
import { PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { premiumStyles as styles } from './styles';
import SoftPaywall from './SoftPaywall';

export const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; emoji: string; locked?: boolean }> = ({ label, active, onPress, emoji, locked }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
    <Text style={styles.chipEmoji}>{emoji}</Text>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    {locked ? <Ionicons name="lock-closed" size={10} color={active ? COLORS.accent.primary : COLORS.text.muted} /> : null}
  </TouchableOpacity>
);

/**
 * Per-feature loss-framing copy. Falls back to a generic pitch when a
 * feature key is missing. Each entry is: [teaserLines, hiddenCount, estLoss]
 */
const FEATURE_FRAMING: Record<string, { teasers: string[]; hidden: number; loss: number }> = {
  'Tax Calculator': {
    teasers: [
      'Old vs New regime — which saves you more?',
      '80C · 80D · HRA optimisation for your income',
      'Estimated refund + quarterly planning',
    ],
    hidden: 6,
    loss: 28000,
  },
  'Investment Suggester': {
    teasers: [
      'AI-picked SIPs based on your spending pattern',
      'Goal-based allocation (retire · house · emergency)',
      'Expected returns over 5 / 10 / 20 years',
    ],
    hidden: 8,
    loss: 46000,
  },
  'Money School': {
    teasers: [
      '15 lessons: SIPs · PPF · insurance · tax saving',
      'Indian-context examples (not US jargon)',
      'XP + savings impact per lesson',
    ],
    hidden: 12,
    loss: 34000,
  },
};

export function LockedState({ feature, desc, minPlan }: { feature: string; desc: string; minPlan: Plan }) {
  const framing = FEATURE_FRAMING[feature] || { teasers: [desc], hidden: 4, loss: 18000 };
  const plan = PLAN_META[minPlan];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* Feature heading */}
      <View style={{ alignItems: 'center', marginBottom: 18, gap: 6 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="sparkles" size={22} color={COLORS.accent.primary} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.4 }}>{feature}</Text>
        <Text style={{ fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 18, fontWeight: '600', paddingHorizontal: 16 }}>
          Unlock with <Text style={{ fontWeight: '900', color: COLORS.accent.primary }}>{plan.emoji} {plan.label} · {plan.price}</Text>
        </Text>
      </View>

      <SoftPaywall
        lossAmount={framing.loss}
        teaserLines={framing.teasers}
        hiddenCount={framing.hidden}
        ctaRoute="/premium"
      />
    </ScrollView>
  );
}
