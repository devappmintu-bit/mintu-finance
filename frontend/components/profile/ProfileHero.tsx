import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, shadowStyle } from '../../utils/theme';

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
  if (score >= 80) return '🏆 Elite Saver';
  if (score >= 60) return '💪 Smart Spender';
  if (score >= 40) return '⚡ Growing Saver';
  return '🌱 Just Starting';
};

export default function ProfileHero({
  user, avatar, referralCount,
  onEditName, onPickAvatar, onRemoveAvatar,
  onOpenReferrals, onOpenYearly, onShareScore,
}: Props) {
  const score = user?.money_score || 0;
  return (
    <View style={s.card}>
      <TouchableOpacity style={s.editBtn} onPress={onEditName}>
        <Ionicons name="create-outline" size={16} color={COLORS.text.muted} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onPickAvatar}
        onLongPress={avatar ? onRemoveAvatar : undefined}
        style={s.avatarWrap}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} />
        ) : (
          <View style={s.avatarPlace}>
            <Text style={s.avatarInitial}>{(user?.name || 'U').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.camBadge}>
          <Ionicons name="camera" size={11} color="#fff" />
        </View>
      </TouchableOpacity>

      <Text style={s.name}>{user?.name || 'User'}</Text>
      <Text style={s.phone}>{user?.phone}</Text>

      <View style={s.progWrap}>
        <View style={s.progHeader}>
          <Text style={s.progLabel}>Money Score</Text>
          <Text style={s.progValue}>{score}/100</Text>
        </View>
        <View style={s.progBar}>
          <View style={[s.progFill, { width: `${Math.min(100, score)}%` }]} />
        </View>
        <Text style={s.progTier}>{tierFor(score)}</Text>
      </View>

      <View style={s.pillRow}>
        <TouchableOpacity style={s.pill} onPress={onOpenReferrals}>
          <Ionicons name="people" size={16} color="#F59E0B" />
          <Text style={s.pillText}>{referralCount} Referrals</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.pill} onPress={onOpenYearly}>
          <Ionicons name="bar-chart" size={16} color={COLORS.accent.moneyIn} />
          <Text style={s.pillText}>Year View</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.shareCTA} onPress={onShareScore} activeOpacity={0.85}>
        <Ionicons name="share-social" size={18} color="#fff" />
        <Text style={s.shareCTAText}>Share My Score</Text>
        <View style={s.shareBadge}>
          <Ionicons name="image" size={10} color="#fff" />
          <Text style={s.shareBadgeText}>IMAGE</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border.card, position: 'relative' },
  editBtn: { position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg.primary, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  avatarWrap: { position: 'relative', marginTop: 4 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: COLORS.accent.primary + '30' },
  avatarPlace: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.accent.primary + '40' },
  avatarInitial: { fontSize: 40, fontWeight: '800', color: COLORS.accent.primary },
  camBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  name: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary, marginTop: 12 },
  phone: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
  progWrap: { width: '100%', marginTop: 18, backgroundColor: '#F8F9FB', borderRadius: 14, padding: 14 },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted, letterSpacing: 0.3 },
  progValue: { fontSize: 14, fontWeight: '800', color: COLORS.accent.primary },
  progBar: { height: 8, backgroundColor: COLORS.border.subtle, borderRadius: 4, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: COLORS.accent.primary, borderRadius: 4 },
  progTier: { fontSize: 11, color: COLORS.text.secondary, marginTop: 8, textAlign: 'center', fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: COLORS.bg.primary, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border.card },
  pillText: { fontSize: 13, fontWeight: '700', color: COLORS.text.primary },
  shareCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: COLORS.accent.primary, borderRadius: 999 },
  shareCTAText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  shareBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999 },
  shareBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.8 },
});
