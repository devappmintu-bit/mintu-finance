// Shared helpers for premium tabs: Chip button + LockedState view.
// Round 30b: migrated from COLORS+premiumStyles to useAppColors+usePremiumStyles
// so theme changes propagate without a root Stack remount.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppColors } from '../../utils/theme';
import { PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { usePremiumStyles } from './styles';
import SoftPaywall from './SoftPaywall';

export const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; emoji: string; locked?: boolean }> = ({ label, active, onPress, emoji, locked }) => {
  const c = useAppColors();
  const styles = usePremiumStyles();
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {locked ? <Ionicons name="lock-closed" size={10} color={active ? c.accent.primary : c.text.muted} /> : null}
    </TouchableOpacity>
  );
};

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
    hidden: 5,
    loss: 42000,
  },
  'Money School': {
    teasers: [
      'Bite-sized lessons on tax, SIPs, and goals',
      'Gamified streaks with ₹-earning challenges',
      'Certificates + yearly roadmap',
    ],
    hidden: 7,
    loss: 15000,
  },
};

export function LockedState({ feature, desc, minPlan }: { feature: string; desc: string; minPlan: Plan }) {
  const c = useAppColors();
  const framing = FEATURE_FRAMING[feature] || { teasers: [desc], hidden: 4, loss: 18000 };
  const plan = PLAN_META[minPlan];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', marginBottom: 18, gap: 6 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent.primary + '18', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="sparkles" size={22} color={c.accent.primary} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.4 }}>{feature}</Text>
        <Text style={{ fontSize: 13, color: c.text.secondary, textAlign: 'center', lineHeight: 18, fontWeight: '600', paddingHorizontal: 16 }}>
          Unlock with <Text style={{ fontWeight: '900', color: c.accent.primary }}>{plan.emoji} {plan.label} · {plan.price}</Text>
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
