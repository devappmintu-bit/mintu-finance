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
import NBSticker from './NBSticker';
import { useNeoPalette } from '../../store/neoTheme';
import { useFinContext } from '../../store/financialContext';
import { useMascotMood } from '../../hooks/useMascotMood';
import {
  NB_BORDER, NB_RADIUS, NB_SPACE, NB_TYPE, roleColor,
} from '../../utils/neoBrutalism';

export default function NBHero() {
  const palette = useNeoPalette();
  const { mood, line, gated } = useMascotMood();
  const txnCount = useFinContext((s) => s.transactions?.count ?? 0);
  const streakDays = useFinContext((s) => s.streak?.days ?? 0);
  const monthlySpend = useFinContext((s) => s.transactions?.monthlySpend ?? 0);

  // R100AE — Mono-brand role mapping. Drop yellow rewards entirely.
  // - celebrating/proud → savings (bold orange) — louder & more brand-coherent
  // - panicked/sad      → coach (deeper orange) — Mintu IS the coach
  // - else              → primary (orange)
  const heroRole: 'savings' | 'coach' | 'primary' = useMemo(() => {
    if (mood === 'celebrating' || mood === 'proud') return 'savings';
    if (mood === 'panicked' || mood === 'sad') return 'coach';
    return 'primary';
  }, [mood]);
  const r = roleColor(palette, heroRole);

  // For cold-start users we keep the Hero with a different copy that
  // teaches first-action, no fake gamification.
  const isCold = gated || txnCount === 0;
  const headline = isCold
    ? 'Money,\nbut make it fun.'
    : streakDays >= 7
    ? `${streakDays} days\nstrong.`
    : streakDays >= 1
    ? `Day ${streakDays}.\nKeep going.`
    : `Tracking\n₹${fmt(monthlySpend)}`;

  const sub = isCold
    ? 'Log your first expense and meet Mintu — your money companion.'
    : line;

  const ctaLabel = isCold ? 'LOG FIRST EXPENSE' : 'CHAT WITH MINTU';
  const ctaIcon = isCold ? 'add' : 'sparkles';
  const onCta = () => {
    if (isCold) {
      router.push('/add' as any);
    } else {
      router.push('/(tabs)/ai-coach' as any);
    }
  };

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
        {/* Sticker chaos around the card edges */}
        <NBSticker shape="asterisk" color="pink" size={32} rotate="spin1" top={-14} left={-12} />
        <NBSticker shape="zigzag" color="sky" size={28} rotate="tilt5" bottom={-10} right={-10} />
        <NBSticker shape="dot" color="yellow" size={20} rotate="none" top={18} right={-8} />

        <View style={styles.row}>
          <View style={styles.body}>
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
});
