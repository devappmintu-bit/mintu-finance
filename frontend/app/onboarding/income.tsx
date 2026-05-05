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
        <Text style={styles.kicker}>STEP 1/1</Text>
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
        <View style={styles.markers}>
          <Text style={styles.marker}>₹15k</Text>
          <Text style={styles.marker}>₹5L</Text>
        </View>

        <View style={styles.anchor}>
          <Text style={styles.anchorNum}>{anchorPct}%</Text>
          <Text style={styles.anchorTxt}>
            is what households like yours typically save.{'\n'}Top 25% save much more.
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
  err: { fontSize: 12, color: BR_COLORS.negative ?? '#C62828', marginTop: 12 },
  cta: {
    marginTop: BR_SPACE.lg, backgroundColor: BR_COLORS.ink,
    paddingVertical: 16, borderWidth: 2, borderColor: BR_COLORS.ink,
    alignItems: 'center',
  },
  ctaTxt: { color: BR_COLORS.paper, fontWeight: '900', letterSpacing: 1.6, fontSize: 14 },
  footer: { marginTop: 16, fontSize: 11, color: BR_COLORS.muted, textAlign: 'center', letterSpacing: 0.6 },
});
