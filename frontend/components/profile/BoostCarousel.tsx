/**
 * BoostCarousel — Round 58 Profile Revamp.
 *
 * Horizontal carousel of "boost your score" actions. Replaces the
 * static 3-tile pillar block with a swipe-friendly card row that maps
 * each pillar (saving habits / spending control / consistency) to an
 * actionable suggestion. Each card shows:
 *   • Emoji + label
 *   • Sub-score and the impact a fix would have
 *   • A secondary CTA chip → opens the relevant screen
 *
 * Data shape mirrors the existing /api/profile/score-breakdown payload
 * (see backend/routers/profile_engine.py) so we get this for free.
 *
 * Visual: glass cards, fixed width 220, snap-to-card scroll. The bar
 * inside each card is a SUB-SCORE, not the global score, so users get
 * a granular sense of where to push.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS, GLASS, shadowStyle } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

export interface BoostPillar {
  key: string;
  label: string;
  score: number;
  emoji: string;
  hint: string;
}

export interface BoostCarouselProps {
  pillars: BoostPillar[];
}

// Map a pillar key to a CTA route + label. Falls back to /transactions.
const PILLAR_CTA: Record<string, { route: string; cta: string }> = {
  saving_habits:    { route: '/goals',                 cta: 'Set a goal' },
  spending_control: { route: '/(tabs)/transactions',   cta: 'Review spends' },
  consistency:      { route: '/(tabs)/index',          cta: 'Open Home' },
};

// Color a pillar's accent based on how the sub-score is doing.
function pillarTone(score: number): { accent: string; bg: string; border: string } {
  if (score >= 75) return { accent: COLORS.state.success,  bg: COLORS.state.successBg,  border: COLORS.state.successBorder };
  if (score >= 40) return { accent: COLORS.accent.primary, bg: COLORS.accent.primary + '14', border: COLORS.accent.primary + '33' };
  return            { accent: COLORS.state.danger,   bg: COLORS.state.dangerBg,   border: COLORS.state.dangerBorder };
}

function onTap(route: string) {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
  try { router.push(route as any); } catch { /* noop */ }
}

function BoostCarousel({ pillars }: BoostCarouselProps) {
  const s = useStyles();
  if (!pillars || pillars.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Boost your score</Text>
        <Text style={s.headerSub}>3 levers · swipe →</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        decelerationRate="fast"
        snapToInterval={232}
        snapToAlignment="start"
      >
        {pillars.map((p) => {
          const tone = pillarTone(p.score);
          const cta = PILLAR_CTA[p.key] || { route: '/(tabs)/transactions', cta: 'Take action' };
          const headroom = Math.max(0, 100 - p.score);
          return (
            <TouchableOpacity
              key={p.key}
              activeOpacity={0.85}
              onPress={() => onTap(cta.route)}
              style={s.card}
            >
              <View style={s.cardHeader}>
                <Text style={s.cardEmoji}>{p.emoji}</Text>
                <View style={[s.scorePill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <Text style={[s.scorePillTxt, { color: tone.accent }]}>{p.score}/100</Text>
                </View>
              </View>

              <Text style={s.cardLabel} numberOfLines={1}>{p.label}</Text>
              <Text style={s.cardHint} numberOfLines={2}>{p.hint}</Text>

              {/* Mini sub-bar */}
              <View style={s.miniBar}>
                <View style={[s.miniBarFill, { width: `${Math.min(100, p.score)}%`, backgroundColor: tone.accent }]} />
              </View>

              {/* Footer: impact + CTA */}
              <View style={s.cardFooter}>
                <Text style={s.impactTxt}>
                  {headroom > 0 ? `+${headroom} pts available` : 'Maxed out'}
                </Text>
                <View style={[s.ctaChip, { backgroundColor: tone.accent }]}>
                  <Text style={s.ctaChipTxt}>{cta.cta}</Text>
                  <Ionicons name="arrow-forward" size={11} color="#FFFFFF" />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default React.memo(BoostCarousel);

const CARD_WIDTH = 220;

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  headerSub: { fontSize: 11, color: c.text.muted, fontWeight: '600' },

  scrollContent: { paddingRight: 8, gap: 12 },
  card: {
    width: CARD_WIDTH,
    backgroundColor: GLASS.solidBg,
    borderRadius: 18, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    ...shadowStyle('#111827', 2, 10, 0.04, 3),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardEmoji: { fontSize: 22 },
  scorePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  scorePillTxt: { fontSize: 11, fontWeight: '800' },

  cardLabel: { fontSize: 14, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  cardHint: { fontSize: 11, color: c.text.muted, marginTop: 3, lineHeight: 15, minHeight: 30 },

  miniBar: { height: 4, borderRadius: 2, backgroundColor: c.gray[200], marginTop: 10, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  impactTxt: { fontSize: 11, color: c.text.muted, fontWeight: '700', flex: 1 },
  ctaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ctaChipTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
}));
