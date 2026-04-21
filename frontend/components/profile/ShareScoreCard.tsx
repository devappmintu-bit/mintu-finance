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
  monthlyDelta?: number;
};

/**
 * ShareScoreCard v3 — Dark Premium (CRED-level polish · Phase Delta 1)
 *
 * Design goals:
 *   • <2 second scan time (Score dominates the card)
 *   • Dark base (#0B0D12) with saffron accent only where needed
 *   • Minimal clutter: NO heavy borders, NO busy patterns, ONE soft shadow
 *   • Clear hierarchy: Score → Rank → Stats → CTA → Referral
 *   • High-resolution export-ready (captureRef at 3.2× pixelRatio upstream)
 */

function percentileFor(score: number): { label: string; color: string; ring: string } {
  if (score >= 90) return { label: 'TOP 5% IN INDIA',  color: '#FBBF24', ring: 'rgba(251,191,36,0.25)' };
  if (score >= 80) return { label: 'TOP 12% IN INDIA', color: '#34D399', ring: 'rgba(52,211,153,0.25)' };
  if (score >= 70) return { label: 'TOP 25% IN INDIA', color: '#60A5FA', ring: 'rgba(96,165,250,0.25)' };
  if (score >= 50) return { label: 'TOP 50% IN INDIA', color: '#C084FC', ring: 'rgba(192,132,252,0.25)' };
  return { label: 'BUILDING MY SCORE', color: '#FB923C', ring: 'rgba(251,146,60,0.25)' };
}

