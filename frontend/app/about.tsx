/**
 * About MintU — R113 brutal convergence.
 *
 * App description / brand intro. Migrated from custom card styles to
 * BrutalCard primitives + brutal tokens. Hero card uses `accent`
 * variant (orange brand) so the brand POPS the moment you land.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  BrutalCard,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
} from '../components/brutal';
import { StaggeredEntrance } from '../components/primitives';

const FEATURES: { emoji: string; text: string }[] = [
  { emoji: '📩', text: 'Auto expense tracking from bank SMS' },
  { emoji: '📊', text: 'Daily Money Score — know how today went' },
  { emoji: '⚡️', text: 'Smart insights that actually mean something' },
  { emoji: '🚨', text: 'Budget alerts before you blow the month' },
  { emoji: '🧾', text: 'Clean dashboard. No spreadsheets. Ever.' },
];

export default function AboutScreen() {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Brutal header */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={s.headerBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <Text style={s.headerTitle}>ABOUT MINTU</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <StaggeredEntrance delayMs={70} duration={420} distance={14}>
          {/* Hero — brand orange card */}
          <BrutalCard variant="accent" style={s.hero}>
            <Image
              source={require('../assets/images/mintu-logo.png')}
              style={s.logo}
              contentFit="contain"
            />
            <Text style={s.brand}>MINTU</Text>
            <Text style={s.tagline}>Your daily money companion 💸</Text>
          </BrutalCard>

          {/* Pitch */}
          <BrutalCard style={s.section}>
            <Text style={s.para}>
              Track expenses automatically. Understand where your money goes.
              Get smart, AI-powered insights to save more every month.
            </Text>
            <Text style={[s.para, { marginTop: BR_SPACE['2'] }]}>
              No spreadsheets. No manual entry. Just clarity.
            </Text>
          </BrutalCard>

          {/* Features */}
          <Text style={s.sect}>🔥 FEATURES</Text>
          <BrutalCard variant="warm" style={s.section}>
            {FEATURES.map((f, i) => (
              <View
                key={f.text}
                style={[s.bulletRow, i === FEATURES.length - 1 && { marginBottom: 0 }]}
              >
                <Text style={s.bulletEmoji}>{f.emoji}</Text>
                <Text style={s.bulletT}>{f.text}</Text>
              </View>
            ))}
          </BrutalCard>

          {/* India */}
          <Text style={s.sect}>🇮🇳 BUILT FOR INDIA</Text>
          <BrutalCard variant="lime" style={s.section}>
            <Text style={s.paraInk}>
              Works with UPI, bank SMS, and Indian spending habits.
            </Text>
          </BrutalCard>

          {/* Why */}
          <Text style={s.sect}>💡 WHY MINTU?</Text>
          <BrutalCard variant="highlight" style={s.section}>
            <Text style={s.paraInk}>
              Because knowing where your money goes is the first step to growing it.
            </Text>
          </BrutalCard>

          {/* Closing CTA-style stamp */}
          <BrutalCard variant="cyan" style={[s.section, s.ctaCard]}>
            <Text style={s.ctaT}>
              Start your journey to smarter money today 🚀
            </Text>
          </BrutalCard>

          <Text style={s.ver}>v1.0.0</Text>
        </StaggeredEntrance>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 14 },

  body: {
    padding: BR_SPACE['4'],
    paddingBottom: 60,
    gap: BR_SPACE['3'],
  },

  hero: {
    alignItems: 'center',
    paddingVertical: BR_SPACE['6'],
  },
  logo: { width: 80, height: 80, borderRadius: 0 },
  brand: {
    marginTop: BR_SPACE['3'],
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.95,
  },

  section: {
    paddingVertical: BR_SPACE['4'],
    paddingHorizontal: BR_SPACE['4'],
  },
  para: {
    fontSize: 14.5,
    lineHeight: 22,
    color: BR_COLORS.text,
    fontWeight: '500',
  },
  paraInk: {
    fontSize: 15,
    lineHeight: 22,
    color: BR_COLORS.ink,
    fontWeight: '700',
  },
  sect: {
    ...BR_FONT.stamp,
    fontSize: 12,
    color: BR_COLORS.ink,
    marginTop: BR_SPACE['3'],
    marginBottom: -BR_SPACE['1'],
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: BR_SPACE['2'],
    gap: BR_SPACE['3'],
  },
  bulletEmoji: { fontSize: 20 },
  bulletT: {
    flex: 1,
    fontSize: 14,
    color: BR_COLORS.ink,
    fontWeight: '600',
    lineHeight: 20,
  },

  ctaCard: { alignItems: 'center', paddingVertical: BR_SPACE['5'] },
  ctaT: {
    fontSize: 14.5,
    fontWeight: '900',
    color: BR_COLORS.ink,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  ver: {
    textAlign: 'center',
    color: BR_COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: BR_SPACE['4'],
    letterSpacing: 1,
  },
});
