/**
 * ProfileHeroV2 — Gamified Financial Identity Hub Hero Card.
 *
 * Design goals (from latest spec):
 *   • User avatar + Top X% rank (percentile vs nation)
 *   • Big Money Score meter with monthly delta (▲/▼)
 *   • Streak + Coins stat chips
 *   • Primary CTAs: "Share Flex" (image) + "Improve Score" (→ AI coach)
 *   • Saffron brand gradient, dopamine-coded chips, haptic taps
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  user: any;
  avatar?: string | null;
  streak?: number;
  coins?: number;
  monthlyDelta?: number; // +/- delta on money score vs last month
  topPercent?: number;   // server-computed percentile (overrides heuristic)
  onEditName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onShareScore: () => void;
  onImproveScore: () => void;
}

const tierFor = (score: number) => {
  if (score >= 80) return { emoji: '🏆', label: 'Elite Saver', color: '#F59E0B' };
  if (score >= 60) return { emoji: '💪', label: 'Smart Spender', color: '#10B981' };
  if (score >= 40) return { emoji: '⚡', label: 'Growing Saver', color: '#3B82F6' };
  return { emoji: '🌱', label: 'Just Starting', color: '#8B5CF6' };
};

// Map money score → Top X% percentile (rough heuristic)
const percentileFor = (score: number) => {
  if (score >= 90) return 1;
  if (score >= 80) return 5;
  if (score >= 70) return 15;
  if (score >= 60) return 30;
  if (score >= 50) return 50;
  if (score >= 35) return 65;
  return 80;
};

export default function ProfileHeroV2({
  user, avatar, streak = 0, coins = 0, monthlyDelta = 0, topPercent,
  onEditName, onPickAvatar, onRemoveAvatar,
  onShareScore, onImproveScore,
}: Props) {
  const s = useStyles();
  const score = user?.money_score || 0;
  const tier = tierFor(score);
  const topPct = useMemo(() => (typeof topPercent === 'number' ? topPercent : percentileFor(score)), [score, topPercent]);
  const deltaPositive = monthlyDelta >= 0;

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <LinearGradient
      colors={['#F56E1E', '#E85D1F', '#C14A06']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.blob1} />
      <View style={s.blob2} />

      {/* Top bar: Top X% rank + edit btn */}
      <View style={s.topBar}>
        <View style={s.rankPill}>
          <Text style={s.rankEmoji}>{tier.emoji}</Text>
          <Text style={s.rankTxt}>TOP {topPct}%</Text>
          <View style={s.rankDot} />
          <Text style={s.rankSub}>IN INDIA</Text>
        </View>
        <TouchableOpacity style={s.editBtn} onPress={() => { haptic(); onEditName(); }} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={14} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Avatar + Name block */}
      <View style={s.identityBlock}>
        <TouchableOpacity
          onPress={() => { haptic(); onPickAvatar(); }}
          onLongPress={avatar ? onRemoveAvatar : undefined}
          style={s.avatarWrap}
          activeOpacity={0.85}
        >
          <View style={s.avatarRing}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlace}>
                <Image source={require('../../assets/images/mintu-logo.png')} style={s.avatar} />
              </View>
            )}
          </View>
          <View style={s.camBadge}>
            <Ionicons name="camera" size={11} color="#C14A06" />
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
          <Text style={s.phone}>{user?.phone || '—'}</Text>
          <View style={[s.tierInline, { backgroundColor: tier.color + '28', borderColor: tier.color + '60' }]}>
            <Text style={s.tierInlineTxt}>{tier.label.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Money Score Ring-style display */}
      <View style={s.scoreBlock}>
        <View style={s.scoreLeft}>
          <Text style={s.scoreLabel}>MONEY SCORE</Text>
          <View style={s.scoreRow}>
            <Text style={s.scoreValue}>{score}</Text>
            <Text style={s.scoreOf}>/100</Text>
          </View>
          <View style={[s.deltaPill, { backgroundColor: deltaPositive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.22)' }]}>
            <Ionicons
              name={deltaPositive ? 'trending-up' : 'trending-down'}
              size={10}
              color={deltaPositive ? '#A7F3D0' : '#FECACA'}
            />
            <Text style={[s.deltaTxt, { color: deltaPositive ? '#A7F3D0' : '#FECACA' }]}>
              {deltaPositive ? '+' : ''}{monthlyDelta} this month
            </Text>
          </View>
        </View>
        <View style={s.scoreRight}>
          <View style={s.progBar}>
            <View style={[s.progFill, { width: `${Math.min(100, score)}%` }]} />
          </View>
          <Text style={s.progHelper}>
            {score >= 80
              ? 'Crushing it 🔥'
              : score >= 60
              ? 'On the rise 📈'
              : 'Let’s level up ⚡'}
          </Text>
        </View>
      </View>

      {/* Stat chips: Streak + Coins */}
      <View style={s.statsRow}>
        <View style={s.statChip}>
          <Text style={s.statEmoji}>🔥</Text>
          <View>
            <Text style={s.statN}>{streak}</Text>
            <Text style={s.statLbl}>Day streak</Text>
          </View>
        </View>
        <View style={s.statChip}>
          <Text style={s.statEmoji}>🪙</Text>
          <View>
            <Text style={s.statN}>{coins.toLocaleString('en-IN')}</Text>
            <Text style={s.statLbl}>Coins</Text>
          </View>
        </View>
      </View>

      {/* Primary CTAs */}
      <View style={s.ctaRow}>
        <TouchableOpacity style={[s.ctaBtn, s.ctaPrimary]} onPress={() => { haptic(); onShareScore(); }} activeOpacity={0.85}>
          <Ionicons name="share-social" size={16} color="#C14A06" />
          <Text style={[s.ctaTxt, { color: '#C14A06' }]}>Share flex</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ctaBtn, s.ctaSecondary]} onPress={() => { haptic(); onImproveScore(); }} activeOpacity={0.85}>
          <Ionicons name="rocket" size={16} color="#fff" />
          <Text style={s.ctaTxt}>Improve score</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const useStyles = makeStyles(() => ({
  card: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#C14A06', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -60, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.1)' },
  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rankPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  rankEmoji: { fontSize: 14 },
  rankTxt: { fontSize: 11, fontWeight: '900', color: '#FFD580', letterSpacing: 0.8 },
  rankDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  rankSub: { fontSize: 9.5, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.8 },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center' },

  // Identity
  identityBlock: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  avatarWrap: { position: 'relative' },
  avatarRing: { padding: 3, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.32)' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  avatarPlace: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#C14A06' },
  name: { fontSize: 19, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  phone: { fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 1, fontWeight: '600' },
  tierInline: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  tierInlineTxt: { fontSize: 9.5, fontWeight: '900', color: '#fff', letterSpacing: 0.7 },

  // Score block
  scoreBlock: { flexDirection: 'row', gap: 12, marginTop: 16, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: 12 },
  scoreLeft: { minWidth: 90 },
  scoreLabel: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  scoreValue: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  scoreOf: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 6, marginLeft: 2 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  deltaTxt: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.2 },
  scoreRight: { flex: 1, justifyContent: 'center' },
  progBar: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden' },
  progFill: { height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  progHelper: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginTop: 6 },

  // Stat chips
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.24)', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  statEmoji: { fontSize: 20 },
  statN: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  statLbl: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.2 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  ctaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 999 },
  ctaPrimary: { backgroundColor: '#fff' },
  ctaSecondary: { backgroundColor: 'rgba(0,0,0,0.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  ctaTxt: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: -0.1 },
}));
