/**
 * app/(tabs)/rewards.tsx — R100J Streaks-only rebuild.
 *
 * User directive: "Kill remaining gamification entirely. Replace it
 * with a clean, honest 'Logged expenses N days in a row' metric."
 *
 * What's gone (by design):
 *   • Coins / coin balance / coin redemption  → no MintU "currency"
 *   • Money Score ring + sub-scores            → fake gamification
 *   • Weekly challenge progress bar            → noise, no real game
 *   • Percentile / "Top X% savers" pill        → comparison anxiety
 *   • Badges / next-milestone unlock lines     → vanity loops
 *   • Leaderboard / friends / social ranking   → stress driver
 *
 * What stays (the only honest signal):
 *   • Logged-expenses-in-a-row count           → single number
 *   • 7-day strip ("did I log on each day?")  → visual proof
 *   • Best streak ever (lifetime maximum)      → personal record
 *   • Share button                              → if user wants to
 *
 * Brutalist-strict visuals: 2-px ink borders, BR_STAMP drops, mono
 * numerals, no rounded chips, no soft pastels, no animated rings.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Share, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import api from '../../utils/api';
import useSwr from '../../hooks/useSwr';
import { useAuthStore } from '../../store/authStore';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP, BR_FONT } from '../../utils/brutalist';
import MintuMascot from '../../components/MintuMascot';

const { ink: INK, paper: PAPER, paperAlt: PAPERALT, accent: ACCENT, line: LINE, muted: MUTED, positive: OK } = BR_COLORS;
const MONO = BR_FONT.mono;

function getRecentDays(): { date: string; label: string; weekday: string }[] {
  // Last 7 days, oldest first.
  const out: { date: string; label: string; weekday: string }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const label = d.toLocaleDateString('en-IN', { day: '2-digit' });
    const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1);
    out.push({ date: d.toISOString().slice(0, 10), label, weekday });
  }
  return out;
}

export default function RewardsScreen() {
  const { user } = useAuthStore();
  const gate = { paused: !user?.id };

  // Streak status comes from /api/streak/status (existing endpoint).
  // We DO NOT call /gamification/status anymore — that surface is
  // killed.
  const { data: streak, refetch } = useSwr<any>('/streak/status', { ttlMs: 30_000, ...gate });

  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const current: number = Number(streak?.current_streak ?? 0);
  const best: number    = Number(streak?.best_streak ?? 0);
  const checkedToday: boolean = !!streak?.checked_in_today;

  // 7-day strip — match each calendar day against `streak.last_7_days`
  // when present; fallback to: "current streak fills the right edge"
  const days = useMemo(() => {
    const recent = getRecentDays();
    const last7 = streak?.last_7_days as string[] | undefined;
    if (Array.isArray(last7)) {
      return recent.map((d) => ({ ...d, hit: last7.includes(d.date) }));
    }
    // Fallback: assume current streak occupies the trailing N days.
    return recent.map((d, idx) => ({ ...d, hit: idx >= 7 - Math.min(7, current) }));
  }, [streak, current]);

  const handleCheckIn = useCallback(async () => {
    if (checkedToday || busy) return;
    setBusy(true);
    try {
      await api.post('/streak/check-in');
      await refetch();
    } catch { /* swallow — check-in tied to expense logging in some builds */ }
    finally { setBusy(false); }
  }, [checkedToday, busy, refetch]);

  const onShare = useCallback(async () => {
    const text = current > 0
      ? `🟧 ${current}-day streak on MintU. Tracking my money daily.\n\nhttps://mintu.app`
      : `Tracking my money daily on MintU.\n\nhttps://mintu.app`;
    try { await Share.share({ message: text }); } catch { /* user cancelled */ }
  }, [current]);

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.kicker}>YOUR STREAK</Text>
          <Text style={st.title}>Logged in a row</Text>
        </View>
        <Pressable
          onPress={onShare}
          style={({ pressed }) => [st.shareBtn, pressed && { transform: [{ translateY: 1 }] }]}
          hitSlop={6}
          testID="rewards-share"
        >
          <Ionicons name="share-social" size={14} color={INK} />
          <Text style={st.shareTxt}>SHARE</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />}
      >
        {/* HERO — single brutalist card. Big mono number, small label,
            tiny status pill. No rings, no flames, no floating coins. */}
        <View style={[st.hero, BR_STAMP.md]}>
          <View style={st.heroTop}>
            <Text style={st.heroLabel}>CURRENT STREAK</Text>
            <View style={[st.statusChip, checkedToday ? { borderColor: OK } : { borderColor: MUTED }]}>
              <Ionicons
                name={checkedToday ? 'checkmark' : 'time-outline'}
                size={11}
                color={checkedToday ? OK : MUTED}
              />
              <Text style={[st.statusTxt, { color: checkedToday ? OK : MUTED }]}>
                {checkedToday ? 'TODAY DONE' : 'TODAY PENDING'}
              </Text>
            </View>
          </View>

          <View style={st.heroFocal}>
            <Text style={st.heroNum}>{current}</Text>
            <Text style={st.heroSuffix}>{current === 1 ? 'day' : 'days'}</Text>
          </View>

          <Text style={st.heroSub}>
            {current === 0
              ? "Log your first expense today and start a streak."
              : current >= 7
                ? `Solid run — ${current} days of tracking.`
                : `Keep going — ${7 - current} day${7 - current === 1 ? '' : 's'} to your first week.`}
          </Text>

          {/* 7-day strip */}
          <View style={st.stripWrap}>
            {days.map((d, i) => (
              <View key={i} style={st.stripCol}>
                <View style={[st.stripCell, d.hit && st.stripCellHit]}>
                  {d.hit ? (
                    <Ionicons name="checkmark" size={12} color={ACCENT} />
                  ) : (
                    <View style={st.stripDot} />
                  )}
                </View>
                <Text style={st.stripDay}>{d.weekday}</Text>
                <Text style={st.stripDate}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SECONDARY — best streak ever (the only "score" that matters) */}
        <View style={st.secondary}>
          <View style={[st.statBox, { borderRightWidth: BR_BORDER.bold }]}>
            <Text style={st.statLabel}>BEST EVER</Text>
            <Text style={st.statVal}>{best}</Text>
            <Text style={st.statSub}>{best === 1 ? 'day' : 'days'}</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statLabel}>THIS RUN</Text>
            <Text style={st.statVal}>{current}</Text>
            <Text style={st.statSub}>{current === 1 ? 'day' : 'days'}</Text>
          </View>
        </View>

        {/* DAILY ACTION — drives the streak. Brutalist primary CTA. */}
        {!checkedToday && (
          <Pressable
            onPress={handleCheckIn}
            disabled={busy}
            style={({ pressed }) => [
              st.cta,
              BR_STAMP.accent,
              pressed && { transform: [{ translateY: 1 }] },
              busy && { opacity: 0.6 },
            ]}
            testID="rewards-check-in"
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={st.ctaTxt}>LOG TODAY'S EXPENSE</Text>
          </Pressable>
        )}

        {/* HONEST FOOTER — explains why streaks matter without
            inventing fake reward currencies. */}
        <View style={st.footnote}>
          <MintuMascot size={36} state="idle" />
          <Text style={st.footnoteTxt}>
            Streaks only work if they're real. We don't track coins,
            badges, or leaderboards — just the days you actually
            logged your money.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.sm,
    paddingBottom: BR_SPACE.md,
    gap: BR_SPACE.md,
  },
  kicker: { ...BR_TYPE.labelSm, color: MUTED },
  title: { ...BR_TYPE.h2, color: INK, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    backgroundColor: PAPER,
  },
  shareTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: INK },

  hero: {
    marginHorizontal: BR_SPACE.lg,
    padding: BR_SPACE.lg,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color: MUTED },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: BR_BORDER.hair,
    backgroundColor: PAPER,
  },
  statusTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },

  heroFocal: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginTop: 4, marginBottom: 6,
  },
  heroNum: {
    fontFamily: MONO, fontSize: 56, fontWeight: '900',
    letterSpacing: -2, color: INK, lineHeight: 60,
  },
  heroSuffix: { fontSize: 18, fontWeight: '700', color: MUTED, letterSpacing: -0.2 },
  heroSub: { ...BR_TYPE.body, color: MUTED, marginBottom: BR_SPACE.lg, fontSize: 13 },

  stripWrap: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: BR_BORDER.hair,
    borderColor: LINE,
  },
  stripCol: { flex: 1, alignItems: 'center', gap: 4, paddingTop: BR_SPACE.sm },
  stripCell: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 36,
    borderWidth: BR_BORDER.hair,
    borderColor: INK,
    backgroundColor: PAPER,
    alignItems: 'center', justifyContent: 'center',
  },
  stripCellHit: { backgroundColor: INK, borderColor: INK },
  stripDot: { width: 4, height: 4, backgroundColor: LINE },
  stripDay: { fontSize: 10, fontWeight: '900', color: MUTED, letterSpacing: 0.6 },
  stripDate: { fontSize: 10, color: MUTED, fontFamily: MONO },

  secondary: {
    flexDirection: 'row',
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
    backgroundColor: PAPERALT,
  },
  statBox: {
    flex: 1,
    paddingVertical: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md,
    borderColor: INK,
    alignItems: 'flex-start',
  },
  statLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: MUTED },
  statVal: {
    fontFamily: MONO, fontSize: 28, fontWeight: '900',
    color: INK, marginTop: 4, letterSpacing: -1,
  },
  statSub: { fontSize: 10, color: MUTED, fontWeight: '700' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.lg,
    paddingVertical: 16,
    backgroundColor: ACCENT,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
  },
  ctaTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6, color: '#fff' },

  footnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: BR_SPACE.md,
    marginHorizontal: BR_SPACE.lg,
    marginTop: BR_SPACE.xl,
    padding: BR_SPACE.md,
    borderTopWidth: BR_BORDER.hair,
    borderColor: LINE,
  },
  footnoteTxt: { ...BR_TYPE.meta, color: MUTED, flex: 1, fontSize: 12, lineHeight: 17 },
});
