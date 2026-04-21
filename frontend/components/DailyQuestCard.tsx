/**
 * MintU 2.0 — Daily Quest Card
 * Gamified 3-action checklist driving daily retention.
 * Reads /coins/status for remaining earnable actions today → renders as a tappable list.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { COLORS, shadowStyle } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

const ACTION_ICONS: Record<string, { icon: string; route?: string; params?: string }> = {
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
};

export default function DailyQuestCard({ coinsStatus, onAction }: Props) {
  const s = useStyles();
  if (!coinsStatus) return null;

  const actionsDone = Object.keys(coinsStatus.today_breakdown || {});
  const available = (coinsStatus.next_actions || []).slice(0, 3);
  const totalToday = coinsStatus.today_earned || 0;
  const completedCount = Object.values(coinsStatus.today_breakdown || {}).filter((b: any) => b.count > 0).length;
  const totalPossible = completedCount + available.length;
  const pct = totalPossible > 0 ? Math.round((completedCount / totalPossible) * 100) : 0;

  if (available.length === 0 && completedCount > 0) {
    return (
      <LinearGradient colors={['#10B981', '#059669']} style={s.allDoneCard}>
        <Ionicons name="trophy" size={22} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.allDoneTitle}>Daily quests complete! 🎉</Text>
          <Text style={s.allDoneSub}>You earned {totalToday} coins today. Come back tomorrow!</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>TODAY'S QUESTS</Text>
          <Text style={s.title}>
            {completedCount > 0 ? `${completedCount}/${totalPossible} done` : 'Earn coins today'}
            {totalToday > 0 && <Text style={s.todayGain}>  +{totalToday} 🪙</Text>}
          </Text>
        </View>
        <View style={s.streakPill}>
          <Text style={s.streakEmoji}>🔥</Text>
          <Text style={s.streakNum}>{coinsStatus.streak_days || 0}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>

      {/* Quest list */}
      <View style={s.questList}>
        {available.map((q: any, i: number) => {
          const meta = ACTION_ICONS[q.id] || { icon: 'checkmark-circle' };
          return (
            <TouchableOpacity
              key={q.id + i}
              style={s.questRow}
              activeOpacity={0.75}
              onPress={() => {
                onAction?.();
                if (meta.route) {
                  try { router.push(meta.route as any); } catch {}
                }
              }}
            >
              <View style={s.questIcon}>
                <Ionicons name={meta.icon as any} size={16} color="#F59E0B" />
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
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    ...shadowStyle('#F59E0B', 3, 12, 0.10, 3),
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 10, fontWeight: '800', color: '#F59E0B', letterSpacing: 1 },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary, marginTop: 2 },
  todayGain: { fontSize: 12, color: '#10B981', fontWeight: '700' },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  streakEmoji: { fontSize: 12 },
  streakNum: { fontSize: 12, fontWeight: '800', color: '#B91C1C' },
  progressTrack: { height: 5, backgroundColor: '#F59E0B20', borderRadius: 999, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 999 },
  questList: { gap: 6 },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFFBEB', borderRadius: 10 },
  questIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  questLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text.primary },
  rewardPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F59E0B40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rewardCoin: { fontSize: 10 },
  rewardPts: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  allDoneCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 14, marginBottom: 14,
    ...shadowStyle('#10B981', 3, 12, 0.2, 4),
  },
  allDoneTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  allDoneSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 1 },
}));
