/**
 * ProfileHero — MintU 2.0 saffron-gradient profile card.
 *
 * Matches Home/Transactions/Budget brand aesthetic:
 *   • Gradient saffron background with decorative blobs
 *   • Large avatar with camera badge (tap to change)
 *   • Name + phone
 *   • Money Score progress bar (white on dark) + tier badge
 *   • Pill row: Referrals · Yearly · Share (tap-through)
 */
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  user: any;
  avatar?: string | null;
  referralCount: number;
  onEditName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onOpenReferrals: () => void;
  onOpenYearly: () => void;
  onShareScore: () => void;
}

const tierFor = (score: number) => {
  if (score >= 80) return { emoji: '🏆', label: 'Elite Saver' };
  if (score >= 60) return { emoji: '💪', label: 'Smart Spender' };
  if (score >= 40) return { emoji: '⚡', label: 'Growing Saver' };
  return { emoji: '🌱', label: 'Just Starting' };
};

export default function ProfileHero({
  user, avatar, referralCount,
  onEditName, onPickAvatar, onRemoveAvatar,
  onOpenReferrals, onOpenYearly, onShareScore,
}: Props) {
  const s = useStyles();
  const score = user?.money_score || 0;
  const tier = tierFor(score);

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <TouchableOpacity style={s.editBtn} onPress={() => { haptic(); onEditName(); }} activeOpacity={0.8}>
        <Ionicons name="create-outline" size={15} color="#fff" />
      </TouchableOpacity>

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

      <Text style={s.name} numberOfLines={1}>{user?.name || 'User'}</Text>
      <Text style={s.phone}>{user?.phone || '—'}</Text>

      {/* Money Score */}
      <View style={s.progWrap}>
        <View style={s.progHeader}>
          <Text style={s.progLabel}>MONEY SCORE</Text>
          <Text style={s.progValue}>{score}<Text style={s.progOf}>/100</Text></Text>
        </View>
        <View style={s.progBar}>
          <View style={[s.progFill, { width: `${Math.min(100, score)}%` }]} />
        </View>
        <View style={s.tierPill}>
          <Text style={s.tierEmoji}>{tier.emoji}</Text>
          <Text style={s.tierTxt}>{tier.label.toUpperCase()}</Text>
        </View>
      </View>

      {/* Pill row */}
      <View style={s.pillRow}>
        <TouchableOpacity style={s.pill} onPress={() => { haptic(); onOpenReferrals(); }} activeOpacity={0.85}>
          <Ionicons name="people" size={15} color="#fff" />
          <Text style={s.pillText}>{referralCount} Referrals</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.pill} onPress={() => { haptic(); onOpenYearly(); }} activeOpacity={0.85}>
          <Ionicons name="bar-chart" size={15} color="#fff" />
          <Text style={s.pillText}>Yearly</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.pill, s.pillPrimary]} onPress={() => { haptic(); onShareScore(); }} activeOpacity={0.85}>
          <Ionicons name="share-social" size={15} color="#C14A06" />
          <Text style={[s.pillText, { color: '#C14A06' }]}>Share</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const useStyles = makeStyles(() => ({
  card: {
    borderRadius: 26,
    padding: 22,
    marginBottom: 14,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#C14A06', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  blob1: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  blob2: { position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.08)' },
  editBtn: { position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.22)', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  avatarWrap: { position: 'relative', marginBottom: 10 },
  avatarRing: { padding: 3, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.28)' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff' },
  avatarPlace: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  camBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#C14A06' },
  name: { fontSize: 20, fontWeight: '900', color: '#fff', marginTop: 2, letterSpacing: -0.3 },
  phone: { fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' },
  // Progress
  progWrap: { width: '100%', marginTop: 16, paddingHorizontal: 2 },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 7 },
  progLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)' },
  progValue: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  progOf: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  progBar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  tierPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  tierEmoji: { fontSize: 12 },
  tierTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.7 },
  // Pills
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 16, alignSelf: 'stretch' },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  pillPrimary: { backgroundColor: '#FFFFFF' },
  pillText: { fontSize: 11.5, fontWeight: '800', color: '#fff', letterSpacing: -0.1 },
}));
