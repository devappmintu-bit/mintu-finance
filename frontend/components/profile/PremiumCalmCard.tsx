/**
 * PremiumCalmCard — muted, non-flashy MintU Pro upsell.
 * 3 benefits max, single "Try Free" CTA, dark card, minimal accent.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  isPro: boolean;
}

export default function PremiumCalmCard({ isPro }: Props) {
  const s = useStyles();
  if (isPro) return null;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  const benefits = [
    { icon: 'sparkles-outline' as const, text: 'AI-coached weekly check-ins' },
    { icon: 'trophy-outline' as const, text: '2× coins on every action' },
    { icon: 'infinite-outline' as const, text: 'Unlimited split groups & goals' },
  ];

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View>
          <Text style={s.label}>MintU Pro</Text>
          <Text style={s.title}>Unlock your full financial power</Text>
        </View>
        <Text style={s.price}>₹99<Text style={s.priceSub}>/mo</Text></Text>
      </View>

      <View style={s.benefits}>
        {benefits.map((b, i) => (
          <View key={i} style={s.benefitRow}>
            <Ionicons name={b.icon} size={14} color={'#FDBA74'} />
            <Text style={s.benefitTxt}>{b.text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={s.cta}
        onPress={() => { haptic(); try { router.push('/premium' as any); } catch {} }}
        activeOpacity={0.88}
      >
        <Text style={s.ctaTxt}>Try free for 7 days</Text>
        <Ionicons name="arrow-forward" size={14} color="#0F172A" />
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 10.5, fontWeight: '800', color: '#FDBA74', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: -0.2, marginTop: 3 },
  price: { fontSize: 18, fontWeight: '800', color: '#fff' },
  priceSub: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },

  benefits: { marginTop: 14, gap: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitTxt: { fontSize: 12.5, fontWeight: '500', color: '#D1D5DB' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FDBA74',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  ctaTxt: { fontSize: 13.5, fontWeight: '700', color: '#0F172A' },
}));
