/**
 * Rewards Hub — Gamification v2 (Wave 1).
 *
 * Complete redesign based on spec:
 *   1. RewardsHero — saffron gradient with coin count + free spins + tier badge
 *   2. TierCard — progression Bronze → Platinum with XP bar
 *   3. EnergyBar — live "Next spin in N coins" / "X free spins today"
 *   4. SpinWheel — premium animated SVG wheel with tick haptics + deceleration
 *   5. Daily Missions — 3 mission cards with progress + pulsing claim
 *   6. Pro upsell — soft-paywall teaser card "2x spins for ₹49/month"
 *   7. Recent wins — compact history strip
 *
 * All data flows through the new /api/rewards/summary, /rewards/spin,
 * /rewards/missions, /rewards/missions/claim endpoints.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAppColors } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import Confetti from '../components/Confetti';
import RewardsHero from '../components/rewards/RewardsHero';
import TierCard from '../components/rewards/TierCard';
import EnergyBar from '../components/rewards/EnergyBar';
import SpinWheel, { SpinWheelHandle } from '../components/rewards/SpinWheel';
import MissionCard from '../components/rewards/MissionCard';
import MarketplaceSection from '../components/rewards/MarketplaceSection';
import SocialFeedTicker from '../components/rewards/SocialFeedTicker';
import EventsBanner from '../components/rewards/EventsBanner';
import {
  fetchRewardsSummary, spinWheel, claimMission,
  fetchMarketplace, fetchSocialFeed, fetchEvents,
  claimMarketplaceReward,
} from '../services/rewards';
import { useIsOnline } from '../hooks/useIsOnline';

export default function RewardsHubScreen() {
  const isOnline = useIsOnline();
  const [data, setData] = useState<any>(null);
  const [market, setMarket] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [events, setEvents] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [claimingMission, setClaimingMission] = useState<string | null>(null);
  // Marketplace claim in-flight guard — prevents double-redeem if the user
  // spam-taps "Claim". Backend may or may not be idempotent on this path,
  // so defence-in-depth is warranted (draining coins twice is unrecoverable).
  const [claimingMarket, setClaimingMarket] = useState<Set<string>>(new Set());
  const [confetti, setConfetti] = useState(false);
  const [lastWin, setLastWin] = useState<any>(null);
  const spinRef = useRef<SpinWheelHandle>(null);
  const c = useAppColors();
  const s = useStyles();

  const load = useCallback(async () => {
    try {
      const [d, m, f, e] = await Promise.all([
        fetchRewardsSummary(),
        fetchMarketplace().catch(() => null),
        fetchSocialFeed().catch(() => null),
        fetchEvents().catch(() => null),
      ]);
      setData(d);
      setMarket(m);
      setFeed(f);
      setEvents(e);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Could not load rewards', text2: e?.message || '' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSpin = async (): Promise<{ prize: any } | null> => {
    if (!data) return null;
    try {
      setSpinning(true);
      const res = await spinWheel();
      setLastWin(res.resolved_prize || res.prize);
      // Optimistically update state — full refresh after wheel finishes
      setData((prev: any) => ({
        ...prev,
        coins: res.coins,
        xp: res.xp,
        tier: res.tier,
        free_spins_left: res.free_spins_left,
      }));
      return { prize: res.prize };
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Spin failed', text2: e?.response?.data?.detail || 'Try again' });
      setSpinning(false);
      return null;
    }
  };

  const handleSpinResult = (prize: any) => {
    setSpinning(false);
    const resolved = lastWin || prize;
    const isNotable = resolved?.kind !== 'none';
    if (isNotable) {
      setConfetti(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setConfetti(false), 2200);
    }
    const winLabel = resolved?.label || prize?.label || 'A reward';
    Toast.show({
      type: isNotable ? 'success' : 'info',
      text1: isNotable ? `🎉 You won ${winLabel}!` : 'Better luck next time',
      text2: isNotable ? 'Added to your wallet' : 'Keep spinning to win big',
    });
    // Re-sync state after spin
    setTimeout(() => load(), 600);
  };

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleClaimMission = async (mid: string) => {
    try {
      setClaimingMission(mid);
      const res = await claimMission(mid);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfetti(true);
      setTimeout(() => setConfetti(false), 1600);
      Toast.show({
        type: 'success',
        text1: `+${res.coins_awarded} coins · +${res.xp_awarded} XP`,
        text2: 'Mission claimed',
      });
      load();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Claim failed', text2: e?.response?.data?.detail || 'Try again' });
    } finally {
      setClaimingMission(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={c.accent.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center', padding: 20 }]}>
        <Text style={{ fontSize: 14, color: '#6B7280' }}>Unable to load rewards. Pull to refresh.</Text>
      </SafeAreaView>
    );
  }

  const {
    coins = 0, tier, free_spins_left = 0, coins_to_next_spin = 0,
    spin_cost = 10, prizes = [], missions = [], recent_rewards = [],
    can_spin_with_free, can_spin_with_coins,
  } = data;

  const canSpin = !!(can_spin_with_free || can_spin_with_coins);
  const ctaSubtitle = can_spin_with_free
    ? `${free_spins_left} free spin${free_spins_left === 1 ? '' : 's'} left`
    : can_spin_with_coins
      ? `Costs ${spin_cost} coins`
      : `Earn ${coins_to_next_spin} more coins`;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Confetti trigger={confetti} />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <RewardsHero
          coins={coins}
          freeSpinsLeft={free_spins_left}
          tierName={tier?.name || 'Bronze'}
          tierColor={tier?.color || '#CD7F32'}
          onBack={() => router.back()}
          onPressCoins={() => router.push('/coin-ledger' as any)}
        />

        {/* Live FOMO social feed ticker */}
        {feed?.items?.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <SocialFeedTicker items={feed.items} />
          </View>
        )}

        {/* Time-boxed events banner */}
        {events?.events?.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <EventsBanner
              events={events.events}
              onPress={(ev) => {
                if (ev.id === 'mystery_box_teaser') {
                  router.push('/mystery-box' as any);
                } else if (ev.id === 'weekend_mega' || ev.id === 'double_rewards_hour') {
                  // Trigger a spin directly from the event card
                  spinRef.current?.forceSpin();
                }
              }}
            />
          </View>
        )}

        {/* Tier progression */}
        <View style={s.section}>
          <TierCard tier={tier} />
        </View>

        {/* Spin Wheel + Energy Bar */}
        <View style={[s.section, s.wheelSection]}>
          <SpinWheel
            ref={spinRef}
            prizes={prizes}
            size={280}
            disabled={!canSpin || spinning}
            ctaLabel={canSpin ? 'Spin & Win Rewards' : 'Earn coins to spin'}
            ctaSubtitle={ctaSubtitle}
            onSpin={handleSpin}
            onResult={handleSpinResult}
          />
          <View style={{ width: '100%', marginTop: 14 }}>
            <EnergyBar
              freeSpinsLeft={free_spins_left}
              coins={coins}
              spinCost={spin_cost}
              coinsToNextSpin={coins_to_next_spin}
            />
          </View>
        </View>

        {/* Daily Missions */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.sectionEmoji}>🔥</Text>
              <Text style={s.sectionTitle}>Daily Missions</Text>
            </View>
            <Text style={s.sectionSub}>Resets in {hoursToMidnight()}h</Text>
          </View>
          <View style={{ gap: 10 }}>
            {missions.map((m: any) => (
              <MissionCard
                key={m.id}
                mission={m}
                onClaim={handleClaimMission}
                submitting={claimingMission === m.id}
              />
            ))}
          </View>
        </View>

        {/* Pro upsell — soft paywall */}
        <View style={s.section}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/premium' as any)}>
            <LinearGradient colors={['#1F2937', '#0F172A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.proCard}>
              <View style={s.proBlob} />
              <View style={s.proHeadRow}>
                <View style={s.proBadge}>
                  <Ionicons name="flash" size={13} color="#fff" />
                  <Text style={s.proBadgeTxt}>MINTU PRO</Text>
                </View>
                <Text style={s.proPrice}>from ₹49/mo</Text>
              </View>
              <Text style={s.proTitle}>2× rewards. 10 free spins/day.</Text>
              <Text style={s.proSub}>Unlock ₹200+ premium rewards, boosted win probability, and exclusive vouchers.</Text>
              <View style={s.proCta}>
                <Text style={s.proCtaTxt}>Upgrade Now</Text>
                <Ionicons name="arrow-forward" size={14} color="#F59E0B" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Rewards Marketplace — Trending / Recommended / Premium */}
        {market && (
          <View style={{ marginTop: 20 }}>
            <MarketplaceSection
              trending={market.trending || []}
              recommended={market.recommended || []}
              premium={market.premium || []}
              isPro={!!market.is_pro}
              userCoins={coins}
              onClaim={async (r) => {
                if (!isOnline) {
                  Toast.show({ type: 'info', text1: "You're offline", text2: 'Connect to the internet to redeem' });
                  return;
                }
                if (r.locked) { router.push('/premium' as any); return; }
                if (coins < r.cost_coins) {
                  Toast.show({ type: 'info', text1: 'Not enough coins', text2: `Need ${r.cost_coins - coins} more — earn via spins & missions` });
                  return;
                }
                // Double-tap guard — if the user spam-taps Claim, only the
                // first request goes through. Coin deduction is unrecoverable
                // so we must gate this client-side as defence-in-depth.
                if (claimingMarket.has(r.id)) return;
                setClaimingMarket(prev => { const n = new Set(prev); n.add(r.id); return n; });
                // Round 35 — optimistic coin decrement so the header balance
                // updates instantly; load() will reconcile with the server
                // response a moment later.
                const prevCoins = coins;
                setCoins(Math.max(0, coins - r.cost_coins));
                try {
                  const res = await claimMarketplaceReward(r.id);
                  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  setConfetti(true);
                  setTimeout(() => setConfetti(false), 1800);
                  Toast.show({ type: 'success', text1: `${r.brand} voucher added`, text2: `${r.discount} · valid 30 days` });
                  // Refresh balance & marketplace
                  load();
                } catch (e: any) {
                  // Rollback the optimistic decrement since the claim failed.
                  setCoins(prevCoins);
                  Toast.show({ type: 'error', text1: 'Claim failed', text2: e?.response?.data?.detail || 'Try again' });
                } finally {
                  setClaimingMarket(prev => { const n = new Set(prev); n.delete(r.id); return n; });
                }
              }}
            />
          </View>
        )}

        {/* Recent wins */}
        {recent_rewards.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.sectionEmoji}>🏆</Text>
                <Text style={s.sectionTitle}>Recent Wins</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
              {recent_rewards.slice(0, 10).map((r: any, i: number) => (
                <View key={r._id || i} style={s.winCard}>
                  <Text style={{ fontSize: 22 }}>{r.emoji || '🎁'}</Text>
                  <Text style={s.winLbl} numberOfLines={2}>{r.label || (r.type === 'cashback' ? `₹${r.value} Cashback` : `₹${r.value} ${r.merchant || ''}`)}</Text>
                  {r.type === 'voucher' && !r.claimed && (
                    <View style={s.winBadge}><Text style={s.winBadgeTxt}>NEW</Text></View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function hoursToMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / (1000 * 60 * 60)));
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: '#FFFBF5' },
  scroll: { paddingBottom: 40 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  wheelSection: { alignItems: 'center', marginTop: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#111827', letterSpacing: -0.2 },
  sectionEmoji: { fontSize: 16 },
  sectionSub: { fontSize: 10.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.3 },
  proCard: { padding: 16, borderRadius: 20, gap: 8, overflow: 'hidden', position: 'relative' },
  proBlob: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(245,158,11,0.15)' },
  proHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F59E0B' },
  proBadgeTxt: { fontSize: 9.5, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  proPrice: { fontSize: 11, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.3 },
  proTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginTop: 4 },
  proSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', lineHeight: 17 },
  proCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  proCtaTxt: { fontSize: 13, fontWeight: '900', color: '#F59E0B' },
  winCard: { width: 120, padding: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', gap: 6, position: 'relative' },
  winLbl: { fontSize: 11, fontWeight: '800', color: '#374151', textAlign: 'center' },
  winBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#10B981' },
  winBadgeTxt: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },
}));
