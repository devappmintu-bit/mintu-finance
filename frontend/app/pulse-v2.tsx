/**
 * Money Pulse v2 — R111.
 *
 * "Inshorts for personal finance" surface. Vertical-snap swipeable
 * card stack — one full-screen card per article — with a top
 * category chip strip and a glanceable "How this affects YOU"
 * personal-impact block on every card.
 *
 * Architecture:
 *   - GET /api/pulse/v2/categories  → chip strip
 *   - GET /api/pulse/v2/feed        → article batch
 *   - POST /api/pulse/v2/react      → like / save / dismiss
 *
 * Design contract (per the master prompt):
 *   1. Zero info fatigue → 1-line headline + 2-line explainer; cards
 *      readable in < 3s. NO walls of text.
 *   2. Personal financial relevance → coloured personal-impact block
 *      with rule-derived ₹-grounded copy.
 *   3. Trust first → source pill + verified ✓ + relative time, never
 *      hidden, always visible top-right.
 *   4. Emotional intelligence → tone words ("ease", "stay invested")
 *      avoid panic & fearmongering.
 *
 * Brutal primitives: built on components/brutal/* — net-new surface
 * #10 in the convergence sprint.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import api from '../utils/api';
import { showBrutalToast } from '../store/brutalToastStore';
import { useNavigationMemory } from '../hooks/useNavigationMemory';
import CalmModeStatusPill from '../components/CalmModeStatusPill';
import {
  BR_COLORS,
  BR_BORDER,
  BR_RADIUS,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';

type Reaction = { kind: string; at: string | null } | null;
type PersonalImpact = {
  tone: 'positive' | 'negative' | 'warning' | 'info';
  label: string;
  message: string;
} | null;

type Article = {
  id: string;
  url: string;
  source: string;
  verified: boolean;
  category: string;
  headline: string;
  explainer: string;
  generic_impact: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  emoji: string;
  published_at: string | null;
  personal_impact: PersonalImpact;
  reaction?: Reaction;
  // R112 — only present on /trending feed
  trending_score?: number;
  engagement?: { likes: number; saves: number };
};

type Category = { key: string; label: string; emoji: string; count: number };

type FeedMode = 'feed' | 'trending' | 'brief';

const MODE_LABEL: Record<FeedMode, string> = {
  feed: 'FOR YOU',
  trending: 'TRENDING',
  brief: 'DAILY BRIEF',
};
const MODE_SUB: Record<FeedMode, string> = {
  feed: 'verified · personalised',
  trending: 'what everyone is reading',
  brief: 'today · 5 picks',
};

const { width: SCR_W, height: SCR_H } = Dimensions.get('window');

// ───────────────────────── helpers ─────────────────────────

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const TONE_BG: Record<string, string> = {
  positive: PALETTE.lime,
  negative: PALETTE.warm,
  warning: PALETTE.peach,
  info: PALETTE.cyan,
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: '🟢',
  negative: '🔴',
  neutral: '🔵',
};

// ─────────────── chip strip ───────────────

function CategoryChips({
  categories, active, onPick,
}: { categories: Category[]; active: string | null; onPick: (k: string | null) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      <Pressable
        onPress={() => onPick(null)}
        style={[styles.chip, !active && styles.chipActive]}
      >
        <Text style={[styles.chipText, !active && styles.chipTextActive]}>ALL</Text>
      </Pressable>
      {categories.filter((c) => c.count > 0).map((c) => (
        <Pressable
          key={c.key}
          onPress={() => onPick(c.key)}
          style={[styles.chip, active === c.key && styles.chipActive]}
        >
          <Text style={styles.chipEmoji}>{c.emoji}</Text>
          <Text style={[styles.chipText, active === c.key && styles.chipTextActive]}>
            {c.label.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─────────────── single card ───────────────

function PulseCard({
  article, height, onReact, onOpen,
}: {
  article: Article;
  height: number;
  onReact: (kind: 'like' | 'save' | 'unlike' | 'unsave') => void;
  onOpen: () => void;
}) {
  const reaction = article.reaction;
  const liked = reaction?.kind === 'like';
  const saved = reaction?.kind === 'save';
  const impact = article.personal_impact;
  const impactBg = impact ? (TONE_BG[impact.tone] || PALETTE.cyan) : PALETTE.cream;

  return (
    <View style={[styles.card, { height }]}>
      {/* Top strip — source / verified / time */}
      <View style={styles.topStrip}>
        <View style={styles.catPill}>
          <Text style={styles.catPillText}>{article.category.toUpperCase().replace('-', ' ')}</Text>
        </View>
        {article.engagement && (article.engagement.likes + article.engagement.saves) > 0 && (
          <View style={styles.trendingPill}>
            <Text style={styles.trendingPillText}>
              🔥 {article.engagement.likes + article.engagement.saves}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={styles.sourceRow}>
          {article.verified && (
            <Ionicons name="shield-checkmark" size={11} color={BR_COLORS.ink} />
          )}
          <Text style={styles.sourceText} numberOfLines={1}>
            {article.source.toUpperCase()}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.timeText}>{relativeTime(article.published_at)}</Text>
        </View>
      </View>

      {/* Hero emoji */}
      <Text style={styles.emoji}>{article.emoji}</Text>

      {/* Headline */}
      <Text style={styles.headline} numberOfLines={4}>
        {article.headline}
      </Text>

      {/* Explainer — 2 lines */}
      <Text style={styles.explainer} numberOfLines={4}>
        {article.explainer}
      </Text>

      <View style={{ flex: 1 }} />

      {/* Personal impact block — the magic */}
      {impact ? (
        <View style={[styles.impact, { backgroundColor: impactBg }]}>
          <View style={styles.impactHead}>
            <Text style={styles.impactStamp}>HOW THIS AFFECTS YOU</Text>
            <View style={styles.impactLabelPill}>
              <Text style={styles.impactLabelText}>{impact.label.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.impactMessage}>{impact.message}</Text>
        </View>
      ) : (
        // Fallback when we don't have a confident personal impact —
        // never fake it; show a generic awareness frame instead.
        <View style={[styles.impact, { backgroundColor: PALETTE.cream }]}>
          <Text style={styles.impactStamp}>{article.generic_impact.toUpperCase()}</Text>
          <Text style={styles.genericNote}>
            {SENTIMENT_DOT[article.sentiment] || '🔵'} Tracking — we{`'`}ll personalise once your data fits this category.
          </Text>
        </View>
      )}

      {/* Action row */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => onReact(liked ? 'unlike' : 'like')}
          hitSlop={8}
          style={[styles.actionBtn, liked && styles.actionBtnOn]}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={18}
            color={liked ? PALETTE.danger : BR_COLORS.ink}
          />
        </Pressable>
        <Pressable
          onPress={() => onReact(saved ? 'unsave' : 'save')}
          hitSlop={8}
          style={[styles.actionBtn, saved && styles.actionBtnOn]}
          accessibilityLabel={saved ? 'Unsave' : 'Save'}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={BR_COLORS.ink}
          />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onOpen}
          style={styles.readBtn}
          accessibilityLabel="Read full article"
        >
          <Text style={styles.readBtnText}>READ FULL</Text>
          <Ionicons name="arrow-forward" size={14} color={'#fff'} />
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────── route ───────────────

