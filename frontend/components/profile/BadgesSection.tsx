import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Badge = { id: string; name: string; desc: string; icon: string };

type GamificationStatus = {
  streak: number;
  badges_earned: Badge[];
  badges_available: Badge[];
  total_badges: number;
  weekly_challenge: any;
};

export default function BadgesSection({
  onStatusLoaded,
}: {
  onStatusLoaded?: (s: GamificationStatus) => void;
}) {
  const s = useStyles();
  const [status, setStatus] = useState<GamificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ badge: Badge; earned: boolean } | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .get('/gamification/status')
      .then((r) => {
        if (!mounted) return;
        setStatus(r.data);
        onStatusLoaded?.(r.data);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Fallback when API fails or returns empty — show a helpful preview so users
  // always see the badges concept and are motivated to start earning.
  const FALLBACK_BADGES: Badge[] = [
    { id: 'first_track', name: 'First Step', desc: 'Track your first expense', icon: 'footsteps' },
    { id: 'week_streak', name: 'Week Warrior', desc: '7-day tracking streak', icon: 'flame' },
    { id: 'month_streak', name: 'Streak Master', desc: '30-day tracking streak', icon: 'trophy' },
    { id: 'saver_pro', name: 'Saver Pro', desc: 'Save 20%+ of income', icon: 'cash' },
    { id: 'score_80', name: 'Elite Scorer', desc: 'Reach Money Score 80+', icon: 'star' },
    { id: 'budget_master', name: 'Budget Master', desc: 'Stay within all budgets', icon: 'shield-checkmark' },
  ];

  if (loading) return null; // brief loading state

  const earned = status?.badges_earned || [];
  const locked = status?.badges_available?.length
    ? status.badges_available
    : (earned.length === 0 ? FALLBACK_BADGES : []);
  const total = earned.length + locked.length;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconBox}>
          <Ionicons name="trophy" size={20} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Achievements</Text>
          <Text style={s.sub}>
            {earned.length} of {total} badges earned
          </Text>
        </View>
        <View style={s.countPill}>
          <Text style={s.countPillNum}>{earned.length}</Text>
          <Text style={s.countPillLbl}>Earned</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View
          style={[s.progressFill, { width: `${total ? Math.round((earned.length / total) * 100) : 0}%` }]}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.grid}
      >
        {earned.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={s.badgeBox}
            activeOpacity={0.7}
            onPress={() => setSelected({ badge: b, earned: true })}
          >
            <View style={[s.badgeIcon, s.badgeIconEarned]}>
              <Ionicons name={b.icon as any} size={22} color="#fff" />
            </View>
            <Text style={s.badgeName} numberOfLines={2}>
              {b.name}
            </Text>
            <View style={s.earnedDot} />
          </TouchableOpacity>
        ))}
        {locked.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={s.badgeBox}
            activeOpacity={0.7}
            onPress={() => setSelected({ badge: b, earned: false })}
          >
            <View style={[s.badgeIcon, s.badgeIconLocked]}>
              <Ionicons name={b.icon as any} size={20} color="#94A3B8" />
              <View style={s.lockOverlay}>
                <Ionicons name="lock-closed" size={10} color="#64748B" />
              </View>
            </View>
            <Text style={[s.badgeName, s.badgeNameLocked]} numberOfLines={2}>
              {b.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Badge detail modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity
          style={s.modalBg}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        >
          <View style={s.modalCard}>
            <View
              style={[
                s.modalIcon,
                selected?.earned ? s.badgeIconEarned : s.badgeIconLocked,
              ]}
            >
              <Ionicons
                name={(selected?.badge.icon as any) || 'ribbon'}
                size={40}
                color={selected?.earned ? '#fff' : '#94A3B8'}
              />
            </View>
            <Text style={s.modalTitle}>{selected?.badge.name}</Text>
            <Text style={s.modalDesc}>{selected?.badge.desc}</Text>
            <View
              style={[
                s.modalStatus,
                { backgroundColor: selected?.earned ? '#10B98115' : '#64748B15' },
              ]}
            >
              <Ionicons
                name={selected?.earned ? 'checkmark-circle' : 'lock-closed'}
                size={14}
                color={selected?.earned ? '#10B981' : '#64748B'}
              />
              <Text
                style={[
                  s.modalStatusText,
                  { color: selected?.earned ? '#10B981' : '#64748B' },
                ]}
              >
                {selected?.earned ? 'Earned' : 'Keep going to unlock!'}
              </Text>
            </View>
            <TouchableOpacity style={s.modalClose} onPress={() => setSelected(null)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  countPill: {
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 56,
  },
  countPillNum: { fontSize: 18, fontWeight: '800', color: '#92400E' },
  countPillLbl: { fontSize: 9, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 },
  progressTrack: {
    height: 6,
    backgroundColor: '#F59E0B20',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 999 },
  grid: { gap: 12, paddingRight: 8 },
  badgeBox: {
    width: 82,
    alignItems: 'center',
    gap: 6,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgeIconEarned: {
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  badgeIconLocked: {
    backgroundColor: '#F1F5F9',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: c.text.primary,
    textAlign: 'center',
    lineHeight: 14,
  },
  badgeNameLocked: { color: c.text.muted },
  earnedDot: {
    position: 'absolute',
    top: 0,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.text.primary, textAlign: 'center' },
  modalDesc: {
    fontSize: 14,
    color: c.text.secondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  modalStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 14,
  },
  modalStatusText: { fontSize: 12, fontWeight: '700' },
  modalClose: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: c.bg.primary,
    borderWidth: 1,
    borderColor: c.border.card,
  },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: c.text.primary },
}));
