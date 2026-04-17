import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

const FAQS = [
  { q: 'How does MintU track my expenses?', a: 'MintU uses AI to parse your bank SMS messages and notifications. Simply paste your bank alerts in the Scan SMS section, and our AI will automatically extract the amount, category, and merchant. You can also add expenses manually or use voice input.' },
  { q: 'Is my financial data safe?', a: 'Absolutely. MintU uses industry-standard encryption (AES-256) for all data at rest and TLS 1.3 for data in transit. Your financial data is stored securely on encrypted servers and is never sold to third parties. We comply with RBI data protection guidelines.' },
  { q: 'How does the AI Coach work?', a: 'Our AI Coach is powered by GPT-5.2 with 5 specialized agents: Insights Agent (spending analysis), Budget Agent (budget management), Split Agent (group expenses), Investment Agent (SIP/mutual fund advice), and a General Agent. Each understands Indian financial context.' },
  { q: 'How are split expenses calculated?', a: 'MintU supports 4 split types: Equal (divide equally), Custom Amount (set specific amounts per person), Shares (proportional sharing), and Percentage (percentage-based). All calculations are verified for accuracy before saving.' },
  { q: 'What is Money Score?', a: 'Money Score (0-100) is a proprietary metric that evaluates your financial health based on: spending vs. income ratio, budget adherence, savings rate, expense diversity, and bill payment patterns. Higher scores unlock rewards and badges.' },
  { q: 'How do UPI settlements work?', a: 'When settling split expenses, MintU generates a UPI payment intent that opens your preferred UPI app (Google Pay, PhonePe, Paytm, BHIM) with the exact amount pre-filled. After payment, you earn settlement coins and rewards.' },
  { q: 'Can I export my data?', a: 'Yes! Go to Profile > Settings > Export Data. You can download all your transactions, budgets, and insights as a CSV file. We believe you own your data completely.' },
  { q: 'Does MintU work offline?', a: 'Basic features like viewing cached transactions and budgets work offline. AI features, split calculations, and real-time sync require an internet connection.' },
];

export default function HelpSupport({ onClose }: { onClose: () => void }) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Help & Support</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <Text style={s.section}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { icon: 'mail', color: '#6366F1', label: 'Email Us', action: () => Linking.openURL('mailto:support@mintu.app?subject=MintU%20Support%20Request') },
            { icon: 'chatbubbles', color: '#10B981', label: 'Live Chat', action: () => Linking.openURL('https://wa.me/919876543210?text=Hi%20MintU%20Support') },
            { icon: 'bug', color: '#EF4444', label: 'Report Bug', action: () => Linking.openURL('mailto:bugs@mintu.app?subject=Bug%20Report%20-%20MintU') },
            { icon: 'star', color: '#F59E0B', label: 'Rate App', action: () => {} },
          ].map((a, i) => (
            <TouchableOpacity key={i} style={s.actionCard} onPress={a.action}>
              <View style={[s.actionIcon, { backgroundColor: a.color + '12' }]}><Ionicons name={a.icon as any} size={22} color={a.color} /></View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Info */}
        <Text style={s.section}>Contact Us</Text>
        <View style={s.contactCard}>
          {[
            { icon: 'mail-outline', text: 'support@mintu.app', sub: 'General support — responds within 24hrs' },
            { icon: 'logo-whatsapp', text: '+91 98765 43210', sub: 'WhatsApp — Mon-Sat, 9am-6pm IST' },
            { icon: 'globe-outline', text: 'help.mintu.app', sub: 'Knowledge base & tutorials' },
            { icon: 'logo-twitter', text: '@MintUApp', sub: 'Follow for updates & tips' },
          ].map((c, i) => (
            <View key={i} style={s.contactRow}>
              <Ionicons name={c.icon as any} size={18} color={COLORS.accent.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.contactText}>{c.text}</Text>
                <Text style={s.contactSub}>{c.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* FAQs */}
        <Text style={s.section}>Frequently Asked Questions</Text>
        {FAQS.map((faq, i) => (
          <View key={i} style={s.faqCard}>
            <Text style={s.faqQ}>{faq.q}</Text>
            <Text style={s.faqA}>{faq.a}</Text>
          </View>
        ))}

        {/* Getting Started */}
        <Text style={s.section}>Getting Started</Text>
        <View style={s.stepsCard}>
          {[
            { step: '1', title: 'Sign Up', desc: 'Enter your phone number and verify with OTP' },
            { step: '2', title: 'Add Expenses', desc: 'Paste bank SMS, use voice input, or add manually' },
            { step: '3', title: 'Set Budgets', desc: 'Create category budgets or let AI suggest them' },
            { step: '4', title: 'Track & Save', desc: 'Monitor spending, get AI insights, improve your Money Score' },
            { step: '5', title: 'Split Bills', desc: 'Create groups, split expenses, settle via UPI' },
          ].map((s2, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepBadge}><Text style={s.stepNum}>{s2.step}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{s2.title}</Text>
                <Text style={s.stepDesc}>{s2.desc}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  scroll: { padding: 20 },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginTop: 16, marginBottom: 10 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: { width: '47%', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.border.card, flexGrow: 1 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text.primary },
  contactCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, borderWidth: 1, borderColor: COLORS.border.card },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  contactText: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  contactSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  faqCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border.card },
  faqQ: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary, marginBottom: 6 },
  faqA: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 20 },
  stepsCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, borderWidth: 1, borderColor: COLORS.border.card },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  stepBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center' },
  stepNum: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stepTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  stepDesc: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
});
