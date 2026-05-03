/**
 * BrutalistProfileView — v8 · "Action Hub" master spec.
 *
 * Strict per-spec structure (Profile = Action Hub, Settings = Config Only):
 *
 *   01  HEADER              passive · "HEY, {NAME}." (no sub-row, no phone)
 *   02  MONEY SCORE         primary brutal · score + 1 key issue + DYNAMIC CTA
 *                                            (no separate Fix button, no tap hint)
 *   03  AI COACH            primary brutal · CONTEXTUAL insight + "FIX IN 2 MIN →"
 *   04  QUICK ACTIONS       secondary 1px · 2×2 grid · Settings · Payments · Goals · Progress
 *   05  PROGRESS SNAPSHOT   tertiary NO border · Badges · Leaderboard rank · "View details →"
 *   06  DANGER ZONE         primary brutal red · Logout · Delete account
 *
 * Three-tier contrast strict:
 *   PRIMARY · 2px ink + offset stamp shadow
 *   SECONDARY · 1px GRAY hairline · no stamp
 *   TERTIARY · NO border · pure typography
 *
 * Lazy-user principle: every CTA is specific (LOG EXPENSE, REDUCE SPEND,
 * FIX IN 2 MIN), never vague.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import BButton from '../BButton';
import BTag from '../BTag';
import MintuMascot from '../../MintuMascot';

import {
  BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP,
} from '../../../utils/brutalist';

// ─── Props ──────────────────────────────────────────────────────────
export interface BrutalistProfileProps {
  // identity
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
  score: number;
  percentile?: number | null;
  weeklyDelta?: number | null;
  tierLabel?: string | null;
  tierEmoji?: string | null;

  // gamification (used in Progress Snapshot)
  streak: number;
  badgesEarned: number;
  badgesTotal: number;
  coins: number;
  leaderboardRank?: number | null;

  // weekly — feeds the contextual issue + AI insight
  weeklyPctBetter?: number | null;
  weeklyCommentary?: string | null;
  weeklyThis?: number | null;
  weeklyLast?: number | null;
  topOverspendCategory?: string | null;
  topOverspendAmount?: number | null;
  daysSinceLastTxn?: number | null;

  // premium / status
  isPro: boolean;
  gmailText?: string;
  bioLabel: string;
  bioHwAvail: boolean;
  bioOn: boolean;
  hasPinSet: boolean;
  appLockOn: boolean;
  langLabel?: string;

  // callbacks
  refreshing: boolean;
  onRefresh: () => void;
  onEditAvatar: () => void;
  onEditName: () => void;
  onOpenScoreBreakdown: () => void;
  onOpenScoreBoost: () => void;
  onLogExpense: () => void;          // NEW — primary action when user has no recent logs
  onShareWin: () => void;
  onOpenAICoach: () => void;
  onOpenPremium: () => void;
  onGoGoals: () => void;
  onOpenAchievements: () => void;
  onGoLeaderboard: () => void;
  onOpenPaymentMethods: () => void;
  onToggleBio?: () => void;
  onChangePin: () => void;
  onToggleAppLock: () => void;
  onOpenPreferences: () => void;
  onOpenNotifs: () => void;
  onGoGmail: () => void;
  onOpenHelp: () => void;
  onGoAbout: () => void;
  onLogout: () => void;
  onGoDeleteAccount: () => void;
  onOpenMoreSettings: () => void;
  onGoRewards: () => void;
  onOpenProfileSheet: () => void;   // NEW v9 — avatar-tap entry point
}

// ─── Component ──────────────────────────────────────────────────────
export default function BrutalistProfileView(p: BrutalistProfileProps) {
  const greeting = (p.name || 'You').trim().split(' ')[0];
  const initial = (p.name || 'U').trim().charAt(0).toUpperCase();

  // Derive the Score card's contextual issue + dynamic CTA.
  const scoreCtx = deriveScoreContext(p);
  // Derive the AI Coach card's contextual insight (always specific, never generic).
  const aiCtx = deriveAIContext(p);

  return (
    <SafeAreaView style={styles.bg} edges={['top']}>
      <ScrollView
        style={styles.bg}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor={BR_COLORS.ink} />
        }
      >
        {/* ══════ 01 HEADER (PASSIVE — no border) ══════
            Avatar is now the PRIMARY IDENTITY ANCHOR (master v9 §2).
            Moved to LEFT of the greeting with an accent ring. Short tap
            opens ProfileSheet; long-press jumps straight to Change-avatar. */}
        <View style={styles.header}>
          <Pressable
            onPress={p.onOpenProfileSheet}
            onLongPress={p.onEditAvatar}
            delayLongPress={350}
            hitSlop={8}
            testID="avatar-node"
            style={styles.avatarWrap}
          >
            {p.avatar ? (
              <Image source={{ uri: p.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, paddingLeft: BR_SPACE.md }}>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted }]}>MINTU</Text>
            <Text style={styles.greet} numberOfLines={1}>
              HEY, {greeting.toUpperCase()}.
            </Text>
          </View>
          <View style={styles.mascotBox}>
            <MintuMascot size={36} state="idle" />
          </View>
        </View>

        {/* ══════ 02 MONEY SCORE CARD (PRIMARY brutal · own CTA) ══════ */}
        <View style={[styles.scoreCard, BR_STAMP.md]}>
          <View style={styles.scoreTagRow}>
            <View style={styles.smallRule} />
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.accent }]}>MONEY SCORE</Text>
            {typeof p.percentile === 'number' ? (
              <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.quiet, marginLeft: 'auto' }]}>
                TOP {Math.max(1, 100 - Math.round(p.percentile))}%
              </Text>
            ) : null}
          </View>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreNum}>{Math.round(p.score)}</Text>
            <View style={styles.scoreSide}>
              <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.quiet }]}>OF 1000</Text>
              {typeof p.weeklyDelta === 'number' ? (
                <View style={{ marginTop: 6 }}>
                  <BTag tone={p.weeklyDelta >= 0 ? 'positive' : 'negative'}>
                    {p.weeklyDelta >= 0 ? '▲' : '▼'} {Math.abs(p.weeklyDelta)} WK
                  </BTag>
                </View>
              ) : null}
            </View>
          </View>

          {/* 1 key contextual issue */}
          <View style={styles.scoreIssue}>
            <View style={styles.issueDot} />
            <Text style={styles.issueText} numberOfLines={2}>{scoreCtx.issue}</Text>
          </View>

          {/* Dynamic CTA inside the card (replaces the old separate boost button) */}
          <Pressable
            onPress={scoreCtx.onPress}
            testID="score-cta"
            style={({ pressed }) => [styles.scoreCta, pressed && styles.pressedShift]}
          >
            <Text style={styles.scoreCtaText}>{scoreCtx.cta}</Text>
            <Ionicons name="arrow-forward" size={18} color={BR_COLORS.ink} />
          </Pressable>
        </View>

        {/* ══════ 03 AI COACH (PRIMARY brutal accent · contextual) ══════ */}
        <Pressable
          onPress={p.onOpenAICoach}
          testID="ai-coach-cta"
          style={({ pressed }) => [styles.aiBlock, BR_STAMP.md, pressed && styles.pressedShift]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[BR_TYPE.labelSm, { color: '#fff', opacity: 0.9 }]}>AI COACH</Text>
            <Text style={[BR_TYPE.h3, { color: '#fff', marginTop: 4 }]} numberOfLines={2}>
              {aiCtx.insight}
            </Text>
            <View style={styles.aiCtaRow}>
              <Text style={styles.aiCtaText}>{aiCtx.cta}</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" style={{ marginLeft: 6 }} />
            </View>
          </View>
        </Pressable>

        {/* ══════ 04 QUICK ACTIONS · 2×2 (SECONDARY 1px) ══════ */}
        <View style={styles.qaGrid}>
          <QuickTile icon="settings-outline" label="Settings" onPress={p.onOpenMoreSettings} testID="qa-settings" />
          <QuickTile icon="card-outline"     label="Payments" onPress={p.onOpenPaymentMethods} testID="qa-payments" right />
          <QuickTile icon="flag-outline"     label="Goals"    onPress={p.onGoGoals}          testID="qa-goals" bottom />
          <QuickTile icon="trophy-outline"   label="Progress" onPress={p.onGoRewards}        testID="qa-progress" bottom right />
        </View>

        {/* ══════ 05 PROGRESS SNAPSHOT (TERTIARY · interactive) ══════ */}
        <Pressable onPress={p.onGoRewards} testID="progress-snapshot" style={({ pressed }) => [
          styles.snapshot, pressed && { opacity: 0.85 },
        ]}>
          <View style={styles.snapHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 20, height: 20 }}>
                <MintuMascot size={20} state="idle" />
              </View>
              <Text style={styles.snapMascotLine} numberOfLines={1}>
                {deriveSnapshotNudge(p)}
              </Text>
            </View>
            <View style={styles.snapLink}>
              <Text style={styles.snapLinkText}>View details</Text>
              <Ionicons name="arrow-forward" size={12} color={BR_COLORS.ink} style={{ marginLeft: 4 }} />
            </View>
          </View>
          <View style={styles.snapRow}>
            <View style={styles.snapStat}>
              <Text style={styles.snapValue}>{p.badgesEarned}/{p.badgesTotal}</Text>
              <Text style={styles.snapLabel}>BADGES</Text>
            </View>
            <View style={styles.snapStat}>
              <Text style={styles.snapValue}>
                {typeof p.leaderboardRank === 'number' && p.leaderboardRank > 0 ? `#${p.leaderboardRank}` : '—'}
              </Text>
              <Text style={styles.snapLabel}>LEADERBOARD</Text>
            </View>
            <View style={styles.snapStat}>
              <Text style={styles.snapValue}>{p.streak}D</Text>
              <Text style={styles.snapLabel}>STREAK</Text>
            </View>
          </View>
        </Pressable>

        {/* ══════ 06 PLAN (SoftCard · monetization) ══════ */}
        <Pressable onPress={p.onOpenPremium} testID="profile-plan-card" style={({ pressed }) => [
          styles.softCard, pressed && { backgroundColor: BR_COLORS.paperAlt },
        ]}>
          <View style={[styles.softIcon, { backgroundColor: p.isPro ? BR_COLORS.ink : BR_COLORS.accent }]}>
            <Ionicons name="diamond" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: BR_SPACE.md }}>
            <Text style={[BR_TYPE.bodyBold]}>{p.isPro ? 'MintU Pro · Active' : 'Get MintU Pro'}</Text>
            <Text style={[BR_TYPE.meta]} numberOfLines={1}>
              {p.isPro ? 'Unlimited AI · advanced reports' : 'Unlock unlimited AI + premium insights'}
            </Text>
          </View>
          {!p.isPro ? (
            <View style={styles.softTag}>
              <Text style={styles.softTagText}>UPGRADE</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={BR_COLORS.ink} style={{ marginLeft: 8 }} />
        </Pressable>

        {/* ══════ 07 SUPPORT (SoftCard · trust layer) ══════ */}
        <View style={styles.supportStack}>
          <Pressable onPress={p.onOpenHelp} testID="profile-help"
            style={({ pressed }) => [styles.supportRow, pressed && { backgroundColor: BR_COLORS.paperAlt }]}>
            <Ionicons name="help-circle-outline" size={16} color={BR_COLORS.ink} />
            <Text style={[BR_TYPE.bodyBold, { marginLeft: BR_SPACE.sm, flex: 1 }]}>Help & support</Text>
            <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
          </Pressable>
          <Pressable onPress={p.onGoAbout} testID="profile-about"
            style={({ pressed }) => [styles.supportRow, { borderTopWidth: BR_BORDER.hair }, pressed && { backgroundColor: BR_COLORS.paperAlt }]}>
            <Ionicons name="information-circle-outline" size={16} color={BR_COLORS.ink} />
            <Text style={[BR_TYPE.bodyBold, { marginLeft: BR_SPACE.sm, flex: 1 }]}>About MintU</Text>
            <Ionicons name="chevron-forward" size={14} color={BR_COLORS.ink} />
          </Pressable>
        </View>

        {/* ══════ 08 DANGER ZONE (CRITICAL brutal red) ══════ */}
        <View style={{ marginTop: BR_SPACE.xl }}>
          <View style={styles.dangerHeaderRow}>
            <View style={[styles.smallRule, { backgroundColor: BR_COLORS.negative }]} />
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.negative }]}>DANGER ZONE</Text>
          </View>
          <View style={[styles.dangerStack, { marginTop: BR_SPACE.sm }]}>
            <Pressable onPress={p.onLogout} testID="profile-logout"
              style={({ pressed }) => [styles.dangerRow, pressed && { backgroundColor: '#FBEAEA' }]}>
              <View style={[styles.dangerIcon, { backgroundColor: BR_COLORS.negative }]}>
                <Ionicons name="log-out-outline" size={16} color="#fff" />
              </View>
              <Text style={[BR_TYPE.bodyBold, { color: BR_COLORS.negative, flex: 1 }]}>Log out</Text>
              <Ionicons name="chevron-forward" size={16} color={BR_COLORS.negative} />
            </Pressable>
            <Pressable onPress={p.onGoDeleteAccount} testID="profile-delete-account"
              style={({ pressed }) => [styles.dangerRow, { borderTopWidth: 0 }, pressed && { backgroundColor: '#FBEAEA' }]}>
              <View style={[styles.dangerIcon, { backgroundColor: BR_COLORS.negative }]}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </View>
              <Text style={[BR_TYPE.bodyBold, { color: BR_COLORS.negative, flex: 1 }]}>Delete account</Text>
              <Ionicons name="chevron-forward" size={16} color={BR_COLORS.negative} />
            </Pressable>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.footerRule} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: BR_SPACE.sm }}>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted }]}>BANK-GRADE · DATA IN INDIA</Text>
            <Text style={[BR_TYPE.labelSm, { color: BR_COLORS.muted }]}>V1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── QuickTile sub (2×2 grid) ───────────────────────────────────────
