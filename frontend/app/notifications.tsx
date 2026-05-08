/**
 * Notifications screen — R113 brutal convergence.
 *
 * Lists the user's persistent notification feed, newest-first.
 * Migrated from custom styles to BrutalCard + brutal tokens —
 * unread rows pop with `warm` variant, read rows are flat ghosts.
 * EmptyState now uses BrutalEmptyState; mark-all uses BrutalButton.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

import {
  BrutalCard,
  BrutalEmptyState,
  BrutalBadge,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
  PALETTE,
} from '../components/brutal';
import Skeleton from '../components/ui/Skeleton';
import { StaggeredListItem } from '../components/primitives';
import {
  fetchNotifications,
  markRead,
  markAllRead,
  seedSampleNotifications,
  deeplinkFor,
  timeAgo,
  NotifItem,
  NotifKind,
} from '../services/notifications';

const ICONS: Record<NotifKind, { emoji: string; tint: string }> = {
  transaction:  { emoji: '💸', tint: PALETTE.brand },
  streak:       { emoji: '🔥', tint: PALETTE.warm },
  reward:       { emoji: '🎁', tint: PALETTE.purple },
  split:        { emoji: '👥', tint: PALETTE.lime },
  goal:         { emoji: '🎯', tint: PALETTE.cyan },
  budget_alert: { emoji: '⚠️', tint: PALETTE.danger },
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
      if (!list.length) {
        await seedSampleNotifications();
        list = await fetchNotifications(100);
      }
      setItems(list);
    } catch {
      setLoadError(true);
      setItems((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPressItem = useCallback(async (n: NotifItem) => {
    if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
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
    const prev = items || [];
    setItems(prev.map((x) => ({ ...x, read: true })));
    try {
      const n = await markAllRead();
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
      Toast.show({ type: 'success', text1: 'All caught up', text2: n ? `${n} marked as read` : 'Nothing new' });
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
        <BrutalCard
          variant={item.read ? 'base' : 'warm'}
          pressable
          onPress={() => onPressItem(item)}
          flat={item.read}
          style={s.row}
          testID={`notif-row-${item.id}`}
        >
          <View style={[s.iconWrap, { backgroundColor: icon.tint }]}>
            <Text style={s.iconEmoji}>{icon.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.rowHead}>
              <Text numberOfLines={1} style={[s.title, !item.read && s.titleUnread]}>
                {item.title}
              </Text>
              {!item.read && <View style={s.dot} />}
            </View>
            <Text numberOfLines={2} style={s.body}>{item.body}</Text>
            <Text style={s.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </BrutalCard>
      </StaggeredListItem>
    );
  }, [onPressItem]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Brutal header */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={s.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={BR_COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>NOTIFICATIONS</Text>
          {unreadCount > 0 && (
            <Text style={s.headerSub}>{unreadCount} UNREAD</Text>
          )}
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={onMarkAll}
            disabled={markingAll}
            style={s.markAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={BR_COLORS.ink} />
            ) : (
              <Text style={s.markAllTxt}>MARK ALL</Text>
            )}
          </Pressable>
        ) : (
          <View style={{ width: 80 }}>
            <BrutalBadge label="✓" tone="positive" />
          </View>
        )}
      </View>

      {items === null ? (
        <View style={{ padding: BR_SPACE['4'], gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton.Box key={i} h={84} radius={4} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BR_COLORS.ink}
            />
          }
          contentContainerStyle={{
            padding: BR_SPACE['4'],
            paddingBottom: 120,
            gap: BR_SPACE['3'],
          }}
          ListEmptyComponent={
            loadError ? (
              <BrutalEmptyState
                emoji="⚠️"
                title="Couldn't load notifications"
                body="Check your connection and try again."
                ctaLabel="RETRY"
                onCta={() => load()}
              />
            ) : (
              <BrutalEmptyState
                emoji="🔔"
                title="You're all caught up"
                body="New nudges, alerts, and rewards will land here."
                hint="We'll vibrate quietly when something needs you."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BR_COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
    gap: BR_SPACE['3'],
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 15,
  },
  headerSub: {
    ...BR_FONT.caption,
    color: PALETTE.brand,
    fontSize: 9,
    marginTop: 2,
  },
  markAll: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: PALETTE.yellow,
    ...(BR_SHADOW.xs as any),
  },
  markAllTxt: {
    ...BR_FONT.stamp,
    color: BR_COLORS.ink,
    fontSize: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: BR_SPACE['3'],
    padding: BR_SPACE['3'],
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
  },
  iconEmoji: { fontSize: 20 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: BR_COLORS.ink,
  },
  titleUnread: { fontWeight: '900' },
  dot: {
    width: 9,
    height: 9,
    backgroundColor: PALETTE.brand,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
  },
  body: {
    fontSize: 13,
    color: BR_COLORS.text,
    marginTop: 2,
    lineHeight: 18,
    fontWeight: '500',
  },
  time: {
    ...BR_FONT.stamp,
    fontSize: 9,
    color: BR_COLORS.textMuted,
    marginTop: 6,
  },
});
