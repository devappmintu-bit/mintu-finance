/**
 * ScoreBoostModal — "Improve your score" curated tips bottom sheet.
 *
 * Fetches 3 personalised boost suggestions from /api/profile/score-boosts
 * and lets the user tap through to the relevant route.
 */
import { useAppColors } from '../../utils/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import api from '../../utils/api';

type Boost = {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  points: number;
  route: string;
  cta: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  currentScore: number;
};

export default function ScoreBoostModal({ visible, onClose, currentScore }: Props) {
  const c = useAppColors();
  const [boosts, setBoosts] = useState<Boost[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxPotential, setMaxPotential] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api
      .get('/profile/score-boosts')
      .then((r) => {
        setBoosts(r.data?.boosts || []);
        setMaxPotential(r.data?.max_potential || 0);
      })
      .catch(() => {
        // Fallback static tips
        setBoosts([
          { id: 'streak', emoji: '🔥', title: 'Hit a 7-day tracking streak',
            sub: 'Log daily for 7 days to earn +5 score',
            points: 5, route: '/(tabs)/transactions', cta: 'Log expense' },
          { id: 'goal', emoji: '🎯', title: 'Set your first savings goal',
            sub: 'Goals drive commitment — earn +4 score',
            points: 4, route: '/(tabs)/budget', cta: 'Create goal' },
          { id: 'refer', emoji: '📢', title: 'Refer a friend for +₹50',
            sub: 'Each referral also boosts your rank',
            points: 3, route: '/(tabs)/profile', cta: 'Share invite' },
        ]);
        setMaxPotential(12);
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  const projectedScore = Math.min(100, currentScore + maxPotential);

  const onTapBoost = (b: Boost) => {
    haptic();
    onClose();
    // Delay navigation so the modal animates out cleanly
    setTimeout(() => { try { router.push(b.route as any); } catch {} }, 200);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>Boost your score</Text>
              <Text style={s.sub}>
                {loading ? 'Analysing your finances…' : `3 moves to reach ${projectedScore}/100`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={c.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Score projection bar */}
          <View style={s.projectionCard}>
            <View style={s.projRow}>
              <View style={s.projCol}>
                <Text style={s.projLbl}>NOW</Text>
                <Text style={s.projNow}>{currentScore}</Text>
              </View>
              <View style={s.projArrow}>
                <Ionicons name="arrow-forward" size={20} color="#F56E1E" />
              </View>
              <View style={s.projCol}>
                <Text style={s.projLbl}>POTENTIAL</Text>
                <Text style={s.projNew}>{projectedScore}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <View style={s.deltaPill}>
                  <Ionicons name="trending-up" size={12} color={c.state.success} />
                  <Text style={s.deltaTxt}>+{maxPotential} pts</Text>
                </View>
              </View>
            </View>
            <View style={s.projBar}>
              <View style={[s.projBarCurrent, { width: `${currentScore}%` }]} />
              <View style={[s.projBarPotential, { width: `${maxPotential}%`, left: `${currentScore}%` }]} />
            </View>
          </View>

          {/* Boost list */}
          {loading ? (
            <View style={{ padding: 30, alignItems: 'center' }}>
              <ActivityIndicator color="#F56E1E" />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {boosts.map((b, idx) => (
                <TouchableOpacity
                  key={b.id}
                  activeOpacity={0.9}
                  onPress={() => onTapBoost(b)}
                  style={s.boostRow}
                >
                  <View style={s.numBadge}>
                    <Text style={s.numTxt}>{idx + 1}</Text>
                  </View>
                  <View style={s.emojiBox}>
                    <Text style={s.emoji}>{b.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.boostTitle} numberOfLines={2}>{b.title}</Text>
                    <Text style={s.boostSub} numberOfLines={2}>{b.sub}</Text>
                  </View>
                  <View style={s.ptsCol}>
                    <LinearGradient colors={['#10B981', '#059669']} style={s.ptsPill}>
                      <Text style={s.ptsTxt}>+{b.points}</Text>
                    </LinearGradient>
                    <Text style={s.ctaTxt}>{b.cta} →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={s.footer}>💡 Your score updates automatically as you log, save, and complete goals.</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '88%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  sub: { fontSize: 12.5, fontWeight: '700', color: '#6B7280', marginTop: 3 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  // Projection card
  projectionCard: { backgroundColor: '#FFF7ED', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 16 },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  projCol: { alignItems: 'flex-start' },
  projLbl: { fontSize: 9.5, fontWeight: '900', color: '#92400E', letterSpacing: 1 },
  projNow: { fontSize: 26, fontWeight: '900', color: '#111827', letterSpacing: -1 },
  projNew: { fontSize: 26, fontWeight: '900', color: '#F56E1E', letterSpacing: -1 },
  projArrow: { paddingHorizontal: 6 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  deltaTxt: { fontSize: 11.5, fontWeight: '900', color: '#065F46' },
  projBar: { marginTop: 10, height: 8, borderRadius: 4, backgroundColor: '#FED7AA', overflow: 'hidden', position: 'relative' },
  projBarCurrent: { position: 'absolute', left: 0, top: 0, height: '100%', backgroundColor: '#C14A06' },
  projBarPotential: { position: 'absolute', top: 0, height: '100%', backgroundColor: '#10B981', opacity: 0.65 },

  // Boost rows
  boostRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, marginBottom: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6' },
  numBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  numTxt: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  emojiBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  emoji: { fontSize: 22 },
  boostTitle: { fontSize: 13.5, fontWeight: '900', color: '#111827', letterSpacing: -0.1 },
  boostSub: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 2, lineHeight: 14 },
  ptsCol: { alignItems: 'flex-end', gap: 4 },
  ptsPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  ptsTxt: { fontSize: 11.5, fontWeight: '900', color: '#FFFFFF' },
  ctaTxt: { fontSize: 10, fontWeight: '800', color: '#F56E1E' },

  footer: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textAlign: 'center', marginTop: 10, lineHeight: 15 },
});
