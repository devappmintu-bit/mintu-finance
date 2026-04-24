/**
 * StreakCoinsHealthCard — expandable observability card for the Profile page.
 *
 * Collapsed state:
 *   🔥 Streak (current) · 🪙 Coins (balance) · ▼  [tap to expand]
 *
 * Expanded state reveals a readable dashboard showing:
 *   1) Streak stats: current + longest + total check-ins + tier
 *   2) Freezes (premium-only): availability + max/month + last-used + upsell CTA
 *      for non-premium users
 *   3) Coin rollups: balance, earned last-7d, earned last-30d, lifetime earn/spend
 *   4) Milestone countdowns: next weekly bonus (days), next monthly bonus (days)
 *   5) Ledger-integrity pill (✓ Verified or ⚠ Out-of-sync)
 *
 * Data source: GET /api/streak/health (see routers/streak.py)
 * Premium CTA navigates to /premium.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { makeStyles } from '../../utils/makeStyles';
import api from '../../utils/api';
import AnimatedStreak from '../AnimatedStreak';
import AnimatedCoin from '../AnimatedCoin';

type HealthData = {
  streak: {
    current: number;
    longest: number;
    last_active_date: string | null;
    total_check_ins: number;
    tier: { tier: string; emoji: string; rank_label: string };
    today_utc: string;
  };
  freezes: {
    is_premium: boolean;
    available: number;
    max_per_month: number;
    last_used_at: string | null;
    last_refill_month: string | null;
  };
  coins: {
    balance: number;
    cached_balance: number;
    integrity_ok: boolean;
    total_earned_lifetime: number;
    total_spent_lifetime: number;
    earned_last_7d: number;
    earned_last_30d: number;
    lifetime_txn_count: number;
  };
  milestones: {
    next_weekly_in_days: number;
    next_weekly_bonus_coins: number;
    next_monthly_in_days: number;
    next_monthly_bonus_coins: number;
  };
};

interface Props {
  /** Initial snapshot (optional — will fetch if absent). */
  initialStreak?: number;
  initialCoins?: number;
}

export default function StreakCoinsHealthCard({ initialStreak = 0, initialCoins = 0 }: Props) {
  const s = useStyles();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthData | null>(null);
  const rot = useRef(new Animated.Value(0)).current;

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get('/streak/health');
      setData(r.data);
    } catch { /* swallow */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on first expand (lazy — don't block profile page load)
    if (expanded && !data) fetchHealth();
  }, [expanded, data, fetchHealth]);

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    Animated.timing(rot, {
      toValue: expanded ? 0 : 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setExpanded(e => !e);
  };

  const chevronRotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const streak = data?.streak.current ?? initialStreak;
  const coins = data?.coins.balance ?? initialCoins;

  return (
    <View style={s.card}>
      {/* Header — always visible */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggle}
        style={s.header}
        testID="streak-health-toggle"
      >
        <View style={s.headerLeft}>
          <Text style={s.title}>Streak & Coins</Text>
          <Text style={s.subtitle}>
            {data?.streak.tier?.tier || 'Rookie'} · Day {streak}
          </Text>
        </View>

        <View style={s.headerRight}>
          <AnimatedStreak value={streak} size="sm" suffix="" />
          <View style={{ width: 8 }} />
          <AnimatedCoin value={coins} size="sm" />
          <Animated.View style={{ transform: [{ rotate: chevronRotate }], marginLeft: 6 }}>
            <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expanded body */}
      {expanded ? (
        loading && !data ? (
          <View style={s.loader}>
            <ActivityIndicator color="#F56E1E" />
          </View>
        ) : data ? (
          <View style={s.body}>
            {/* Streak stats row */}
            <View style={s.statsRow}>
              <Stat label="Current" value={`${data.streak.current}d`} />
              <Divider />
              <Stat label="Longest" value={`${data.streak.longest}d`} />
              <Divider />
              <Stat label="Total" value={`${data.streak.total_check_ins}`} />
              <Divider />
              <Stat label="Tier" value={data.streak.tier.emoji} />
            </View>

            {/* Freezes row — premium-gated */}
            <View style={s.section}>
              <SectionTitle icon="snow-outline" title="Streak Freeze" />
              {data.freezes.is_premium ? (
                <>
                  <View style={s.freezeRow}>
                    <View style={s.freezeGrid}>
                      {Array.from({ length: data.freezes.max_per_month }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            s.freezeChip,
                            i < data.freezes.available ? s.freezeActive : s.freezeUsed,
                          ]}
                        >
                          <Text style={{ fontSize: 16 }}>❄️</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.freezeCount}>
                      {data.freezes.available} / {data.freezes.max_per_month}
                    </Text>
                  </View>
                  <Text style={s.hint}>
                    Miss a day? A freeze auto-saves your streak. Refills monthly.
                  </Text>
                </>
              ) : (
                <TouchableOpacity
                  style={s.premiumCta}
                  activeOpacity={0.85}
                  onPress={() => {
                    try { router.push('/premium' as any); } catch { /* noop */ }
                  }}
                >
                  <Text style={s.premiumCtaEmoji}>💎</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.premiumCtaTitle}>Upgrade to Pro</Text>
                    <Text style={s.premiumCtaSub}>
                      Get 3 streak freezes/month · Never lose your streak
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#F56E1E" />
                </TouchableOpacity>
              )}
            </View>

            {/* Coin rollups */}
            <View style={s.section}>
              <SectionTitle icon="wallet-outline" title="Coins" />
              <View style={s.coinsGrid}>
                <CoinPill label="Balance" value={data.coins.balance} highlight />
                <CoinPill label="7-day earn" value={data.coins.earned_last_7d} />
                <CoinPill label="30-day earn" value={data.coins.earned_last_30d} />
                <CoinPill label="Lifetime earn" value={data.coins.total_earned_lifetime} />
                <CoinPill label="Lifetime spend" value={data.coins.total_spent_lifetime} negative />
                <CoinPill label="Transactions" value={data.coins.lifetime_txn_count} noCoin />
              </View>
            </View>

            {/* Milestones */}
            <View style={s.section}>
              <SectionTitle icon="trophy-outline" title="Upcoming bonuses" />
              <View style={s.milestoneRow}>
                <View style={s.milestoneItem}>
                  <Text style={s.milestoneEmoji}>🎯</Text>
                  <Text style={s.milestoneTitle}>Weekly</Text>
                  <Text style={s.milestoneSub}>
                    +{data.milestones.next_weekly_bonus_coins} coins
                  </Text>
                  <Text style={s.milestoneETA}>
                    in {data.milestones.next_weekly_in_days} day
                    {data.milestones.next_weekly_in_days === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={s.milestoneItem}>
                  <Text style={s.milestoneEmoji}>🏆</Text>
                  <Text style={s.milestoneTitle}>Monthly</Text>
                  <Text style={s.milestoneSub}>
                    +{data.milestones.next_monthly_bonus_coins} coins
                  </Text>
                  <Text style={s.milestoneETA}>
                    in {data.milestones.next_monthly_in_days} day
                    {data.milestones.next_monthly_in_days === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Integrity footer */}
            <View style={s.footer}>
              <Ionicons
                name={data.coins.integrity_ok ? 'shield-checkmark' : 'warning'}
                size={12}
                color={data.coins.integrity_ok ? '#10B981' : '#F59E0B'}
              />
              <Text
                style={[
                  s.footerTxt,
                  { color: data.coins.integrity_ok ? '#10B981' : '#F59E0B' },
                ]}
              >
                {data.coins.integrity_ok
                  ? 'Ledger verified · tamper-proof'
                  : 'Ledger reconciling…'}
              </Text>
              <TouchableOpacity onPress={fetchHealth} style={{ marginLeft: 'auto' }} hitSlop={8}>
                <Ionicons name="refresh" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null
      ) : null}
    </View>
  );
}

