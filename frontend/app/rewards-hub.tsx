/**
 * Rewards Hub — gamified screen for coins, spins, vouchers and wallet.
 *
 * Sections:
 *   • Coin balance hero — large animated counter + daily streak chip
 *   • Spin Wheel — interactive wheel with 8 prizes, 10-coin spin cost,
 *     3 spins/day, confetti on win
 *   • Voucher feed — live vouchers fetched from /rewards/vouchers, category
 *     picker at top; tap to copy code + open merchant site
 *   • My Wallet — claimed vouchers + win history
 *
 * Tapped from: header coin chip on Home tab.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Animated, Easing, Platform, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';
import api from '../utils/api';
import { COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';
import { copyToClipboard } from '../utils/share';
import Confetti from '../components/Confetti';

type Prize = {
  id: string;
  label: string;
  weight: number;
  kind: 'coins' | 'voucher' | 'none';
  amount?: number;
  merchant?: string;
  value?: number;
  emoji?: string;
  color?: string;
};

type Voucher = {
  merchant: string;
  code: string;
  discount: string;
  description: string;
  url: string;
  emoji: string;
  color: string;
  min_order?: string | null;
  expires?: string;
  category: string;
};

type WalletItem = {
  _id: string;
  type: string;
  merchant?: string;
  code?: string;
  discount?: string;
  value?: number;
  label?: string;
  emoji?: string;
  created_at: string;
  expires_at?: string;
  claimed?: boolean;
};

const CATEGORIES = [
  { id: 'food',          label: 'Food',        emoji: '🍔' },
  { id: 'shopping',      label: 'Shopping',    emoji: '🛍️' },
  { id: 'travel',        label: 'Travel',      emoji: '✈️' },
  { id: 'entertainment', label: 'Movies',      emoji: '🎬' },
  { id: 'groceries',     label: 'Groceries',   emoji: '🛒' },
  { id: 'electronics',   label: 'Electronics', emoji: '📱' },
  { id: 'fashion',       label: 'Fashion',     emoji: '👗' },
  { id: 'beauty',        label: 'Beauty',      emoji: '💄' },
  { id: 'recharge',      label: 'Recharge',    emoji: '📶' },
  { id: 'health',        label: 'Health',      emoji: '💊' },
];

const WHEEL_SIZE = 280;

export default function RewardsHubScreen() {
  const s = useStyles();
  const [coins, setCoins] = useState(0);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [spinCost, setSpinCost] = useState(10);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [category, setCategory] = useState('food');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletItem[]>([]);

  // Wheel spin animation
  const spinAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [summary, walletRes] = await Promise.all([
        api.get('/rewards/summary').then(r => r.data).catch(() => null),
        api.get('/rewards/wallet').then(r => r.data).catch(() => ({ items: [] })),
      ]);
      if (summary) {
        setCoins(summary.coins || 0);
        setSpinsLeft(summary.spins_left || 0);
        setSpinCost(summary.spin_cost || 10);
        setPrizes(summary.prizes || []);
      }
      setWallet(walletRes?.items || []);
    } catch { /* noop */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadVouchers = useCallback(async (cat: string) => {
    setVouchersLoading(true);
    try {
      const res = await api.get(`/rewards/vouchers?category=${cat}`);
      setVouchers(res.data?.vouchers || []);
    } catch {
      setVouchers([]);
    } finally {
      setVouchersLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadVouchers(category); }, [category, loadVouchers]);

  const onRefresh = () => { setRefreshing(true); load(); loadVouchers(category); };

  const spin = async () => {
    if (spinning) return;
    if (coins < spinCost) {
      Toast.show({ type: 'error', text1: 'Not enough coins', text2: `Need ${spinCost} to spin` });
      return;
    }
    if (spinsLeft <= 0) {
      Toast.show({ type: 'info', text1: 'No spins left today', text2: 'Come back tomorrow 🌞' });
      return;
    }
    setSpinning(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    // Start long spin animation
    spinAnim.setValue(0);
    const resp = await api.post('/rewards/spin');
    const prize: Prize = resp.data?.prize;
    const newCoins = resp.data?.coins ?? coins;
    const newSpinsLeft = resp.data?.spins_left ?? Math.max(0, spinsLeft - 1);

    // Calculate target rotation — land on the prize's slot
    const idx = prizes.findIndex(p => p.id === prize?.id);
    const slotAngle = 360 / Math.max(1, prizes.length);
    // Add extra rotations for drama (5-7 full spins)
    const extraTurns = 5 + Math.random() * 2;
    const targetDeg = extraTurns * 360 + (360 - idx * slotAngle - slotAngle / 2);

    Animated.timing(spinAnim, {
      toValue: targetDeg,
      duration: 3200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      setCoins(newCoins);
      setSpinsLeft(newSpinsLeft);
      setWonPrize(prize);
      if (prize?.kind !== 'none') {
        setShowConfetti(true);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      setSpinning(false);
      load(); // refresh wallet
    });
  };

  const copyCode = (code: string, merchant: string) => {
    copyToClipboard(code);
    Toast.show({ type: 'success', text1: `${merchant} code copied!`, text2: code });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const openMerchant = async (url: string, code: string, merchant: string) => {
    // Save to wallet first
    try { await api.post('/rewards/claim-voucher', {
      merchant, code,
      discount: vouchers.find(v => v.code === code)?.discount || '',
      description: vouchers.find(v => v.code === code)?.description || '',
      url, emoji: vouchers.find(v => v.code === code)?.emoji || '🎟️',
    }); } catch {}
    copyCode(code, merchant);
    if (url) { Linking.openURL(url).catch(() => {}); }
    load();
  };

  // ── Animated spin transform
  const spinDeg = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  if (loading) return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.accent.primary} />
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <Confetti trigger={showConfetti} onDone={() => setShowConfetti(false)} />

      {/* Top bar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="rewards-back">
          <Ionicons name="chevron-back" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle}>Rewards</Text>
          <Text style={s.topSub}>Spin. Earn. Redeem.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}
      >
        {/* ── Coin hero ─── */}
        <LinearGradient
          colors={['#F56E1E', '#C14A06']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.coinHero}
        >
          <View style={s.coinHeroTop}>
            <Text style={s.coinLabel}>YOUR COINS</Text>
            <View style={s.streakPill}>
              <Ionicons name="flame" size={12} color="#FFB300" />
              <Text style={s.streakPillT}>Daily</Text>
            </View>
          </View>
          <Text style={s.coinBig}>🪙 {coins.toLocaleString('en-IN')}</Text>
          <Text style={s.coinSub}>
            {spinsLeft > 0 ? `${spinsLeft} spin${spinsLeft > 1 ? 's' : ''} left today` : 'Come back tomorrow for more spins'}
          </Text>
        </LinearGradient>

        {/* ── Spin Wheel ─── */}
        <Text style={s.sectionTitle}>Spin the wheel · {spinCost} coins per spin</Text>
        <View style={s.wheelCard}>
          <View style={s.wheelWrap}>
            <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <SpinWheelSvg prizes={prizes} size={WHEEL_SIZE} />
            </Animated.View>
            {/* Center spin button */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={spin}
              disabled={spinning || spinsLeft <= 0 || coins < spinCost}
              style={s.spinBtn}
              testID="rewards-spin-btn"
            >
              <LinearGradient
                colors={spinning || coins < spinCost || spinsLeft <= 0
                  ? [COLORS.text.muted, COLORS.text.muted]
                  : ['#F56E1E', '#C14A06']}
                style={s.spinBtnInner}
              >
                {spinning
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.spinBtnT}>SPIN</Text>}
              </LinearGradient>
            </TouchableOpacity>
            {/* Pointer */}
            <View style={s.pointer}>
              <Svg width="30" height="30" viewBox="0 0 30 30">
                <Path d="M15 0 L30 15 L15 30 Z" fill={COLORS.accent.primary} />
              </Svg>
            </View>
          </View>

          {wonPrize && !spinning && (
            <View style={s.wonCard}>
              <Text style={s.wonEmoji}>{wonPrize.emoji || '🎁'}</Text>
              <Text style={s.wonLabel}>
                {wonPrize.kind === 'none' ? 'Try again tomorrow!' : `You won: ${wonPrize.label}`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Voucher feed ─── */}
        <View style={s.catRow}>
          <Text style={s.sectionTitle}>Live vouchers</Text>
          {vouchersLoading && <ActivityIndicator size="small" color={COLORS.accent.primary} />}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catChipsRow}
        >
          {CATEGORIES.map(c => {
            const on = c.id === category;
            return (
              <TouchableOpacity
                key={c.id}
                style={[s.catChip, on && s.catChipOn]}
                onPress={() => setCategory(c.id)}
                activeOpacity={0.8}
                testID={`cat-chip-${c.id}`}
              >
                <Text style={[s.catChipEmoji]}>{c.emoji}</Text>
                <Text style={[s.catChipT, on && s.catChipTOn]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {vouchers.length === 0 && !vouchersLoading && (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>🎟️</Text>
            <Text style={s.emptyT}>Pull to refresh — fetching live codes</Text>
          </View>
        )}

        {vouchers.map((v, i) => (
          <View key={`${v.merchant}-${i}`} style={s.voucherCard}>
            <View style={[s.voucherEmoji, { backgroundColor: (v.color || COLORS.accent.primary) + '22' }]}>
              <Text style={{ fontSize: 22 }}>{v.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.voucherTopRow}>
                <Text style={s.voucherMerchant}>{v.merchant}</Text>
                <Text style={s.voucherDiscount} numberOfLines={1}>{v.discount}</Text>
              </View>
              <Text style={s.voucherDesc} numberOfLines={2}>{v.description}</Text>
              <View style={s.voucherActions}>
                <TouchableOpacity
                  style={s.codeChip}
                  onPress={() => copyCode(v.code, v.merchant)}
                  activeOpacity={0.8}
                  testID={`voucher-code-${v.code}`}
                >
                  <Ionicons name="copy-outline" size={12} color={COLORS.accent.primary} />
                  <Text style={s.codeChipT}>{v.code}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.useBtn}
                  onPress={() => openMerchant(v.url, v.code, v.merchant)}
                  activeOpacity={0.85}
                  testID={`voucher-use-${v.code}`}
                >
                  <Text style={s.useBtnT}>Use</Text>
                  <Ionicons name="arrow-forward" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
              {v.expires && <Text style={s.voucherExp}>{v.expires}{v.min_order ? ` · Min ${v.min_order}` : ''}</Text>}
            </View>
          </View>
        ))}

        {/* ── Wallet ─── */}
        {wallet.length > 0 && (
          <>
            <Text style={s.sectionTitle}>My wallet · {wallet.length} rewards</Text>
            <View style={{ gap: 8 }}>
              {wallet.slice(0, 10).map((w) => (
                <View key={w._id} style={s.walletRow}>
                  <Text style={{ fontSize: 20 }}>{w.emoji || '🎁'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.walletName}>{w.merchant || w.label || 'Reward'}</Text>
                    <Text style={s.walletSub} numberOfLines={1}>
                      {w.discount || (w.value ? `₹${w.value}` : '')}
                      {w.code ? ` · ${w.code}` : ''}
                    </Text>
                  </View>
                  <Text style={s.walletDate}>
                    {new Date(w.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════
// SPIN WHEEL SVG
// ══════════════════════════════════════════════════════════════════
function SpinWheelSvg({ prizes, size }: { prizes: Prize[]; size: number }) {
  if (!prizes.length) return <View style={{ width: size, height: size }} />;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const n = prizes.length;
  const slotAngle = 360 / n;

  const polarToCart = (angle: number, radius: number) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  return (
    <Svg width={size} height={size}>
      {prizes.map((p, i) => {
        const startAngle = i * slotAngle;
        const endAngle = startAngle + slotAngle;
        const start = polarToCart(startAngle, r);
        const end = polarToCart(endAngle, r);
        const largeArc = slotAngle > 180 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
        // Label position — at ~70% radius, center of slot
        const midAngle = startAngle + slotAngle / 2;
        const labelPos = polarToCart(midAngle, r * 0.62);
        return (
          <G key={p.id}>
            <Path d={d} fill={p.color || '#F59E0B'} stroke="#fff" strokeWidth={2} />
            <SvgText
              x={labelPos.x}
              y={labelPos.y}
              fill="#fff"
              fontSize={14}
              fontWeight="800"
              textAnchor="middle"
              alignmentBaseline="middle"
              transform={`rotate(${midAngle}, ${labelPos.x}, ${labelPos.y})`}
            >
              {p.emoji || '🎁'}
            </SvgText>
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFF" strokeWidth={4} />
    </Svg>
  );
}

// ══════════════════════════════════════════════════════════════════
const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },

  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: c.bg.secondary,
    borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.bg.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 18, fontWeight: '800', color: c.text.primary },
  topSub: { fontSize: 11, color: c.text.muted, marginTop: 1 },

  // Coin hero
  coinHero: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 18,
  },
  coinHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coinLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.86)', letterSpacing: 1.4 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  streakPillT: { fontSize: 10, fontWeight: '800', color: '#fff' },
  coinBig: { fontSize: 40, fontWeight: '900', color: '#fff', marginTop: 6, letterSpacing: -0.6 },
  coinSub: { fontSize: 12, color: 'rgba(255,255,255,0.86)', marginTop: 4, fontWeight: '700' },

  sectionTitle: {
    fontSize: 12, fontWeight: '900',
    color: c.text.muted, letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10, marginTop: 6,
  },

  // Wheel
  wheelCard: {
    backgroundColor: c.bg.secondary,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1, borderColor: c.border.subtle,
    marginBottom: 18,
  },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinBtn: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    ...Platform.select({
      ios: { shadowColor: '#C14A06', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
      web: { boxShadow: '0 4px 12px rgba(193,74,6,0.4)' as any },
    }),
  },
  spinBtnInner: {
    flex: 1, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  spinBtnT: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  pointer: {
    position: 'absolute', top: -4, left: WHEEL_SIZE / 2 - 15,
    transform: [{ rotate: '90deg' }],
  },
  wonCard: {
    marginTop: 14, padding: 12, borderRadius: 14,
    backgroundColor: '#FFF0DE',
    borderWidth: 1, borderColor: c.accent.primary + '40',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    width: '100%',
  },
  wonEmoji: { fontSize: 26 },
  wonLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: c.text.primary },

  // Category chips
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catChipsRow: { gap: 8, paddingVertical: 4, paddingRight: 12 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.bg.secondary,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  catChipOn: {
    backgroundColor: c.accent.primary,
    borderColor: c.accent.primary,
  },
  catChipEmoji: { fontSize: 14 },
  catChipT: { fontSize: 12, fontWeight: '800', color: c.text.secondary },
  catChipTOn: { color: '#fff' },

  // Voucher
  voucherCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: c.bg.secondary,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  voucherEmoji: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  voucherTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voucherMerchant: { fontSize: 14, fontWeight: '900', color: c.text.primary },
  voucherDiscount: { fontSize: 11, fontWeight: '800', color: c.accent.primary, maxWidth: 140 },
  voucherDesc: { fontSize: 11.5, color: c.text.secondary, marginTop: 2, lineHeight: 15 },
  voucherActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#FFF0DE',
    borderRadius: 8,
    borderWidth: 1, borderColor: c.accent.primary + '40',
    borderStyle: 'dashed',
  },
  codeChipT: { fontSize: 11.5, fontWeight: '900', color: c.accent.primary, letterSpacing: 0.6 },
  useBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: c.accent.primary,
    borderRadius: 999,
  },
  useBtnT: { fontSize: 11.5, fontWeight: '900', color: '#fff' },
  voucherExp: { fontSize: 10, color: c.text.muted, marginTop: 6, fontWeight: '600' },

  emptyCard: {
    padding: 24, alignItems: 'center',
    backgroundColor: c.bg.secondary,
    borderRadius: 16,
    borderWidth: 1, borderColor: c.border.subtle,
    marginTop: 10,
  },
  emptyEmoji: { fontSize: 28, marginBottom: 4 },
  emptyT: { fontSize: 12, color: c.text.muted, fontWeight: '700' },

  // Wallet
  walletRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12,
    backgroundColor: c.bg.secondary,
    borderRadius: 12,
    borderWidth: 1, borderColor: c.border.subtle,
  },
  walletName: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  walletSub: { fontSize: 11, color: c.text.secondary, marginTop: 2 },
  walletDate: { fontSize: 10, color: c.text.muted, fontWeight: '700' },
}));
