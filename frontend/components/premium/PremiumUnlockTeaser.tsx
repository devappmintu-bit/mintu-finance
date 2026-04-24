/**
 * PremiumUnlockTeaser — compact, contextual nudge card for non-Premium users.
 *
 * Renders a single-line value prop with an "Unlock" CTA that navigates to /premium.
 * Variant (`context`) picks the copy + emoji — keeps the user in flow, avoiding
 * heavy-handed paywalls. Returns null if user is already Premium.
 *
 * Used in: /leaderboard, DailyQuestCard (streak), Budget analytics, future screens.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { useActivePlan } from '../../utils/premium';

type Context =
  | 'leaderboard_global'   // "See how you rank in your city"
  | 'streak_boost'         // "2x streak bonuses with Premium"
  | 'budget_forecast'      // "See 90-day spending forecast"
  | 'split_insights'       // "Unlock group spending insights"
  | 'ai_unlimited';        // "Unlimited AI Coach messages"

const CONTEXT_META: Record<Context, { emoji: string; title: string; sub: string }> = {
  leaderboard_global:  { emoji: '🏙️', title: 'See your city rank',        sub: 'Premium · India-wide & city-level boards' },
  streak_boost:        { emoji: '⚡', title: '2× streak coin bonus',      sub: 'Premium · double your daily quest rewards' },
  budget_forecast:     { emoji: '🔮', title: '90-day spending forecast',  sub: 'Premium · AI predicts your next 3 months' },
  split_insights:      { emoji: '🔍', title: 'Group spending insights',   sub: 'Premium · who owes whom, trends, benchmarks' },
  ai_unlimited:        { emoji: '♾️', title: 'Unlimited AI chats',         sub: 'Premium · no 5-msg daily cap' },
};

type Props = {
  context: Context;
  /** Override the default CTA route. */
  ctaRoute?: string;
  /** Hide when true — used for conditional rendering from parent. */
  hidden?: boolean;
};

export default function PremiumUnlockTeaser({ context, ctaRoute = '/premium', hidden }: Props) {
  const [plan] = useActivePlan();
  const isPro = plan === 'monthly' || plan === 'yearly' || plan === 'intro';
  const c = useAppColors();
  const styles = useStyles();

  if (isPro || hidden) return null;

  const meta = CONTEXT_META[context];

  const onPress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { router.push(ctaRoute as any); } catch {}
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      testID={`premium-teaser-${context}`}
    >
      <View style={styles.emojiBox}>
        <Text style={styles.emoji}>{meta.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{meta.title}</Text>
          <View style={styles.crown}>
            <Ionicons name="diamond" size={9} color="#FFB020" />
            <Text style={styles.crownT}>PRO</Text>
          </View>
        </View>
        <Text style={styles.sub} numberOfLines={1}>{meta.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.accent.primary} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginVertical: 8, padding: 12,
    borderRadius: 14,
    backgroundColor: c.accent.primary + '10',
    borderWidth: 1,
    borderColor: c.accent.primary + '40',
  },
  emojiBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: c.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13.5, fontWeight: '800', color: c.text.primary, flexShrink: 1 },
  sub: { fontSize: 11, color: c.text.muted, marginTop: 2, fontWeight: '600' },
  crown: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    backgroundColor: '#FFB020' + '22',
    borderWidth: 1, borderColor: '#FFB020' + '60',
  },
  crownT: { fontSize: 9, fontWeight: '900', color: '#FFB020', letterSpacing: 0.5 },
}));
