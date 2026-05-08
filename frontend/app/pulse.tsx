/**
 * MintU Pulse — Instagram story-style Money Signal Layer (R100I).
 *
 * R100I rebuild per user directive:
 *   "Make the india finance news instagram story style design — not
 *    vertical scroll. Every news as a separate story card."
 *
 * Visual grammar: full-screen story cards, horizontal paging, segment
 * progress bars at the top (one per card, animated fill), tap-zones
 * for prev/next, long-press to pause. Mirrors Instagram/WhatsApp
 * Stories behavior so the gesture vocabulary is instantly familiar.
 *
 * Header copy is the locked brand line:
 *     "What's affecting your money today"
 *
 * Gestures:
 *   tap right edge → next card
 *   tap left edge  → previous card
 *   long-press     → pause auto-advance
 *   swipe horiz    → jump cards
 *   tap 🤖         → send the card's ai_prompt_seed into the AI Coach
 *
 * Anti-patterns explicitly avoided (re-read before changing):
 *   • No share / save / like buttons → the card is a decision prompt,
 *     not a social post.
 *   • No "Related" carousel → feed MUST end when the cards end.
 *     Users should close Pulse feeling "done", not endlessly scrolling.
 *   • No ads, no sponsored cards, no "Premium" teaser inside Pulse.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import api from '../utils/api';
import MintuMascot from '../components/MintuMascot';
import { BR_COLORS, BR_FONT } from '../utils/brutalist';
import { useAIPrompt, type PulseContext } from '../store/aiPromptStore';

const { ink: INK, paper: PAPER, accent: ACCENT, line: LINE, muted: MUTED, positive: OK, negative: DANGER } = BR_COLORS;
const MONO = BR_FONT.mono;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Story-style auto-advance duration. Instagram defaults to ~5s for
// images; Pulse cards have more text + the impact layer to digest, so
// we lean longer. Long-press pauses; releasing resumes at the same
// progress instead of restarting (story-app convention).
const STORY_DURATION_MS = 8000;

type Impact = {
  kind: 'expense' | 'income' | 'suggestion' | 'low_relevance';
  icon: string;
  text: string;
};

type PulseCard = {
  id: string;
  category: 'rbi' | 'markets' | 'banking' | 'tax' | 'upi_fintech' | 'jobs_salary';
  headline: string;
  summary: string;
  emoji: string;
  source: string;
  source_url?: string;
  impacts: Impact[];
  importance: 'low' | 'normal' | 'high';
  ai_prompt_seed: string;
  published_at: string;
};

const CAT_LABEL: Record<PulseCard['category'], string> = {
  rbi: 'RBI · INTEREST',
  markets: 'MARKETS',
  banking: 'BANKING',
  tax: 'TAX',
  upi_fintech: 'UPI · FINTECH',
  jobs_salary: 'JOBS · SALARY',
};

export default function PulseModal() {
  const [cards, setCards] = useState<PulseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const listRef = useRef<FlatList<PulseCard> | null>(null);
  const seenMarked = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Fetch feed.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get('/pulse');
        if (!alive) return;
        setCards((r.data?.cards || []) as PulseCard[]);
      } catch {
        /* show empty state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mark seen once, on first viewable card.
  useEffect(() => {
    if (cards.length === 0 || seenMarked.current) return;
    seenMarked.current = true;
    api.post('/pulse/seen').catch(() => {
      /* non-critical */
    });
  }, [cards]);

  // R100I — Story-style auto-advance. When the active card changes
  // (or the user resumes from pause), restart the progress animation
  // from 0 → 1 over STORY_DURATION_MS, then advance to next card.
  // Stops at the final card so the feed has a real end.
  useEffect(() => {
    if (paused || cards.length === 0) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      // Advance — but stop at the last card. Closing on overflow
      // would feel like "kicked out"; better to just hold the last
      // card until user taps close.
      if (activeIdx < cards.length - 1) {
        scrollToIdx(activeIdx + 1);
      }
    });
    return () => { anim.stop(); };
  }, [activeIdx, paused, cards.length, progress]);

  const scrollToIdx = useCallback((idx: number) => {
    if (idx < 0 || idx >= cards.length) return;
    listRef.current?.scrollToOffset({
      offset: idx * SCREEN_W,
      animated: true,
    });
    setActiveIdx(idx);
  }, [cards.length]);

  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        setActiveIdx(viewableItems[0].index);
      }
    }
  ).current;
  const viewabilityCfg = useRef({ itemVisiblePercentThreshold: 75 }).current;

  // Tap-zone handlers — story-app convention.
  const onTapPrev = useCallback(() => {
    scrollToIdx(Math.max(0, activeIdx - 1));
  }, [activeIdx, scrollToIdx]);
  const onTapNext = useCallback(() => {
    if (activeIdx < cards.length - 1) {
      scrollToIdx(activeIdx + 1);
    } else {
      router.back();
    }
  }, [activeIdx, cards.length, scrollToIdx]);

  const askAi = useCallback((card: PulseCard) => {
    // R100E — Pulse → AI Coach BRIDGE.
    // Don't lean on URL params (RN deeplink truncation + URL-encoded JSON is
    // brittle). Push a structured payload into the zustand prompt store and
    // route. AICoachChat already consumes `pending` on mount; we add an
    // `activeContext` field so the chat can render the "📌 From Pulse" pill
    // even after the auto-fire has consumed `pending`.
    const ctx: PulseContext = {
      kind: 'pulse',
      headline: card.headline,
      summary: card.summary,
      category: CAT_LABEL[card.category] || card.category,
      source: card.source,
      // Strip down to fields the chat actually renders — avoid serialising
      // anything we don't show.
      impacts: (card.impacts || []).map((i) => ({
        kind: i.kind,
        icon: i.icon,
        text: i.text,
      })),
    };
    // The user-visible message. Keep short — the impact bullets carry the
    // domain-specific signal, the chat pill displays the headline, and the
    // backend coach already has the full context via the conversation start.
    const userMessage =
      `What should I do about this?\n\n` +
      `📌 ${card.headline}\n\n` +
      (card.summary ? `Background: ${card.summary}\n\n` : '') +
      `Impacts on me:\n` +
      ctx.impacts.map((i) => `• ${i.text}`).join('\n') +
      `\n\nAnswer in 3 specific bullet points. No generic advice.`;

    useAIPrompt.getState().set(userMessage, 'free', 'pulse', ctx);
    router.replace('/(tabs)/ai-coach' as any);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={st.root}>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
        <Header />
        <View style={st.loadingPane}>
          <ActivityIndicator size="small" color={INK} />
        </View>
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={st.root}>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
        <Header />
        <View style={st.emptyPane}>
          <MintuMascot size={120} state="idle" style={{ marginBottom: 20 }} />
          <Text style={st.emptyTitle}>Nothing to flag today.</Text>
          <Text style={st.emptyBody}>
            We only surface news that actually moves your money. Quiet days
            are good days — come back tomorrow.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [st.closeBtn, pressed && st.closeBtnPressed]}
          >
            <Text style={st.closeBtnText}>BACK TO MINTU</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.root}>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />

      {/* R100I — Segment progress bars (one per card). Active segment
          fills with the auto-advance timer; past segments are full;
          future segments are empty. Mirrors Instagram/WhatsApp story
          segment bar at the top. */}
      <View style={st.segments}>
        {cards.map((_, idx) => {
          const isPast = idx < activeIdx;
          const isActive = idx === activeIdx;
          return (
            <View key={idx} style={st.segmentTrack}>
              <Animated.View
                style={[
                  st.segmentFill,
                  {
                    width: isPast
                      ? '100%'
                      : isActive
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <Header activeIdx={activeIdx} total={cards.length} />

      <FlatList
        ref={listRef}
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <PulseCardView card={item} width={SCREEN_W} onAskAi={askAi} />
        )}
        horizontal
        pagingEnabled
        snapToInterval={SCREEN_W}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityCfg}
        getItemLayout={(_, idx) => ({
          length: SCREEN_W,
          offset: SCREEN_W * idx,
          index: idx,
        })}
      />

      {/* R100I — Tap zones overlay. Left half = previous, right half =
          next. Long-press anywhere = pause. The pressables sit BEHIND
          the card content (zIndex: -1 via pointerEvents on the card)
          so internal CTAs (Ask MintU button) still work. We use a
          two-column layout above the card content with pointerEvents
          'box-only' on the wrapper so taps land on the zones unless
          they hit a clickable child. */}
      <View style={st.tapZones} pointerEvents="box-none">
        <Pressable
          style={st.tapPrev}
          onPress={onTapPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={200}
        />
        <Pressable
          style={st.tapNext}
          onPress={onTapNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={200}
        />
      </View>
    </SafeAreaView>
  );
}

const HEADER_H = 56;

function Header({ activeIdx, total }: { activeIdx?: number; total?: number }) {
  return (
    <View style={st.header}>
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close">
        <Ionicons name="close" size={26} color={INK} />
      </Pressable>
      <View style={st.headerMid}>
        <Text style={st.headerTitle} numberOfLines={1}>
          What's affecting your money today
        </Text>
        {typeof activeIdx === 'number' && typeof total === 'number' && total > 0 ? (
          <Text style={st.headerProgress}>
            {activeIdx + 1} / {total}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 26 }} />
    </View>
  );
}

function PulseCardView({
  card,
  width,
  onAskAi,
}: {
  card: PulseCard;
  width: number;
  onAskAi: (c: PulseCard) => void;
}) {
  const isImportant = card.importance === 'high';
  return (
    <View style={[st.card, { width }]}>
      {/* Top meta strip: category tag + source */}
      <View style={st.metaRow}>
        <View style={[st.catTag, isImportant && st.catTagImportant]}>
          <Text style={[st.catTagText, isImportant && st.catTagTextImportant]}>
            {CAT_LABEL[card.category] || 'SIGNAL'}
          </Text>
        </View>
        {card.source ? <Text style={st.sourceText}>{card.source}</Text> : null}
      </View>

      {/* Big emoji visual — stands in for the article image. Intentionally
          minimal; feels authored, not stock. */}
      <View style={st.visualBlock}>
        <Text style={st.visualEmoji}>{card.emoji}</Text>
      </View>

      {/* Headline + summary */}
      <Text style={st.headline}>{card.headline}</Text>
      <Text style={st.summary}>{card.summary}</Text>

      {/* Divider */}
      <View style={st.divider} />

      {/* IMPACT LAYER — mandatory, the whole point of Pulse */}
      <View style={st.impactBlock}>
        <Text style={st.impactKicker}>WHY THIS MATTERS TO YOU</Text>
        {card.impacts.map((imp, idx) => (
          <View
            key={idx}
            style={[
              st.impactRow,
              imp.kind === 'expense' && st.impactRowExpense,
              imp.kind === 'income' && st.impactRowIncome,
              imp.kind === 'suggestion' && st.impactRowSuggestion,
            ]}
          >
            <Text style={st.impactIcon}>{imp.icon}</Text>
            <Text style={st.impactText}>{imp.text}</Text>
          </View>
        ))}
      </View>

      {/* Ask MintU CTA */}
      <Pressable
        onPress={() => onAskAi(card)}
        style={({ pressed }) => [st.askBtn, pressed && st.askBtnPressed]}
      >
        <MintuMascot size={24} state="idle" />
        <Text style={st.askBtnText}>ASK MINTU ABOUT THIS</Text>
        <Ionicons name="arrow-forward" size={16} color={INK} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },

  // R100I — Segment progress bars (Instagram/WhatsApp story style).
  // One thin track per card across the top of the screen; active
  // segment fills with the auto-advance animation, past segments
  // are full, future segments are empty.
  segments: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  segmentTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    backgroundColor: INK,
    borderRadius: 1.5,
  },

  // R100I — Tap zones overlay (story-app convention).
  // Two transparent halves above the card content — left half = prev,
  // right half = next, long-press = pause. pointerEvents 'box-none' on
  // the wrapper lets internal CTAs (Ask MintU button) still receive
  // taps because they sit above this layer in z-order.
  tapZones: {
    position: 'absolute',
    top: 56,        // below segments + header
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapPrev: { width: '30%' },
  tapNext: { flex: 1 },

  header: {
    height: HEADER_H,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.2,
  },
  headerProgress: {
    fontSize: 10,
    color: MUTED,
    fontFamily: MONO,
    marginTop: 2,
    letterSpacing: 1.5,
  },

  loadingPane: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  closeBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: INK,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  closeBtnPressed: { transform: [{ translateY: 1 }] },
  closeBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },

  card: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  catTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  catTagImportant: { backgroundColor: INK },
  catTagText: { fontSize: 10, fontWeight: '900', color: INK, letterSpacing: 1.5 },
  catTagTextImportant: { color: '#fff' },
  sourceText: { fontSize: 11, color: MUTED, fontWeight: '700', letterSpacing: 1 },

  visualBlock: {
    height: 96,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  visualEmoji: { fontSize: 52, lineHeight: 58 },

  headline: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 8,
  },
  summary: { fontSize: 14, color: MUTED, lineHeight: 20, marginBottom: 16 },

  divider: { height: 1, backgroundColor: INK, marginBottom: 16 },

  impactBlock: { marginBottom: 20 },
  impactKicker: {
    fontSize: 10,
    fontWeight: '900',
    color: INK,
    letterSpacing: 2,
    marginBottom: 10,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  impactRowExpense: { borderLeftWidth: 5, borderLeftColor: DANGER },
  impactRowIncome: { borderLeftWidth: 5, borderLeftColor: OK },
  impactRowSuggestion: { borderLeftWidth: 5, borderLeftColor: ACCENT },
  impactIcon: { fontSize: 18, marginRight: 10, lineHeight: 22 },
  impactText: { flex: 1, fontSize: 13, color: INK, lineHeight: 18, fontWeight: '600' },

  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: PAPER,
    gap: 8,
    marginTop: 'auto',
  },
  askBtnPressed: { transform: [{ translateY: 1 }] },
  askBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: INK,
    letterSpacing: 1.5,
  },
});
