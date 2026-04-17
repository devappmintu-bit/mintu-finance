import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

export default function AboutMintU({ onClose }: { onClose: () => void }) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>About MintU</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.logo}>\ud83d\udcb0</Text>
        <Text style={s.tagline}>MintU</Text>
        <Text style={s.subtitle}>AI-Powered Personal Finance for India</Text>
        <Text style={s.version}>Version 1.0.0 (Build 2025.06)</Text>

        <Text style={s.desc}>MintU is an intelligent personal finance assistant designed specifically for the Indian market. We combine cutting-edge AI with deep understanding of Indian financial habits, UPI ecosystems, and local spending patterns to help over 1.46 billion Indians take control of their money.</Text>

        <Text style={s.sectionTitle}>Our Mission</Text>
        <Text style={s.desc}>To make financial awareness and smart money management accessible to every Indian, regardless of their financial literacy level. We believe technology should simplify money, not complicate it.</Text>

        <Text style={s.sectionTitle}>What Makes MintU Special</Text>
        {[
          { emoji: '\ud83e\udde0', title: 'AI-First Approach', desc: 'Powered by GPT-5.2 with 5 specialized financial agents that understand Indian context — from chai budgets to SIP investments' },
          { emoji: '\ud83d\udcf1', title: 'SMS-Based Tracking', desc: 'Automatically parse bank SMS and UPI notifications. No manual entry needed — just paste and our AI does the rest' },
          { emoji: '\ud83c\udfaf', title: 'Smart Budgets', desc: 'AI-suggested budgets based on your actual spending patterns. Category-wise limits with real-time tracking and alerts' },
          { emoji: '\ud83d\udcb8', title: 'Splitwise-Style Splits', desc: 'Create groups, split expenses 4 ways (equal, custom, shares, percentage), settle via UPI, and earn gamified rewards' },
          { emoji: '\ud83d\udd25', title: 'Waste Detector', desc: 'AI compares your spending against peers and past months. Get shock-factor equivalences like "That\'s 50 cups of chai!"' },
          { emoji: '\ud83c\udfc6', title: 'Gamification', desc: 'Money Score (0-100), leaderboards, streaks, badges, settlement coins, and weekly challenges to make saving fun' },
          { emoji: '\ud83c\udf0d', title: 'Multi-Language', desc: 'Full support for Hindi, Tamil, Telugu, Kannada, Bengali, Marathi, Gujarati, Malayalam, Punjabi, and Odia' },
          { emoji: '\ud83d\udd12', title: 'Privacy First', desc: 'Bank-grade encryption, no data selling, RBI-compliant. Your finances are your business — we just help you manage them' },
        ].map((f, i) => (
          <View key={i} style={s.featureRow}>
            <Text style={s.featureEmoji}>{f.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.featureTitle}>{f.title}</Text>
              <Text style={s.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}

        <Text style={s.sectionTitle}>Technology</Text>
        <View style={s.techCard}>
          {[
            { label: 'AI Engine', value: 'OpenAI GPT-5.2' },
            { label: 'Frontend', value: 'React Native (Expo)' },
            { label: 'Backend', value: 'FastAPI + MongoDB' },
            { label: 'Languages', value: '10 Indian languages' },
            { label: 'Split Types', value: 'Equal, Custom, Shares, %' },
            { label: 'Payments', value: 'UPI Deep Linking' },
          ].map((t, i) => (
            <View key={i} style={s.techRow}>
              <Text style={s.techLabel}>{t.label}</Text>
              <Text style={s.techValue}>{t.value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Legal</Text>
        <TouchableOpacity style={s.legalRow} onPress={() => Linking.openURL('https://mintu.app/privacy')}>
          <Ionicons name="shield-checkmark" size={18} color={COLORS.accent.primary} />
          <Text style={s.legalText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.legalRow} onPress={() => Linking.openURL('https://mintu.app/terms')}>
          <Ionicons name="document-text" size={18} color={COLORS.accent.primary} />
          <Text style={s.legalText}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.legalRow} onPress={() => Linking.openURL('https://mintu.app/data-policy')}>
          <Ionicons name="lock-closed" size={18} color={COLORS.accent.primary} />
          <Text style={s.legalText}>Data Protection Policy</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>

        <Text style={s.footer}>Made with \u2764\ufe0f in India for 1.46 billion Indians</Text>
        <Text style={s.footerSub}>\u00a9 2025 MintU Technologies Pvt. Ltd.</Text>
        <Text style={s.footerSub}>All rights reserved.</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  scroll: { padding: 20, alignItems: 'center' },
  logo: { fontSize: 56, marginBottom: 8 },
  tagline: { fontSize: 28, fontWeight: '900', color: COLORS.text.primary },
  subtitle: { fontSize: 14, color: COLORS.text.secondary, marginTop: 4 },
  version: { fontSize: 12, color: COLORS.text.muted, marginTop: 6, marginBottom: 20 },
  desc: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 22, textAlign: 'left', width: '100%', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary, marginTop: 20, marginBottom: 12, alignSelf: 'flex-start' },
  featureRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14, width: '100%' },
  featureEmoji: { fontSize: 22, marginTop: 2 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  featureDesc: { fontSize: 12, color: COLORS.text.muted, lineHeight: 18, marginTop: 2 },
  techCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, width: '100%', borderWidth: 1, borderColor: COLORS.border.card },
  techRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  techLabel: { fontSize: 13, color: COLORS.text.muted },
  techValue: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 6, width: '100%', borderWidth: 1, borderColor: COLORS.border.card },
  legalText: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary },
  footer: { fontSize: 13, fontWeight: '600', color: COLORS.text.secondary, marginTop: 28, textAlign: 'center' },
  footerSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 4, textAlign: 'center' },
});