export default function PulseV2Screen() {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedMode>('feed');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefDate, setBriefDate] = useState<string | null>(null);
  const listRef = useRef<FlatList<Article>>(null);

  // R119 — restore missing scroll-memory wiring. The references to
  // `navMemo`, `lastScrollOffset`, and `restoreSeqRef` below were
  // emitted by an earlier refactor without the corresponding hook
  // initialisation, throwing `ReferenceError: navMemo is not defined`
  // and white-screening the Pulse tab. Declared here so the
  // mode-swap scroll-restoration logic actually has its dependencies.
  const navMemo = useNavigationMemory();
  const lastScrollOffset = useRef<number>(0);
  const restoreSeqRef = useRef<number>(0);

  // Card height — fills the screen minus header + tabs + chips + safe areas.
  const headerH = 56 + insets.top;
  const tabsH = 44;
  const chipsH = mode === 'feed' ? 48 : 0;
  const cardH = SCR_H - headerH - tabsH - chipsH - insets.bottom - 8;

  const loadCats = useCallback(async () => {
    try {
      const r = await api.get('/pulse/v2/categories');
      const list: Category[] = Array.isArray(r?.data?.categories) ? r.data.categories : [];
      setCategories(list);
    } catch {
      setCategories([]);
    }
  }, []);

  const load = useCallback(async (m: FeedMode, cat: string | null) => {
    setLoading(true);
    setError(null);
    try {
      let list: Article[] = [];
      if (m === 'feed') {
        const params = cat ? { category: cat, limit: 30 } : { limit: 30 };
        const r = await api.get('/pulse/v2/feed', { params });
        list = Array.isArray(r?.data?.articles) ? r.data.articles : [];
        if (list.length === 0) {
          // Cold-start ingest fallback only on default feed.
          try {
            await api.post('/pulse/v2/refresh-now');
            const r2 = await api.get('/pulse/v2/feed', { params });
            list = Array.isArray(r2?.data?.articles) ? r2.data.articles : [];
          } catch { /* noop */ }
        }
      } else if (m === 'trending') {
        const r = await api.get('/pulse/v2/trending', { params: { limit: 20 } });
        list = Array.isArray(r?.data?.articles) ? r.data.articles : [];
      } else {
        const r = await api.get('/pulse/v2/daily-brief');
        list = Array.isArray(r?.data?.articles) ? r.data.articles : [];
        setBriefDate(r?.data?.date || null);
      }
      setArticles(list);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load Pulse');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCats(); }, [loadCats]);
  useEffect(() => { load(mode, mode === 'feed' ? active : null); }, [mode, active, load]);

  const onPickCategory = useCallback((k: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    setActive(k);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const onPickMode = useCallback((m: FeedMode) => {
    if (m === mode) return;
    Haptics.selectionAsync().catch(() => {});
    // C8 — snapshot the current mode's offset before swap so when
    // the user comes back to it, they land exactly where they left.
    navMemo.setMemo(`pulse:scroll:${mode}`, lastScrollOffset.current);
    setMode(m);
    // Restore the target mode's offset (or 0) once the new list mounts.
    const targetOffset = navMemo.getMemo<number>(`pulse:scroll:${m}`) || 0;
    const seq = ++restoreSeqRef.current;
    requestAnimationFrame(() => {
      // Two-frame delay so FlatList has had a chance to mount + measure.
      setTimeout(() => {
        if (seq !== restoreSeqRef.current) return;
        try { listRef.current?.scrollToOffset({ offset: targetOffset, animated: false }); } catch {}
      }, 80);
    });
  }, [mode, navMemo]);

  const onReact = useCallback(async (
    article: Article,
    kind: 'like' | 'save' | 'unlike' | 'unsave',
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Optimistic local update.
    setArticles((prev) =>
      prev.map((a) => {
        if (a.id !== article.id) return a;
        const target = kind === 'unlike' ? null : kind === 'unsave' ? null
          : kind === 'like' ? { kind: 'like', at: new Date().toISOString() }
          : { kind: 'save', at: new Date().toISOString() };
        // unlike/unsave only clears matching reaction kind
        if (kind === 'unlike' && a.reaction?.kind !== 'like') return a;
        if (kind === 'unsave' && a.reaction?.kind !== 'save') return a;
        return { ...a, reaction: target };
      }),
    );
    try {
      await api.post('/pulse/v2/react', { article_id: article.id, kind });
      if (kind === 'save') showBrutalToast('Saved', 'positive', 1200);
      if (kind === 'like') showBrutalToast('Liked', 'positive', 900);
    } catch {
      showBrutalToast('Reaction failed', 'danger');
    }
  }, []);

  const openArticle = useCallback((a: Article) => {
    if (a.url) {
      Linking.openURL(a.url).catch(() => showBrutalToast('Could not open link', 'danger'));
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: Article }) => (
    <PulseCard
      article={item}
      height={cardH}
      onReact={(k) => onReact(item, k)}
      onOpen={() => openArticle(item)}
    />
  ), [cardH, onReact, openArticle]);

  const keyExtractor = useCallback((a: Article) => a.id, []);

  const liveCount = useMemo(
    () => categories.reduce((n, c) => n + (c.count || 0), 0),
    [categories],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{MODE_LABEL[mode]}</Text>
          <Text style={styles.headerSub}>
            {mode === 'brief' && briefDate
              ? `${briefDate} · 5 picks`
              : mode === 'feed' && liveCount > 0
                ? `${liveCount} live · verified sources`
                : MODE_SUB[mode]}
          </Text>
        </View>
        <Pressable
          onPress={() => load(mode, mode === 'feed' ? active : null)}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="Refresh"
        >
          <Ionicons name="refresh" size={18} color={BR_COLORS.ink} />
        </Pressable>
      </View>

      {/* Mode tab strip — FOR YOU / TRENDING / DAILY BRIEF */}
      <View style={styles.modeRow}>
        {(['feed', 'trending', 'brief'] as FeedMode[]).map((m) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => onPickMode(m)}
              style={[styles.modeTab, on && styles.modeTabOn]}
              accessibilityLabel={MODE_LABEL[m]}
            >
              <Text style={[styles.modeTabText, on && styles.modeTabTextOn]}>
                {MODE_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* R117 — Calm Mode tone reflector. Subtle pill that lets the
          user know which mood Pulse is colored for today. Pulse is
          one of the loudest, news-heaviest screens; surfacing the
          state here creates continuity with Home + Profile. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, alignItems: 'flex-start' }}>
        <CalmModeStatusPill />
      </View>

      {/* Category strip — only in FOR YOU mode */}
      {mode === 'feed' && (
        <View style={styles.chipsBar}>
          <CategoryChips categories={categories} active={active} onPick={onPickCategory} />
        </View>
      )}

      {/* Vertical snap feed */}
      {loading && articles.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={BR_COLORS.ink} />
          <Text style={styles.emptyText}>Pulling the latest…</Text>
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={() => load(mode, mode === 'feed' ? active : null)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{mode === 'brief' ? '☀️' : '📡'}</Text>
          <Text style={styles.emptyText}>
            {mode === 'brief'
              ? 'Brief is empty.\nReact to a few cards in FOR YOU first — then come back tomorrow.'
              : mode === 'trending'
                ? 'Nothing trending yet.\nLike or save articles to seed the trending feed.'
                : 'No headlines yet for this category.\nTap refresh in 30s.'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={articles}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={cardH + 8}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScroll={(e) => { lastScrollOffset.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={250}
          contentContainerStyle={{ paddingHorizontal: BR_SPACE['3'] }}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────── styles ───────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
  },
  headerBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 13 },
  headerSub: { ...BR_FONT.caption, color: BR_COLORS.textMuted, fontSize: 9, marginTop: 1 },

  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: BR_SPACE['3'],
    paddingTop: BR_SPACE['2'],
    paddingBottom: BR_SPACE['2'],
    gap: 6,
    borderBottomWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.bg,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  modeTabOn: { backgroundColor: BR_COLORS.ink, ...(BR_SHADOW.xs as any) },
  modeTabText: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 10 },
  modeTabTextOn: { color: '#fff' },

  trendingPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: PALETTE.warm,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
  },
  trendingPillText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
  },

  chipsBar: {
    paddingTop: BR_SPACE['2'],
    paddingBottom: BR_SPACE['1'],
    borderBottomWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.bg,
  },
  chipRow: {
    paddingHorizontal: BR_SPACE['3'],
    gap: 6,
    alignItems: 'center',
    paddingBottom: BR_SPACE['2'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: BR_SPACE['3'],
    paddingVertical: 6,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  chipActive: { backgroundColor: BR_COLORS.ink },
  chipEmoji: { fontSize: 11 },
  chipText: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 10 },
  chipTextActive: { color: '#fff' },

  card: {
    width: SCR_W - BR_SPACE['3'] * 2,
    marginVertical: 4,
    padding: BR_SPACE['5'],
    backgroundColor: BR_COLORS.card,
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    borderRadius: BR_RADIUS.md,
    ...(BR_SHADOW.lg as any),
  },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: BR_SPACE['4'],
    gap: BR_SPACE['2'],
  },
  catPill: {
    paddingHorizontal: BR_SPACE['2'],
    paddingVertical: 3,
    backgroundColor: PALETTE.brand,
    borderWidth: BR_BORDER.fine,
    borderColor: BR_COLORS.ink,
  },
  catPillText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 10,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceText: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
    maxWidth: 110,
  },
  dot: { color: BR_COLORS.textMuted, fontSize: 10 },
  timeText: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 10,
  },
  emoji: { fontSize: 36, marginBottom: BR_SPACE['3'] },
  headline: {
    ...BR_FONT.h1,
    color: BR_COLORS.ink,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: BR_SPACE['3'],
  },
  explainer: {
    ...BR_FONT.body,
    color: BR_COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: BR_SPACE['4'],
  },

  impact: {
    padding: BR_SPACE['3'],
    borderWidth: BR_BORDER.thick,
    borderColor: BR_COLORS.ink,
    marginBottom: BR_SPACE['3'],
  },
  impactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  impactStamp: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
  },
  impactLabelPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: BR_COLORS.ink,
  },
  impactLabelText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 9,
  },
  impactMessage: {
    ...BR_FONT.body,
    color: BR_COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  genericNote: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
  },
  actionBtnOn: { backgroundColor: PALETTE.cream },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: 10,
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
  },
  readBtnText: {
    ...BR_FONT.stamp,
    color: '#fff',
    fontSize: 11,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: BR_SPACE['6'],
    gap: BR_SPACE['3'],
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: {
    ...BR_FONT.body,
    color: BR_COLORS.textMuted,
    textAlign: 'center',
    fontSize: 13,
  },
  retryBtn: {
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['2'],
    backgroundColor: BR_COLORS.ink,
  },
  retryText: { ...BR_FONT.stamp, color: '#fff', fontSize: 11 },
});
