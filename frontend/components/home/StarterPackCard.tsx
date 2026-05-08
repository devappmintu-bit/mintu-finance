/**
 * StarterPackCard — Round 99E rewrite.
 *
 * Original (R99) flow shipped a fatal UX hole confirmed by live user
 * walkthrough: tapping a card silently router.push()'d to a different
 * tab and the deck rendered IDENTICALLY on return. Real users thought
 * "did my tap even register?" — mistrust spike, abandonment risk ~40%.
 *
 * R99E rebuild closes the loop:
 *
 *   1. Tap → fire mutation → STAY ON HOME.
 *   2. Render proof banner inline ("Locked. ₹7,500/mo cap on food.").
 *   3. Card visually transforms: ✓ check, strikethrough label,
 *      "DONE" badge in place of the impact chip, no chevron.
 *   4. Completion persisted per-user in AsyncStorage so the visual
 *      state survives navigation, refreshes, and tab switches.
 *   5. Parent receives a `completedCount` so it can gate the premium
 *      paywall (premature paywall fix — must wait until at least 2
 *      starter actions are done before pitching upgrade).
 *
 * The deck does NOT disappear after completion — that would erase
 * the proof. Cards stay visible in their "done" state. After all 3
 * are done, the headline swaps from "3 moves in the next 60 seconds"
 * to "All 3 moves done. We're watching the rest." (active framing.)
 *
 * Card 3 (`import_sms`) shipping note: it still routes to Profile
 * because the OS permission flow can't happen inline in this card.
 * BUT the copy now leads with the user benefit, not with the threat
 * ("we'll find ₹X for you" instead of "we can't help without this").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import api from '../../utils/api';
import type { StarterCard } from '../../hooks/useStarterCards';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useFinContext } from '../../store/financialContext';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

// AsyncStorage key for completion state. Namespaced per-user so multi-account
// devices don't bleed completions across users. Set lazily once we know
// the user's id (we never have it during SSR).
const COMPLETION_KEY_PREFIX = 'mintu:starterPack:done:';

interface Props {
  cards: StarterCard[];
  anchorPct?: number | null;
  anchorCopy?: string | null;
  /** User id from auth store. Used to namespace persisted completion
   *  state. Falls back to 'anon' if absent — completions then survive
   *  the session but not signout (acceptable). */
  userId?: string | null;
  /** Round 99E — the parent (Home) reads this to know whether to
   *  render the premium upgrade banner. We want at least 2 actions
   *  completed before any paywall pitch (premature paywall fix). */
  onCompletedCountChange?: (count: number) => void;
}

interface ProofState {
  visible: boolean;
  text: string;
}

function fmtImpact(n?: number): string {
  // Round 99E — explicit unit. Previous shipped without /mo and a real
  // user couldn't tell if "+₹1.0K" meant per month or per year.
  if (!n || n <= 0) return '';
  if (n >= 1000) return `+₹${(n / 1000).toFixed(1)}K/mo`;
  return `+₹${n}/mo`;
}

function kindIcon(kind: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'set_budget_cap': return 'lock-closed';
    case 'create_goal':    return 'flag';
    case 'import_sms':     return 'chatbubble-ellipses';
    default:               return 'arrow-forward-circle';
  }
}

function proofTextFor(card: StarterCard): string {
  const amt = (card.payload && (card.payload.amount || card.payload.target_amount)) || 0;
  const cat = (card.payload && card.payload.category) || '';
  switch (card.kind) {
    case 'set_budget_cap':
      return cat
        ? `Locked. ₹${Number(amt).toLocaleString('en-IN')}/mo cap on ${String(cat).toLowerCase()}. We'll alert you at 80%.`
        : `Cap locked at ₹${Number(amt).toLocaleString('en-IN')}/mo.`;
    case 'create_goal':
      return `Goal opened. ₹${Number(amt).toLocaleString('en-IN')} target. We'll suggest weekly contributions.`;
    case 'import_sms':
      return `One step left — grant SMS access on the next screen.`;
    default:
      return `Done.`;
  }
}

