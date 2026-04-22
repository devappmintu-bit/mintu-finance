/**
 * MissionsEngine — "Today's Financial Missions" with XP + coins per action,
 * countdown timer to daily refresh, and "Earn + Level Up" CTA.
 *
 * Includes:
 *   • Per-mission XP/coin pill + est seconds
 *   • Streak Saver flag (loss-aversion nudge)
 *   • Live countdown to midnight
 *   • Aggregated reward in CTA
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

export type Mission = {
  id: string;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  xp: number;
  coins: number;
  est_seconds: number;
  route: string;
  streak_saver?: boolean;
  done?: boolean;
};

function fmtCountdown(s: number): string {
  if (s <= 0) return '00:00:00';
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

interface Props {
  missions: Mission[];
  secondsToRefresh: number;
  totalXp: number;
  totalCoins: number;
  onMissionPress: (m: Mission) => void;
  onEarnAll: () => void;
}

function MissionsEngineBase({
  missions, secondsToRefresh, totalXp, totalCoins, onMissionPress, onEarnAll,
}: Props) {
  const s = useStyles();
  const [countdown, setCountdown] = useState(secondsToRefresh);

  useEffect(() => {
    setCountdown(secondsToRefresh);
    const id = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsToRefresh]);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

  const remaining = missions.filter(m => !m.done).length;
  const hasStreakSaver = missions.some(m => m.streak_saver && !m.done);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View>
          <Text style={s.title}>Today's Financial Missions</Text>
          <Text style={s.sub}>Fresh daily · {remaining} left</Text>
        </View>
        <View style={s.timerPill}>
          <Ionicons name="time-outline" size={11} color={'#92400E'} />
          <Text style={s.timerTxt}>{fmtCountdown(countdown)}</Text>
        </View>
      </View>

      {hasStreakSaver ? (
        <View style={s.streakAlert}>
          <Text style={s.streakAlertEmoji}>🔥</Text>
          <Text style={s.streakAlertTxt}>You'll lose your streak if you don't act today</Text>
        </View>
      ) : null}

      <View style={s.missionList}>
        {missions.map((m, idx) => (
          <TouchableOpacity
            key={m.id}
            style={[s.mission, idx > 0 && s.missionDivider, m.done && s.missionDone]}
            onPress={() => { haptic(); onMissionPress(m); }}
            activeOpacity={0.7}
          >
            <View style={[s.missionIcon, m.done && s.missionIconDone, m.streak_saver && s.missionIconSaver]}>
              {m.done ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Ionicons name={m.icon} size={17} color={m.streak_saver ? '#fff' : '#6B7280'} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.missionTitleRow}>
                <Text style={[s.missionTitle, m.done && s.missionTitleDone]} numberOfLines={1}>{m.title}</Text>
                {m.streak_saver && !m.done ? (
                  <View style={s.saverPill}><Text style={s.saverTxt}>STREAK SAVER</Text></View>
                ) : null}
              </View>
              <Text style={s.missionHint} numberOfLines={1}>{m.hint}</Text>
            </View>
            <View style={s.missionReward}>
              <View style={s.rewardRow}>
                <Text style={s.xpTxt}>+{m.xp} XP</Text>
                <View style={s.rewardDot} />
                <Text style={s.coinTxt}>+{m.coins}🪙</Text>
              </View>
              <Text style={s.estTxt}>~{m.est_seconds}s</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.cta} onPress={() => { haptic(); onEarnAll(); }} activeOpacity={0.88}>
        <Ionicons name="rocket" size={15} color="#fff" />
        <Text style={s.ctaTxt}>Earn +{totalXp} XP + {totalCoins}🪙 · Level Up 🚀</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Memoized export — re-renders only when missions list, XP/coins totals or
 * the refresh countdown tick change. The callbacks are stable-by-reference
 * from the parent, so we skip comparing them. This prevents ~10 unnecessary
 * re-renders per minute on the Profile tab.
 */
function missionsPropsEqual(a: Props, b: Props): boolean {
  if (a.totalXp !== b.totalXp || a.totalCoins !== b.totalCoins) return false;
  if (Math.abs((a.secondsToRefresh || 0) - (b.secondsToRefresh || 0)) > 0) return false;
  if (a.missions.length !== b.missions.length) return false;
  for (let i = 0; i < a.missions.length; i++) {
    const x = a.missions[i]; const y = b.missions[i];
    if (x.id !== y.id || x.done !== y.done || x.streak_saver !== y.streak_saver) return false;
  }
  return true;
}

const MissionsEngine = React.memo(MissionsEngineBase, missionsPropsEqual);
export default MissionsEngine;

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.bg.secondary, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  sub: { fontSize: 11.5, fontWeight: '500', color: c.text.muted, marginTop: 2 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEF3C7' },
  timerTxt: { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.3 },

  streakAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  streakAlertEmoji: { fontSize: 14 },
  streakAlertTxt: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#B91C1C' },

  missionList: { marginTop: 12 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  missionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  missionDone: { opacity: 0.55 },
  missionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.primary },
  missionIconDone: { backgroundColor: '#10B981' },
  missionIconSaver: { backgroundColor: '#EF4444' },
  missionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionTitle: { fontSize: 13, fontWeight: '700', color: c.text.primary, flexShrink: 1 },
  missionTitleDone: { textDecorationLine: 'line-through', color: c.text.muted },
  saverPill: { backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  saverTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },
  missionHint: { fontSize: 11, fontWeight: '500', color: c.text.muted, marginTop: 1 },
  missionReward: { alignItems: 'flex-end', gap: 2 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  xpTxt: { fontSize: 10.5, fontWeight: '800', color: '#7C3AED' },
  coinTxt: { fontSize: 10.5, fontWeight: '800', color: '#D97706' },
  rewardDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: c.text.muted },
  estTxt: { fontSize: 9.5, fontWeight: '600', color: c.text.muted },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  ctaTxt: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: -0.1 },
}));