/* ────────────────────────────────────────────────────────── subviews */

function Stat({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.statItem}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  const s = useStyles();
  return <View style={s.divider} />;
}

function SectionTitle({ icon, title }: { icon: any; title: string }) {
  const s = useStyles();
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={14} color="#F56E1E" />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function CoinPill({
  label, value, highlight = false, negative = false, noCoin = false,
}: { label: string; value: number; highlight?: boolean; negative?: boolean; noCoin?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.coinPill, highlight && s.coinPillHighlight]}>
      <Text style={s.coinPillLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {!noCoin ? <Text style={{ fontSize: 11 }}>🪙</Text> : null}
        <Text
          style={[
            s.coinPillValue,
            negative && { color: '#EF4444' },
            highlight && { color: '#F56E1E' },
          ]}
        >
          {negative ? '-' : ''}
          {value.toLocaleString('en-IN')}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: c.text.muted, marginTop: 2, fontWeight: '500' },

  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
    paddingTop: 12,
  },
  loader: { padding: 24, alignItems: 'center' },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: c.bg.primary,
    borderRadius: 12,
    marginBottom: 14,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: c.text.muted, marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },
  divider: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: c.border.subtle },

  section: { marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.text.secondary, letterSpacing: 0.3, textTransform: 'uppercase' },

  freezeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  freezeGrid: { flexDirection: 'row', gap: 6 },
  freezeChip: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  freezeActive: { backgroundColor: 'rgba(99, 179, 237, 0.18)', borderColor: '#63B3ED' },
  freezeUsed:   { backgroundColor: c.bg.primary, borderColor: c.border.subtle, opacity: 0.4 },
  freezeCount:  { fontSize: 14, fontWeight: '700', color: c.text.primary },
  hint:         { fontSize: 11, color: c.text.muted, marginTop: 8, fontWeight: '500' },

  premiumCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(245, 110, 30, 0.08)',
    borderWidth: 1, borderColor: 'rgba(245, 110, 30, 0.2)',
  },
  premiumCtaEmoji: { fontSize: 24 },
  premiumCtaTitle: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  premiumCtaSub:   { fontSize: 11, color: c.text.muted, marginTop: 2, fontWeight: '500' },

  coinsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coinPill: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: c.bg.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  coinPillHighlight: {
    backgroundColor: 'rgba(245, 110, 30, 0.08)',
    borderColor: 'rgba(245, 110, 30, 0.3)',
  },
  coinPillLabel: { fontSize: 10, color: c.text.muted, fontWeight: '600', letterSpacing: 0.3 },
  coinPillValue: { fontSize: 14, fontWeight: '800', color: c.text.primary, marginTop: 2 },

  milestoneRow: { flexDirection: 'row', gap: 10 },
  milestoneItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: c.bg.primary,
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  milestoneEmoji: { fontSize: 22 },
  milestoneTitle: { fontSize: 11, color: c.text.muted, fontWeight: '700', letterSpacing: 0.3, marginTop: 2 },
  milestoneSub:   { fontSize: 13, color: c.text.primary, fontWeight: '800', marginTop: 2 },
  milestoneETA:   { fontSize: 10, color: c.text.muted, marginTop: 1, fontWeight: '500' },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
  },
  footerTxt: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
}));