const ShareScoreCard = React.forwardRef<View, { data: ShareScoreCardData }>(
  ({ data }, ref) => {
    const s = useStyles();
    const pct = percentileFor(data.score);
    const delta = Number(data.monthlyDelta ?? 0);

    return (
      <View ref={ref} collapsable={false} style={s.wrap}>
        <LinearGradient
          colors={['#0B0D12', '#1A1F2E', '#0B0D12']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.5, 1]}
          style={s.card}
        >
          {/* Accent glow blobs — subtle, premium */}
          <View style={[s.glow1, { backgroundColor: pct.ring }]} />
          <View style={s.glow2} />

          {/* Brand strip */}
          <View style={s.brandRow}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>M</Text>
            </View>
            <Text style={s.brand}>MintU</Text>
            <View style={s.hashPill}>
              <Text style={s.hashTxt}>#MoneyScore</Text>
            </View>
          </View>

          {/* Rank percentile pill (above the fold, under brand) */}
          <View style={[s.rankPill, { borderColor: pct.color, backgroundColor: pct.color + '15' }]}>
            <Ionicons name="trophy" size={12} color={pct.color} />
            <Text style={[s.rankTxt, { color: pct.color }]}>{pct.label}</Text>
          </View>

          {/* User row */}
          <View style={s.userRow}>
            {data.avatar ? (
              <Image source={{ uri: data.avatar }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlace}>
                <Text style={s.avatarInit}>{(data.name || 'U').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.userName} numberOfLines={1}>{data.name || 'User'}</Text>
              <View style={s.tierRow}>
                <Text style={s.tierEmoji}>{data.tierEmoji}</Text>
                <Text style={s.tierText}>{data.tier}</Text>
              </View>
            </View>
          </View>

          {/* BIG SCORE — the hero */}
          <View style={s.scoreBlock}>
            <View style={s.scoreInnerRow}>
              <Text style={s.scoreBig}>{data.score}</Text>
              <View style={s.scoreMeta}>
                <Text style={s.scoreOutOf}>/100</Text>
                {delta !== 0 && (
                  <View style={[s.deltaPill, { backgroundColor: delta > 0 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)' }]}>
                    <Ionicons name={delta > 0 ? 'trending-up' : 'trending-down'} size={10} color={delta > 0 ? '#34D399' : '#F87171'} />
                    <Text style={[s.deltaTxt, { color: delta > 0 ? '#34D399' : '#F87171' }]}>
                      {delta > 0 ? '+' : ''}{delta}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={s.scoreLabel}>MONEY SCORE</Text>
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statEmoji}>🔥</Text>
              <Text style={s.statNum}>{data.streak}</Text>
              <Text style={s.statLbl}>Streak</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statEmoji}>💰</Text>
              <Text style={s.statNum}>{data.savingsRate}<Text style={s.statUnit}>%</Text></Text>
              <Text style={s.statLbl}>Saved</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statEmoji}>🪙</Text>
              <Text style={s.statNum}>{data.coins || 0}</Text>
              <Text style={s.statLbl}>Coins</Text>
            </View>
          </View>

          {/* Competitive hook */}
          <Text style={s.hook}>Think you can beat me?</Text>

          {/* CTA */}
          <View style={s.ctaBlock}>
            <Text style={s.ctaDownload}>Download MintU</Text>
            <Text style={s.ctaDomain}>mintu.app  ·  🇮🇳</Text>
          </View>

          {/* Referral — subtle but visible */}
          {data.referralCode ? (
            <View style={s.codeRow}>
              <Text style={s.codeLbl}>USE CODE</Text>
              <Text style={s.code}>{data.referralCode}</Text>
              <Text style={s.codeSub}>+ bonus coins</Text>
            </View>
          ) : null}
        </LinearGradient>
      </View>
    );
  },
);

ShareScoreCard.displayName = 'ShareScoreCard';
export default ShareScoreCard;

const useStyles = makeStyles(() => ({
  wrap: { width: 340, borderRadius: 28, overflow: 'hidden', backgroundColor: '#0B0D12' },
  card: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
    gap: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  // Premium glow accents — replace heavy gradient borders
  glow1: { position: 'absolute', top: -80, right: -60, width: 220, height: 220, borderRadius: 110 },
  glow2: { position: 'absolute', bottom: -100, left: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(245,110,30,0.10)' },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F56E1E', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  brand: { flex: 1, fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  hashPill: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  hashTxt: { fontSize: 10, fontWeight: '800', color: '#D1D5DB', letterSpacing: 0.4 },

  rankPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  rankTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  avatarPlace: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F56E1E', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  avatarInit: { fontSize: 22, fontWeight: '900', color: '#fff' },
  userName: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  tierEmoji: { fontSize: 12 },
  tierText: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.2 },

  scoreBlock: { alignItems: 'center', marginVertical: 2 },
  scoreInnerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  scoreBig: { fontSize: 96, fontWeight: '900', color: '#fff', letterSpacing: -4, lineHeight: 98 },
  scoreMeta: { alignItems: 'flex-start', gap: 6, marginTop: 12 },
  scoreOutOf: { fontSize: 18, fontWeight: '800', color: '#6B7280' },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  deltaTxt: { fontSize: 11, fontWeight: '900' },
  scoreLabel: { fontSize: 10, fontWeight: '900', color: '#6B7280', letterSpacing: 2.5, marginTop: 4 },

  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8 },
  statBox: { flex: 1, alignItems: 'center', gap: 3 },
  statEmoji: { fontSize: 16 },
  statNum: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  statUnit: { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  statLbl: { fontSize: 9.5, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },

  hook: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -0.3, marginTop: 2 },

  ctaBlock: { alignItems: 'center', gap: 3, marginTop: -8 },
  ctaDownload: { fontSize: 14, fontWeight: '900', color: '#F56E1E', letterSpacing: 0.2 },
  ctaDomain: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.3 },

  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(245,110,30,0.12)', borderWidth: 1, borderColor: 'rgba(245,110,30,0.3)' },
  codeLbl: { fontSize: 9, fontWeight: '900', color: '#9CA3AF', letterSpacing: 0.8 },
  code: { fontSize: 13, fontWeight: '900', color: '#F56E1E', letterSpacing: 1.5 },
  codeSub: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
}));
