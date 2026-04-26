/**
 * MoneySchoolCard — dedicated premium feature card on the Home tab.
 *
 * Shows a preview of today's Money School lesson (title + 1-line teaser)
 * and routes to the full Money School experience at /money-school. For
 * free users a "premium" lock badge is visible — tapping still opens the
 * experience (lesson page itself enforces the premium gate).
 *
 * Color scheme: in-app saffron/cream, distinct from PremiumHomeCard so
 * Money School reads as a separate premium product.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../../utils/api';
import { fetchPremiumStatus } from '../../services/premium';
import {  COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Lesson = { title?: string; tip?: string; lesson_number?: number; total_lessons?: number };

function MoneySchoolCard() {
  const s = useStyles();
  const c = useAppColors();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [daily, premium] = await Promise.all([
          api.get('/money-school/daily').then(r => r.data).catch(() => null),
          fetchPremiumStatus().catch(() => ({ is_premium: false })),
        ]);
        if (!mounted) return;
        if (daily?.lesson) {
          setLesson({
            title: daily.lesson.title,
            tip: daily.personal_tip || daily.lesson.tip,
            lesson_number: daily.lesson_number,
            total_lessons: daily.total_lessons,
          });
        }
        setIsPremium(!!premium?.is_premium);
      } catch { /* noop */ }
    })();
    return () => { mounted = false; };
  }, []);

  const open = () => router.push('/money-school' as any);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={open} testID="money-school-card">
      <LinearGradient
        colors={['#FFF7E8', '#FFE7C7']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.wrap}
      >
        {/* Left: accent strip with mortarboard icon */}
        <LinearGradient
          colors={[COLORS.accent.secondary, COLORS.accent.primary]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={s.iconStrip}
        >
          <Ionicons name="school" size={22} color="#FFFFFF" />
        </LinearGradient>

        <View style={s.body}>
          <View style={s.topRow}>
            <Text style={s.eyebrow}>AI MONEY SCHOOL</Text>
            {!isPremium ? (
              <View style={s.proPill}>
                <Ionicons name="diamond" size={9} color={COLORS.accent.primary} />
                <Text style={s.proPillT}>PREMIUM</Text>
              </View>
            ) : (
              <View style={[s.proPill, s.proPillOn]}>
                <Ionicons name="flash" size={9} color="#FFFFFF" />
                <Text style={[s.proPillT, { color: '#FFFFFF' }]}>ACTIVE</Text>
              </View>
            )}
          </View>

          <Text style={s.title} numberOfLines={1}>
            {lesson?.title || 'Daily finance lesson · 60 sec'}
          </Text>
          <Text style={s.tip} numberOfLines={2}>
            {lesson?.tip || 'Bite-sized lessons on saving, investing and tax — tailored to your spending.'}
          </Text>

          <View style={s.ctaRow}>
            <View style={s.progressChip}>
              <Ionicons name="sparkles" size={11} color={COLORS.accent.primary} />
              <Text style={s.progressT}>
                {lesson?.lesson_number ? `Day ${lesson.lesson_number}/${lesson.total_lessons || '∞'}` : 'New'}
              </Text>
            </View>
            <View style={s.ctaBtn}>
              <Text style={s.ctaT}>Open</Text>
              <Ionicons name="arrow-forward" size={13} color={COLORS.accent.primary} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: 'row',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.accent.primary + '33',
  },
  iconStrip: { width: 60, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: c.accent.primary, letterSpacing: 1.4 },
  proPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.bg.elevated,
    paddingHorizontal: 7, paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1, borderColor: c.accent.primary + '40',
  },
  proPillOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  proPillT: { fontSize: 9, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.5 },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  tip: { fontSize: 11.5, color: c.text.secondary, marginTop: 4, lineHeight: 16 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  progressChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.bg.elevated,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
  },
  progressT: { fontSize: 10.5, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.3 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ctaT: { fontSize: 12, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.2 },
}));

// Round 43 perf — memoized so unrelated parent state changes don't re-render this widget.
export default React.memo(MoneySchoolCard);
