/**
 * Round 37 — Notifications screen.
 *
 * Lists the user's persistent notification feed, newest-first.
 * Unread rows get a bold title + orange dot; tap marks-read + deep-links
 * to the relevant screen per `kind`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { StaggeredListItem } from '../components/primitives';
import { COLORS, SPACING } from '../utils/theme';
import {
  fetchNotifications, markRead, markAllRead, seedSampleNotifications,
  deeplinkFor, timeAgo, NotifItem, NotifKind,
} from '../services/notifications';

// Categorical icon palette per notification kind. These hex literals are an
// intentional brand identity per Round 50 audit (similar to CATEGORIES[].color
// in theme.ts) — each kind gets a distinct, recognizable tint that reads in
// both light and dark themes.
const ICONS: Record<NotifKind, { emoji: string; tint: string }> = {
  transaction:  { emoji: '💸', tint: '#E84A0C' },
  streak:       { emoji: '🔥', tint: COLORS.accent.secondary },
  reward:       { emoji: '🎁', tint: '#A21CAF' },
  split:        { emoji: '👥', tint: COLORS.state.successAlt },
  goal:         { emoji: '🎯', tint: '#3B82F6' },
  budget_alert: { emoji: '⚠️', tint: COLORS.state.danger },
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotifItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoadError(false);
    try {
      let list = await fetchNotifications(100);
      // Dev convenience — if the feed is completely empty, seed 4 sample rows
      // so the screen isn't a one-shot empty state during local testing.
      if (!list.length) {
        await seedSampleNotifications();
        list = await fetchNotifications(100);
      }
      setItems(list);
    } catch {
      setLoadError(true);
      setItems(items || []);
    }
  }, [items]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPressItem = useCallback(async (n: NotifItem) => {
    if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
    // Optimistic mark-as-read — user expects the dot to disappear instantly.
    if (!n.read) {
      setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markRead(n.id).catch(() => {});
    }
    const route = deeplinkFor(n.kind);
    try { router.push(route as any); } catch { router.replace('/(tabs)' as any); }
  }, []);

  const onMarkAll = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Optimistic — flip everything to read first, roll back on failure.
    const prev = items || [];
    setItems(prev.map((x) => ({ ...x, read: true })));
    try {
      const n = await markAllRead();
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
      Toast.show({ type: 'success', text1: 'All caught up', text2: n ? `${n} marked as read` : 'Nothing new to mark' });
    } catch {
      setItems(prev);
      Toast.show({ type: 'error', text1: "Couldn't mark all", text2: 'Try again in a moment' });
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const unreadCount = (items || []).filter((x) => !x.read).length;

  const renderItem = useCallback(({ item, index }: { item: NotifItem; index: number }) => {
    const icon = ICONS[item.kind] || ICONS.transaction;
    return (
      <StaggeredListItem index={index}>
        <TouchableOpacity
          onPress={() => onPressItem(item)}
          style={[s.row, !item.read && s.rowUnread]}
          accessibilityRole="button"
          accessibilityLabel={`${item.read ? 'Read' : 'Unread'} notification: ${item.title}`}
          activeOpacity={0.7}
        >
          <View style={[s.iconWrap, { backgroundColor: icon.tint + '18' }]}>
            <Text style={s.iconEmoji}>{icon.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.rowHead}>
              <Text numberOfLines={1} style={[s.title, !item.read && s.titleUnread]}>{item.title}</Text>
              {!item.read && <View style={s.dot} />}
            </View>
            <Text numberOfLines={2} style={s.body}>{item.body}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      </StaggeredListItem>
    );
  }, [onPressItem]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={onMarkAll} disabled={markingAll} style={s.markAll} accessibilityRole="button" accessibilityLabel="Mark all as read">
            {markingAll ? <ActivityIndicator size="small" color={COLORS.accent.primary} /> : <Text style={s.markAllTxt}>Mark all read</Text>}
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {items === null ? (
        // Skeleton — 3 placeholder rows.
        <View style={{ padding: SPACING.lg, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton.Box key={i} h={76} radius={16} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120, gap: 8 }}
          ListEmptyComponent={
            loadError ? (
              <EmptyState
                emoji="⚠️"
                title="Couldn't load notifications"
                subtitle="Check your connection and try again"
                ctaLabel="Retry"
                onCta={() => load()}
              />
            ) : (
              <EmptyState
                mascot
                title="You're all caught up"
                subtitle="New nudges, alerts, and rewards will show up here."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.3 },
  markAll: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  markAllTxt: { fontSize: 12, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 0.2 },

  row: {
    flexDirection: 'row', gap: 12, padding: 14, backgroundColor: COLORS.bg.secondary,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border.subtle,
  },
  rowUnread: { backgroundColor: COLORS.accent.brandSoft, borderColor: 'rgba(255,107,26,0.32)' },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 22 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  titleUnread: { fontWeight: '900' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent.primary },
  body: { fontSize: 13, color: COLORS.text.secondary, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, color: COLORS.text.muted, marginTop: 4, fontWeight: '600' },
});
