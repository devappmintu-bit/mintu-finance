/**
 * About MintU — App description screen.
 * Linked from the profile → "About MintU" menu row.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { StaggeredEntrance } from '../components/primitives';

export default function AboutScreen() {
  const s = useStyles();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>About MintU</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <StaggeredEntrance delayMs={70} duration={420} distance={14}>
        {/* Hero */}
        <View style={s.hero}>
          <Image
            source={require('../assets/images/mintu-logo.png')}
            style={s.logo}
          />
          <Text style={s.brand}>MintU</Text>
          <Text style={s.tagline}>Your daily money companion 💸</Text>
        </View>

        <Text style={s.para}>
          Track your expenses automatically, understand where your money goes, and get smart AI-powered insights to save more every month.
        </Text>

        <Text style={s.para}>No spreadsheets. No manual entry. Just clarity.</Text>

        <Text style={s.sect}>🔥 Features</Text>
        {[
          'Automatic expense tracking via SMS',
          'Daily Money Score (know how you’re doing)',
          'Smart insights like “You overspent on food this week”',
          'Budget alerts and saving tips',
          'Clean and simple dashboard',
        ].map((f) => (
          <View key={f} style={s.bulletRow}>
            <Text style={s.bullet}>•</Text>
            <Text style={s.bulletT}>{f}</Text>
          </View>
        ))}

        <Text style={s.sect}>🇮🇳 Built for India</Text>
        <Text style={s.para}>Works with UPI, bank SMS, and Indian spending habits.</Text>

        <Text style={s.sect}>💡 Why MintU?</Text>
        <Text style={s.para}>Because knowing where your money goes is the first step to growing it.</Text>

        <View style={s.cta}>
          <Text style={s.ctaT}>Start your journey to smarter money today 🚀</Text>
        </View>

        <Text style={s.ver}>v1.0.0</Text>
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'space-between' },
  back: { padding: 6, borderRadius: 0, backgroundColor: c.gray[100] },
  title: { fontSize: 18, fontWeight: '800', color: c.text.primary },
  body: { padding: 20, paddingBottom: 60 },
  hero: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 96, height: 96, borderRadius: 0 },
  brand: { marginTop: 10, fontSize: 24, fontWeight: '900', color: c.text.primary, letterSpacing: -0.5 },
  tagline: { marginTop: 4, fontSize: 14, fontWeight: '600', color: c.text.secondary },
  para: { fontSize: 14.5, lineHeight: 22, color: c.text.secondary, marginBottom: 14 },
  sect: { fontSize: 16, fontWeight: '800', color: c.text.primary, marginTop: 10, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 2 },
  bullet: { color: c.accent.primary, fontSize: 18, marginRight: 8, lineHeight: 20 },
  bulletT: { flex: 1, fontSize: 14, color: c.text.secondary, lineHeight: 20 },
  cta: {
    marginTop: 18, marginBottom: 16, padding: 18,
    backgroundColor: '#FFF0E3', borderRadius: 0, alignItems: 'center',
    borderWidth: 1, borderColor: c.border.subtle,
  },
  ctaT: { fontSize: 14.5, fontWeight: '700', color: c.accent.primary, textAlign: 'center' },
  ver: { textAlign: 'center', color: c.text.muted, fontSize: 12, marginTop: 12 },
}));
