/**
 * /onboarding/income.tsx — Round 98 single-slider onboarding step.
 *
 * Panel directive: TTFV < 45s. This is THE only data-collection step
 * before user sees the pre-seeded Home. Profile screen was killed
 * (70% drop). Name/age are captured later inline.
 *
 * Brutalist: big number, hard 2px border, zero decoration.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import api from '../../utils/api';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });
const MIN = 15000, MAX = 500000, STEP = 5000;

// Round 99F — band labels for the peer-anchor copy. Replaces the
// inscrutable "households like yours" with a concrete bracket.
function incomeBandLabel(n: number): string {
  if (n < 25000)  return 'households earning under ₹25k';
  if (n < 50000)  return 'households at ₹25k–₹50k';
  if (n < 100000) return 'households at ₹50k–₹1L';
  if (n < 200000) return 'households at ₹1L–₹2L';
  return 'households earning ₹2L+';
}

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function OnboardingIncome() {
  const [income, setIncome] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true); setErr(null);
    try {
      await api.post('/onboarding/seed', { income });
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      setErr('Could not save. Tap to retry.');
    } finally {
      setLoading(false);
    }
  };

  // Live peer anchor — mirrors the backend band logic for instant
  // visual feedback as the user drags. Keep in sync with _PEER_BANDS.
  const anchorPct =
    income < 25000 ? 8  :
    income < 50000 ? 12 :
    income < 100000 ? 18 :
    income < 200000 ? 22 : 30;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Round 99G — "STEP 1/1" was confusing: either it's the only
            step (so why number it?) or implies more steps (a lie that
            erodes trust on the FIRST screen of TTFV<45s). Replaced
            with an honest, anchoring kicker. */}
        <Text style={styles.kicker}>QUICK SETUP · 30 SECONDS</Text>
        <Text style={styles.h1}>What's your monthly take-home?</Text>
        <Text style={styles.sub}>
          We use this to seed your diagnostic score and find your biggest leak.
        </Text>

        <View style={styles.bigBox}>
          <Text style={styles.bigNum}>{fmtINR(income)}</Text>
          <Text style={styles.bigUnit}>per month</Text>
        </View>

        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={MIN}
          maximumValue={MAX}
          step={STEP}
          value={income}
          onValueChange={setIncome}
          minimumTrackTintColor={BR_COLORS.ink}
          maximumTrackTintColor={BR_COLORS.line}
          thumbTintColor={BR_COLORS.ink}
        />
        {/* Round 99F — explicit 5-tick anchors. The slider thumb at
            ₹50K sits at ~7% of the [15K-500K] range and visually looks
            like the slider didn't move. Tick labels give the user a
            mental map of where they actually are. */}
        <View style={styles.markers}>
          <Text style={styles.marker}>₹15k</Text>
          <Text style={styles.marker}>₹50k</Text>
          <Text style={styles.marker}>₹1L</Text>
          <Text style={styles.marker}>₹2L</Text>
          <Text style={styles.marker}>₹5L</Text>
        </View>

        <View style={styles.anchor}>
          <Text style={styles.anchorNum}>{anchorPct}%</Text>
          <Text style={styles.anchorTxt}>
            {/* Round 99F — coherent copy. Old: "is what households like
                yours typically save. Top 25% save much more." was
                contradictory ("typically" implies majority; "Top 25%"
                implies median). New: states the median directly. */}
            {`is the median savings rate for ${incomeBandLabel(income)}.`}{'\n'}
            <Text style={styles.anchorTxtBold}>{`We'll show you how to beat it.`}</Text>
          </Text>
        </View>

        {err && <Text style={styles.err}>{err}</Text>}

        <Pressable
          onPress={submit}
          disabled={loading}
          style={({ pressed }) => [
            styles.cta,
            loading && { opacity: 0.6 },
            pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
          ]}
        >
          <Text style={styles.ctaTxt}>
            {loading ? 'SEEDING YOUR COACH…' : 'SEE MY SCORE →'}
          </Text>
        </Pressable>

        <Text style={styles.footer}>No bank connect required. 45-second start.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BR_COLORS.paper },
  inner: { flex: 1, padding: BR_SPACE.lg, justifyContent: 'center' },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.muted, letterSpacing: 1.6 },
  h1: { fontSize: 26, fontWeight: '900', color: BR_COLORS.ink, marginTop: 8, lineHeight: 32 },
  sub: { fontSize: 14, color: BR_COLORS.muted, marginTop: 8, lineHeight: 20 },
  bigBox: {
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    marginVertical: BR_SPACE.lg, padding: BR_SPACE.lg, alignItems: 'center',
  },
  bigNum: { fontSize: 48, fontWeight: '900', color: BR_COLORS.ink, fontFamily: MONO, letterSpacing: -1 },
  bigUnit: { ...BR_TYPE.label, color: BR_COLORS.muted, marginTop: 4 },
  markers: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  marker: { ...BR_TYPE.labelSm, color: BR_COLORS.muted },
  anchor: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: BR_SPACE.lg, padding: BR_SPACE.md,
    borderLeftWidth: 4, borderLeftColor: BR_COLORS.ink, backgroundColor: BR_COLORS.paperDim ?? '#f6f6f4',
  },
  anchorNum: { fontSize: 34, fontWeight: '900', color: BR_COLORS.ink, fontFamily: MONO },
  anchorTxt: { flex: 1, fontSize: 12, color: BR_COLORS.ink, lineHeight: 16 },
  anchorTxtBold: { fontWeight: '900', color: BR_COLORS.accent, letterSpacing: -0.1 },
  err: { fontSize: 12, color: BR_COLORS.negative ?? '#C62828', marginTop: 12 },
  cta: {
    marginTop: BR_SPACE.lg, backgroundColor: BR_COLORS.ink,
    paddingVertical: 16, borderWidth: 2, borderColor: BR_COLORS.ink,
    alignItems: 'center',
  },
  ctaTxt: { color: BR_COLORS.paper, fontWeight: '900', letterSpacing: 1.6, fontSize: 14 },
  footer: { marginTop: 16, fontSize: 11, color: BR_COLORS.muted, textAlign: 'center', letterSpacing: 0.6 },
});
