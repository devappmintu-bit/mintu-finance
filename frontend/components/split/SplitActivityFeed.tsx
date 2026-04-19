/**
 * MintU 2.0 — Split Activity Feed (emotional redesign)
 * Replaces cold transactional view with a warm, social activity stream:
 * - "You settled ₹450 with Riya 💙"
 * - "Arjun added ₹300 for Lunch"
 * - "🎉 Anita paid you ₹1,200"
 * Plus: monthly settle count + top friend highlight.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, shadowStyle } from '../../utils/theme';

type FeedItem = {
  type: 'settled_out' | 'settled_in' | 'expense_added';
  emoji: string;
  title: string;
  subtitle: string;
  amount: number;
  direction: 'in' | 'out' | 'neutral';
  timestamp: string;
  group_id?: string;
};

type Props = {
  data: {
    feed: FeedItem[];
    headline: string;
    settled_this_month: { count: number; amount: number };
    top_friend: { name: string; count: number } | null;
  } | null;
  onPressItem?: (item: FeedItem) => void;
};

const relTime = (iso: string) => {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}d`;
    return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
};

export default function SplitActivityFeed({ data, onPressItem }: Props) {
  if (!data || !data.feed || data.feed.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.emptyBox}>
          <Ionicons name="people-outline" size={32} color={COLORS.text.muted} />
          <Text style={s.emptyTitle}>No activity yet</Text>
          <Text style={s.emptySub}>{data?.headline || 'Start splitting with friends to see your activity here 👋'}</Text>
        </View>
      </View>
    );
  }

  const { feed, headline, settled_this_month, top_friend } = data;

  return (
    <View style={s.card}>
      {/* Emotional header */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>RECENT ACTIVITY</Text>
          <Text style={s.headline}>{headline}</Text>
        </View>
      </View>

      {/* Stats chip row */}
      {(settled_this_month.count > 0 || top_friend) && (
        <View style={s.statChipRow}>
          {settled_this_month.count > 0 && (
            <View style={[s.statChip, { backgroundColor: '#10B98118' }]}>
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text style={[s.statChipText, { color: '#059669' }]}>
                {settled_this_month.count} settled · ₹{Math.round(settled_this_month.amount).toLocaleString('en-IN')}
              </Text>
            </View>
          )}
          {top_friend && top_friend.count >= 2 && (
            <View style={[s.statChip, { backgroundColor: '#E6510018' }]}>
              <Text style={s.heartEmoji}>💙</Text>
              <Text style={[s.statChipText, { color: '#E65100' }]}>Top: {top_friend.name}</Text>
            </View>
          )}
        </View>
      )}

      {/* Feed items */}
      <View style={s.feedList}>
        {feed.slice(0, 6).map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[s.feedItem, i === feed.slice(0, 6).length - 1 && { borderBottomWidth: 0 }]}
            activeOpacity={onPressItem ? 0.7 : 1}
            onPress={() => onPressItem?.(item)}
          >
            <View style={[s.feedEmojiCircle, { backgroundColor: item.direction === 'in' ? '#10B98115' : item.direction === 'out' ? '#E6510015' : '#F3F4F6' }]}>
              <Text style={s.feedEmoji}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.feedTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={s.feedSub} numberOfLines={1}>{item.subtitle}</Text>
            </View>
            <Text style={s.feedTime}>{relTime(item.timestamp)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border.card,
    ...shadowStyle('#2E1F1A', 2, 10, 0.05, 3),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headerLabel: { fontSize: 10, fontWeight: '800', color: '#E65100', letterSpacing: 1, marginBottom: 3 },
  headline: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary, lineHeight: 19 },
  statChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statChipText: { fontSize: 11, fontWeight: '700' },
  heartEmoji: { fontSize: 12 },
  feedList: { marginTop: 10 },
  feedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  feedEmojiCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  feedEmoji: { fontSize: 16 },
  feedTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary, lineHeight: 18 },
  feedSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 1, fontWeight: '500' },
  feedTime: { fontSize: 10, color: COLORS.text.muted, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary },
  emptySub: { fontSize: 12, color: COLORS.text.muted, textAlign: 'center', lineHeight: 17 },
});
