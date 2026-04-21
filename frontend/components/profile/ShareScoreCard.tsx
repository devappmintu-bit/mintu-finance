import React from 'react';
import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';

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
  monthlyDelta?: number; // +X score this month
};

/**
 * ShareScoreCard v2 — Viral Engine Edition (Phase 1 UX redesign)
 *
 * Upgrades:
 *   • Rank percentile badge  ("Top 12% in India 🇮🇳")
 *   • Monthly Δ progress     ("+7 this month 📈")
 *   • Competitive hook CTA   ("Can you beat me?")
 *   • Lighter gradient (saffron + cream) for better contrast & readability
 *   • Clearer typography hierarchy (score is the hero, everything else serves it)
 *   • Still IG-story aspect ratio for captureRef → shareImageSmart
 */

function percentileFor(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Top 5% in India 🇮🇳',  color: '#FBBF24' };
  if (score >= 80) return { label: 'Top 12% in India 🇮🇳', color: '#10B981' };
  if (score >= 70) return { label: 'Top 25% in India 🇮🇳', color: '#3B82F6' };
  if (score >= 50) return { label: 'Top 50% in India 🇮🇳', color: '#A78BFA' };
  return { label: 'Building my score 🇮🇳', color: '#F97316' };
}

const ShareScoreCard = React.forwardRef<View, { data: ShareScoreCardData }>(
  ({ data }, ref) => {
    const s = useStyles();
    const pct = percentileFor(data.score);
    const delta = Number(data.monthlyDelta ?? 0);

    return (
      <View ref={ref} collapsable={false} style={s.wrap}>
        <LinearGradient
          colors={['#FFF7ED', '#FFE4C4', '#F56E1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.card}
        >
          {/* Top row: MintU brand + hashtag */}
          <View style={s.brandRow}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>M</Text>
            </View>
            <Text style={s.brand}>MintU</Text>
            <View style={s.tagPill}>
              <Text style={s.tagText}>#MoneyScore</Text>
            </View>
          </View>

          {/* Percentile badge — new hero element above the fold */}
          <View style={[s.percentilePill, { borderColor: pct.color + 'AA' }]}>
            <Ionicons name="trophy" size={13} color={pct.color} />
            <Text style={[s.percentileTxt, { color: pct.color }]}>{pct.label}</Text>
          </View>

          {/* User identity */}
          <View style={s.userBlock}>
            {data.avatar ? (
              <Image source={{ uri: data.avatar }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlace}>
                <Text style={s.avatarInit}>{(data.name || 'U').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.userName} numberOfLines={1}>{data.name || 'User'}</Text>
          </View>

          {/* BIG SCORE — the hero */}
          <View style={s.scoreBlock}>
            <Text style={s.scoreLabel}>MONEY SCORE</Text>
            <View style={s.scoreRow}>
              <Text style={s.scoreBig}>{data.score}</Text>
              <Text style={s.scoreOutOf}>/100</Text>
            </View>
            {/* Monthly delta pill */}
            {delta !== 0 && (
              <View style={[s.deltaPill, { backgroundColor: delta > 0 ? '#10B98120' : '#EF444420' }]}>
                <Ionicons name={delta > 0 ? 'trending-up' : 'trending-down'} size={12} color={delta > 0 ? '#059669' : '#DC2626'} />
                <Text style={[s.deltaTxt, { color: delta > 0 ? '#059669' : '#DC2626' }]}>
                  {delta > 0 ? '+' : ''}{delta} this month
                </Text>
              </View>
            )}
            <View style={s.tierPill}>
              <Text style={s.tierEmoji}>{data.tierEmoji}</Text>
              <Text style={s.tierText}>{data.tier}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statEmoji}>🔥</Text>
              <Text style={s.statNum}>{data.streak}</Text>
              <Text style={s.statLbl}>Day Streak</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statEmoji}>💰</Text>
              <Text style={s.statNum}>{data.savingsRate}%</Text>
              <Text style={s.statLbl}>Saved</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statEmoji}>🪙</Text>
              <Text style={s.statNum}>{data.coins || 0}</Text>
              <Text style={s.statLbl}>Coins</Text>
            </View>
          </View>

          {/* Competitive hook footer */}
          <View style={s.hookBlock}>
            <Text style={s.hookLine}>Can you beat me?</Text>
            <Text style={s.ctaLine}>Download MintU & track your score</Text>
            {data.referralCode ? (
              <View style={s.codeWrap}>
                <Text style={s.codeLbl}>USE CODE</Text>
                <Text style={s.code}>{data.referralCode}</Text>
              </View>
            ) : null}
            <Text style={s.madeIn}>🇮🇳  Made in India  ·  mintu.app</Text>
          </View>
        </LinearGradient>
      </View>
    );
  },
);

ShareScoreCard.displayName = 'ShareScoreCard';
export default ShareScoreCard;

const useStyles = makeStyles(() => ({
  wrap: {
    width: 340,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#FFF7ED',
  },
  card: {
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 16,
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  logoCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#C14A06', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  brand: { fontSize: 18, fontWeight: '900', color: '#7A2E0A', flex: 1, letterSpacing: 0.2 },
  tagPill: { backgroundColor: 'rgba(122,46,10,0.1)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(122,46,10,0.18)' },
  tagText: { fontSize: 10, fontWeight: '800', color: '#7A2E0A', letterSpacing: 0.3 },

  percentilePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  percentileTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },

  userBlock: { alignItems: 'center', gap: 4 },
  avatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: '#fff' },
  avatarPlace: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  avatarInit: { fontSize: 26, fontWeight: '900', color: '#C14A06' },
  userName: { fontSize: 17, fontWeight: '800', color: '#1F2937', marginTop: 2 },

  scoreBlock: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 22, paddingVertical: 18, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(193,74,6,0.12)', alignSelf: 'stretch' },
  scoreLabel: { fontSize: 10, fontWeight: '900', color: '#C2410C', letterSpacing: 2, marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreBig: { fontSize: 80, fontWeight: '900', color: '#1F2937', letterSpacing: -3, lineHeight: 82 },
  scoreOutOf: { fontSize: 20, fontWeight: '800', color: '#9CA3AF', marginBottom: 14, marginLeft: 2 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  deltaTxt: { fontSize: 11.5, fontWeight: '900' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: '#C14A06' },
  tierEmoji: { fontSize: 13 },
  tierText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, alignSelf: 'stretch' },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statEmoji: { fontSize: 16 },
  statNum: { fontSize: 16, fontWeight: '900', color: '#1F2937' },
  statLbl: { fontSize: 9.5, fontWeight: '700', color: '#6B7280', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(0,0,0,0.08)' },

  hookBlock: { alignItems: 'center', gap: 5, marginTop: 2, alignSelf: 'stretch' },
  hookLine: { fontSize: 19, fontWeight: '900', color: '#7A2E0A', letterSpacing: -0.2 },
  ctaLine: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  codeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(193,74,6,0.15)', borderWidth: 1, borderColor: 'rgba(193,74,6,0.25)' },
  codeLbl: { fontSize: 9, fontWeight: '900', color: '#7A2E0A', letterSpacing: 1 },
  code: { fontSize: 14, fontWeight: '900', color: '#7A2E0A', letterSpacing: 1.5 },
  madeIn: { fontSize: 10.5, fontWeight: '700', color: '#7A2E0A', marginTop: 6, letterSpacing: 0.3 },
}));
