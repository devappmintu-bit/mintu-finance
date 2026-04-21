/**
 * RewardsHub — single-surface view of all rewards earned across the app.
 *
 * Lives on Profile. Shows:
 *   • Coins + money-score + streak stats
 *   • Badges earned vs locked (from /gamification/status)
 *   • Share CTAs (score card + referral)
 *
 * Tap any share CTA → share via the cross-platform shareSmart helper.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import api from '../../utils/api';
import { shareSmart } from '../../utils/share';
import { makeStyles } from '../../utils/makeStyles';

type Badge = { id: string; name: string; icon?: string; unlocked?: boolean; description?: string };

export default function RewardsHub() {
  const s = useStyles();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coins, setCoins] = useState<any>(null);
  const [game, setGame] = useState<any>(null);
  const [ref, setRef] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, g, r] = await Promise.allSettled([
          api.get('/coins/status'),
          api.get('/gamification/status'),
          api.get('/referral/enhanced-status'),
        ]);
        if (c.status === 'fulfilled') setCoins(c.value.data);
        if (g.status === 'fulfilled') setGame(g.value.data);
        if (r.status === 'fulfilled') setRef(r.value.data);
      } finally { setLoading(false); }
    })();
  }, []);

  // Compute stats ---------------------------------------------------
  const coinTotal = coins?.balance ?? 0;
  const todayEarned = coins?.today_earned ?? 0;
  const streak = game?.streak_days ?? 0;
  const level = game?.level ?? 1;
  const badgesRaw: Badge[] = Array.isArray(game?.badges) ? game.badges : [];
  const unlockedCount = badgesRaw.filter(b => b?.unlocked).length;
  const totalBadges = badgesRaw.length || 0;

  const referralCount = ref?.friends_joined ?? ref?.successful_referrals ?? 0;

  const onShareScore = async () => {
    try {
      const { data } = await api.get('/share/score-card');
      await shareSmart({
        title: 'My MintU Score',
        message: (data?.message || 'Check out my MintU money journey!') + '\n\nhttps://mintu.app',
      });
    } catch { /* silent */ }
  };

  const onShareReferral = async () => {
    const code = ref?.code || ref?.referral_code || 'MINTU';
    await shareSmart({
      title: 'Join me on MintU',
      message: `🎉 Use my MintU referral code ${code} — we both earn ₹50 in coins!\n\nhttps://mintu.app?ref=${code}`,
    });
  };

  // ── Collapsed header ─────────────────────────────────────────────
  const header = (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setExpanded(v => !v)}
      testID="rewards-hub-header"
    >
      <LinearGradient colors={['#FFF7ED', '#FFEAD0']} style={s.header}>
        <View style={s.headerIcon}><Text style={{ fontSize: 22 }}>🏆</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>My Rewards</Text>
          <Text style={s.headerSub}>
            🪙 {coinTotal} · 🔥 {streak}-day · 🎖 {unlockedCount}/{totalBadges || '—'} badges
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#7C2D12" />
      </LinearGradient>
    </TouchableOpacity>
  );

  if (!expanded) return <View style={s.wrap}>{header}</View>;

  return (
    <View style={s.wrap}>
      {header}

      {loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color="#F56E1E" />
        </View>
      ) : (
        <View style={s.body}>
          {/* Stats grid */}
          <View style={s.statsRow}>
            <StatTile icon="🪙" label="Coins" value={String(coinTotal)} sub={todayEarned > 0 ? `+${todayEarned} today` : 'Keep going!'} tint="#FFF7ED" border="#FDE68A" />
            <StatTile icon="🔥" label="Streak" value={`${streak}d`} sub={streak >= 3 ? 'On fire' : 'Build it up'} tint="#FFE4E6" border="#FECACA" />
            <StatTile icon="🎖" label="Level" value={String(level)} sub={`Lvl ${level}`} tint="#EDE9FE" border="#DDD6FE" />
            <StatTile icon="🤝" label="Invited" value={String(referralCount)} sub={referralCount > 0 ? 'Keep sharing' : 'Invite friends'} tint="#E0F2FE" border="#BAE6FD" />
          </View>

          {/* Badges horizontal */}
          <Text style={s.sectionTitle}>Badges</Text>
          {badgesRaw.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="ribbon-outline" size={22} color="#9CA3AF" />
              <Text style={s.emptyTxt}>No badges yet — complete challenges to earn your first one!</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {badgesRaw.map((b, i) => (
                <View key={(b.id || i) + String(i)} style={[s.badge, !b.unlocked && s.badgeLocked]}>
                  <Text style={{ fontSize: 22, opacity: b.unlocked ? 1 : 0.3 }}>{b.icon || '🏅'}</Text>
                  <Text style={[s.badgeName, !b.unlocked && { color: '#9CA3AF' }]} numberOfLines={2}>{b.name}</Text>
                  {!b.unlocked && (
                    <View style={s.badgeLockPin}>
                      <Ionicons name="lock-closed" size={10} color="#fff" />
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Shareable rewards */}
          <Text style={s.sectionTitle}>Share your wins</Text>
          <View style={s.shareRow}>
            <TouchableOpacity activeOpacity={0.85} onPress={onShareScore} style={s.shareCard} testID="rewards-share-score">
              <View style={[s.shareIcon, { backgroundColor: '#FFF7ED' }]}><Ionicons name="stats-chart" size={18} color="#F56E1E" /></View>
              <Text style={s.shareTitle}>Score card</Text>
              <Text style={s.shareSub}>Share your MintU score as an image</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={onShareReferral} style={s.shareCard} testID="rewards-share-referral">
              <View style={[s.shareIcon, { backgroundColor: '#F0FDF4' }]}><Ionicons name="gift" size={18} color="#10B981" /></View>
              <Text style={s.shareTitle}>Referral</Text>
              <Text style={s.shareSub}>Invite friends, earn ₹50 each</Text>
            </TouchableOpacity>
          </View>

          {/* Leaderboard shortcut */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)' as any)}
            style={s.leaderboardBtn}
            testID="rewards-leaderboard"
          >
            <Ionicons name="trophy" size={16} color="#7C2D12" />
            <Text style={s.leaderboardTxt}>View the leaderboard</Text>
            <Ionicons name="chevron-forward" size={16} color="#7C2D12" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function StatTile({ icon, label, value, sub, tint, border }: { icon: string; label: string; value: string; sub: string; tint: string; border: string }) {
  const s = useStyles();
  return (
    <View style={[s.stat, { backgroundColor: tint, borderColor: border }]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={s.statSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3F4F6' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FED7AA' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  headerSub: { fontSize: 11, color: '#7C2D12', fontWeight: '700', marginTop: 2 },

  body: { padding: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },

  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  stat: { flex: 1, minWidth: '22%', padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  statVal: { fontSize: 17, fontWeight: '800', color: '#111', marginTop: 2 },
  statLbl: { fontSize: 10, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  statSub: { fontSize: 9.5, color: '#9CA3AF', marginTop: 2 },

  badge: { width: 84, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', alignItems: 'center', position: 'relative' },
  badgeLocked: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  badgeName: { fontSize: 10, fontWeight: '700', color: '#7C2D12', textAlign: 'center', marginTop: 4 },
  badgeLockPin: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },

  emptyBox: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6' },
  emptyTxt: { flex: 1, fontSize: 12, color: '#6B7280' },

  shareRow: { flexDirection: 'row', gap: 10 },
  shareCard: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3F4F6' },
  shareIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  shareTitle: { fontSize: 13, fontWeight: '800', color: '#111' },
  shareSub: { fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 14 },

  leaderboardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 14, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  leaderboardTxt: { color: '#7C2D12', fontSize: 13, fontWeight: '800' },
}));
