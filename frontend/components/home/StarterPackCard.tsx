/**
 * StarterPackCard — Round 98 Home first-paint deck.
 *
 * Renders the 3 deterministic starter cards seeded by
 * `/api/onboarding/seed`. Shown ONLY on Home when the user has
 * 0 transactions AND the server confirms they were seeded.
 *
 * Panel directive: first Home render must contain real, tappable
 * action cards — not a "Add your first expense" placeholder.
 * These cards give the user something to act on in < 45s of
 * app install, no LLM round-trip required.
 *
 * Brutalist: 2px ink hairlines, flat paper, mono numerals on impact.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../utils/api';
import type { StarterCard } from '../../hooks/useStarterCards';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useFinContext } from '../../store/financialContext';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

interface Props {
  cards: StarterCard[];
  anchorPct?: number | null;
  anchorCopy?: string | null;
  onActionComplete?: () => void;
}

function fmtImpact(n?: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1000) return `+₹${(n / 1000).toFixed(1)}K`;
  return `+₹${n}`;
}

function kindIcon(kind: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'set_budget_cap': return 'lock-closed';
    case 'create_goal':    return 'flag';
    case 'import_sms':     return 'chatbubble-ellipses';
    default:               return 'arrow-forward-circle';
  }
}

export default function StarterPackCard({
  cards,
  anchorPct,
  anchorCopy,
  onActionComplete,
}: Props) {
  if (!cards || cards.length === 0) return null;

  const handleTap = async (card: StarterCard) => {
    try {
      // For `import_sms` we route — there's no direct mutation to run
      // without device permission handling.
      if (card.kind === 'import_sms') {
        router.push(ROUTES.PROFILE as any);
        return;
      }

      // For set_budget_cap / create_goal, fire the server mutation,
      // then bounce to the corresponding tab so the user SEES it stick.
      const method = (card.method || 'POST').toLowerCase();
      const endpoint = (card.endpoint || '').replace(/^\/api/, '');
      if (method === 'post' && endpoint) {
        await api.post(endpoint, card.payload || {});
      } else if (method === 'put' && endpoint) {
        await api.put(endpoint, card.payload || {});
      }

      // Route the user to where the action landed so they can verify.
      if (card.kind === 'set_budget_cap') {
        router.push(ROUTES.BUDGET as any);
      } else if (card.kind === 'create_goal') {
        router.push(ROUTES.GOALS as any);
      }

      // Refresh the SSoT so Home instantly reflects the new budget / goal.
      try { await useFinContext.getState().refresh(true); } catch { /* noop */ }

      onActionComplete?.();
    } catch (e: any) {
      // Never swallow silently — user tapped a CTA, we owe a response.
      Alert.alert(
        'Couldn\'t complete',
        e?.response?.data?.detail || 'Tap again or try from the tab.',
      );
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.kickerRow}>
        <Text style={styles.kicker}>YOUR STARTER PACK</Text>
        {typeof anchorPct === 'number' && (
          <View style={styles.anchorPill}>
            <Text style={styles.anchorPillTxt}>PEERS SAVE {anchorPct}%</Text>
          </View>
        )}
      </View>

      <Text style={styles.h1}>3 moves in the next 60 seconds.</Text>
      {anchorCopy && (
        <Text style={styles.sub} numberOfLines={2}>{anchorCopy}</Text>
      )}

      <View style={styles.deck}>
        {cards.slice(0, 3).map((card, i) => (
          <Pressable
            key={`${card.kind}-${i}`}
            onPress={() => handleTap(card)}
            accessibilityRole="button"
            accessibilityLabel={card.label}
            style={({ pressed }) => [
              styles.card,
              pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
            ]}
          >
            <View style={styles.cardRow}>
              <View style={styles.cardIcon}>
                <Ionicons name={kindIcon(card.kind)} size={18} color={BR_COLORS.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel} numberOfLines={2}>{card.label}</Text>
                {!!card.reason && (
                  <Text style={styles.cardReason} numberOfLines={2}>{card.reason}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {!!card.projected_impact && card.projected_impact > 0 && (
                  <Text style={styles.impact}>{fmtImpact(card.projected_impact)}</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color={BR_COLORS.ink} />
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    marginBottom: BR_SPACE.lg,
    backgroundColor: BR_COLORS.paper,
  },
  kickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.accent, letterSpacing: 1.8 },
  anchorPill: {
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: BR_COLORS.paperAlt ?? '#f6f6f4',
  },
  anchorPillTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, color: BR_COLORS.ink },
  h1: {
    fontSize: 22,
    fontWeight: '900',
    color: BR_COLORS.ink,
    marginTop: BR_SPACE.sm,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  sub: {
    ...BR_TYPE.sub,
    color: BR_COLORS.muted,
    marginTop: 4,
  },
  deck: {
    marginTop: BR_SPACE.lg,
    gap: BR_SPACE.sm,
  },
  card: {
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.md,
    backgroundColor: BR_COLORS.paper,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 32, height: 32,
    borderWidth: 1.5, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BR_COLORS.paperAlt ?? '#f6f6f4',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: -0.2,
  },
  cardReason: {
    fontSize: 11,
    color: BR_COLORS.muted,
    marginTop: 2,
    lineHeight: 15,
  },
  impact: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: MONO,
    color: BR_COLORS.positive ?? '#0B7A3E',
    marginBottom: 2,
  },
});
