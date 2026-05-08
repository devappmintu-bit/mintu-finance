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
// R100G — Premium Hub row removed: Premium card moved to Profile per
// user directive. Discover now houses School + Rewards only.
const ROWS: Row[] = [
  { icon: 'school-outline',    label: 'Money School', sub: '60-second daily lessons',    route: ROUTES.MONEY_SCHOOL },
  { icon: 'trophy-outline',    label: 'Rewards',      sub: 'Streaks, badges, history',   route: ROUTES.REWARDS },
];

export default function DiscoverDrawer() {
  const [open, setOpen] = useState(false);
  // R100F — DISCOVER no longer fetches India-finance news. That's
  // Pulse's job (top-left mascot in Home). Keeping news here was
  // duplicate signal and pulled the user out of the Pulse habit loop.
  // The drawer is now a slim navigation shelf for school / premium /
  // streaks etc., reachable but never demanding attention.

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
          {!open && (
            <Text style={styles.newsHint} numberOfLines={1}>
              Money School · Rewards
            </Text>
          )}
        </View>
        <View style={styles.chev}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={BR_COLORS.ink} />
        </View>
      </Pressable>

      {open && (
        <View style={styles.list}>
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
  // Round 99G — fallback hint when news cache is empty so the
  // collapsed accordion never reads as a dead label.
  newsHint: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
    fontSize: 11,
    fontStyle: 'italic',
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
