/**
 * CalmModeStatusPill.tsx — R117 surface Calm Mode beyond Home.
 *
 * Compact pill that reflects the user's current financial state
 * (flourishing, steady, attention, critical). Used on Profile and
 * Transactions empty state. Reads from financialStateStore so the
 * existing Home subscriber is the single source of truth.
 *
 * Falls back to a subtle "AWAITING SIGNAL" pill when state hasn't
 * been computed yet (e.g. Profile loaded before Home).
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useFinStateStore from '../store/financialStateStore';
import { BR_COLORS } from '../utils/brutalist';

const { ink: INK } = BR_COLORS;

interface Props {
  variant?: 'inline' | 'card';
}

function CalmModeStatusPillImpl({ variant = 'inline' }: Props) {
  const state = useFinStateStore((s) => s.state);
  const finState = state?.state ?? 'unknown';

  const meta = (() => {
    switch (finState) {
      case 'flourishing':
        return { icon: 'sparkles' as const, label: 'FLOURISHING', tint: '#0F766E', bg: '#D1FAE5' };
      case 'steady':
        return { icon: 'leaf-outline' as const, label: 'ON TRACK', tint: '#1A1A1A', bg: '#F4EFEA' };
      case 'attention':
        return { icon: 'eye-outline' as const, label: 'WATCHING', tint: '#92400E', bg: '#FEF3C7' };
      case 'critical':
        return { icon: 'alert-circle-outline' as const, label: 'TIGHT MONTH', tint: '#B91C1C', bg: '#FEE2E2' };
      default:
        // R118 polish: warmer copy than "CALCULATING" for the initial
        // unknown state — avoids feeling like a system status while
        // we still don't have enough txn signal.
        return { icon: 'pulse-outline' as const, label: 'GETTING TO KNOW YOU', tint: '#6B6B6B', bg: '#F4EFEA' };
    }
  })();

  if (variant === 'card') {
    return (
      <View style={[styles.card, { backgroundColor: meta.bg, borderColor: meta.tint + '55' }]}>
        <Ionicons name={meta.icon} size={16} color={meta.tint} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: meta.tint }]}>{meta.label}</Text>
          {state?.headline ? (
            <Text style={styles.cardSub} numberOfLines={1}>
              {state.headline}
            </Text>
          ) : (
            <Text style={styles.cardSub} numberOfLines={1}>
              {finState === 'unknown' ? 'Calm Mode initialising…' : 'Tap home to refresh.'}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.pill, { backgroundColor: meta.bg, borderColor: meta.tint + '55' }]}>
      <Ionicons name={meta.icon} size={11} color={meta.tint} />
      <Text style={[styles.pillLabel, { color: meta.tint }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1.5,
  },
  cardLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  cardSub: { fontSize: 12, fontWeight: '500', color: INK, marginTop: 2 },
});

export default memo(CalmModeStatusPillImpl);
