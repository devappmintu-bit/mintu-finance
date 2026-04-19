import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../utils/theme';
import NewsStoryViewer from './NewsStoryViewer';

interface Props {
  news: any[];
  newsUpdatedAt: string | null;
  newsLoading: boolean;
  onRefresh: () => void;
}

const categoryColor = (cat: string) => {
  switch (cat) {
    case 'alert': return '#EF4444';
    case 'market': return '#10B981';
    case 'scheme': return COLORS.accent.primary;
    case 'tip': return '#F59E0B';
    default: return COLORS.accent.primary;
  }
};

export default function NewsCarousel({ news, newsUpdatedAt, newsLoading, onRefresh }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyStart, setStoryStart] = useState(0);
  return (
    <View style={{ marginBottom: SPACING.lg, marginHorizontal: -SPACING.lg }}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name="newspaper" size={16} color={COLORS.accent.primary} />
          <Text style={s.sectionTitle}>India Finance Today</Text>
          {newsUpdatedAt ? (
            <View style={s.freshPill}>
              <View style={s.freshDot} />
              <Text style={s.freshPillText}>Live</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={s.refreshBtn}
          activeOpacity={0.7}
          disabled={newsLoading}
        >
          {newsLoading ? (
            <ActivityIndicator size="small" color={COLORS.accent.primary} />
          ) : (
            <Ionicons name="refresh" size={14} color={COLORS.accent.primary} />
          )}
        </TouchableOpacity>
      </View>

      {news.length === 0 ? (
        <View style={[s.empty, { marginHorizontal: SPACING.lg }]}>
          <ActivityIndicator size="small" color={COLORS.accent.primary} />
          <Text style={s.emptyText}>Loading today's news...</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={278}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 12 }}
        >
          {news.map((article: any, i: number) => {
            const color = categoryColor(article.category);
            return (
              <TouchableOpacity
                key={i}
                style={[s.card, { borderTopColor: color }]}
                activeOpacity={0.88}
                onPress={() => { setStoryStart(i); setStoryOpen(true); }}
              >
                <View style={s.catRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <View style={[s.catDot, { backgroundColor: color }]} />
                    <Text style={[s.cat, { color }]} numberOfLines={1}>{article.category}</Text>
                  </View>
                  <Text style={{ fontSize: 22 }}>{article.emoji}</Text>
                </View>
                <Text style={s.title} numberOfLines={3}>{article.title}</Text>
                <Text style={s.summary} numberOfLines={4}>{article.summary}</Text>
                <View style={s.footer}>
                  <Text style={s.source} numberOfLines={1}>{article.source}</Text>
                  <View style={s.readMore}>
                    <Text style={s.readMoreText}>Tap to read</Text>
                    <Ionicons name="chevron-forward" size={11} color={color} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={[s.card, s.endCard]}>
            <Ionicons name="checkmark-done-circle" size={28} color={COLORS.accent.primary} />
            <Text style={s.endTitle}>You're caught up!</Text>
            <Text style={s.endSub}>Pull down or tap refresh for updates</Text>
            <TouchableOpacity style={s.endBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Ionicons name="refresh" size={12} color="#fff" />
              <Text style={s.endBtnText}>Refresh now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <NewsStoryViewer
        visible={storyOpen}
        articles={news}
        startIndex={storyStart}
        onClose={() => setStoryOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: COLORS.text.primary },
  freshPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#10B98115', borderRadius: 999 },
  freshDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  freshPillText: { fontSize: 9, fontWeight: '800', color: '#10B981' },
  refreshBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent.primary + '15', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 12, color: COLORS.text.muted, marginTop: 8 },
  card: { width: 260, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border.card, borderTopWidth: 3 },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  cat: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, lineHeight: 19, marginBottom: 6 },
  summary: { fontSize: 12, color: COLORS.text.secondary, lineHeight: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border.subtle },
  source: { fontSize: 10, fontWeight: '700', color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  readMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  readMoreText: { fontSize: 10, fontWeight: '800', color: COLORS.accent.primary, letterSpacing: 0.3 },
  endCard: { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.accent.primary + '08', borderColor: COLORS.accent.primary + '30' },
  endTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text.primary, marginTop: 8 },
  endSub: { fontSize: 11, color: COLORS.text.muted, marginTop: 4, textAlign: 'center' },
  endBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 10 },
  endBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
