/**
 * MintU 2.0 — Daily Quest Card (Phase-C Game Engine upgrade)
 *
 * Gamified 3-action checklist driving daily retention with XP mechanics.
 *   • LEVEL + XP bar (derived from streak × 10 + total_earned + badges)
 *   • Streak pill with milestone badges (7 → 🥉, 30 → 🥈, 100 → 🥇)
 *   • Progress ring on completion
 *   • Haptic feedback on quest tap
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, shadowStyle } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import ShareWeeklyWinModal from './profile/ShareWeeklyWinModal';

const ACTION_ICONS: Record<string, { icon: string; route?: string }> = {
  add_transaction: { icon: 'add-circle', route: '/transactions?openAdd=1' },
  scan_sms: { icon: 'scan', route: '/transactions?openSmsScan=1' },
  add_income: { icon: 'cash', route: '/transactions?openAdd=1&type=credit' },
  set_budget: { icon: 'pie-chart', route: '/budget' },
  settle_split: { icon: 'people', route: '/split' },
  complete_lesson: { icon: 'school', route: '/' },
  share_report: { icon: 'share-social', route: '/' },
  open_app_daily: { icon: 'checkmark-circle' },
};

type Props = {
  coinsStatus: any;
  onAction?: () => void;
  userName?: string;
};

/** XP formula: streak × 10 + (total coins earned) + (badges × 25) */
function computeLevel(totalXp: number) {
  // Level N requires (N × 100) XP. Cap at 99.
  const level = Math.min(99, Math.max(1, Math.floor(totalXp / 100) + 1));
  const xpInLevel = totalXp % 100;
  const xpToNext = 100 - xpInLevel;
  return { level, xpInLevel, xpToNext, pct: xpInLevel };
}

function streakMilestone(days: number) {
  if (days >= 100) return { emoji: '🥇', label: 'LEGEND', color: '#FBBF24' };
  if (days >= 30)  return { emoji: '🥈', label: 'SILVER', color: COLORS.text.muted };
  if (days >= 7)   return { emoji: '🥉', label: 'BRONZE', color: COLORS.accent.secondary };
  return null;
}

