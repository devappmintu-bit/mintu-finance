/**
 * BudgetAchievements — Phase-3 Gamification strip for the Budget screen.
 *
 * Renders:
 *   1. A streak hero card (current streak • progress bar to next milestone)
 *   2. Horizontal list of badges (locked / unlocked + progress %)
 *
 * Data:  GET /api/budgets/achievements
 *        → { streak, stats, badges, next_badge, headline }
 *
 * Pull-to-refresh cascades down from parent BudgetScreen; this component
 * only exposes a `refreshKey` prop so it re-fetches when the parent does.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import useFocusRefresh from '../../hooks/useFocusRefresh';
import { View, Text, StyleSheet, ScrollView, Animated, Easing, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';

type Badge = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  unlocked: boolean;
  progress_pct: number;
  progress_label: string;
};
type Achievements = {
  streak: { current_days: number; longest_days: number; target: number; pct: number };
  stats: {
    days_under_budget_mtd: number;
    days_in_month_so_far: number;
    under_rate_pct: number;
    categories_under: number;
    categories_over: number;
    total_categories: number;
    saved_amount: number;
    saved_pct: number;
  };
  badges: Badge[];
  next_badge: Badge | null;
  headline: string;
};

type Props = {
  refreshKey?: number;   // bump this from parent to force re-fetch (e.g. on pull-to-refresh)
  onBadgePress?: (b: Badge) => void;
};

export default function BudgetAchievements({ refreshKey = 0, onBadgePress }: Props) {
  const [data, setData] = useState<Achievements | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/budgets/achievements');
      setData(r.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useFocusRefresh(load);

  // Streak flame pulse
  const pulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);
  const flameScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  // Streak progress bar fill animation
  const fill = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (data?.streak?.pct != null) {
      Animated.timing(fill, { toValue: data.streak.pct / 100, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
  }, [data?.streak?.pct, fill]);

  const sortedBadges = useMemo(() => {
    if (!data?.badges) return [];
    // Unlocked first, then highest progress
    return [...data.badges].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return b.progress_pct - a.progress_pct;
    });
  }, [data]);

  if (loading) {
    return (
      <View style={s.skelCard}>
        <View style={s.skelLine} />
        <View style={[s.skelLine, { width: '60%', marginTop: 8 }]} />
      </View>
    );
  }
  if (!data) return null;

  const { streak, stats, headline } = data;
  const hasBudgets = stats.total_categories > 0;

  return (
    <View style={s.wrap}>
      {/* ── Streak hero card ── */}
      <LinearGradient
        colors={streak.current_days >= 3
          ? ['#F56E1E', '#C14A06']  // active streak: saffron fire
          : ['#2C1810', '#4A2F1F']} // cool state: deep espresso
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={{ flex: 1 }}>
          <View style={s.headRow}>
            <Animated.Text style={[s.flame, { transform: [{ scale: flameScale }] }]}>
              {streak.current_days >= 30 ? '🌟' : streak.current_days >= 7 ? '🔥' : streak.current_days >= 1 ? '✨' : '🎯'}
            </Animated.Text>
            <View style={{ flex: 1 }}>
              <Text style={s.streakDays}>
                {streak.current_days}
                <Text style={s.streakDaysSmall}>{streak.current_days === 1 ? ' day' : ' days'}</Text>
              </Text>
              <Text style={s.streakSub}>{headline}</Text>
            </View>
          </View>

          {hasBudgets && (
            <>
              <View style={s.progressTrack}>
                <Animated.View
                  style={[
                    s.progressFill,
                    { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                  ]}
                />
              </View>
              <View style={s.progRow}>
                <Text style={s.progressLabel}>{`${streak.current_days} / ${streak.target} days`}</Text>
                <Text style={s.progressLabel}>{`Longest: ${streak.longest_days}d`}</Text>
              </View>
            </>
          )}
        </View>
      </LinearGradient>

      {/* ── MTD stat chips ── */}
      {hasBudgets && (
        <View style={s.chipRow}>
          <View style={s.chip}>
            <Text style={s.chipVal}>{stats.days_under_budget_mtd}</Text>
            <Text style={s.chipLbl}>days under</Text>
          </View>
          <View style={s.chip}>
            <Text style={[s.chipVal, { color: stats.categories_over === 0 ? '#10B981' : '#F56E1E' }]}>
              {stats.categories_under}/{stats.total_categories}
            </Text>
            <Text style={s.chipLbl}>cats on track</Text>
          </View>
          <View style={s.chip}>
            <Text style={[s.chipVal, { color: '#10B981' }]}>{`₹${Math.round(stats.saved_amount).toLocaleString('en-IN')}`}</Text>
            <Text style={s.chipLbl}>{`saved (${stats.saved_pct}%)`}</Text>
          </View>
        </View>
      )}

      {/* ── Badge strip ── */}
      <View style={s.badgeHeader}>
        <Text style={s.badgeTitle}>Achievements</Text>
        <Text style={s.badgeCount}>
          {data.badges.filter(b => b.unlocked).length}/{data.badges.length} unlocked
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgeList}>
        {sortedBadges.map((b) => (
          <TouchableOpacity
            key={b.id}
            activeOpacity={0.85}
            onPress={() => onBadgePress?.(b)}
            style={[s.badge, b.unlocked ? s.badgeOn : s.badgeOff]}
          >
            <Text style={[s.badgeEmoji, !b.unlocked && s.badgeEmojiOff]}>{b.emoji}</Text>
            <Text style={[s.badgeName, !b.unlocked && s.badgeNameOff]} numberOfLines={1}>{b.name}</Text>
            {b.unlocked ? (
              <View style={s.unlockedPill}>
                <Ionicons name="checkmark-circle" size={10} color="#fff" />
                <Text style={s.unlockedT}>Unlocked</Text>
              </View>
            ) : (
              <View style={s.lockedRow}>
                <View style={s.bTrack}>
                  <View style={[s.bFill, { width: `${b.progress_pct}%` }]} />
                </View>
                <Text style={s.bLabel}>{b.progress_label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const BG = '#FFF7ED';
const CARD = '#FFFFFF';
const BORDER = '#FED7AA';

const s = StyleSheet.create({
  wrap: { marginBottom: 12 },

  hero: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#C14A06',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  flame: { fontSize: 32 },
  streakDays: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  streakDaysSmall: { fontSize: 14, fontWeight: '700', opacity: 0.85 },
  streakSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', marginTop: -2 },

  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden', marginTop: 4,
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#FEF3C7' },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: {
    flex: 1, backgroundColor: CARD, borderRadius: 14, paddingVertical: 10,
    paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: BORDER,
  },
  chipVal: { fontSize: 16, fontWeight: '900', color: COLORS.text.primary, letterSpacing: -0.3 },
  chipLbl: { fontSize: 10.5, fontWeight: '700', color: COLORS.text.muted, marginTop: 2, textAlign: 'center' },

  badgeHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, paddingHorizontal: 2,
  },
  badgeTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.2 },
  badgeCount: { fontSize: 11, fontWeight: '700', color: COLORS.text.muted },

  badgeList: { gap: 10, paddingBottom: 4, paddingRight: 16 },
  badge: {
    width: 140, borderRadius: 16, padding: 12,
    borderWidth: 1.5,
    backgroundColor: CARD,
    alignItems: 'center',
  },
  badgeOn: { borderColor: '#F56E1E', backgroundColor: '#FFF7ED' },
  badgeOff: { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', opacity: 0.85 },
  badgeEmoji: { fontSize: 30, marginBottom: 4 },
  badgeEmojiOff: { opacity: 0.45 },
  badgeName: { fontSize: 12.5, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center' },
  badgeNameOff: { color: COLORS.text.tertiary },

  unlockedPill: {
    marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F56E1E', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  unlockedT: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  lockedRow: { width: '100%', marginTop: 6, alignItems: 'center' },
  bTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  bFill: { height: 4, borderRadius: 2, backgroundColor: '#F56E1E' },
  bLabel: { fontSize: 10, fontWeight: '700', color: COLORS.text.tertiary, marginTop: 4 },

  skelCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: BORDER, height: 110,
  },
  skelLine: { height: 14, borderRadius: 7, backgroundColor: '#FED7AA', width: '40%' },
});
