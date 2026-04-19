import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';

const FEATURES = [
  { icon: 'infinite', text: 'Unlimited AI Coach conversations' },
  { icon: 'flash', text: 'Priority GPT-5.2 responses (no queue)' },
  { icon: 'bar-chart', text: 'Advanced analytics & custom reports' },
  { icon: 'trophy', text: 'Exclusive badges & leaderboard perks' },
  { icon: 'close-circle', text: 'Zero ads, ever' },
];

interface Props {
  onExplore: () => void;
}

export default function PremiumExpandable({ onExplore }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
        <View style={s.iconBox}><Ionicons name="diamond" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>MintU Premium</Text>
          <Text style={s.sub}>Unlock unlimited AI, reports & ad-free</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      {expanded && (
        <View style={s.body}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <View style={s.check}><Ionicons name="checkmark" size={12} color="#fff" /></View>
              <Ionicons name={f.icon as any} size={16} color="#F59E0B" />
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
          <View style={s.priceRow}>
            <View>
              <Text style={s.priceStrike}>₹999/yr</Text>
              <Text style={s.price}>₹499/yr</Text>
            </View>
            <TouchableOpacity style={s.cta} onPress={onExplore}>
              <Text style={s.ctaText}>Explore →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#0F172A', borderRadius: 20, marginBottom: 14, borderWidth: 1, borderColor: '#F59E0B40', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  iconBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  featureText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  priceStrike: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textDecorationLine: 'line-through' },
  price: { fontSize: 22, fontWeight: '800', color: '#fff' },
  cta: { backgroundColor: '#F59E0B', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  ctaText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
});
