/**
 * app/legal/terms.tsx — Terms of Service
 *
 * Plain-English ToS. Mirrors how the app actually behaves and what
 * we can and can't promise. Required for App Store / Play Store
 * submission and for the user trust signal on a personal-finance app.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';

const LAST_UPDATED = 'May 9, 2026';
const SUPPORT_EMAIL = 'support@mintu.app';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>LEGAL</Text>
          <Text style={styles.title}>Terms of Service</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Last updated · {LAST_UPDATED}</Text>

        <Section title="Welcome">
          <P>
            By using MintU you agree to these terms. If you don&apos;t
            agree, please don&apos;t use the app. Plain English here, no
            walls of legalese.
          </P>
        </Section>

        <Section title="What MintU is — and isn't">
          <P>
            MintU is a personal-finance companion that reads your own
            transaction data (manual entry, SMS, Gmail receipts) and
            shows you patterns, projections, and gentle nudges.
          </P>
          <Bullet>
            MintU is <Bold>not</Bold> a bank, broker, lender, or
            licensed financial advisor.
          </Bullet>
          <Bullet>
            Numbers shown are projections from your past activity, not
            guarantees about your future.
          </Bullet>
          <Bullet>
            Advice surfaces (AI Coach, behaviour patterns) are general
            information, not personalised financial advice. Consult a
            licensed professional for material decisions.
          </Bullet>
        </Section>

        <Section title="Your account">
          <Bullet>You sign in with your phone number and an OTP.</Bullet>
          <Bullet>
            Keep your device secure. We assume any action on a logged-in
            device is yours.
          </Bullet>
          <Bullet>
            One human, one account. Don&apos;t create multiple accounts to
            game features.
          </Bullet>
          <Bullet>You must be 13 or older to use MintU.</Bullet>
        </Section>

        <Section title="Acceptable use">
          <P>You agree not to:</P>
          <Bullet>
            Reverse-engineer, scrape, or abuse the app or its APIs.
          </Bullet>
          <Bullet>
            Upload content that violates the law or another person&apos;s
            rights.
          </Bullet>
          <Bullet>
            Use MintU to launder funds, evade taxes, or commit fraud.
          </Bullet>
          <Bullet>
            Share your account with others.
          </Bullet>
        </Section>

        <Section title="Intellectual property">
          <P>
            The app, brand, copy, designs, and algorithms are owned by
            MintU. Your data is yours. We hold a limited licence to
            process it strictly to run the features you ask for.
          </P>
        </Section>

        <Section title="No warranty">
          <P>
            MintU is provided <Bold>as is</Bold>. We work hard to keep
            it accurate and reliable but we do not warrant that it will
            be error-free, uninterrupted, or fit for any specific
            financial decision you make. Use the numbers as one input,
            not the only input.
          </P>
        </Section>

        <Section title="Limitation of liability">
          <P>
            To the maximum extent permitted by law, MintU is not liable
            for indirect, incidental, or consequential damages arising
            from your use of the app. Our total liability for any
            claim is limited to the amount you paid us in the 12 months
            preceding the claim (currently zero for free-tier users).
          </P>
        </Section>

        <Section title="Changes">
          <P>
            We may update these terms. If a change is material we&apos;ll
            tell you in-app the next time you open MintU. Your continued
            use after a change means you accept the new version.
          </P>
        </Section>

        <Section title="Termination">
          <P>
            You can delete your account anytime from
            Profile → Privacy → Delete Account. We may suspend accounts
            that violate these terms.
          </P>
        </Section>

        <Section title="Governing law">
          <P>
            These terms are governed by the laws of India. Any dispute
            will be heard in courts of competent jurisdiction in
            Bengaluru, India.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions: <Bold>{SUPPORT_EMAIL}</Bold>
          </P>
        </Section>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
function P({ children }: { children: React.ReactNode }) { return <Text style={styles.p}>{children}</Text>; }
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletTxt}>{children}</Text>
    </View>
  );
}
function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: '900' }}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.paper },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: BR_COLORS.line,
    gap: BR_SPACE.md,
  },
  backBtn: {
    width: 32, height: 32,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { ...BR_TYPE.label, fontSize: 9, letterSpacing: 1.6, color: BR_COLORS.muted },
  title: { fontSize: 20, fontWeight: '900', color: BR_COLORS.ink, letterSpacing: -0.4 },
  scroll: { padding: BR_SPACE.lg, paddingTop: BR_SPACE.md },
  updated: {
    fontSize: 11, color: BR_COLORS.muted, fontWeight: '700',
    fontStyle: 'italic',
    marginBottom: BR_SPACE.lg,
  },
  section: {
    marginBottom: BR_SPACE.xl,
    borderLeftWidth: BR_BORDER.bold,
    borderLeftColor: BR_COLORS.ink,
    paddingLeft: BR_SPACE.md,
  },
  sectionTitle: {
    ...BR_TYPE.label,
    color: BR_COLORS.ink,
    letterSpacing: 1.8,
    fontSize: 12,
    marginBottom: BR_SPACE.sm,
  },
  p: {
    fontSize: 13,
    color: BR_COLORS.ink,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 8,
  },
  bullet: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  bulletDot: {
    fontSize: 16, color: BR_COLORS.ink, fontWeight: '900', lineHeight: 19,
  },
  bulletTxt: {
    flex: 1, fontSize: 13, color: BR_COLORS.ink, fontWeight: '500', lineHeight: 19,
  },
});
