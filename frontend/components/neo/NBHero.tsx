/**
 * NBHero — the Neo-Brutalist home dashboard hero.
 *
 * Replaces (or sits above) the Swiss HeroDecision with a Memphis-Group
 * collage of Mintu mascot + sticker decoration + bold headline + chunky
 * primary CTA. Feels alive on first scroll.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import MascotPresence from '../mascot/MascotPresence';
import NBButton from './NBButton';
// R100AG — NBSticker import removed; Memphis decoration stripped from
// production surfaces. Component file kept for any future use.
import { useNeoPalette } from '../../store/neoTheme';
import { useFinContext } from '../../store/financialContext';
import { useMascotMood } from '../../hooks/useMascotMood';
import { useFinStateName } from '../../store/financialStateStore';
import {
  NB_BORDER, NB_RADIUS, NB_SPACE, NB_TYPE, roleColor,
} from '../../utils/neoBrutalism';

export default function NBHero() {
  const palette = useNeoPalette();
  const { mood, line, gated } = useMascotMood();
  const txnCount = useFinContext((s) => s.transactions?.count ?? 0);
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const monthlySpend = useFinContext((s) => s.transactions?.monthlySpend ?? 0);

  // R100AF — Hero stays on brand chrome (orange) for primary/proud/
  // celebrating — semantic colors (green/red/blue/yellow/purple) are
  // RESERVED for category badges, status pills, chart bars — never on
  // the hero card. Result: hero is iconic & instantly MintU regardless
  // of mood; semantic accents communicate state via small surfaces.
  const heroRole: 'primary' | 'coach' | 'alert' = useMemo(() => {
    if (mood === 'panicked') return 'alert';      // semantic red surface
    if (mood === 'sad') return 'coach';           // semantic purple surface
    return 'primary';                              // brand orange (default)
  }, [mood]);
  const r = roleColor(palette, heroRole);

  // For cold-start users we keep the Hero with a different copy that
  // teaches first-action, no fake gamification.
  const isCold = gated || txnCount === 0;

  // R101A — Add explicit time windows everywhere on Home. The
  // headline "Tracking ₹1.6K" was abstract — UX audit (P0): the user
  // can't tell whether that's lifetime / month / week. We now break
  // the figure across two lines: amount up top, period kicker
  // ("THIS MONTH SO FAR") in the sub. Streak headlines retain their
  // own framing because "Day 5" / "5 days strong" are inherently
  // time-anchored.
  const monthName = useMemo(() => {
    try {
      return new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
    } catch { return ''; }
  }, []);

  const headline = isCold
    ? 'Money,\nbut make it fun.'
    : streakDays >= 7
    ? `${streakDays} days\nstrong.`
    : streakDays >= 1
    ? `Day ${streakDays}.\nKeep going.`
    : `\u20b9${fmt(monthlySpend)}\nthis month.`;

  const sub = isCold
    ? 'Log your first expense and meet Mintu — your money companion.'
    : streakDays >= 1
    ? line
    : `Spent in ${monthName} so far. ${line}`;

  const ctaLabel = isCold ? 'LOG FIRST EXPENSE' : 'CHAT WITH MINTU';
  const ctaIcon = isCold ? 'add' : 'sparkles';
  const onCta = () => {
    if (isCold) {
      router.push('/add' as any);
    } else {
      router.push('/(tabs)/ai-coach' as any);
    }
  };

  // R116 Calm Mode — visible state badge. Reads from the global
  // financial state store, which is populated by Home's
  // useFinancialState() result. Renders a small pill above the
  // headline so the user can SEE that the app understands their
  // current emotional context.
  const finStateName = useFinStateName();
  const stateBadge = useMemo(() => {
    switch (finStateName) {
      case 'flourishing': return { text: 'DOING GREAT', icon: '✨', bg: '#22C55E', fg: '#0A0A0A' };
      case 'steady':      return { text: 'ON TRACK',    icon: '🟢', bg: '#86EFAC', fg: '#0A0A0A' };
      case 'attention':   return { text: 'ONE TO WATCH', icon: '👀', bg: '#FCD34D', fg: '#0A0A0A' };
      case 'critical':    return { text: 'NEEDS A RESET', icon: '🔧', bg: '#FCA5A5', fg: '#0A0A0A' };
      default:            return null;
    }
  }, [finStateName]);

  return (
    <View style={styles.outer}>
      {/* Hard ink shadow plate */}
      <View pointerEvents="none" style={[styles.shadow, { backgroundColor: palette.ink }]} />
      <View
        style={[
          styles.card,
          {
            backgroundColor: r.bg,
            borderColor: palette.ink,
            borderWidth: NB_BORDER.thick,
            borderRadius: NB_RADIUS.lg,
          },
        ]}
      >
        {/* R100AG — Memphis sticker decoration removed (asterisks/zigzags/dots).
            The hero is now structural-only: thick border, hard shadow,
            big type, mascot. No decorative chaos. Disciplined. */}

        <View style={styles.row}>
          <View style={styles.body}>
            {stateBadge ? (
              <View style={[styles.statePill, { backgroundColor: stateBadge.bg, borderColor: palette.ink }]}>
                <Text style={[styles.statePillText, { color: stateBadge.fg }]}>
                  {stateBadge.icon}  {stateBadge.text}
                </Text>
              </View>
            ) : null}
            <Text style={[NB_TYPE.h1, { color: r.ink }]}>{headline}</Text>
            <Text style={[styles.sub, { color: r.ink }]} numberOfLines={2}>{sub}</Text>
            <View style={{ marginTop: NB_SPACE.md, alignSelf: 'flex-start' }}>
              <NBButton
                label={ctaLabel}
                icon={ctaIcon as any}
                onPress={onCta}
                role={isCold ? 'rewards' : 'premium'}
                size="md"
              />
            </View>
          </View>
          <View style={styles.mascotWrap}>
            <MascotPresence size={92} showWhenGated />
          </View>
        </View>
      </View>
    </View>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 16,
    marginTop: 12,
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    left: 6, top: 6, right: -6, bottom: -6,
    borderRadius: 20,
  },
  card: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    overflow: 'visible',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 4 },
  sub: { fontSize: 13, fontWeight: '600', lineHeight: 18, marginTop: 4, opacity: 0.85 },
  mascotWrap: { width: 92, alignItems: 'center', justifyContent: 'center' },
  // R116 — Calm Mode state pill. Hard 2-px border + chunky uppercase
  // type matches Brutal grammar; bg color carries the semantic.
  statePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderRadius: 4,
    marginBottom: 8,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
