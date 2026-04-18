/**
 * MintU — Legal Pages (dynamic route)
 * Routes: /legal/privacy · /legal/terms · /legal/data-protection
 * Full long-form legal content for Indian fintech compliance.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, shadowStyle } from '../../utils/theme';

type Section = { heading: string; body: string };
type LegalDoc = { title: string; emoji: string; lastUpdated: string; intro: string; sections: Section[] };

const EFFECTIVE = 'April 2026';

const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    emoji: '🔒',
    lastUpdated: EFFECTIVE,
    intro: 'MintU ("we", "our", "us") is committed to protecting your privacy and complying with the Indian IT Act 2000, RBI data localization norms, and globally-recognized GDPR principles. This policy explains what data we collect, how we use it, and the rights you have over it.',
    sections: [
      { heading: '1. Data We Collect', body: 'With your explicit consent, we collect: (a) basic profile data — name, phone number, optional email, profile photo; (b) financial data you log manually or let us parse from SMS — transaction amounts, categories, merchant names, dates; (c) optional UPI handle for settlement links; (d) usage analytics — screens visited, features used, crash reports. We DO NOT collect your bank passwords, OTPs, or raw bank account numbers.' },
      { heading: '2. How We Use Your Data', body: 'Your data powers: (a) expense tracking and budget alerts; (b) AI-generated insights, predictions, and nudges via on-device and server-side models; (c) aggregated anonymised benchmarking (e.g., "You save more than 68% of users") — only aggregate statistics, never individual-level sharing; (d) product improvements via crash and usage analytics.' },
      { heading: '3. SMS Parsing', body: 'If you grant SMS permission, MintU parses bank transaction alerts on-device to extract transaction data. The parsed data is synced to our India-based servers for your analytics. Raw SMS bodies are NOT stored, transmitted, or shared. You can revoke SMS permission at any time via your phone settings, and the app continues to work with manual entry.' },
      { heading: '4. No Data Selling Clause', body: 'MintU will never sell, rent, or trade your personal financial data to advertisers, data brokers, or any third party. Your financial information is yours. We monetize only via (a) optional premium subscriptions and (b) transparent affiliate referrals where you explicitly opt in.' },
      { heading: '5. Your Rights (GDPR + IT Act 2000)', body: 'You have the right to: (a) access all data we hold about you; (b) correct or update inaccurate information; (c) export your data in a portable JSON/CSV format; (d) delete your account and all associated data within 30 days of request; (e) withdraw any consent at any time. Email privacy@mintu.app for any request.' },
      { heading: '6. Data Storage & Localization', body: 'All personal and financial data is stored on encrypted servers physically located in India, aligned with RBI Master Direction on data localization. Backups are encrypted at rest (AES-256) and never leave Indian jurisdiction. No cross-border data transfer takes place.' },
      { heading: '7. Data Retention', body: 'Active account data is retained until you delete your account. Deleted accounts are purged within 30 days from primary systems and 90 days from encrypted backups. Anonymized aggregate analytics may be retained indefinitely.' },
      { heading: '8. Third-party Services', body: 'We use: (a) OpenAI GPT-5.2 for AI coach — only structured, non-PII prompts are sent; no raw transaction descriptions are retained by OpenAI under zero-retention API contracts; (b) Razorpay/UPI gateways for settlements — your UPI handle only; (c) crash analytics — anonymized device info only.' },
      { heading: '9. Children', body: 'MintU is not directed at users under 18. If you believe a minor has registered, email us to initiate deletion.' },
      { heading: '10. Changes & Contact', body: 'Material changes to this policy are communicated via in-app notification and email at least 7 days in advance. Questions? Email privacy@mintu.app or write to MintU India Pvt Ltd, Bangalore, India.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    emoji: '📜',
    lastUpdated: EFFECTIVE,
    intro: 'By using MintU, you agree to the following terms. Please read carefully — these terms govern your use of our mobile app, website, and associated services.',
    sections: [
      { heading: '1. Eligibility & Account', body: 'You must be at least 18 years old and a resident of India to use MintU. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. Notify us immediately of any unauthorized access.' },
      { heading: '2. Financial Disclaimer — NOT A FINANCIAL ADVISOR', body: 'MintU is a personal finance TRACKING and INFORMATION tool. We are NOT a SEBI-registered investment advisor, financial planner, or tax consultant. Insights, tax estimates, investment suggestions, and AI recommendations are educational in nature and do not constitute professional advice. Consult a certified financial planner, chartered accountant, or SEBI-registered advisor before making financial decisions.' },
      { heading: '3. AI Coach Limitations', body: 'The AI Coach uses large language models that may occasionally produce inaccurate, outdated, or incomplete information. Always verify critical numbers (tax calculations, investment returns, settlement amounts) with official sources. AI responses are grounded in your logged data — they do not predict markets or guarantee outcomes.' },
      { heading: '4. User Responsibilities', body: 'You agree to: (a) provide accurate information; (b) not use MintU for fraudulent, illegal, or unauthorized purposes; (c) not attempt to reverse-engineer, scrape, or resell our services; (d) be responsible for verifying all transactions, settlements, and tax calculations before acting on them.' },
      { heading: '5. Subscription & Billing', body: 'Premium plans are billed monthly (₹99) or annually (₹899). Subscriptions auto-renew unless cancelled at least 24 hours before renewal. Refunds are governed by Play Store / App Store policies for in-app purchases. We reserve the right to change pricing with 30-day notice.' },
      { heading: '6. Intellectual Property', body: 'All app content (design, logos, code, AI prompts) is owned by MintU India Pvt Ltd. You are granted a limited, non-exclusive, non-transferable license to use the app for personal purposes only.' },
      { heading: '7. Liability Limitations', body: 'To the extent permitted by law, MintU\'s total liability for any claim arising out of your use of the service is limited to the amount you paid us in the 12 months preceding the claim. We are not liable for indirect, consequential, or punitive damages, including loss of profits or data beyond our reasonable control.' },
      { heading: '8. Termination', body: 'You may close your account at any time from the Profile settings. We may suspend or terminate accounts for violations of these terms, fraudulent activity, or as required by law. On termination, your data is deleted per the Privacy Policy.' },
      { heading: '9. Governing Law', body: 'These terms are governed by the laws of India. Any disputes will be resolved exclusively in the courts of Bangalore, Karnataka.' },
      { heading: '10. Contact', body: 'For legal queries: legal@mintu.app. For general support: support@mintu.app.' },
    ],
  },
  'data-protection': {
    title: 'Data Protection Policy',
    emoji: '🛡️',
    lastUpdated: EFFECTIVE,
    intro: 'MintU applies bank-grade security controls aligned with Indian Digital Personal Data Protection Act (DPDPA), IT Act 2000, and RBI technology guidelines. This document details the technical safeguards protecting your data.',
    sections: [
      { heading: '1. Encryption', body: 'Data in transit is protected via TLS 1.3 between the app and our servers — no legacy SSL/TLS 1.0/1.1 supported. Data at rest on MongoDB servers uses AES-256 encryption with keys managed through AWS KMS (India region). Database backups are encrypted with separate keys and stored in India-only S3 buckets.' },
      { heading: '2. Authentication', body: 'Login uses either OTP (6-digit, 5-minute TTL) or bcrypt-hashed passwords (cost factor 12). Session tokens are signed JWTs with a 7-day expiry, refreshed on each active session. Optional biometric lock (fingerprint / face ID) is enforced on mobile devices.' },
      { heading: '3. Access Control (RBAC)', body: 'Internally, only specific engineering roles have production database access, always via short-lived audit-logged SSO sessions. No MintU employee can read your individual transactions without your explicit support consent. Audit logs are retained for 2 years per RBI requirements.' },
      { heading: '4. API Rate Limiting', body: 'Per-user and per-IP rate limits prevent abuse: 60 req/min for read endpoints, 20 req/min for writes, 5 req/min for auth endpoints. Anomalies trigger automatic soft-lockouts and security alerts.' },
      { heading: '5. Data Retention & Deletion', body: 'Active account data is retained indefinitely while your account is active. On account deletion: primary systems purge within 30 days, encrypted backups within 90 days. Legally-required retention (e.g., for fraud-prevention or tax-related queries) follows Indian statute minimums. Anonymized aggregate analytics may be retained indefinitely.' },
      { heading: '6. Breach Handling', body: 'In the unlikely event of a security breach: (a) we notify the Indian Computer Emergency Response Team (CERT-In) within 6 hours per the CERT-In 2022 directions; (b) affected users are notified within 72 hours via email and in-app banner; (c) incident reports and remediation steps are published transparently.' },
      { heading: '7. Vulnerability Disclosure', body: 'We welcome responsible disclosure of security issues. Email security@mintu.app with technical details. We respond within 48 hours and publicly credit contributors (with consent) in our hall of fame.' },
      { heading: '8. Compliance Audits', body: 'We undergo annual VAPT (Vulnerability Assessment & Penetration Testing) audits by certified Indian security firms. ISO 27001 certification is targeted for FY 2026-27.' },
      { heading: '9. India Data Localization', body: 'Per RBI Master Direction on data localization (April 2018), all personal and financial data of Indian users is stored exclusively on servers located within Indian territory. No mirror or backup copies exist outside India.' },
      { heading: '10. Contact', body: 'For security concerns or data protection queries: security@mintu.app · privacy@mintu.app.' },
    ],
  },
};

export default function LegalPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const key = String(page || 'privacy').toLowerCase();
  const doc = DOCS[key] || DOCS.privacy;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{doc.title}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.heroEmoji}>{doc.emoji}</Text>
          <Text style={s.heroTitle}>{doc.title}</Text>
          <Text style={s.heroDate}>Last updated · {doc.lastUpdated}</Text>
        </View>

        <Text style={s.intro}>{doc.intro}</Text>

        {doc.sections.map((sec, i) => (
          <View key={i} style={s.section}>
            <Text style={s.sectionTitle}>{sec.heading}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={s.footer}>
          <Ionicons name="shield-checkmark" size={14} color="#10B981" />
          <Text style={s.footerText}>
            Aligned with RBI data localization · DPDPA 2023 · IT Act 2000 · GDPR principles
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' },
  scroll: { padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 14, ...shadowStyle('#2E1F1A', 2, 10, 0.05, 2) },
  heroEmoji: { fontSize: 38, marginBottom: 6 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text.primary },
  heroDate: { fontSize: 11, fontWeight: '600', color: COLORS.text.muted, marginTop: 4, letterSpacing: 0.3 },
  intro: { fontSize: 14, color: COLORS.text.secondary, lineHeight: 22, marginBottom: 16, fontWeight: '500' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#8B5CF6', marginBottom: 6 },
  sectionBody: { fontSize: 13, color: COLORS.text.primary, lineHeight: 20, fontWeight: '500' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, padding: 12, backgroundColor: '#10B98110', borderRadius: 10, borderWidth: 1, borderColor: '#10B98125' },
  footerText: { flex: 1, fontSize: 11, color: '#059669', fontWeight: '700', lineHeight: 15 },
});