function QuickTile({
  icon, label, onPress, right, bottom, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  right?: boolean; bottom?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        qa.tile,
        !right  && { borderRightWidth: BR_BORDER.hair },
        !bottom && { borderBottomWidth: BR_BORDER.hair },
        pressed && { backgroundColor: BR_COLORS.paperAlt },
      ]}
    >
      <Ionicons name={icon} size={20} color={BR_COLORS.ink} />
      <Text style={[BR_TYPE.bodyBold, { marginLeft: BR_SPACE.md }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
const qa = StyleSheet.create({
  tile: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.lg,
    minHeight: 64,
    backgroundColor: BR_COLORS.paper,
    borderColor: BR_COLORS.line,
  },
});

// ─── Contextual derivations ─────────────────────────────────────────
function deriveScoreContext(p: BrutalistProfileProps): {
  issue: string;
  cta: string;
  onPress: () => void;
} {
  // If user has overspent significantly → REDUCE SPEND
  if (typeof p.weeklyPctBetter === 'number' && p.weeklyPctBetter <= -10) {
    const cat = p.topOverspendCategory ? ` on ${p.topOverspendCategory.toLowerCase()}` : '';
    return {
      issue: `Spending up ${Math.abs(p.weeklyPctBetter)}% this week${cat}.`,
      cta: 'REDUCE SPEND',
      onPress: p.onOpenScoreBoost,
    };
  }
  // If no recent transactions → LOG EXPENSE
  if (typeof p.daysSinceLastTxn === 'number' && p.daysSinceLastTxn >= 2) {
    return {
      issue: `No expenses logged in ${p.daysSinceLastTxn} days.`,
      cta: 'LOG EXPENSE',
      onPress: p.onLogExpense,
    };
  }
  // Low score → boost
  if (p.score < 400) {
    return {
      issue: `3 quick wins available — boost your score by 30+ today.`,
      cta: 'BOOST SCORE',
      onPress: p.onOpenScoreBoost,
    };
  }
  // Default → log expense (best lazy-user nudge)
  return {
    issue: `One log a day keeps your score climbing.`,
    cta: 'LOG EXPENSE',
    onPress: p.onLogExpense,
  };
}

function deriveAIContext(p: BrutalistProfileProps): { insight: string; cta: string } {
  // Contextual insight (never generic).
  if (p.topOverspendCategory && typeof p.topOverspendAmount === 'number' && p.topOverspendAmount > 0) {
    return {
      insight: `You overspent ₹${numFmt(p.topOverspendAmount)} on ${p.topOverspendCategory.toLowerCase()}.`,
      cta: 'FIX IN 2 MIN',
    };
  }
  if (typeof p.weeklyPctBetter === 'number' && p.weeklyPctBetter <= -10) {
    return {
      insight: `Spending climbed ${Math.abs(p.weeklyPctBetter)}% — let's pin where it leaked.`,
      cta: 'FIND THE LEAK',
    };
  }
  if (typeof p.weeklyPctBetter === 'number' && p.weeklyPctBetter >= 5) {
    return {
      insight: `You're saving ${p.weeklyPctBetter}% more than last week — let's lock it in.`,
      cta: 'LOCK IN GAINS',
    };
  }
  if (p.score >= 700) {
    return {
      insight: `Strong score. Two moves can push you to the next tier.`,
      cta: 'PLAN MY MOVES',
    };
  }
  return {
    insight: `5-minute money plan, tailored for you.`,
    cta: 'BUILD MY PLAN',
  };
}

function numFmt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

// Mascot-driven nudge for the Progress Snapshot — always a concrete next step.
function deriveSnapshotNudge(p: BrutalistProfileProps): string {
  if (p.badgesEarned === 0) return `You're 1 step away from your first badge`;
  if (p.streak === 0) return `Start a streak today — 1 log is all it takes`;
  if (p.streak >= 7) return `${p.streak}-day streak. Keep the flame alive 🔥`;
  if (p.badgesEarned < p.badgesTotal) return `${p.badgesTotal - p.badgesEarned} more badges to collect`;
  return `All badges unlocked. Climb the leaderboard next.`;
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BR_COLORS.paper },
  scroll: { paddingHorizontal: BR_SPACE.lg, paddingTop: BR_SPACE.sm, paddingBottom: 140 },

  // 01 HEADER (passive · no border)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: BR_SPACE.md,
    paddingBottom: BR_SPACE.md,
  },
  mascotBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  greet: {
    fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -1,
    color: BR_COLORS.ink, marginTop: 2,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.accent, borderRadius: 0 },
  avatarFallback: { backgroundColor: BR_COLORS.paperAlt, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '900', color: BR_COLORS.ink },

  // 02 SCORE CARD
  scoreCard: {
    backgroundColor: BR_COLORS.ink,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    paddingTop: BR_SPACE.lg,
    marginTop: BR_SPACE.lg, // 24pt
    overflow: 'hidden',
  },
  scoreTagRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: BR_SPACE.lg,
  },
  smallRule: { width: 12, height: BR_BORDER.heavy, backgroundColor: BR_COLORS.accent },
  scoreRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: BR_SPACE.lg, marginTop: BR_SPACE.sm,
  },
  scoreNum: {
    fontFamily: 'Menlo',
    fontSize: 88, lineHeight: 88,
    fontWeight: '900', letterSpacing: -3,
    color: '#fff',
  },
  scoreSide: { marginLeft: 14, marginBottom: 12, flex: 1 },

  scoreIssue: {
    flexDirection: 'row', alignItems: 'flex-start', gap: BR_SPACE.sm,
    paddingHorizontal: BR_SPACE.lg, paddingTop: BR_SPACE.md, paddingBottom: BR_SPACE.lg,
    borderTopWidth: BR_BORDER.hair,
    borderColor: 'rgba(255,255,255,0.18)',
    marginTop: BR_SPACE.md,
  },
  issueDot: {
    width: 6, height: 6, backgroundColor: BR_COLORS.accent, marginTop: 6,
  },
  issueText: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500', flex: 1 },

  scoreCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BR_COLORS.accent,
    paddingHorizontal: BR_SPACE.lg, paddingVertical: 14,
    borderTopWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
  },
  scoreCtaText: {
    color: '#fff', fontSize: 14, fontWeight: '900',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  // 03 AI COACH
  aiBlock: {
    backgroundColor: BR_COLORS.ink,
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.bold,
    padding: BR_SPACE.lg,
    marginTop: BR_SPACE.md,
  },
  aiCtaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: BR_BORDER.hair,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  aiCtaText: {
    color: BR_COLORS.accent,
    fontSize: 12, fontWeight: '900',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  pressedShift: { transform: [{ translateX: 2 }, { translateY: 2 }], opacity: 0.95 },

  // 04 QUICK ACTIONS 2×2
  qaGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: BR_SPACE.xl,
    borderColor: BR_COLORS.line,
    borderWidth: BR_BORDER.hair,
    backgroundColor: BR_COLORS.paper,
  },

  // 05 PROGRESS SNAPSHOT (no border)
  snapshot: { marginTop: BR_SPACE.xl, paddingHorizontal: 4 },
  snapHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: BR_SPACE.md,
  },
  snapMascotLine: {
    fontSize: 12, fontWeight: '700',
    color: BR_COLORS.ink,
  },
  snapLink: { flexDirection: 'row', alignItems: 'center' },
  snapLinkText: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase',
    color: BR_COLORS.ink,
  },
  snapRow: { flexDirection: 'row', gap: BR_SPACE.lg },
  snapStat: { flex: 1 },
  snapValue: {
    fontFamily: 'Menlo',
    fontSize: 26, lineHeight: 30,
    fontWeight: '900', letterSpacing: -0.5,
    color: BR_COLORS.ink,
  },
  snapLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase',
    color: BR_COLORS.muted, marginTop: 2,
  },

  // 06/07 — Plan + Support SoftCards (moved from Settings → Profile for
  // visibility / monetization / trust layer).
  softCard: {
    marginTop: BR_SPACE.lg,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: BR_SPACE.md, paddingVertical: BR_SPACE.md,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paper,
    minHeight: 64,
  },
  softIcon: {
    width: 32, height: 32,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  softTag: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
  },
  softTagText: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: '#fff',
  },
  supportStack: {
    marginTop: BR_SPACE.md,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.line,
    backgroundColor: BR_COLORS.paper,
  },
  supportRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: BR_SPACE.md, paddingVertical: BR_SPACE.md,
    minHeight: 52,
    borderColor: BR_COLORS.line,
  },

  // 08 DANGER ZONE
  dangerHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: BR_SPACE.sm, marginBottom: BR_SPACE.sm,
  },
  dangerStack: {
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.negative,
    backgroundColor: '#fff',
    ...BR_STAMP.negative,
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', gap: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md, paddingVertical: BR_SPACE.md,
    minHeight: 56,
    borderTopWidth: BR_BORDER.bold, borderColor: BR_COLORS.negative,
  },
  dangerIcon: {
    width: 32, height: 32,
    borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },

  // FOOTER
  footer: { marginTop: BR_SPACE.xl },
  footerRule: { height: BR_BORDER.hair, backgroundColor: BR_COLORS.line },
});
