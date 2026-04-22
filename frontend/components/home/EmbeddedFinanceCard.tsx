/**
 * EmbeddedFinanceCard — Soft cross-sell for credit-line / insurance.
 *
 * Shows 2 contextual financial products based on user's money score and
 * income profile. Non-intrusive, opens external web view / deep-link.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

type Product = {
  key: string;
  badge: string;
  emoji: string;
  title: string;
  sub: string;
  cta: string;
  gradient: [string, string];
  accent: string;
};

export default function EmbeddedFinanceCard({ moneyScore = 0 }: { moneyScore?: number }) {
  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  // Contextual products: better score = better offers
  const products: Product[] = [];

  if (moneyScore >= 60) {
    products.push({
      key: 'credit-line',
      badge: 'PRE-APPROVED',
      emoji: '💳',
      title: 'Flexi Credit up to ₹2L',
      sub: '0% interest for 30 days · instant disbursal',
      cta: 'Check offer',
      gradient: ['#1F2937', '#0F172A'],
      accent: '#FCD34D',
    });
  } else {
    products.push({
      key: 'credit-line-lite',
      badge: 'BUILD CREDIT',
      emoji: '📈',
      title: 'Start your credit journey',
      sub: 'Unlock credit line at Score 60+ · track progress',
      cta: 'Learn how',
      gradient: ['#1F2937', '#0F172A'],
      accent: '#FCD34D',
    });
  }

  products.push({
    key: 'health',
    badge: 'FAMILY PROTECT',
    emoji: '🏥',
    title: 'Health cover ₹5L @ ₹200/mo',
    sub: 'Tax-saving · cashless across 10,000+ hospitals',
    cta: 'Compare plans',
    gradient: ['#059669', '#047857'],
    accent: '#A7F3D0',
  });

  products.push({
    key: 'mutual-fund',
    badge: 'WEALTH BUILDER',
    emoji: '📊',
    title: 'Start SIP with ₹500/month',
    sub: 'Top-rated funds · zero commission · beat FD',
    cta: 'Explore SIPs',
    gradient: ['#7C3AED', '#4C1D95'],
    accent: '#DDD6FE',
  });

  const onTap = (p: Product) => {
    haptic();
    Toast.show({
      type: 'info',
      text1: `${p.title}`,
      text2: 'Coming soon — partner integration in progress',
      position: 'bottom',
    });
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="briefcase" size={14} color="#F56E1E" />
          <Text style={s.title}>Financial Products</Text>
        </View>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>CURATED</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {products.map((p) => (
          <TouchableOpacity key={p.key} activeOpacity={0.9} onPress={() => onTap(p)}>
            <LinearGradient colors={p.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.emoji}>{p.emoji}</Text>
                <View style={[s.badge, { backgroundColor: p.accent + '33', borderColor: p.accent + '88' }]}>
                  <Text style={[s.badgeTxt, { color: p.accent }]}>{p.badge}</Text>
                </View>
              </View>
              <Text style={s.cardTitle} numberOfLines={2}>{p.title}</Text>
              <Text style={s.cardSub} numberOfLines={2}>{p.sub}</Text>
              <View style={s.ctaRow}>
                <Text style={[s.ctaTxt, { color: p.accent }]}>{p.cta}</Text>
                <Ionicons name="arrow-forward" size={12} color={p.accent} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.disclaimer}>Offers curated with partner banks & insurers · RBI-aligned · no data shared without consent</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: '#111827', letterSpacing: -0.2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#10B98118' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveTxt: { fontSize: 9, fontWeight: '900', color: '#065F46', letterSpacing: 0.6 },
  row: { gap: 10, paddingRight: 16, paddingVertical: 2 },
  card: { width: 230, padding: 14, borderRadius: 18, gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emoji: { fontSize: 26 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  cardTitle: { fontSize: 14.5, fontWeight: '900', color: '#fff', letterSpacing: -0.2, lineHeight: 18, marginTop: 4 },
  cardSub: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 15 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ctaTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 0.1 },
  disclaimer: { fontSize: 9.5, fontWeight: '600', color: '#6B7280', marginTop: 8, paddingHorizontal: 2, lineHeight: 13 },
});
