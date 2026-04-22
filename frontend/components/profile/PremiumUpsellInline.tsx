/**
 * PremiumUpsellInline.tsx — Soft-paywall card for the Profile.
 *
 * Contextual benefits + ₹99/month most-popular + "Try free" CTA.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Props = {
  isPro?: boolean;
};

export default function PremiumUpsellInline({ isPro }: Props) {
  if (isPro) {
    return (
      <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.proCard}>
        <View style={s.row}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.proTitle}>MintU Pro Active</Text>
            <Text style={s.proSub}>You're getting the full experience</Text>
          </View>
        </View>
      </LinearGradient>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => { try { Haptics.selectionAsync(); } catch {} router.push('/premium' as any); }}
      testID="profile-upsell"
    >
      <LinearGradient colors={['#1F2937', '#0F172A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        <View style={s.blob} />
        <View style={s.topRow}>
          <View style={s.badge}>
            <Ionicons name="flash" size={11} color="#fff" />
            <Text style={s.badgeTxt}>MINTU PRO</Text>
          </View>
          <Text style={s.pricePill}>₹99/mo · Popular</Text>
        </View>
        <Text style={s.title}>Unlock your full financial power</Text>
        <View style={s.benefitsRow}>
          <Benefit icon="sparkles" label="AI insights" />
          <Benefit icon="shield-checkmark" label="Priority support" />
          <Benefit icon="flash" label="2× rewards" />
        </View>
        <View style={s.cta}>
          <Text style={s.ctaTxt}>Try free for 7 days</Text>
          <Ionicons name="arrow-forward" size={14} color="#F59E0B" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function Benefit({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.benefit}>
      <Ionicons name={icon} size={12} color="#F59E0B" />
      <Text style={s.benefitTxt}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 20, gap: 10, overflow: 'hidden', position: 'relative' },
  proCard: { padding: 14, borderRadius: 16 },
  blob: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(245,158,11,0.15)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F59E0B' },
  badgeTxt: { fontSize: 9.5, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  pricePill: { fontSize: 11, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.2 },
  title: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginTop: 4 },
  benefitsRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  benefitTxt: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ctaTxt: { fontSize: 13, fontWeight: '900', color: '#F59E0B' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proTitle: { fontSize: 14, fontWeight: '900', color: '#fff' },
  proSub: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 1 },
});
