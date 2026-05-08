/**
 * /premium/tax — Dedicated Tax Planner screen.
 *
 * Round 89 — extracted out of the AI-Coach tab (which was a dumping
 * ground for unrelated tools). Tax Planner lives under Premium Hub
 * now; AI Coach is purely conversational + insight-driven.
 *
 * Free users see the unlock teaser; Pro users see the full calculator.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import TaxCalculator from '../../components/premium/TaxCalculator';
import PremiumUnlockTeaser from '../../components/premium/PremiumUnlockTeaser';
import { useActivePlan, FEATURES, canAccess } from '../../utils/premium';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, SPACING } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  back: {
    width: 40, height: 40, borderRadius: 0,
    borderWidth: 2, borderColor: '#0A0A0A', backgroundColor: c.bg.secondary,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.5 },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2, fontWeight: '600' },
  lockedScroll: { padding: SPACING.lg, alignItems: 'center' },
  lockedHint: {
    fontSize: 13, color: c.text.secondary, textAlign: 'center',
    marginTop: SPACING.lg, lineHeight: 20, paddingHorizontal: SPACING.md,
  },
}));

export default function PremiumTaxScreen() {
  const s = useStyles();
  const [plan] = useActivePlan();
  const unlocked = canAccess(FEATURES.TAX_CALCULATOR, plan);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header — matches Premium Hub visual language */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Tax Planner</Text>
          <Text style={s.sub}>Old vs New regime · 80C/80D · save up to ₹1.5 L</Text>
        </View>
      </View>

      {unlocked ? (
        <TaxCalculator />
      ) : (
        <ScrollView contentContainerStyle={s.lockedScroll}>
          <PremiumUnlockTeaser context="tax_calculator" />
          <Text style={s.lockedHint}>
            Upgrade to unlock the Old vs New regime calculator and save up to ₹1.5 L every year.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