function DailyQuestCard({ coinsStatus, onAction, userName }: Props) {
  const s = useStyles();
  const [shareVisible, setShareVisible] = useState(false);

  const data = useMemo(() => {
    if (!coinsStatus) return null;
    const available = (coinsStatus.next_actions || []).slice(0, 3);
    const totalToday = Number(coinsStatus.today_earned || 0);
    const totalEarned = Number(coinsStatus.total_earned || coinsStatus.balance || 0);
    const streak = Number(coinsStatus.streak_days || 0);
    const badges = Number(coinsStatus.badges_count || 0);
    const completedCount = Object.values(coinsStatus.today_breakdown || {}).filter((b: any) => b.count > 0).length;
    const totalPossible = completedCount + available.length;
    const pct = totalPossible > 0 ? Math.round((completedCount / totalPossible) * 100) : 0;
    const totalXp = streak * 10 + totalEarned + badges * 25;
    const { level, xpInLevel, xpToNext, pct: xpPct } = computeLevel(totalXp);
    const milestone = streakMilestone(streak);
    return { available, totalToday, streak, completedCount, totalPossible, pct, level, xpInLevel, xpToNext, xpPct, milestone };
  }, [coinsStatus]);

  if (!data) return null;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  // All quests complete → celebration card
  if (data.available.length === 0 && data.completedCount > 0) {
    return (
      <LinearGradient colors={[COLORS.state.successAlt, COLORS.state.success]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.allDoneCard}>
        <View style={s.allDoneIcon}>
          <Ionicons name="trophy" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.allDoneTitle}>Daily quests complete! 🎉</Text>
          <Text style={s.allDoneSub}>+{data.totalToday} 🪙 earned today · Lv {data.level} · {data.streak}-day streak {data.milestone?.emoji || ''}</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={s.card}>
      {/* Header row: Level badge + streak pill */}
      <View style={s.header}>
        <View style={s.levelBadge}>
          <Text style={s.levelNum}>Lv {data.level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>TODAY'S QUESTS</Text>
          <Text style={s.title}>
            {data.completedCount > 0 ? `${data.completedCount}/${data.totalPossible} done` : 'Earn coins today'}
            {data.totalToday > 0 && <Text style={s.todayGain}>  +{data.totalToday} 🪙</Text>}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.streakPill, data.milestone && { backgroundColor: (data.milestone.color || '#FEE2E2') + '22', borderColor: data.milestone.color }]}
          onPress={() => { if (data.streak >= 3) { haptic(); setShareVisible(true); } }}
          disabled={data.streak < 3}
          activeOpacity={0.7}
          testID="streak-pill"
        >
          <Text style={s.streakEmoji}>{data.milestone?.emoji || '🔥'}</Text>
          <Text style={[s.streakNum, data.milestone && { color: data.milestone.color }]}>{data.streak}d</Text>
          {data.streak >= 3 && <Ionicons name="share-social" size={10} color={data.milestone?.color || '#B91C1C'} style={{ marginLeft: 2 }} />}
        </TouchableOpacity>
      </View>

      {/* XP bar */}
      <View style={s.xpRow}>
        <View style={s.xpTrack}>
          <LinearGradient colors={[COLORS.accent.secondary, '#DC6E0E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.xpFill, { width: `${data.xpPct}%` }]} />
        </View>
        <Text style={s.xpTxt}>{data.xpInLevel}/100 XP</Text>
      </View>

      {/* Quest list */}
      <View style={s.questList}>
        {data.available.map((q: any, i: number) => {
          const meta = ACTION_ICONS[q.id] || { icon: 'checkmark-circle' };
          return (
            <TouchableOpacity
              key={q.id + i}
              style={s.questRow}
              activeOpacity={0.75}
              onPress={() => {
                haptic();
                onAction?.();
                if (meta.route) { try { router.push(meta.route as any); } catch {} }
              }}
            >
              <View style={s.questIcon}>
                <Ionicons name={meta.icon as any} size={16} color={COLORS.accent.secondary} />
              </View>
              <Text style={s.questLabel} numberOfLines={1}>{q.label}</Text>
              <View style={s.rewardPill}>
                <Text style={s.rewardCoin}>🪙</Text>
                <Text style={s.rewardPts}>+{q.reward}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={COLORS.text.muted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Milestone progress — nudges user toward next badge */}
      {data.streak > 0 && data.streak < 100 && (
        <View style={s.milestoneHint}>
          <Ionicons name="flag" size={11} color="#92400E" />
          <Text style={s.milestoneTxt}>
            {data.streak < 7  && `${7 - data.streak} days to 🥉 Bronze streak`}
            {data.streak >= 7 && data.streak < 30  && `${30 - data.streak} days to 🥈 Silver streak`}
            {data.streak >= 30 && data.streak < 100 && `${100 - data.streak} days to 🥇 Legend`}
          </Text>
        </View>
      )}

      {/* Shareable streak card modal */}
      <ShareWeeklyWinModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        cardProps={{
          userName,
          kind: 'streak',
          heroValue: `${data.streak}`,
          heroLabel: 'DAYS ON FIRE',
          tagline: data.milestone
            ? `${data.milestone.label} streak unlocked · Can you beat me?`
            : `${Math.max(1, 7 - data.streak)} days to Bronze — let's go!`,
          tier: data.milestone ? `${data.milestone.emoji} ${data.milestone.label}` : `Lv ${data.level}`,
        }}
        caption={`🔥 I'm on a ${data.streak}-day MintU streak${data.milestone ? ` (${data.milestone.label})` : ''}. Join me: https://mintu.app`}
      />
    </View>
  );
}

export default memo(DailyQuestCard);

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    ...shadowStyle(COLORS.accent.secondary, 3, 12, 0.10, 3),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  levelBadge: { backgroundColor: COLORS.accent.secondary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  levelNum: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  label: { fontSize: 10, fontWeight: '800', color: COLORS.accent.secondary, letterSpacing: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  todayGain: { fontSize: 12, color: COLORS.state.successAlt, fontWeight: '700' },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'transparent' },
  streakEmoji: { fontSize: 12 },
  streakNum: { fontSize: 12, fontWeight: '900', color: '#B91C1C' },
  // XP bar
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  xpTrack: { flex: 1, height: 6, backgroundColor: '#FEF3C7', borderRadius: 999, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 999 },
  xpTxt: { fontSize: 10, fontWeight: '800', color: '#92400E', minWidth: 52, textAlign: 'right' },
  // Quests
  questList: { gap: 6 },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFFBEB', borderRadius: 10 },
  questIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  questLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text.primary },
  rewardPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F59E0B40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rewardCoin: { fontSize: 10 },
  rewardPts: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  // Milestone
  milestoneHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  milestoneTxt: { flex: 1, fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.1 },
  // All done state
  allDoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 14, ...shadowStyle(COLORS.state.successAlt, 3, 12, 0.2, 4) },
  allDoneIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  allDoneTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  allDoneSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.92)', marginTop: 2 },
}));
