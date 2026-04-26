/**
 * Money School — dedicated premium feature route.
 *
 * Premium users get access to an AI-personalized daily lesson flow:
 *   • Hero: today's lesson (title + 1-line personal tip)
 *   • Cards: swipeable micro-lessons from /money-school/cards
 *   • Progress: XP + level
 *
 * Free users see a locked preview + an Upgrade CTA that opens Premium Hub.
 * This is a SEPARATE experience from the generic AI Coach chat — lets us
 * evolve the curriculum independently of the coaching chat surface.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../utils/api';
import { fetchPremiumStatus } from '../services/premium';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import FullScreenLoader from '../components/FullScreenLoader';

type Card = { id?: string; type?: string; emoji?: string; title?: string; body?: string; xp?: number; color?: string; completed?: boolean };
type Progress = {
  xp: number;
  level: { name?: string; emoji?: string; min_xp?: number };
  next_level?: { name?: string; min_xp?: number };
  xp_to_next?: number;
  completed_count?: number;
  total_cards?: number;
  streak?: number;
};
type Lesson = { title?: string; tip?: string; points?: string[]; action?: string };

export default function MoneySchoolScreen() {
  const s = useStyles();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [personalTip, setPersonalTip] = useState<string>('');
  const [lessonNumber, setLessonNumber] = useState<number | null>(null);
  const [totalLessons, setTotalLessons] = useState<number | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async () => {
    try {
      const [prem, daily, cardsRes] = await Promise.all([
        fetchPremiumStatus().catch(() => ({ is_premium: false })),
        api.get('/money-school/daily').then(r => r.data).catch(() => null),
        api.get('/money-school/cards').then(r => r.data).catch(() => null),
      ]);
      setIsPremium(!!prem?.is_premium);
      if (daily?.lesson) {
        setLesson(daily.lesson);
        setPersonalTip(daily.personal_tip || daily.lesson.tip);
        setLessonNumber(daily.lesson_number || null);
        setTotalLessons(daily.total_lessons || null);
      }
      if (cardsRes?.cards) setCards(cardsRes.cards.slice(0, 12));
      if (cardsRes?.progress) setProgress(cardsRes.progress);
    } catch { /* noop */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const completeCard = async (card: Card) => {
    if (!card.id) return;
    try {
      await api.post('/money-school/complete', { card_id: card.id, xp: card.xp || 10 });
      load();
    } catch { /* noop */ }
  };

  if (loading) return <FullScreenLoader tagline="Building today's lesson…" />;

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <TopBar subtitle={isPremium ? 'AI-personalized daily lessons' : 'Premium feature · preview mode'} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
      >
        {/* Free-user lock banner */}
        {!isPremium && (
          <LinearGradient
            colors={[COLORS.accent.primary, '#C14A06']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.lockBanner}
          >
            <View style={s.lockIconWrap}>
              <Ionicons name="lock-closed" size={22} color={COLORS.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.lockTitle}>Unlock the full Money School</Text>
              <Text style={s.lockSub}>
                Personalised daily lessons, XP tracking, and advanced topics — included with MintU Premium.
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/premium-hub' as any)} style={s.lockCta} testID="money-school-upgrade">
              <Text style={s.lockCtaT}>Upgrade</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.accent.primary} />
            </TouchableOpacity>
          </LinearGradient>
        )}

        {/* Progress strip (only for premium) */}
        {isPremium && progress && (
          <View style={s.progressCard}>
            <View style={s.progressTop}>
              <View style={s.levelBadge}>
                <Text style={s.levelEmoji}>{progress.level?.emoji || '🎓'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.progressName}>{progress.level?.name || 'Starter'}</Text>
                <Text style={s.progressSub}>
                  {progress.xp} XP · {progress.completed_count || 0}/{progress.total_cards || cards.length} complete
                  {typeof progress.streak === 'number' && progress.streak > 0 ? `  ·  🔥${progress.streak}` : ''}
                </Text>
              </View>
              {progress.next_level?.name && (
                <View style={s.nextLevel}>
                  <Text style={s.nextLevelT}>next</Text>
                  <Text style={s.nextLevelName}>{progress.next_level.name}</Text>
                </View>
              )}
            </View>
            {typeof progress.xp_to_next === 'number' && progress.xp_to_next > 0 && progress.next_level?.min_xp && (
              <View style={s.xpTrackWrap}>
                <View style={[s.xpTrackFill, {
                  width: `${Math.min(100, Math.max(0, 100 - (progress.xp_to_next / (progress.next_level.min_xp || 1)) * 100))}%`,
                }]} />
              </View>
            )}
          </View>
        )}

        {/* Today's lesson hero */}
        {lesson && (
          <LinearGradient
            colors={['#FFF7E8', '#FFE7C7']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.hero}
          >
            <View style={s.heroEyebrowRow}>
              <Ionicons name="sunny" size={14} color={COLORS.accent.primary} />
              <Text style={s.heroEyebrow}>TODAY'S LESSON</Text>
              {lessonNumber && (
                <Text style={s.heroCount}>· {lessonNumber}/{totalLessons || '∞'}</Text>
              )}
            </View>
            <Text style={s.heroTitle} numberOfLines={2}>{lesson.title}</Text>
            {!!personalTip && (
              <View style={s.tipBox}>
                <Ionicons name="sparkles" size={13} color={COLORS.accent.primary} />
                <Text style={s.tipT} numberOfLines={4}>{personalTip}</Text>
              </View>
            )}
            {Array.isArray(lesson.points) && lesson.points.length > 0 && (
              <View style={{ marginTop: 10 }}>
                {lesson.points.slice(0, 3).map((p, i) => (
                  <View key={i} style={s.pointRow}>
                    <View style={s.pointDot} />
                    <Text style={s.pointT} numberOfLines={2}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!lesson.action && (
              <View style={s.actionRow}>
                <Ionicons name="flash" size={13} color={COLORS.accent.moneyOut} />
                <Text style={s.actionT} numberOfLines={2}>{lesson.action}</Text>
              </View>
            )}
          </LinearGradient>
        )}

        {/* Cards deck */}
        {cards.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Micro-lessons · swipe through</Text>
            <View style={s.cardsGrid}>
              {cards.map((c, i) => (
                <TouchableOpacity
                  key={c.id || `c${i}`}
                  style={[s.cardTile, c.completed && s.cardTileDone, !isPremium && s.cardTileLocked]}
                  activeOpacity={isPremium ? 0.88 : 1}
                  onPress={() => isPremium ? completeCard(c) : router.push('/premium-hub' as any)}
                >
                  <Text style={s.cardEmoji}>{c.emoji || '💡'}</Text>
                  <Text style={s.cardTitle} numberOfLines={2}>{c.title}</Text>
                  <Text style={s.cardBody} numberOfLines={3}>{c.body}</Text>
                  <View style={s.cardFooter}>
                    <View style={[s.xpChip, c.completed && s.xpChipDone]}>
                      <Ionicons
                        name={c.completed ? 'checkmark' : 'star'}
                        size={10}
                        color={c.completed ? '#fff' : COLORS.accent.primary}
                      />
                      <Text style={[s.xpChipT, c.completed && { color: '#fff' }]}>
                        {c.completed ? 'Done' : `+${c.xp || 10} XP`}
                      </Text>
                    </View>
                    {!isPremium && (
                      <Ionicons name="lock-closed" size={12} color={COLORS.text.muted} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity onPress={() => router.push('/premium-hub' as any)} style={s.bottomLink} testID="money-school-hub-link">
          <Ionicons name="arrow-back" size={13} color={COLORS.accent.primary} />
          <Text style={s.bottomLinkT}>Back to Premium Hub</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function TopBar({ subtitle }: { subtitle?: string }) {
  const s = useStyles();
  return (
    <View style={s.topbar}>
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="money-school-back">
        <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.topTitle}>Money School</Text>
        {subtitle && <Text style={s.topSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={s.topBadge}>
        <Ionicons name="school" size={14} color={COLORS.accent.primary} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },

  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: c.bg.secondary,
    borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 17, fontWeight: '800', color: c.text.primary },
  topSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },
  topBadge: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#FFF0DE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.accent.primary + '40',
  },

  // Lock banner
  lockBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18, marginBottom: 16,
  },
  lockIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: c.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  lockTitle: { fontSize: 14, fontWeight: '800', color: c.bg.elevated },
  lockSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 2, lineHeight: 16 },
  lockCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.bg.elevated,
    paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 999,
  },
  lockCtaT: { color: c.accent.primary, fontWeight: '800', fontSize: 12 },

  // Progress card
  progressCard: {
    backgroundColor: c.bg.secondary,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelBadge: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FFF0DE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.accent.primary + '33',
  },
  levelEmoji: { fontSize: 22 },
  progressName: { fontSize: 15, fontWeight: '800', color: c.text.primary },
  progressSub: { fontSize: 11.5, color: c.text.secondary, marginTop: 2 },
  nextLevel: { alignItems: 'flex-end' },
  nextLevelT: { fontSize: 9, color: c.text.muted, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  nextLevelName: { fontSize: 12, color: c.accent.primary, fontWeight: '800' },
  xpTrackWrap: {
    height: 6, backgroundColor: c.bg.elevated,
    borderRadius: 3, marginTop: 10, overflow: 'hidden',
  },
  xpTrackFill: { height: '100%', backgroundColor: c.accent.primary, borderRadius: 3 },

  // Hero lesson
  hero: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.accent.primary + '2E',
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { fontSize: 10.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 1.2 },
  heroCount: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, letterSpacing: 0.4 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: c.text.primary, marginTop: 6, letterSpacing: -0.3 },
  tipBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: c.bg.elevated,
    padding: 10, borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.accent.primary + '22',
  },
  tipT: { flex: 1, fontSize: 12.5, color: c.text.primary, lineHeight: 18, fontWeight: '600' },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  pointDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent.primary, marginTop: 7 },
  pointT: { flex: 1, fontSize: 12.5, color: c.text.secondary, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: c.accent.primary + '1E',
  },
  actionT: { flex: 1, fontSize: 12, color: c.text.primary, fontWeight: '700' },

  // Cards grid
  sectionTitle: {
    fontSize: 11, fontWeight: '900',
    color: c.text.muted, letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 2,
  },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardTile: {
    width: '48%',
    backgroundColor: c.bg.secondary,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: c.border.subtle,
    minHeight: 140,
  },
  cardTileDone: { backgroundColor: c.accent.brandSoft, borderColor: c.accent.primary + '40' },
  cardTileLocked: { opacity: 0.75 },
  cardEmoji: { fontSize: 22, marginBottom: 4 },
  cardTitle: { fontSize: 12.5, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  cardBody: { fontSize: 11, color: c.text.secondary, marginTop: 4, lineHeight: 15 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  xpChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFF0DE',
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 999,
  },
  xpChipDone: { backgroundColor: c.accent.primary },
  xpChipT: { fontSize: 10, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.2 },

  bottomLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginTop: 14, padding: 10,
  },
  bottomLinkT: { color: c.accent.primary, fontWeight: '800', fontSize: 12.5 },
}));
