import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export type ShareScoreCardData = {
  name: string;
  avatar?: string;
  score: number;
  tier: string;
  tierEmoji: string;
  streak: number;
  savingsRate: number;
  coins?: number;
  referralCode?: string;
};

/**
 * A premium, Instagram-story-ready viral card.
 * Rendered at a natural size (~340x560 on screen), but captured at 2x pixelRatio
 * via react-native-view-shot produces a ~680x1120 image perfect for WhatsApp / IG stories.
 *
 * IMPORTANT: must be rendered in a ViewShot wrapper by the parent.
 */
const ShareScoreCard = React.forwardRef<View, { data: ShareScoreCardData }>(
  ({ data }, ref) => {
    const tierColor =
      data.score >= 80 ? '#FCD34D' : data.score >= 60 ? '#A7F3D0' : data.score >= 40 ? '#93C5FD' : '#FCA5A5';

    return (
      <View ref={ref} collapsable={false} style={s.wrap}>
        <LinearGradient
          colors={['#0F172A', '#1E293B', '#312E81']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.card}
        >
          {/* Top brand strip */}
          <View style={s.brandRow}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>M</Text>
            </View>
            <Text style={s.brand}>MintU</Text>
            <View style={s.tagPill}>
              <Text style={s.tagText}>#MoneyScore</Text>
            </View>
          </View>

          {/* User block */}
          <View style={s.userBlock}>
            {data.avatar ? (
              <Image source={{ uri: data.avatar }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlace}>
                <Text style={s.avatarInit}>{(data.name || 'U').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.userName} numberOfLines={1}>{data.name || 'User'}</Text>
            <Text style={s.userSub}>India's smartest money app</Text>
          </View>

          {/* HUGE Score */}
          <View style={s.scoreBlock}>
            <Text style={s.scoreLabel}>MY MONEY SCORE</Text>
            <View style={s.scoreRow}>
              <Text style={s.scoreBig}>{data.score}</Text>
              <Text style={s.scoreOutOf}>/100</Text>
            </View>
            <View style={[s.tierPill, { backgroundColor: tierColor + '25', borderColor: tierColor + '60' }]}>
              <Text style={[s.tierEmoji]}>{data.tierEmoji}</Text>
              <Text style={[s.tierText, { color: tierColor }]}>{data.tier}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Ionicons name="flame" size={18} color="#F59E0B" />
              <Text style={s.statNum}>{data.streak}</Text>
              <Text style={s.statLbl}>Day Streak</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Ionicons name="trending-up" size={18} color="#10B981" />
              <Text style={s.statNum}>{data.savingsRate}%</Text>
              <Text style={s.statLbl}>Saved</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Ionicons name="star" size={18} color="#FBBF24" />
              <Text style={s.statNum}>{data.coins || 0}</Text>
              <Text style={s.statLbl}>Coins</Text>
            </View>
          </View>

          {/* Footer CTA */}
          <View style={s.footer}>
            <Text style={s.footerTop}>Think you can beat me?</Text>
            <View style={s.ctaBox}>
              <Text style={s.ctaText}>
                Download MintU & track your score
              </Text>
              {data.referralCode ? (
                <View style={s.codeWrap}>
                  <Text style={s.codeLbl}>USE CODE</Text>
                  <Text style={s.code}>{data.referralCode}</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.madeIn}>🇮🇳 Made in India · mintu.app</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }
);

ShareScoreCard.displayName = 'ShareScoreCard';
export default ShareScoreCard;

const s = StyleSheet.create({
  wrap: {
    // Natural display size optimised for IG-story aspect ratio (9:16).
    width: 340,
    // height auto-calculated by children; IG story ratio ~ 340 * 16/9 ≈ 604
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  card: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 20,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center',
  },
  logoText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  brand: { fontSize: 18, fontWeight: '900', color: '#fff', flex: 1, letterSpacing: 0.3 },
  tagPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  tagText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  userBlock: { alignItems: 'center', gap: 6, marginTop: 4 },
  avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' },
  avatarPlace: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarInit: { fontSize: 28, fontWeight: '900', color: '#fff' },
  userName: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 6 },
  userSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 0.3 },

  scoreBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  scoreLabel: {
    fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2, marginBottom: 4,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreBig: {
    fontSize: 84,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 90,
    letterSpacing: -2,
  },
  scoreOutOf: {
    fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.45)',
    marginBottom: 14, marginLeft: 4,
  },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, marginTop: 8,
  },
  tierEmoji: { fontSize: 14 },
  tierText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  statBox: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 18, fontWeight: '900', color: '#fff', marginTop: 2 },
  statLbl: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.12)' },

  footer: { alignItems: 'center', gap: 10 },
  footerTop: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  ctaBox: {
    width: '100%',
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 6,
  },
  ctaText: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
  codeWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  codeLbl: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1 },
  code: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
  madeIn: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
});
