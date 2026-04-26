/**
 * PremiumConversionFunnel — persuasive Pro upsell with locked preview,
 * ROI, social proof, urgency. Replaces PremiumCalmCard for more conversion.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

interface Props { isPro: boolean; }

export default function PremiumConversionFunnel({ isPro }: Props) {
  if (isPro) return null;
  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };

  const lockedFeatures = [
    { emoji: '🧠', title: 'AI weekly check-ins', blur: 'Personal coaching based on your spending' },
    { emoji: '🔁', title: '2× coins on every action', blur: 'Double rewards — twice as fast progress' },
    { emoji: '♾️', title: 'Unlimited goals & groups', blur: 'No caps — set as many as you need' },
  ];

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <View>
          <View style={s.badgeRow}>
            <View style={s.proBadge}><Text style={s.proBadgeTxt}>MINTU PRO</Text></View>
            <View style={s.urgencyBadge}><Text style={s.urgencyTxt}>⏰ 7-day trial</Text></View>
          </View>
          <Text style={s.title}>Unlock your full financial power</Text>
        </View>
        <Text style={s.price}>₹99<Text style={s.priceSub}>/mo</Text></Text>
      </View>

      {/* ROI banner */}
      <View style={s.roiBanner}>
        <Ionicons name="trending-up" size={14} color={'#10B981'} />
        <Text style={s.roiTxt}>Pro users save <Text style={s.roiBold}>avg ₹1,200/month</Text> — pays for itself 12×</Text>
      </View>

      {/* Locked features preview (blurred) */}
      <View style={s.features}>
        {lockedFeatures.map((f, i) => (
          <View key={i} style={s.feature}>
            <View style={s.featIcon}><Text style={{ fontSize: 16 }}>{f.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={s.featTitleRow}>
                <Text style={s.featTitle}>{f.title}</Text>
                <Ionicons name="lock-closed" size={11} color={'#FCD34D'} />
              </View>
              <Text style={s.featBlur}>{f.blur}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Social proof */}
      <View style={s.social}>
        <View style={s.avatars}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[s.avatarDot, { left: i * 12, backgroundColor: ['#F56E1E', '#10B981', '#7C3AED', '#3B82F6'][i] }]} />
          ))}
        </View>
        <Text style={s.socialTxt}>
          <Text style={{ fontWeight: '900', color: '#FFFFFF' }}>2,400+</Text> upgraded this week
        </Text>
      </View>

      <TouchableOpacity
        style={s.cta}
        onPress={() => { haptic(); try { router.push('/premium' as any); } catch {} }}
        activeOpacity={0.88}
      >
        <Text style={s.ctaTxt}>Start free trial · unlock savings</Text>
        <Ionicons name="arrow-forward" size={15} color={'#0F172A'} />
      </TouchableOpacity>
      <Text style={s.ctaSub}>7-day free · cancel anytime · no card needed</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#0F172A', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#1E293B', marginBottom: 16, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  proBadge: { backgroundColor: '#FCD34D', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  proBadgeTxt: { fontSize: 9.5, fontWeight: '900', color: '#0F172A', letterSpacing: 0.7 },
  urgencyBadge: { backgroundColor: '#EF444422', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: '#EF444488' },
  urgencyTxt: { fontSize: 9, fontWeight: '900', color: '#FCA5A5', letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, marginTop: 6, maxWidth: 210 },
  price: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  priceSub: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  roiBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, padding: 10, borderRadius: 12, backgroundColor: '#10B98114', borderWidth: 1, borderColor: '#10B98133' },
  roiTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#D1FAE5' },
  roiBold: { fontWeight: '900', color: '#34D399' },

  features: { marginTop: 14, gap: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  featTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featTitle: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  featBlur: { fontSize: 11, fontWeight: '500', color: '#9CA3AF', marginTop: 1, opacity: 0.7 },

  social: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1E293B' },
  avatars: { width: 60, height: 18, position: 'relative' },
  avatarDot: { position: 'absolute', top: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#0F172A' },
  socialTxt: { fontSize: 11.5, fontWeight: '600', color: '#9CA3AF' },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FCD34D', paddingVertical: 13, borderRadius: 12, marginTop: 14 },
  ctaTxt: { fontSize: 14, fontWeight: '900', color: '#0F172A', letterSpacing: -0.1 },
  ctaSub: { fontSize: 10.5, fontWeight: '500', color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
});
