/**
 * /news-view — in-app reader for News Stack Lite items.
 *
 * Entry point: DiscoverDrawer > tap a news row. The row stashes the
 * NewsItem on a module-level slot (setSelectedNews) and then pushes
 * this route. We read it synchronously on first paint — no flash,
 * no loading spinner.
 *
 * If someone lands here without a selection (deep-link, back-forward
 * anomaly), we render a graceful empty state with a CTA back to Home.
 *
 * Visual: strict Brutalist — paper background, small-caps source
 * strip, bold title, soft body, thick Ink "Read full story" pill at
 * the bottom that opens the original URL in the system browser.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { getSelectedNews } from '../hooks/useNewsLite';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../utils/brutalist';

function prettyCategory(c?: string): string {
  if (!c) return 'NEWS';
  const k = c.toLowerCase();
  const map: Record<string, string> = {
    market: 'MARKETS',
    markets: 'MARKETS',
    banking: 'BANKING',
    policy: 'POLICY',
    personal_finance: 'PERSONAL FINANCE',
    'personal-finance': 'PERSONAL FINANCE',
    tips: 'TIPS',
    crypto: 'CRYPTO',
    upi: 'UPI',
  };
  return map[k] || c.toUpperCase();
}

export default function NewsViewScreen() {
  const item = useMemo(() => getSelectedNews(), []);

  const hasExternal = !!(item?.source_url || item?.url);
  const onOpenExternal = () => {
    const url = item?.source_url || item?.url;
    if (!url) return;
    try { Linking.openURL(url); } catch { /* noop */ }
  };

  const onBack = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)' as any);
    } catch {
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} testID="news-back" hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>NEWS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.bg}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!item ? (
          <EmptyState onBack={onBack} />
        ) : (
          <>
            {/* Category ribbon */}
            <View style={styles.ribbonWrap}>
              <Text style={styles.ribbonTxt}>
                {prettyCategory(item.category)}
              </Text>
              <View style={styles.ribbonRule} />
              {item.emoji ? (
                <Text style={styles.ribbonEmoji}>{item.emoji}</Text>
              ) : null}
            </View>

            {/* Title */}
            <Text style={styles.title}>{item.title}</Text>

            {/* Source / meta */}
            <View style={styles.metaRow}>
              {item.source ? (
                <Text style={styles.metaTxt} numberOfLines={1}>
                  {item.source.toUpperCase()}
                </Text>
              ) : null}
              {item.published_at ? (
                <Text style={styles.metaDot}>·</Text>
              ) : null}
              {item.published_at ? (
                <Text style={styles.metaTxt}>{formatDate(item.published_at)}</Text>
              ) : null}
            </View>

            {/* Summary body — thick leading for reader comfort */}
            {item.summary ? (
              <Text style={styles.body}>{item.summary}</Text>
            ) : null}

            {/* Fallback disclaimer — LLM-generated content caveat */}
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={14} color={BR_COLORS.muted} />
              <Text style={styles.noteTxt}>
                AI-summarised brief. Tap &ldquo;Read full story&rdquo; below for
                the original source.
              </Text>
            </View>

            {/* Open original source */}
            {hasExternal ? (
              <Pressable
                onPress={onOpenExternal}
                testID="news-open-external"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.primaryBtnTxt}>READ FULL STORY</Text>
                <Ionicons name="open-outline" size={16} color="#fff" />
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No story selected</Text>
      <Text style={styles.emptyBody}>
        Pick a story from Discover on Home.
      </Text>
      <Pressable
        onPress={onBack}
        testID="news-empty-back"
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && { opacity: 0.9 },
          { marginTop: BR_SPACE.lg },
        ]}
      >
        <Text style={styles.primaryBtnTxt}>BACK TO HOME</Text>
      </Pressable>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const mo = d.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
    return `${d.getDate()} ${mo}`;
  } catch { return ''; }
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.sm,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
  },
  backBtn: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 11, fontWeight: '900', letterSpacing: 2,
    color: BR_COLORS.ink,
  },

  scroll: {
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.md,
    paddingBottom: 48,
  },

  ribbonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginBottom: BR_SPACE.md,
  },
  ribbonTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
    color: BR_COLORS.muted,
  },
  ribbonRule: {
    flex: 1,
    height: BR_BORDER.hair,
    backgroundColor: BR_COLORS.line,
  },
  ribbonEmoji: { fontSize: 18 },

  title: {
    fontSize: 26, lineHeight: 30, fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: -0.5,
  },

  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: BR_SPACE.sm,
    gap: 6,
  },
  metaTxt: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: BR_COLORS.muted,
  },
  metaDot: {
    fontSize: 11,
    color: BR_COLORS.muted,
  },

  body: {
    marginTop: BR_SPACE.lg,
    fontSize: 16, lineHeight: 25,
    color: BR_COLORS.ink,
    ...Platform.select({
      web: { fontFamily: 'system-ui, sans-serif' as any },
    }),
  },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: BR_SPACE.xl,
    padding: BR_SPACE.md,
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paperAlt,
  },
  noteTxt: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    flex: 1,
    lineHeight: 16,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: BR_SPACE.lg,
    paddingVertical: 16,
    paddingHorizontal: BR_SPACE.lg,
    backgroundColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  primaryBtnTxt: {
    fontSize: 13, fontWeight: '900', letterSpacing: 2,
    color: '#fff',
  },

  // Empty state
  empty: {
    paddingTop: BR_SPACE.xl * 2,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 22, fontWeight: '900',
    color: BR_COLORS.ink,
  },
  emptyBody: {
    ...BR_TYPE.body,
    color: BR_COLORS.muted,
    marginTop: 6,
    textAlign: 'center',
  },
});
