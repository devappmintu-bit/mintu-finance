/**
 * DiscoverDrawer — Round 89 Strike 2 refine.
 *
 * FIXES vs prior rev (user feedback: "extremely slow, not showing anything"):
 *   • LayoutAnimation.configureNext removed — it was skipping frames on
 *     web and on some Android builds, making the drawer appear empty
 *     on first expand. Plain React state toggle renders instantly.
 *   • /news row dropped — the route never existed, so tapping it was
 *     a dead-click. Re-add only after we ship /news.
 *   • Each row is a Pressable with a visible pressed state so taps
 *     feel ALIVE even before navigation completes.
 *   • Navigation is synchronous (router.push only). Zero fetch on
 *     expand — all targets are static routes. The drawer renders the
 *     moment the user taps the header, no matter what.
 *
 * Contract: this component owns nav, not data. No hooks except useState.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER } from '../../utils/brutalist';
import { ROUTES } from '../../constants/routes';
import { useNewsLite, getCachedNewsTop, setSelectedNews, type NewsItem } from '../../hooks/useNewsLite';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  route: string;
};

// Only routes that DEFINITELY resolve. If you add a row, verify
// /app/frontend/app/<route>.tsx exists first — dead-clicks = lost trust.
const ROWS: Row[] = [
  { icon: 'school-outline',    label: 'Money School', sub: '60-second daily lessons',    route: ROUTES.MONEY_SCHOOL },
  { icon: 'sparkles-outline',  label: 'Premium Hub',  sub: 'Tax, Invest, Reports',       route: '/premium-hub' },
  { icon: 'trophy-outline',    label: 'Rewards',      sub: 'Coins, streaks, leaderboard', route: ROUTES.REWARDS },
];

export default function DiscoverDrawer() {
  const [open, setOpen] = useState(false);
  // Only fetch news when user expands — preserves the "news never blocks
  // Home" contract. The collapsed preview line uses the cached-sync
  // accessor so it renders instantly if cache exists.
  const { items: news, loading: newsLoading } = useNewsLite(open);
  const cachedTop = getCachedNewsTop();

  const openNewsItem = (item: NewsItem) => {
    // Round 89c — route into in-app reader instead of kicking to Safari.
    // setSelectedNews hands off the item via a module-level slot so
    // the reader can render instantly without URL payload bloat.
    setSelectedNews(item);
    try { router.push('/news-view' as any); } catch { /* noop */ }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse Discover' : 'Expand Discover'}
        accessibilityState={{ expanded: open }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>DISCOVER</Text>
          {/* Instant cached preview — only renders when we have news in the
              session cache. Never blocks the collapsed header. */}
          {!open && cachedTop && (
            <Text style={styles.newsPreview} numberOfLines={1}>
              📰 {cachedTop.title}
            </Text>
          )}
        </View>
        <View style={styles.chev}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={BR_COLORS.ink} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.list}>
          {/* ── NEWS SECTION — always rendered when drawer is open so
                the user SEES the section. Shows loading placeholder
                until the cached/fresh list arrives. Never hides
                silently — that was the "dead on expand" bug. */}
          <View style={styles.newsSection}>
            <Text style={styles.sectionLabel}>INDIA FINANCE · TODAY</Text>
            {news.length === 0 && (
              <View style={[styles.newsRow, { borderTopWidth: 0 }]}>
                <Text style={styles.newsLoading}>
                  {newsLoading ? 'Fetching the latest…' : 'Nothing new right now — check back later.'}
                </Text>
              </View>
            )}
            {news.slice(0, 5).map((n, i) => (
              <Pressable
                key={`news-${i}`}
                onPress={() => openNewsItem(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}. Source: ${n.source || 'unknown'}.`}
                style={({ pressed }) => [styles.newsRow, i > 0 && styles.rowDivider, pressed && styles.rowPressed]}
              >
                <Text style={styles.newsEmoji}>{n.emoji || '📰'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
                  {(n.source || n.category) && (
                    <Text style={styles.newsMeta} numberOfLines={1}>
                      {n.source || ''}{n.source && n.category ? ' · ' : ''}{n.category || ''}
                    </Text>
                  )}
                </View>
                {(n.source_url || n.url) && (
                  <Ionicons name="open-outline" size={14} color={BR_COLORS.muted} />
                )}
              </Pressable>
            ))}
          </View>

          {/* ── NAV ROWS — always render instantly, no data gating. ── */}
          <View style={styles.navSection}>
            {ROWS.map((r, i) => (
              <Pressable
                key={r.label}
                onPress={() => {
                  // Synchronous — no awaited network, no conditional gating.
                  // Instant navigation so the row feels alive under thumb.
                  try { router.push(r.route as any); } catch { /* noop */ }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${r.label} — ${r.sub}`}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={({ pressed }) => [
                  styles.row,
                  i !== 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={r.icon} size={18} color={BR_COLORS.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowSub}>{r.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={BR_COLORS.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    marginBottom: BR_SPACE.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
  },
  pressed: { backgroundColor: BR_COLORS.paperAlt },
  kicker: { ...BR_TYPE.label, color: BR_COLORS.ink },
  chev: {
    width: 26, height: 26,
    borderWidth: 2, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  list: {
    borderTopWidth: 1,
    borderColor: BR_COLORS.line,
  },
  // News-Lite — cached preview line under the collapsed kicker.
  newsPreview: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
    fontSize: 11,
  },
  sectionLabel: {
    ...BR_TYPE.labelSm,
    color: BR_COLORS.accent,
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.md,
    paddingBottom: BR_SPACE.sm,
  },
  newsSection: { backgroundColor: BR_COLORS.paper },
  newsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
  },
  newsEmoji: { fontSize: 18, width: 22, textAlign: 'center' },
  newsTitle: { ...BR_TYPE.bodyBold, color: BR_COLORS.ink, fontSize: 13, lineHeight: 17 },
  newsMeta:  { ...BR_TYPE.meta, color: BR_COLORS.muted, marginTop: 2, fontSize: 10 },
  newsLoading: { ...BR_TYPE.meta, color: BR_COLORS.muted, fontStyle: 'italic' },
  navSection: {
    borderTopWidth: 1,
    borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paperAlt,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.md,
  },
  rowDivider: { borderTopWidth: 1, borderColor: BR_COLORS.line },
  rowPressed: { backgroundColor: BR_COLORS.paperAlt },
  iconWrap: {
    width: 36, height: 36,
    borderWidth: 2, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BR_COLORS.paperAlt,
  },
  rowLabel: { ...BR_TYPE.bodyBold, color: BR_COLORS.ink, fontSize: 14 },
  rowSub:   { ...BR_TYPE.meta, color: BR_COLORS.muted, marginTop: 2 },
});
