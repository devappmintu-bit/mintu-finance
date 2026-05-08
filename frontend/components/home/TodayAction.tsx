/**
 * TodayAction — Round 89 Strike 2.
 *
 * Home's Block 2 — the ACTION ENGINE. The most important block in the
 * app. Hard rules (enforced by this file):
 *
 *   • Exactly ONE primary action (always visible, always tappable)
 *   • Optional ONE secondary action (text-only, small)
 *   • No list, no scroll, no chips
 *   • Whole block is tappable → opens AI Coach with the insight's prefill
 *
 * This block replaces ControlCenterCard + GettingStarted + DailyQuest +
 * SmartSuggestion. Don't re-add any of those. If you need more than
 * one action, fix the priority engine — not this UI.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useAIPrompt } from '../../store/aiPromptStore';
import type { PriorityInsight } from '../../hooks/usePriorityInsight';

interface Props {
  insight: PriorityInsight;
}

export default function TodayAction({ insight }: Props) {
  // Tapping the CARD body (anywhere outside the primary button)
  // opens AI Coach pre-seeded with the insight. This is the
  // "Home (action) → AI Coach (decision + execution)" pipeline.
  const openCoach = () => {
    try {
      useAIPrompt.getState().set(insight.coachPrompt, 'daily_brief', 'home_today');
      router.push(ROUTES.AI_COACH);
    } catch { /* noop */ }
  };

  return (
    <Pressable
      onPress={openCoach}
      accessibilityRole="button"
      accessibilityLabel={`Today's action: ${insight.headline}. Tap to ask Mintu.`}
      style={({ pressed }) => [styles.card, BR_STAMP.accent, pressed && styles.pressed]}
    >
      <Text style={styles.kicker}>TODAY</Text>
      <Text style={styles.headline} numberOfLines={2}>{insight.headline}</Text>
      <Text style={styles.body} numberOfLines={2}>{insight.body}</Text>

      {/* PRIMARY ACTION — the single CTA. Always one. */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); insight.onAction(); }}
        accessibilityRole="button"
        accessibilityLabel={insight.actionLabel}
        style={({ pressed: p }) => [styles.primaryBtn, p && styles.primaryPressed]}
      >
        <Text style={styles.primaryTxt}>{insight.actionLabel.toUpperCase()}</Text>
        <Ionicons name="arrow-forward" size={16} color={BR_COLORS.accentInk} />
      </Pressable>

      {/* SECONDARY — only if the engine provided one. Text-only. */}
      {insight.secondaryLabel && insight.onSecondary && (
        <Pressable
          onPress={(e) => { e.stopPropagation(); insight.onSecondary && insight.onSecondary(); }}
          accessibilityRole="button"
          accessibilityLabel={insight.secondaryLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.secondaryWrap}
        >
          <Text style={styles.secondaryTxt}>{insight.secondaryLabel.toUpperCase()}</Text>
        </Pressable>
      )}
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
  pressed: { transform: [{ translateX: 1 }, { translateY: 1 }], opacity: 0.97 },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.accent },
  headline: {
    ...BR_TYPE.h2,
    color: BR_COLORS.ink,
    marginTop: BR_SPACE.sm,
    fontSize: 22,
    lineHeight: 26,
  },
  body: {
    ...BR_TYPE.sub,
    color: BR_COLORS.muted,
    marginTop: BR_SPACE.sm,
  },
  primaryBtn: {
    marginTop: BR_SPACE.lg,
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    paddingVertical: 14,
    paddingHorizontal: BR_SPACE.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  primaryPressed: { opacity: 0.85 },
  primaryTxt: { ...BR_TYPE.labelSm, color: BR_COLORS.accentInk, fontSize: 12, letterSpacing: 2 },
  secondaryWrap: {
    marginTop: BR_SPACE.md,
    alignSelf: 'flex-start',
  },
  secondaryTxt: { ...BR_TYPE.labelSm, color: BR_COLORS.muted, textDecorationLine: 'underline' },
});
