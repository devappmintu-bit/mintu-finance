/**
 * app/landing.tsx — Public marketing landing page.
 *
 * Goals:
 *   1. Tell a brutalist-clean version of MintU's pitch in <30 seconds
 *   2. Drive a single conversion: join the App Store beta waitlist
 *   3. Reuse the existing brand system (BR_COLORS / BR_TYPE / BR_BORDER)
 *      so the page lives inside the app shell without theme drift
 *
 * Sections (top → bottom):
 *   • HERO        — Mascot, headline, sub, primary CTA
 *   • PROOF       — "Join {N}+ founders waiting" social-proof counter
 *   • FEATURES    — 6 brutalist cards (Subscriptions Vault, AI Coach,
 *                   Mood Score, Money Story, Smart Split, Pulse)
 *   • HOW IT WORKS — 3-step flow with mono numbers
 *   • TRUST       — On-device parsing, no LLM rewrites, deterministic
 *   • CTA         — Final email capture
 *   • FOOTER      — Privacy, Terms, Contact
 *
 * Backend: POST /api/beta/waitlist (email, optional platform_pref)
 *          GET  /api/beta/stats (display counter)
 *
 * Routing:
 *   /landing is a root-level public route — no auth required, no
 *   tabs, no bottom nav. Users hitting / -> /landing if they don't
 *   have a session yet (handled by app/_layout.tsx redirect logic
 *   if the team chooses to enable; default app/index.tsx routes go
 *   through /onboarding which already exists).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Linking, Image, ActivityIndicator, Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT, BR_STAMP,
} from '../utils/brutalist';
import api from '../utils/api';

// ─────────────────────────────────────────────────────────────────────
// Static content (copy lives here so it's editable in one place).
// ─────────────────────────────────────────────────────────────────────

const TAGLINE = 'Money,\nsimplified.';
const SUBTAGLINE =
  'Real-time SMS intelligence. Mood, behaviour, and predictive cash flow — without spreadsheets, without an LLM rewriting your numbers.';

const FEATURES: Array<{
  num: string;
  title: string;
  body: string;
  emoji: string;
}> = [
  {
    num: '01',
    emoji: '💎',
    title: 'Subscription Vault',
    body: 'Auto-detects every recurring charge from SMS. One screen, every drain, ready to cancel.',
  },
  {
    num: '02',
    emoji: '✨',
    title: 'AI Money Coach',
    body: 'Grounded answers, with sources. No hallucinations on your own balance.',
  },
  {
    num: '03',
    emoji: '🌡️',
    title: 'Mood Score',
    body: 'A single 0–100 read on your month. Calm vs stressed, computed deterministically.',
  },
  {
    num: '04',
    emoji: '📖',
    title: 'AI Money Story',
    body: 'Five panels of last month — what happened, why, what to keep doing.',
  },
  {
    num: '05',
    emoji: '👥',
    title: 'Smart Split',
    body: 'Settle group expenses without spreadsheets. Friends do not need an account.',
  },
  {
    num: '06',
    emoji: '📡',
    title: 'Money Pulse',
    body: 'A swipeable feed of money news that actually changes your decisions.',
  },
];

const STEPS: Array<{ num: string; title: string; body: string }> = [
  {
    num: '01',
    title: 'Connect',
    body: 'Grant SMS or Gmail access. Parsing is on-device or transient on server.',
  },
  {
    num: '02',
    title: 'Watch it work',
    body: 'Every UPI, salary, EMI, and subscription gets categorised in real time.',
  },
  {
    num: '03',
    title: 'Act on insights',
    body: 'Mood Score, Behaviour Patterns, Predictive Cash Flow — every screen, ready to act.',
  },
];

const TRUST_BULLETS = [
  'No LLM rewrites a single number on your screen.',
  'Bank SMS parsing happens on your device. Server only sees structured fields.',
  'One-tap data export. One-tap delete. Always.',
  'Never sold. Never shared with advertisers.',
];

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export default function LandingScreen() {
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'either'>('either');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ position: number; already: boolean } | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  // ── Live waitlist counter for social proof
  useEffect(() => {
    let alive = true;
    api.get('/beta/stats')
      .then(r => { if (alive && typeof r?.data?.total === 'number') setWaitlistCount(r.data.total); })
      .catch(() => { /* keep null → omit counter */ });
    return () => { alive = false; };
  }, []);

  const validEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email],
  );

  const onSubmit = async () => {
    if (!validEmail || submitting) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const r = await api.post('/beta/waitlist', {
        email: email.trim(),
        platform_pref: platform,
      });
      setSubmitted({
        position: Number(r?.data?.position || 0),
        already: !!r?.data?.already_joined,
      });
      // Optimistically bump local counter so the social-proof number
      // updates without another roundtrip.
      setWaitlistCount(c => (c == null ? null : c + (r?.data?.already_joined ? 0 : 1)));
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not join the waitlist. Try again.';
      setSubmitErr(typeof msg === 'string' ? msg : 'Could not join the waitlist.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ── */}
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandWord}>MintU</Text>
          </View>
          <Pressable
            onPress={() => router.push('/auth' as any)}
            style={({ pressed }) => [styles.signInBtn, pressed && styles.pressed]}
            hitSlop={10}
          >
            <Text style={styles.signInTxt}>SIGN IN</Text>
          </Pressable>
        </View>

        {/* ── HERO ── */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>BETA · INDIA</Text>
          <Text style={styles.headline}>{TAGLINE}</Text>
          <Text style={styles.sub}>{SUBTAGLINE}</Text>

          {/* Primary CTA — scrolls down to capture form is fine on web,
              but we just focus the email field through layout flow. */}
          <View style={{ height: BR_SPACE.lg }} />
          {waitlistCount != null && waitlistCount > 0 && (
            <View style={styles.proofPill}>
              <View style={styles.proofDot} />
              <Text style={styles.proofTxt}>
                {waitlistCount.toLocaleString('en-IN')}+ on the waitlist
              </Text>
            </View>
          )}
        </View>

        {/* ── EMAIL CAPTURE (above-the-fold) ── */}
        <View style={styles.captureBlock}>
          <Text style={styles.captureKicker}>JOIN THE BETA</Text>
          {submitted ? (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>
                {submitted.already ? 'Already on the list ✦' : "You're in. ✦"}
              </Text>
              <Text style={styles.confirmBody}>
                Position{' '}
                <Text style={styles.confirmPos}>#{submitted.position.toLocaleString('en-IN')}</Text>
                .{'\n'}We'll email you the moment your invite is ready.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={BR_COLORS.quiet}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  testID="beta-waitlist-email"
                  onSubmitEditing={onSubmit}
                  editable={!submitting}
                />
                <Pressable
                  onPress={onSubmit}
                  disabled={!validEmail || submitting}
                  testID="beta-waitlist-submit"
                  style={({ pressed }) => [
                    styles.submitBtn,
                    (!validEmail || submitting) && styles.submitBtnDisabled,
                    pressed && validEmail && styles.pressed,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={BR_COLORS.accentInk} />
                  ) : (
                    <Text style={styles.submitTxt}>JOIN →</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.platformRow}>
                {(['ios', 'android', 'either'] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPlatform(p)}
                    style={[styles.pfChip, platform === p && styles.pfChipOn]}
                  >
                    <Text style={[styles.pfTxt, platform === p && styles.pfTxtOn]}>
                      {p === 'ios' ? 'iOS' : p === 'android' ? 'ANDROID' : 'EITHER'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {submitErr && (
                <Text style={styles.errTxt}>{submitErr}</Text>
              )}
            </>
          )}
        </View>

        {/* ── FEATURES grid ── */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>WHAT YOU GET</Text>
          <Text style={styles.sectionH}>Six things, well done.</Text>
          <View style={styles.featureGrid}>
            {FEATURES.map((f) => (
              <View key={f.num} style={styles.featureCard}>
                <View style={styles.featureHead}>
                  <Text style={styles.featureNum}>{f.num}</Text>
                  <Text style={styles.featureEmoji}>{f.emoji}</Text>
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── HOW IT WORKS ── */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>HOW IT WORKS</Text>
          <Text style={styles.sectionH}>Three steps. No spreadsheets.</Text>
          <View style={{ height: BR_SPACE.md }} />
          {STEPS.map((s) => (
            <View key={s.num} style={styles.stepRow}>
              <Text style={styles.stepNum}>{s.num}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── TRUST ── */}
        <View style={[styles.section, styles.trustSection]}>
          <Text style={styles.sectionKickerInk}>TRUST · NO BS</Text>
          <Text style={styles.sectionHInk}>Your money, your data.</Text>
          <View style={{ height: BR_SPACE.md }} />
          {TRUST_BULLETS.map((t, i) => (
            <View key={i} style={styles.trustRow}>
              <Text style={styles.trustCheck}>✓</Text>
              <Text style={styles.trustTxt}>{t}</Text>
            </View>
          ))}
        </View>

        {/* ── FINAL CTA ── */}
        {!submitted && (
          <View style={styles.finalCta}>
            <Text style={styles.finalCtaH}>Built for India.</Text>
            <Text style={styles.finalCtaSub}>
              We're rolling invites in waves. Drop your email above to claim a spot.
            </Text>
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          <View style={styles.footerLinks}>
            <Pressable onPress={() => router.push('/legal/privacy' as any)} hitSlop={8}>
              <Text style={styles.footerLink}>Privacy</Text>
            </Pressable>
            <Text style={styles.footerSep}>·</Text>
            <Pressable onPress={() => router.push('/legal/terms' as any)} hitSlop={8}>
              <Text style={styles.footerLink}>Terms</Text>
            </Pressable>
            <Text style={styles.footerSep}>·</Text>
            <Pressable
              onPress={() => Linking.openURL('mailto:hello@mintu.app').catch(() => {})}
              hitSlop={8}
            >
              <Text style={styles.footerLink}>Contact</Text>
            </Pressable>
          </View>
          <Text style={styles.footerCopy}>© 2026 MintU · Made in India</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: { paddingBottom: BR_SPACE.xxxl },
  pressed: { opacity: 0.7 },

  // ── topbar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: BR_SPACE.sm },
  brandLogo: { width: 28, height: 28 },
  brandWord: { ...BR_TYPE.h3, color: BR_COLORS.ink, fontWeight: '900' },
  signInBtn: {
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.xs + 2,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  signInTxt: { ...BR_TYPE.label, color: BR_COLORS.ink },

  // ── hero
  hero: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.xl,
    paddingBottom: BR_SPACE.lg,
  },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.accent, marginBottom: BR_SPACE.md },
  headline: { ...BR_TYPE.h1, color: BR_COLORS.ink, fontSize: 44, lineHeight: 46 },
  sub: {
    ...BR_TYPE.body, color: BR_COLORS.muted,
    marginTop: BR_SPACE.md,
    fontSize: 16, lineHeight: 24,
  },

  proofPill: {
    flexDirection: 'row', alignItems: 'center', gap: BR_SPACE.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.xs + 2,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  proofDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: BR_COLORS.positive,
  },
  proofTxt: { ...BR_TYPE.meta, color: BR_COLORS.ink, fontWeight: '800' },

  // ── capture
  captureBlock: {
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.lg,
    marginBottom: BR_SPACE.xl,
    padding: BR_SPACE.lg,
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  captureKicker: {
    ...BR_TYPE.label, color: BR_COLORS.accent,
    marginBottom: BR_SPACE.md,
  },
  inputRow: { flexDirection: 'row', gap: BR_SPACE.sm },
  input: {
    flex: 1,
    backgroundColor: BR_COLORS.paper,
    color: BR_COLORS.ink,
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: Platform.OS === 'ios' ? BR_SPACE.md : BR_SPACE.sm + 2,
    fontSize: 15,
    fontWeight: '600',
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.paper,
  },
  submitBtn: {
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
    backgroundColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  submitBtnDisabled: {
    backgroundColor: BR_COLORS.muted,
    borderColor: BR_COLORS.muted,
  },
  submitTxt: {
    ...BR_TYPE.label, color: BR_COLORS.accentInk,
    fontSize: 12, letterSpacing: 1.5,
  },
  platformRow: {
    flexDirection: 'row',
    gap: BR_SPACE.sm,
    marginTop: BR_SPACE.md,
  },
  pfChip: {
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.xs + 2,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.paper + 'AA',
    backgroundColor: 'transparent',
  },
  pfChipOn: {
    backgroundColor: BR_COLORS.paper,
    borderColor: BR_COLORS.paper,
  },
  pfTxt: {
    ...BR_TYPE.labelSm, color: BR_COLORS.paper,
    letterSpacing: 1.2,
  },
  pfTxtOn: { color: BR_COLORS.ink },
  errTxt: {
    ...BR_TYPE.meta,
    color: BR_COLORS.accent,
    marginTop: BR_SPACE.sm,
  },

  confirmCard: {
    paddingVertical: BR_SPACE.md,
  },
  confirmTitle: {
    ...BR_TYPE.h2, color: BR_COLORS.paper,
    fontSize: 22, lineHeight: 26,
  },
  confirmBody: {
    ...BR_TYPE.body,
    color: BR_COLORS.line,
    marginTop: BR_SPACE.sm,
  },
  confirmPos: {
    fontFamily: BR_FONT.mono,
    color: BR_COLORS.accent,
    fontWeight: '900',
  },

  // ── sections
  section: {
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.xl,
    borderTopWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  sectionKicker: { ...BR_TYPE.label, color: BR_COLORS.accent, marginBottom: BR_SPACE.sm },
  sectionH: { ...BR_TYPE.h2, color: BR_COLORS.ink },
  sectionKickerInk: { ...BR_TYPE.label, color: BR_COLORS.accent, marginBottom: BR_SPACE.sm },
  sectionHInk: { ...BR_TYPE.h2, color: BR_COLORS.paper },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BR_SPACE.md,
    marginTop: BR_SPACE.lg,
  },
  featureCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 150,
    padding: BR_SPACE.md,
    backgroundColor: BR_COLORS.paperAlt,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    ...BR_STAMP.sm,
  },
  featureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: BR_SPACE.sm,
  },
  featureNum: {
    fontFamily: BR_FONT.mono,
    fontSize: 14, fontWeight: '900',
    color: BR_COLORS.muted,
    letterSpacing: -0.5,
  },
  featureEmoji: { fontSize: 18 },
  featureTitle: {
    ...BR_TYPE.h3, color: BR_COLORS.ink,
    fontSize: 16, lineHeight: 20,
    marginBottom: BR_SPACE.xs,
  },
  featureBody: {
    ...BR_TYPE.sub, color: BR_COLORS.muted,
    fontSize: 12.5, lineHeight: 17,
  },

  stepRow: {
    flexDirection: 'row',
    gap: BR_SPACE.md,
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  stepNum: {
    fontFamily: BR_FONT.mono,
    fontSize: 32, fontWeight: '900',
    color: BR_COLORS.accent,
    letterSpacing: -1.5,
    width: 56,
  },
  stepTitle: { ...BR_TYPE.h3, color: BR_COLORS.ink },
  stepBody: {
    ...BR_TYPE.sub, color: BR_COLORS.muted,
    marginTop: BR_SPACE.xs,
  },

  trustSection: {
    backgroundColor: BR_COLORS.ink,
    borderTopColor: BR_COLORS.ink,
  },
  trustRow: {
    flexDirection: 'row',
    gap: BR_SPACE.md,
    marginBottom: BR_SPACE.md,
    alignItems: 'flex-start',
  },
  trustCheck: {
    fontSize: 18,
    color: BR_COLORS.accent,
    fontWeight: '900',
    width: 20,
    lineHeight: 22,
  },
  trustTxt: {
    flex: 1,
    ...BR_TYPE.body,
    color: BR_COLORS.line,
    fontSize: 14, lineHeight: 20,
  },

  finalCta: {
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.xl,
    alignItems: 'center',
  },
  finalCtaH: { ...BR_TYPE.h2, color: BR_COLORS.ink, textAlign: 'center' },
  finalCtaSub: {
    ...BR_TYPE.sub, color: BR_COLORS.muted,
    marginTop: BR_SPACE.sm,
    textAlign: 'center',
    maxWidth: 320,
  },

  footer: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.xl,
    paddingBottom: BR_SPACE.lg,
    borderTopWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    alignItems: 'center',
    gap: BR_SPACE.md,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
  },
  footerLink: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerSep: { color: BR_COLORS.line, fontSize: 13 },
  footerCopy: {
    ...BR_TYPE.labelSm,
    color: BR_COLORS.quiet,
  },
});
