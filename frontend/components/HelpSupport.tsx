/**
 * HelpSupport — Phase 3 Redesign: search-first + top 5 FAQs + AI chat CTA.
 * Replaces the heavy, scroll-heavy help screen with a focused, modern layout.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, SPACING } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

const FAQS = [
  { q: 'How does MintU track my expenses?', a: 'Paste bank SMS in the Scan SMS card — our AI extracts amount, merchant, and category automatically. You can also log manually or connect Gmail for auto-import.', tags: ['track', 'expense', 'sms', 'scan'] },
  { q: 'Is my financial data safe?', a: 'Yes. AES-256 at rest, TLS 1.3 in transit, RBI-aligned data practices, zero third-party sharing.', tags: ['safe', 'secure', 'privacy', 'encryption', 'rbi'] },
  { q: 'What is Money Score?', a: 'Your 0–100 financial health metric — blends spending ratio, savings rate, budget adherence, and bill habits. Higher = more rewards.', tags: ['score', 'rank', 'money'] },
  { q: 'How do UPI settlements work?', a: 'MintU opens your preferred UPI app (GPay, PhonePe, Paytm, BHIM) with amount pre-filled. You pay, both sides are settled instantly.', tags: ['upi', 'payment', 'split', 'settle'] },
  { q: 'Can I export my data?', a: 'Yes — Profile → Export Data gives you all transactions, budgets and insights as CSV. Your data, always.', tags: ['export', 'csv', 'data', 'download'] },
];

export default function HelpSupport({ onClose }: { onClose: () => void }) {
  const s = useStyles();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return FAQS;
    const needle = q.trim().toLowerCase();
    return FAQS.filter(f =>
      f.q.toLowerCase().includes(needle) ||
      f.a.toLowerCase().includes(needle) ||
      f.tags.some(t => t.includes(needle)),
    );
  }, [q]);

  const openAICoach = () => {
    try { router.push('/(tabs)/ai-coach' as any); onClose(); } catch {}
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Help</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Search bar — FIRST */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={COLORS.text.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search help (e.g. UPI, Money Score, safety)"
            placeholderTextColor={COLORS.text.muted}
            style={s.searchInput}
            autoCapitalize="none"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* AI Chat CTA */}
        <TouchableOpacity style={s.aiCard} onPress={openAICoach} activeOpacity={0.88}>
          <View style={s.aiIconBubble}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.aiTitle}>Ask AI Coach · instant answers</Text>
            <Text style={s.aiSub}>Specialised agents for budgets, splits, investments · 24/7</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={COLORS.accent.brandDark} />
        </TouchableOpacity>

        {/* FAQs */}
        <Text style={s.sectionLbl}>{q ? `Results (${filtered.length})` : 'Top Questions'}</Text>
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="search-outline" size={28} color={COLORS.text.muted} />
            <Text style={s.emptyT}>No matches</Text>
            <Text style={s.emptyS}>Try asking AI Coach — it knows everything about MintU.</Text>
            <TouchableOpacity style={s.emptyCTA} onPress={openAICoach} activeOpacity={0.85}>
              <Text style={s.emptyCTATxt}>Ask AI Coach</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((faq, i) => {
            const open = expanded === i;
            return (
              <TouchableOpacity key={i} style={[s.faqCard, open && s.faqCardOpen]} onPress={() => setExpanded(open ? null : i)} activeOpacity={0.85}>
                <View style={s.faqRow}>
                  <Text style={s.faqQ}>{faq.q}</Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.text.muted} />
                </View>
                {open && <Text style={s.faqA}>{faq.a}</Text>}
              </TouchableOpacity>
            );
          })
        )}

        {/* Contact shortcuts — condensed */}
        <Text style={s.sectionLbl}>Still stuck?</Text>
        <View style={s.contactRow}>
          <TouchableOpacity style={s.contactChip} activeOpacity={0.85} onPress={() => Linking.openURL('https://wa.me/919876543210?text=Hi%20MintU%20Support')}>
            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
            <Text style={s.contactTxt}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.contactChip} activeOpacity={0.85} onPress={() => Linking.openURL('mailto:support@mintu.app')}>
            <Ionicons name="mail" size={16} color={COLORS.accent.brandDark} />
            <Text style={s.contactTxt}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.contactChip} activeOpacity={0.85} onPress={() => Linking.openURL('mailto:bugs@mintu.app?subject=Bug%20Report')}>
            <Ionicons name="bug" size={16} color={COLORS.state.danger} />
            <Text style={s.contactTxt}>Report bug</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  title: { fontSize: 20, fontWeight: '900', color: c.text.primary, letterSpacing: -0.3 },
  scroll: { padding: SPACING.lg, gap: 14 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.bg.secondary, borderRadius: 0, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border.subtle },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: c.text.primary },

  aiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 0, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  aiIconBubble: { width: 40, height: 40, borderRadius: 0, backgroundColor: COLORS.accent.brandDark, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 14, fontWeight: '900', color: '#7A2E0A', letterSpacing: -0.2 },
  aiSub: { fontSize: 11.5, color: '#92400E', marginTop: 2, fontWeight: '600' },

  sectionLbl: { fontSize: 10.5, fontWeight: '900', color: c.text.muted, letterSpacing: 1, marginTop: 6, marginBottom: 2 },

  faqCard: { backgroundColor: c.bg.secondary, borderRadius: 0, padding: 14, borderWidth: 1, borderColor: c.border.subtle },
  faqCardOpen: { borderColor: c.accent.primary + '60' },
  faqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  faqQ: { flex: 1, fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  faqA: { fontSize: 12.5, color: c.text.secondary, marginTop: 8, lineHeight: 18, fontWeight: '500' },

  emptyCard: { alignItems: 'center', padding: 24, gap: 8, backgroundColor: c.bg.secondary, borderRadius: 0, borderWidth: 1, borderColor: c.border.subtle },
  emptyT: { fontSize: 14, fontWeight: '800', color: c.text.primary },
  emptyS: { fontSize: 12, color: c.text.secondary, textAlign: 'center', fontWeight: '500' },
  emptyCTA: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 0, backgroundColor: c.accent.primary },
  emptyCTATxt: { fontSize: 13, fontWeight: '800', color: '#fff' },

  contactRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  contactChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 0, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle, minWidth: 100 },
  contactTxt: { fontSize: 12, fontWeight: '800', color: c.text.primary },
}));