export default function StarterPackCard({
  cards,
  anchorPct,
  anchorCopy,
  userId,
  onCompletedCountChange,
}: Props) {
  // Persisted completion set: { 'set_budget_cap-0': true, ... }
  // Key is `${kind}-${index}` so two cards of the same kind don't collide.
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [proof, setProof] = useState<ProofState>({ visible: false, text: '' });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const proofOpacity = useRef(new Animated.Value(0)).current;

  const storageKey = `${COMPLETION_KEY_PREFIX}${userId || 'anon'}`;

  // ── Hydrate from storage on mount / userId change ─────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!cancelled) {
          setDone(raw ? JSON.parse(raw) : {});
          setHydrated(true);
        }
      } catch {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  // ── Notify parent when completion count changes ──────────────────
  useEffect(() => {
    if (!hydrated) return;
    onCompletedCountChange?.(Object.values(done).filter(Boolean).length);
  }, [done, hydrated, onCompletedCountChange]);

  // ── Proof banner animation ───────────────────────────────────────
  const flashProof = useCallback((text: string) => {
    setProof({ visible: true, text });
    Animated.sequence([
      Animated.timing(proofOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(proofOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setProof({ visible: false, text: '' }));
  }, [proofOpacity]);

  const persistDone = useCallback(async (key: string) => {
    setDone(prev => {
      const next = { ...prev, [key]: true };
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [storageKey]);

  const handleTap = async (card: StarterCard, idx: number) => {
    const cardKey = `${card.kind}-${idx}`;
    if (done[cardKey] || busyKey) return;       // already locked or another tap in flight

    setBusyKey(cardKey);

    try {
      // import_sms is a permission ask — we cannot mutate state here, so
      // route to Profile (where the SMS permission row lives) AND mark
      // it complete optimistically. If the user denies on the OS dialog,
      // the dismiss is on them; we don't pretend they granted it.
      if (card.kind === 'import_sms') {
        await persistDone(cardKey);
        flashProof(proofTextFor(card));
        // Small delay so the user sees the badge change BEFORE the route.
        setTimeout(() => router.push(ROUTES.PROFILE as any), 600);
        return;
      }

      // Mutation — fire and confirm.
      const method = (card.method || 'POST').toLowerCase();
      const endpoint = (card.endpoint || '').replace(/^\/api/, '');
      if (method === 'post' && endpoint)  await api.post(endpoint, card.payload || {});
      else if (method === 'put' && endpoint) await api.put(endpoint, card.payload || {});

      // Refresh financial context so Hero / WeekStrip pick up the new
      // budget or goal without a manual reload.
      try { await useFinContext.getState().refresh(true); } catch { /* noop */ }

      // STAY ON HOME. Mark done. Show proof.
      await persistDone(cardKey);
      flashProof(proofTextFor(card));
    } catch (e: any) {
      Alert.alert(
        "Couldn't complete",
        e?.response?.data?.detail || 'Network error. Tap again to retry.',
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (!cards || cards.length === 0) return null;

  // Hide deck entirely if not yet hydrated → prevents the brief flash of
  // un-checked cards on remount when completion state hasn't loaded.
  if (!hydrated) return null;

  const totalDone = Object.values(done).filter(Boolean).length;
  const allDone = totalDone >= Math.min(3, cards.length);

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

      {/* Headline switches to celebration once all done — keeps the deck
          visible (so the user retains proof of what they locked) but
          retires the "do this" framing. */}
      <Text style={styles.h1}>
        {allDone
          ? `All ${cards.length} moves done.`
          : `${cards.length} moves in the next 60 seconds.`}
      </Text>
      <Text style={styles.sub} numberOfLines={2}>
        {allDone
          ? `We're tracking the rest. Check back tomorrow.`
          : (anchorCopy || '')}
      </Text>

      {/* Inline proof banner — animated overlay on top of the deck.
          Persists ~3.5s, then fades. Doesn't block taps. */}
      {proof.visible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.proofBanner, { opacity: proofOpacity }]}
        >
          <Ionicons name="checkmark-circle" size={18} color={BR_COLORS.positive ?? '#0B7A3E'} />
          <Text style={styles.proofTxt} numberOfLines={2}>{proof.text}</Text>
        </Animated.View>
      )}

      <View style={styles.deck}>
        {cards.slice(0, 3).map((card, i) => {
          const key = `${card.kind}-${i}`;
          const isDone = !!done[key];
          const isBusy = busyKey === key;

          return (
            <Pressable
              key={key}
              onPress={() => handleTap(card, i)}
              disabled={isDone || !!busyKey}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDone, busy: isBusy }}
              accessibilityLabel={`${card.label}${isDone ? ' (done)' : ''}`}
              style={({ pressed }) => [
                styles.card,
                isDone && styles.cardDone,
                pressed && !isDone && { transform: [{ translateX: 1 }, { translateY: 1 }] },
              ]}
            >
              <View style={styles.cardRow}>
                <View style={[styles.cardIcon, isDone && styles.cardIconDone]}>
                  <Ionicons
                    name={isDone ? 'checkmark' : kindIcon(card.kind)}
                    size={18}
                    color={isDone ? BR_COLORS.positive ?? '#0B7A3E' : BR_COLORS.ink}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.cardLabel, isDone && styles.cardLabelDone]}
                    numberOfLines={2}
                  >
                    {card.label}
                  </Text>
                  {!!card.reason && (
                    <Text
                      style={[styles.cardReason, isDone && styles.cardReasonDone]}
                      numberOfLines={2}
                    >
                      {card.reason}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {isDone ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeTxt}>DONE</Text>
                    </View>
                  ) : (
                    <>
                      {!!card.projected_impact && card.projected_impact > 0 && (
                        <Text style={styles.impact}>{fmtImpact(card.projected_impact)}</Text>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={BR_COLORS.ink} />
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
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

  // ── Proof banner ─────────────────────────────────────────────────
  proofBanner: {
    position: 'absolute',
    left: BR_SPACE.lg,
    right: BR_SPACE.lg,
    top: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.positive ?? '#0B7A3E',
    backgroundColor: BR_COLORS.paper,
    zIndex: 10,
  },
  proofTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: BR_COLORS.ink,
    letterSpacing: -0.1,
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
  cardDone: {
    backgroundColor: BR_COLORS.paperAlt ?? '#F3F2ED',
    borderColor: BR_COLORS.positive ?? '#0B7A3E',
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
  cardIconDone: {
    borderColor: BR_COLORS.positive ?? '#0B7A3E',
    backgroundColor: BR_COLORS.paper,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: -0.2,
  },
  cardLabelDone: {
    color: BR_COLORS.muted,
    textDecorationLine: 'line-through',
  },
  cardReason: {
    fontSize: 11,
    color: BR_COLORS.muted,
    marginTop: 2,
    lineHeight: 15,
  },
  cardReasonDone: {
    color: BR_COLORS.muted,
  },
  impact: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: MONO,
    color: BR_COLORS.positive ?? '#0B7A3E',
    marginBottom: 2,
  },
  doneBadge: {
    borderWidth: 1.5,
    borderColor: BR_COLORS.positive ?? '#0B7A3E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: BR_COLORS.paper,
  },
  doneBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: BR_COLORS.positive ?? '#0B7A3E',
  },
});
