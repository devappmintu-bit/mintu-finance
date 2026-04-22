/**
 * InviteEarnStrip — Compact Invite & Earn card.
 *
 * Replaces the previous heavy ReferralDashboard when space is scarce.
 * Shows referral count, earnings (₹50 per friend), share CTA.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function InviteEarnStrip({
  referralCount,
  referralCode,
  onShare,
  onOpenDashboard,
}: {
  referralCount: number;
  referralCode?: string;
  onShare: () => void;
  onOpenDashboard: () => void;
}) {
  const earned = referralCount * 50; // ₹50 per successful referral

  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={() => { haptic(); onOpenDashboard(); }}>
      <LinearGradient
        colors={['#FEF3C7', '#FED7AA']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.card}
      >
        <View style={s.emojiCol}>
          <Text style={s.giftEmoji}>🎁</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.titleRow}>
            <Text style={s.title}>Invite & Earn</Text>
            <View style={s.earnedPill}>
              <Text style={s.earnedPillTxt}>₹{earned} earned</Text>
            </View>
          </View>
          <Text style={s.sub} numberOfLines={2}>
            {referralCount > 0
              ? `${referralCount} friend${referralCount === 1 ? '' : 's'} joined · ₹50 per invite`
              : 'Get ₹50 for each friend who joins MintU'}
          </Text>
          {referralCode ? (
            <View style={s.codeRow}>
              <Text style={s.codeLbl}>CODE</Text>
              <Text style={s.codeTxt}>{referralCode}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={s.shareBtn}
          onPress={(e) => { e.stopPropagation(); haptic(); onShare(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="share-social" size={15} color="#fff" />
          <Text style={s.shareBtnTxt}>Share</Text>
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  emojiCol: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  giftEmoji: { fontSize: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '900', color: '#7C2D12', letterSpacing: -0.2 },
  earnedPill: { backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  earnedPillTxt: { fontSize: 10, fontWeight: '900', color: '#fff' },
  sub: { fontSize: 11.5, fontWeight: '700', color: '#9A3412', marginTop: 3, lineHeight: 15 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  codeLbl: { fontSize: 9, fontWeight: '900', color: '#9A3412', letterSpacing: 0.8 },
  codeTxt: { fontSize: 11.5, fontWeight: '900', color: '#111827', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, letterSpacing: 0.8 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#C14A06', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  shareBtnTxt: { fontSize: 12, fontWeight: '900', color: '#fff' },
});
