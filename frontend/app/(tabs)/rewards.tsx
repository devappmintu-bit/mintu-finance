/**
 * app/(tabs)/rewards.tsx — Round 73 redesign.
 *
 * Replaces the static score / streak / weekly-challenge stack
 * with a real-time gamification surface:
 *
 *   1. AnimatedScoreRing  — circular progress + count-up + tap
 *      → ScoreBreakdownSheet (4 sub-scores)
 *   2. StreakFlame        — animated flame that scales with streak
 *      length, plus a 7-day visualization strip
 *   3. ChallengeProgress  — live "1/3 days completed" with a
 *      progress bar (replaces the inert title+desc card)
 *   4. NextMilestone      — closest still-locked badge + gap copy
 *      (replaces the empty/lonely "no badges yet" placeholder)
 *   5. Social proof       — "Top X% savers this week" pill
 *
 * Backend: /api/gamification/status was extended in Round 73 to
 * return: score, score_breakdown, weekly_challenge.progress,
 * next_milestone, percentile.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { trackAbEvent } from '../../services/rewards';
import { useLangStore } from '../../store/langStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, RADIUS, SPACING, FONT_FAMILY } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import Skeleton from '../../components/ui/Skeleton';
import ScoreCard from '../../components/ScoreCard';
import { t } from '../../utils/i18n';
import useSwr from '../../hooks/useSwr';
import { StaggeredEntrance } from '../../components/primitives';
import AnimatedScoreRing from '../../components/rewards/AnimatedScoreRing';
import StreakFlame from '../../components/rewards/StreakFlame';
import ChallengeProgress from '../../components/rewards/ChallengeProgress';
import NextMilestone from '../../components/rewards/NextMilestone';
import ScoreBreakdownSheet from '../../components/rewards/ScoreBreakdownSheet';
import RewardsHeroBrutalist from '../../components/rewards/RewardsHeroBrutalist';
import { BrutalButton } from '../../components/brutalist/primitives';

function RewardsScreen() {
  const s = useStyles();
  const { lang } = useLangStore();
  const { user } = useAuthStore();

  const gate = { paused: !user?.id };
  const { data: gamification, refetch: refGame } = useSwr<any>('/gamification/status', { ttlMs: 30_000, ...gate });
  const { data: scoreCardData } = useSwr<any>('/share/score-card', { ttlMs: 60_000, ...gate });
  const { data: abGroup } = useSwr<any>('/ab/paywall-group', { ttlMs: 60_000, ...gate });

  const loading = gamification == null;
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try { await refGame(); } finally { setRefreshing(false); }
  }, [refGame]);

  const shareWhatsApp = (text: string) => {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: text });
    });
  };

  // Round 73 — pre-build the urgency line based on what's closest:
  // "You can reach X by tonight" if a small score bump is reachable
  // by today's tracking, otherwise fall back to the badge gap copy.
  const score = gamification?.score ?? user?.money_score ?? 50;
  const breakdown = gamification?.score_breakdown || [];
  const milestone = gamification?.next_milestone || null;
  const percentile = gamification?.percentile || null;
  const challenge = gamification?.weekly_challenge;

  const urgencyText = useMemo(() => {
    // Prefer reaching the next round-10 score if possible from
    // today's tracking activity (each new txn ≈ 0.5 pt → 2 txns = 1 pt).
    const nextTen = Math.min(100, Math.ceil((score + 1) / 10) * 10);
    if (nextTen > score && nextTen - score <= 5) {
      return `You can reach ${nextTen} by tonight`;
    }
    if (milestone?.copy) {
      // Trim to fit the chip
      return milestone.copy.length > 38 ? milestone.copy.slice(0, 36) + '…' : milestone.copy;
    }
    return null;
  }, [score, milestone]);

  // Track AB-group view event for paywall placement (legacy)
  const _ = abGroup ? trackAbEvent('rewards_view', abGroup?.group, abGroup?.placement) : null;

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={{ padding: 20, gap: 14 }}>
        <Skeleton.Box w="100%" h={200} radius={22} />
        <Skeleton.Box w="100%" h={140} radius={22} />
        <Skeleton.Box w="100%" h={120} radius={22} />
        <Skeleton.Box w="100%" h={110} radius={22} />
      </View>
    </SafeAreaView>
  );

  const streak = gamification?.streak || 0;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        testID="rewards-screen"
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.accent.primary} />}
      >
        <RewardsHeroBrutalist
          score={score}
          streak={streak}
          percentile={percentile || null}
          tier={(gamification as any)?.tier || 'BRONZE'}
        />

        <StaggeredEntrance delayMs={65} duration={420} distance={14}>
          {/* 1. Animated score ring + tap-to-breakdown + urgency chip */}
          <View style={s.heroCard}>
            <AnimatedScoreRing
              score={score}
              urgencyText={urgencyText}
              onPress={() => setBreakdownOpen(true)}
            />
            {/* Social proof pill — "Top X% savers this week" */}
            {percentile?.label && (
              <View style={s.socialProof}>
                <Ionicons name="trending-up" size={13} color="#0E8B5E" />
                <Text style={s.socialProofTxt}>{percentile.label}</Text>
              </View>
            )}

            {/* v9 master §Rewards: replace 'Tap for breakdown' → 'See how to improve'
                + inline 'Top X% · WHY?' explainer. Brutalist row, 1px hairline. */}
            <TouchableOpacity
              onPress={() => setBreakdownOpen(true)}
              testID="rewards-see-how"
              style={{
                marginTop: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#0A0A0A',
                backgroundColor: '#fff',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0A0A0A', letterSpacing: 0.2 }}>
                  See how to improve
                </Text>
                {percentile?.pct != null ? (
                  <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>
                    Top {Math.max(1, 100 - Math.round(percentile.pct))}% — here's WHY: logging
                    daily + on-time bills + low food-delivery share.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>
                    3 concrete actions to lift your score this week.
                  </Text>
                )}
              </View>
              <Ionicons name="arrow-forward" size={14} color="#0A0A0A" />
            </TouchableOpacity>
          </View>

          {/* Brutalist 🔥/⚪ 7-day streak strip (v9 master §Rewards) */}
          <View style={{
            marginTop: 14,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 2,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#6B6B6B' }}>
              7-DAY FLAME
            </Text>
            <View style={{ flex: 1 }} />
            {Array.from({ length: 7 }).map((_, i) => (
              <Text key={i} style={{ fontSize: 16 }}>
                {i < Math.min(streak, 7) ? '🔥' : '⚪'}
              </Text>
            ))}
          </View>

          {/* 2. Animated streak flame */}
          <View style={{ marginTop: 14 }}>
            <StreakFlame streak={streak} />
          </View>

          {/* 3. Live weekly challenge with progress tracker */}
          {challenge && (
            <View style={{ marginTop: 14 }}>
              <ChallengeProgress
                title={challenge.title}
                desc={challenge.desc}
                current={challenge.progress?.current ?? 0}
                target={challenge.progress?.target ?? challenge.target_days ?? challenge.target_count ?? 1}
                unit={challenge.progress?.unit ?? 'completed'}
                pct={challenge.progress?.pct}
              />
            </View>
          )}

          {/* 4. Next milestone preview (replaces empty badges row) */}
          {milestone && (
            <View style={{ marginTop: 14 }}>
              <NextMilestone milestone={milestone} />
            </View>
          )}

          {/* Instagram-shareable score card (kept — still high-value
              social action when score is solid). */}
          {scoreCardData && score >= 60 && (
            <View style={{ marginTop: 14 }}>
              <Text style={s.sectionLbl}>SHARE YOUR SCORE</Text>
              <ScoreCard
                name={scoreCardData.name}
                score={scoreCardData.score}
                streak={scoreCardData.streak}
                totalSaved={scoreCardData.total_saved}
                month={scoreCardData.month}
              />
            </View>
          )}

          {/* WhatsApp share CTA (only when there's something to flex). */}
          {score >= 50 && (
            <View style={{ marginTop: 14 }}>
              <BrutalButton
                variant="primary"
                size="md"
                onPress={() => shareWhatsApp(`My Money Score on MintU is ${score}/100! Track your finances: https://mintu.app`)}
                accessibilityLabel="Share score on WhatsApp"
              >
                <Ionicons name="share-social" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 }}>
                  SHARE ON WHATSAPP
                </Text>
              </BrutalButton>
            </View>
          )}
        </StaggeredEntrance>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Tap-to-breakdown bottom sheet */}
      <ScoreBreakdownSheet
        visible={breakdownOpen}
        total={score}
        items={breakdown}
        urgencyText={urgencyText}
        onClose={() => setBreakdownOpen(false)}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  scroll: { padding: SPACING.lg, paddingBottom: 120 },
  pageTitle: {
    fontSize: 28, fontWeight: '800', color: c.text.primary,
    letterSpacing: -0.5, marginBottom: SPACING.lg,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 14,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  socialProofTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0E8B5E',
    letterSpacing: 0.2,
  },
  sectionLbl: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: c.text.muted,
    marginBottom: 10,
    marginTop: 4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.accent.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    marginTop: 18,
  },
  shareTxt: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
}));


// Round 41 — wrap with tab-level ErrorBoundary so a crash here
// doesn't blank the whole app; the user sees a Retry CTA instead.
import { withTabBoundary as _wrapTab_RewardsScreen } from '../../components/withTabBoundary';
export default _wrapTab_RewardsScreen(RewardsScreen, 'Rewards');
