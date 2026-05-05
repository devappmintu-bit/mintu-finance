/**
 * HeroDecision — Round 92 Diagnostic Score upgrade.
 *
 * Replaces the old abstract Money Score (`73/100`) with a 3-line
 * diagnostic that's personal, directional and actionable:
 *
 *   Line 1  — score + week delta            73  ▲+3  vs last week
 *   Line 2  — percentile vs OWN history     Better than 67% of your last 12 weeks
 *   Line 3  — weakest category overshoot    Food up 24% vs your typical
 *
 * Tappable → AI Coach with the weakest-category prefilled.
 * Strict Brutalist: no shadows, no glass, hard 2px borders, mono numerals.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useAIPrompt } from '../../store/aiPromptStore';
import type { PriorityInsight, RiskLevel } from '../../hooks/usePriorityInsight';
import { useDiagnosticScore } from '../../hooks/useDiagnosticScore';

interface Props {
  insight: PriorityInsight;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

function riskPaint(risk: RiskLevel): { bg: string; fg: string; label: string } {
  switch (risk) {
    case 'risk':    return { bg: BR_COLORS.negative, fg: BR_COLORS.accentInk, label: 'AT RISK' };
    case 'caution': return { bg: BR_COLORS.warning,  fg: BR_COLORS.accentInk, label: 'CAUTION' };
    case 'watch':   return { bg: BR_COLORS.muted,    fg: BR_COLORS.accentInk, label: 'WATCH'   };
    case 'ok':
    default:        return { bg: BR_COLORS.positive, fg: BR_COLORS.accentInk, label: 'ON TRACK' };
  }
}

function deltaPaint(delta: number) {
  if (delta > 0) return { sym: '▲', color: BR_COLORS.positive, sign: '+' };
  if (delta < 0) return { sym: '▼', color: BR_COLORS.negative, sign: '' };
  return { sym: '•', color: BR_COLORS.muted, sign: '' };
}

export default function HeroDecision({ insight }: Props) {
  const { data: diag, ctxScore } = useDiagnosticScore();
  const score = diag?.score ?? Number(ctxScore || 0);
  const delta = diag?.delta_week ?? 0;
  const dPaint = deltaPaint(delta);
  const paint = riskPaint(insight.risk);

  const headline = diag?.headline;
  const weakestCat = diag?.weakest_category;

  const handlePress = () => {
    try {
      // Prefer asking about the weakest category — it's the actionable hook.
      const weakestPrompt = weakestCat
        ? `My ${weakestCat.category} spend is up ${weakestCat.overshoot_pct}% vs my typical. Suggest a fix.`
        : insight.coachPrompt;
      useAIPrompt.getState().set(weakestPrompt, 'daily_brief', 'home_hero');
      router.push(ROUTES.AI_COACH);
    } catch { /* noop */ }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Money score ${score}, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} this week. Tap to ask Mintu.`}
      style={({ pressed }) => [styles.card, BR_STAMP.md, pressed && styles.pressed]}
    >
      {/* Top row — label + risk pill */}
      <View style={styles.top}>
        <Text style={styles.kicker}>DIAGNOSTIC SCORE</Text>
        <View style={[styles.pill, { backgroundColor: paint.bg }]}>
          <Text style={[styles.pillTxt, { color: paint.fg }]}>{paint.label}</Text>
        </View>
      </View>

      {/* Line 1: BIG score + delta chip */}
      <View style={styles.scoreRow}>
        <Text style={styles.scoreNum}>{Number.isFinite(score) ? score : 0}</Text>
        <Text style={styles.scoreOf}>/100</Text>
        {delta !== 0 ? (
          <View style={[styles.deltaChip, { borderColor: dPaint.color }]}>
            <Text style={[styles.deltaTxt, { color: dPaint.color }]}>
              {dPaint.sym} {dPaint.sign}{delta} vs last wk
            </Text>
          </View>
        ) : (
          <View style={[styles.deltaChip, { borderColor: BR_COLORS.muted }]}>
            <Text style={[styles.deltaTxt, { color: BR_COLORS.muted }]}>• flat vs last wk</Text>
          </View>
        )}
      </View>

      {/* Line 2: Percentile (own-history baseline) */}
      <View style={styles.lineWrap}>
        <Text style={styles.lineTag}>HISTORY</Text>
        <Text style={styles.lineTxt} numberOfLines={2}>
          {headline?.percentile_line || `Building your baseline — ${diag?.history_count ?? 0}/3 weeks logged`}
        </Text>
      </View>

      {/* Line 3: Weakest category */}
      <View style={styles.lineWrap}>
        <Text style={[styles.lineTag, !!weakestCat && { color: BR_COLORS.accent }]}>
          {weakestCat ? 'WEAK SPOT' : 'CATEGORIES'}
        </Text>
        <Text style={styles.lineTxt} numberOfLines={2}>
          {headline?.weakest_line || 'All categories on baseline this month'}
        </Text>
      </View>

      {/* Affordance */}
      <View style={styles.footer}>
        <Text style={styles.foot}>{weakestCat ? 'ASK MINTU TO FIX' : 'ASK MINTU WHY'}</Text>
        <Ionicons name="arrow-forward" size={14} color={BR_COLORS.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BR_COLORS.paper,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    marginBottom: BR_SPACE.lg,
  },
  pressed: { transform: [{ translateX: 1 }, { translateY: 1 }], opacity: 0.96 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.muted },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: BR_COLORS.ink,
  },
  pillTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: BR_SPACE.md, flexWrap: 'wrap' },
  scoreNum: { ...BR_TYPE.numLg, color: BR_COLORS.ink, fontFamily: MONO, letterSpacing: -1 },
  scoreOf:  { ...BR_TYPE.num, color: BR_COLORS.muted, marginBottom: 8, marginLeft: 4 },
  deltaChip: {
    marginLeft: 10,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
  },
  deltaTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1, fontFamily: MONO },

  lineWrap: {
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: 1,
    borderColor: BR_COLORS.line,
  },
  lineTag: { ...BR_TYPE.labelSm, color: BR_COLORS.muted, marginBottom: 3 },
  lineTxt: { fontSize: 13, fontWeight: '700', color: BR_COLORS.ink, lineHeight: 18 },

  footer: {
    marginTop: BR_SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foot: { ...BR_TYPE.labelSm, color: BR_COLORS.ink },
});
