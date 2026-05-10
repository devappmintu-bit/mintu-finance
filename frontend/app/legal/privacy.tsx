/**
 * app/legal/privacy.tsx — Privacy Policy
 *
 * Static, in-app privacy policy required for App Store / Play Store
 * submission (and an explicit user trust signal in the master prompt's
 * "Real-Time SMS Financial Intelligence" pitch — users will share
 * sensitive transaction data with us, so they need to be able to read
 * what we do with it from inside the app).
 *
 * The copy is deterministic, plain-English, and mirrors how the app
 * actually behaves today:
 *   • SMS / Gmail content is parsed on-device or transient on server
 *   • Only structured transaction fields are persisted
 *   • Mood / behaviour / cashflow / story signals are computed
 *     deterministically — no LLM rewrites a number
 *   • Data never sold or shared with third-party advertisers
 *   • One-tap data export + delete
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';

const LAST_UPDATED = 'May 9, 2026';
const SUPPORT_EMAIL = 'privacy@mintu.app';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>LEGAL</Text>
          <Text style={styles.title}>Privacy Policy</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Last updated · {LAST_UPDATED}</Text>

        <Section title="The short version">
          <P>
            MintU runs on your phone and on a backend we control. Sensitive
            content like SMS messages and Gmail receipts is parsed for
            structured fields (amount, merchant, category, date) and the
            raw text is not persisted. Numbers you see on the home,
            insights, and money story screens are all computed
            deterministically from your own activity — no language model
            rewrites a single number. We do not sell your data. You can
            export or delete everything in one tap from Profile → Privacy.
          </P>
        </Section>

        <Section title="What we collect">
          <Bullet>Phone number for sign-in and OTP delivery.</Bullet>
          <Bullet>
            Transactions you add manually, paste from SMS, import from
            Gmail receipts, or commit through coach actions. Stored
            fields: amount, type (credit/debit), category, description,
            merchant, date.
          </Bullet>
          <Bullet>
            App preferences and configuration (e.g. budget targets, goal
            tracking, calm-mode toggle).
          </Bullet>
          <Bullet>
            Anonymous usage and crash telemetry to keep the app stable.
            No precise location, no advertising IDs.
          </Bullet>
        </Section>

        <Section title="What we do NOT collect">
          <Bullet>
            Raw SMS bodies. We parse, extract structured fields, and
            discard the text.
          </Bullet>
          <Bullet>
            Email bodies beyond receipt parsing. Gmail OAuth scope is
            limited to receipt-shaped messages; nothing else is stored.
          </Bullet>
          <Bullet>Contact lists, photos, calendar, browsing history.</Bullet>
          <Bullet>
            Bank credentials. MintU never asks for or stores your bank
            password or PIN.
          </Bullet>
        </Section>

        <Section title="How AI is used (and how it is NOT)">
          <P>
            The R118 Intelligence Engine — Money Mood Score, AI Money
            Story, Behaviour Patterns, Predictive Cash Flow, Subscription
            Vault — is fully deterministic. Every number on those
            surfaces is computed from your own transaction graph using
            transparent algorithms. No language model is in the math.
          </P>
          <P>
            The AI Coach feature uses a large language model purely for
            free-form conversation framing — it is shown what we
            already computed, never asked to invent numbers.
          </P>
        </Section>

        <Section title="Sharing">
          <P>
            We do not sell your data and we do not share it with
            advertising networks. We share only with strict-purpose
            sub-processors required to run the app:
          </P>
          <Bullet>Cloud hosting (compute + database).</Bullet>
          <Bullet>SMS gateway for OTP delivery.</Bullet>
          <Bullet>Crash + analytics tooling (anonymous identifiers).</Bullet>
          <P>
            All sub-processors are bound by data processing agreements.
          </P>
        </Section>

        <Section title="Your controls">
          <Bullet>
            Export · Profile → Privacy → Export My Data downloads a JSON
            of every record we hold for you.
          </Bullet>
          <Bullet>
            Delete · Profile → Privacy → Delete Account removes your
            entire account and derived data within 30 days. There is no
            soft-delete shadow.
          </Bullet>
          <Bullet>
            Disconnect Gmail · Profile → Integrations → Gmail → Revoke
            stops all future imports immediately.
          </Bullet>
        </Section>

        <Section title="Security">
          <P>
            All traffic is TLS 1.2+ in transit. Backend storage is
            encrypted at rest. Authentication uses short-lived JWTs. PIN
            and Face ID gate sensitive screens.
          </P>
        </Section>

        <Section title="Children">
          <P>
            MintU is not directed at users under 13. We do not knowingly
            collect data from children.
          </P>
        </Section>

        <Section title="Changes to this policy">
          <P>
            If we change anything material, we will notify you via the
            app the next time you open it, and the &quot;Last updated&quot; date
            above will move forward. Your continued use after a change
            means you accept the new version.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions, requests, or concerns: <Bold>{SUPPORT_EMAIL}</Bold>
          </P>
        </Section>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── tiny reusable atoms ─────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}
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
  bullet: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  bulletDot: {
    fontSize: 16,
    color: BR_COLORS.ink,
    fontWeight: '900',
    lineHeight: 19,
  },
  bulletTxt: {
    flex: 1,
    fontSize: 13,
    color: BR_COLORS.ink,
    fontWeight: '500',
    lineHeight: 19,
  },
});
