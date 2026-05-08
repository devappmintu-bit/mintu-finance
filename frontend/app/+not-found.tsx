/**
 * +not-found.tsx — Branded 404 page (R100B).
 *
 * Replaces the Expo Router stock `Unmatched Route` screen. The default
 * page leaks "Sitemap" + the literal localhost URL + a blue link in
 * dev-tool styling that breaks brand. This file makes the not-found
 * experience match the rest of the app:
 *
 *   • Brutalist surface (BR_COLORS.paper / ink / accent) — no
 *     mid-bundle visual whiplash for the user.
 *   • MintuMascot in `error` state — single small head-shake then
 *     resumes idle breath. Subtle, not punishing.
 *   • One CTA: back to Home. Less choice, faster recovery.
 *
 * The Stack option `headerShown: false` is critical — the parent
 * navigator's header would render an "Oops!" title which we do NOT
 * want bolted onto the brutalist canvas.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import MintuMascot from '../components/MintuMascot';
import { BR_COLORS, BR_FONT } from '../utils/brutalist';

const { ink: INK, paper: PAPER, accent: ACCENT, muted: MUTED } = BR_COLORS;
const MONO = BR_FONT.mono;

export default function NotFound() {
  return (
    <SafeAreaView style={st.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, title: '404' }} />

      <View style={st.center}>
        {/* Mascot reacts with a quick shake then settles — signals
            "something went wrong" without alarm sirens. */}
        <MintuMascot size={140} state="error" style={{ marginBottom: 24 }} />

        <Text style={st.code}>404</Text>
        <Text style={st.title}>Page not found.</Text>
        <Text style={st.body}>
          That link doesn't exist anymore — or never did. Head back home and
          MintU will pick up where you left off.
        </Text>

        <Pressable
          onPress={() => router.replace('/' as any)}
          style={({ pressed }) => [st.cta, pressed && st.ctaPressed]}
          accessibilityLabel="Go to home"
        >
          <Text style={st.ctaText}>BACK TO HOME</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  center: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontSize: 64,
    lineHeight: 64,
    fontWeight: '900',
    color: INK,
    fontFamily: MONO,
    letterSpacing: -3,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    maxWidth: 320,
  },
  cta: {
    backgroundColor: ACCENT,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: INK,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  ctaPressed: { transform: [{ translateY: 1 }] },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
