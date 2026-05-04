/**
 * HeroDecision — Round 89 Strike 2.
 *
 * Home's Block 1. Answers ONE question: "Am I okay or in trouble?"
 *
 * Nothing decorative. Three things only:
 *   • Money Score (big mono number)
 *   • Risk flag (solid colour pill + label)
 *   • ONE sharp insight (headline from the shared priority engine)
 *
 * Tappable → routes to AI Coach with the insight's coachPrompt
 * prefilled. Keeps the "Home → Coach" pipeline continuous.
 *
 * Brutalist: no blur, no glass, no shadows. Hard 2px borders, flat
 * 4px offset stamp, mono numerals on the score.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useFinContext } from '../../store/financialContext';
import type { PriorityInsight, RiskLevel } from '../../hooks/usePriorityInsight';
import { useAIPrompt } from '../../store/aiPromptStore';

interface Props {
  insight: PriorityInsight;
}

function riskPaint(risk: RiskLevel): { bg: string; fg: string; label: string } {
  switch (risk) {
    case 'risk':    return { bg: BR_COLORS.negative, fg: BR_COLORS.accentInk, label: 'AT RISK' };
    case 'caution': return { bg: BR_COLORS.warning,  fg: BR_COLORS.accentInk, label: 'CAUTION' };
    case 'watch':   return { bg: BR_COLORS.muted,    fg: BR_COLORS.accentInk, label: 'WATCH'   };
    case 'ok':
    default:        return { bg: BR_COLORS.positive, fg: BR_COLORS.accentInk, label: 'ON TRACK' };
  }
}

export default function HeroDecision({ insight }: Props) {
  const ctx = useFinContext();
  const score = Number(ctx?.score?.value ?? 0);
  const paint = riskPaint(insight.risk);

  const handlePress = () => {
    try {
      useAIPrompt.getState().set(insight.coachPrompt, 'daily_brief', 'home_hero');
      router.push(ROUTES.AI_COACH);
    } catch { /* noop */ }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Money score ${score || 'not yet available'}, ${paint.label}. Tap to ask Mintu about ${insight.headline}.`}
      style={({ pressed }) => [styles.card, BR_STAMP.md, pressed && styles.pressed]}
    >
      {/* Top row — label + risk pill */}
      <View style={styles.top}>
        <Text style={styles.kicker}>MONEY SCORE</Text>
        <View style={[styles.pill, { backgroundColor: paint.bg }]}>
          <Text style={[styles.pillTxt, { color: paint.fg }]}>{paint.label}</Text>
        </View>
      </View>

      {/* Score */}
      <View style={styles.scoreRow}>
        <Text style={styles.scoreNum}>{Number.isFinite(score) ? score : 0}</Text>
        <Text style={styles.scoreOf}>/100</Text>
      </View>

      {/* ONE sharp insight */}
      <View style={styles.insightWrap}>
        <Text style={styles.insightTag}>{insight.tag}</Text>
        <Text style={styles.insightLine} numberOfLines={2}>{insight.headline}</Text>
      </View>

      {/* Affordance */}
      <View style={styles.footer}>
        <Text style={styles.foot}>ASK MINTU WHY</Text>
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
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: BR_SPACE.md },
  scoreNum: { ...BR_TYPE.numLg, color: BR_COLORS.ink },
  scoreOf:  { ...BR_TYPE.num, color: BR_COLORS.muted, marginBottom: 8, marginLeft: 4 },
  insightWrap: {
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1,
    borderColor: BR_COLORS.line,
  },
  insightTag: { ...BR_TYPE.labelSm, color: BR_COLORS.accent, marginBottom: 4 },
  insightLine: { ...BR_TYPE.bodyBold, color: BR_COLORS.ink, lineHeight: 22 },
  footer: {
    marginTop: BR_SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foot: { ...BR_TYPE.labelSm, color: BR_COLORS.ink },
});
