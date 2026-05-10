/**
 * components/intelligence/MoneyStoryCard.tsx — R118 SLICE A
 *
 * Home-screen entry tile for the AI Money Story (Instagram-style).
 *
 * Rendered as a slim sticker card on the home dashboard:
 *   • bold "MONEY STORY" stamp + month label
 *   • one-line teaser ("₹X moved this April")
 *   • RIGHT pill telling the user how many panels are inside
 * Tap → navigates to /money-story which renders the full swipeable deck.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMoneyStory } from '../../hooks/useIntelligence';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT, BR_STAMP } from '../../utils/brutalist';

const STORY_VIEWED_KEY = '@mintu/money_story_viewed_month_v1';

export default function MoneyStoryCard() {
  const { data, loading } = useMoneyStory();
  const [viewedMonth, setViewedMonth] = useState<string | null>(null);

  // Load last-viewed month on mount so we know when to show the NEW badge.
  useEffect(() => {
    AsyncStorage.getItem(STORY_VIEWED_KEY)
      .then(v => setViewedMonth(v || null))
      .catch(() => {});
  }, []);

  const hero = useMemo(
    () => data?.panels?.find(p => p.kind === 'hero'),
    [data?.panels],
  );

  // The story is "NEW" if its month differs from the last-viewed month
  // we wrote to AsyncStorage. First-time users see the NEW badge on
  // first load (viewedMonth === null), which is the desired behaviour.
  const isFreshStory = useMemo(() => {
    if (!data?.month) return false;
    return data.month !== viewedMonth;
  }, [data?.month, viewedMonth]);

  if (loading && !data) {
    return (
      <View style={[styles.card, styles.skeleton]}>
        <View style={[styles.skeletonLine, { width: '50%' }]} />
        <View style={[styles.skeletonLine, { width: '90%' }]} />
      </View>
    );
  }
  if (!data || !data.panels || data.panels.length === 0) return null;

  const onOpen = async () => {
    // Mark this month as viewed so the NEW badge disappears next mount.
    try {
      await AsyncStorage.setItem(STORY_VIEWED_KEY, data.month);
      setViewedMonth(data.month);
    } catch { /* noop */ }
    router.push('/money-story' as any);
  };

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open AI money story for ${data.month_label}${isFreshStory ? ', new this month' : ''}`}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {/* Decorative stamp */}
      <View style={styles.stamp}>
        <Text style={styles.stampTxt}>STORY</Text>
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>AI MONEY STORY</Text>
          {isFreshStory && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeTxt}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={styles.month}>{data.month_label}</Text>
        <Text style={styles.teaser} numberOfLines={2}>
          {hero?.copy || `${data.panels.length} moments to explore`}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.panelsCount}>{data.panels.length}</Text>
        <Text style={styles.panelsLbl}>PANELS</Text>
        <Ionicons name="chevron-forward" size={16} color={BR_COLORS.ink} style={{ marginTop: 6 }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.md,
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: '#FFF8DC',
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
    ...(BR_STAMP.md as object),
  },
  cardPressed: { transform: [{ translateY: 1 }, { translateX: 1 }] },

  // Sticker rotation for personality
  stamp: {
    width: 56,
    height: 56,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  stampTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },

  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kicker: {
    ...BR_TYPE.label,
    color: BR_COLORS.muted,
    letterSpacing: 1.6,
    fontSize: 10,
  },
  newBadge: {
    backgroundColor: BR_COLORS.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
  },
  newBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.4,
  },
  month: {
    fontSize: 18,
    fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  teaser: {
    fontSize: 12,
    color: BR_COLORS.ink,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 4,
    opacity: 0.85,
  },

  right: { alignItems: 'center', minWidth: 56 },
  panelsCount: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: BR_FONT.mono,
    color: BR_COLORS.ink,
    letterSpacing: -1,
    lineHeight: 28,
  },
  panelsLbl: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: BR_COLORS.muted,
    marginTop: 2,
  },

  // skeleton
  skeleton: {
    backgroundColor: BR_COLORS.paperAlt,
    gap: 8,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: BR_COLORS.line,
    width: '100%',
  },
});
