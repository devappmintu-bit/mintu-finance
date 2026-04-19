// Shared helpers for premium tabs: Chip button + LockedState view.
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';
import { PLAN_META } from '../../utils/premium';
import type { Plan } from '../../utils/premium';
import { premiumStyles as styles } from './styles';

export const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; emoji: string; locked?: boolean }> = ({ label, active, onPress, emoji, locked }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]} activeOpacity={0.8}>
    <Text style={styles.chipEmoji}>{emoji}</Text>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    {locked ? <Ionicons name="lock-closed" size={10} color={active ? COLORS.accent.primary : COLORS.text.muted} /> : null}
  </TouchableOpacity>
);

export function LockedState({ feature, desc, minPlan }: { feature: string; desc: string; minPlan: Plan }) {
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
      <View style={styles.lockedCta}>
        <Text style={styles.lockedCtaText}>👆 Tap "Plans" tab above to upgrade</Text>
      </View>
    </View>
  );
}
