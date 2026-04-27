/**
 * RewardsHero.tsx — Gamified hero header for the Rewards Hub.
 *
 * Shows:
 *   • Coin balance (animated counter-up) with gold pill
 *   • Energy bolt (free spins today)
 *   • Tier badge mini-pill
 *   • Subtle particle/blob decorations
 *
 * Round 50 — the bright orange→saffron→gold gradient is intentional brand
 * (rewards = warmth + dopamine), so it stays literal in both themes.
 * White overlay text + scrim opacity also stay literal because they're
 * tuned against the gradient, not the page bg.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';

type Props = {
  coins: number;
  freeSpinsLeft: number;
  tierName: string;
  tierColor: string;
  onBack?: () => void;
  onPressCoins?: () => void;
};

// Brand gradient — intentional, theme-independent
const HERO_GRADIENT: readonly [string, string, string] = [COLORS.accent.brand, COLORS.accent.secondary, '#FCD34D'];
const ON_BRAND = '#FFFFFF';
const ON_BRAND_SOFT = 'rgba(255,255,255,0.85)';
const ON_BRAND_SCRIM = 'rgba(255,255,255,0.22)';

export default function RewardsHero({ coins, freeSpinsLeft, tierName, tierColor, onBack, onPressCoins }: Props) {
  const s = useStyles();
  const coinBounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(coinBounce, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();
  }, [coins, coinBounce]);

  return (
    <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.wrap}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.topRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={16} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={ON_BRAND} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>⚡ REWARDS HUB</Text>
          <Text style={s.heading}>Spin. Win. Repeat.</Text>
        </View>
        <View style={[s.tierPill, { backgroundColor: tierColor + 'AA' }]}>
          <Ionicons name="trophy" size={12} color={ON_BRAND} />
          <Text style={s.tierTxt}>{tierName}</Text>
        </View>
      </View>

      <View style={s.statsRow}>
        <Animated.View style={[s.statCard, { transform: [{ scale: coinBounce.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
          <TouchableOpacity
            onPress={onPressCoins}
            disabled={!onPressCoins}
            style={s.statRow}
            accessibilityRole="button"
            accessibilityLabel={`Coin balance ${coins}, view history`}
            activeOpacity={0.85}
          >
            <Text style={s.statEmoji}>🪙</Text>
            <View>
              <Text style={s.statLbl}>COINS</Text>
              <Text style={s.statVal}>{coins.toLocaleString('en-IN')}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
        <View style={s.statCard}>
          <Text style={s.statEmoji}>⚡</Text>
          <View>
            <Text style={s.statLbl}>FREE SPINS</Text>
            <Text style={s.statVal}>{freeSpinsLeft}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, gap: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', shadowColor: c.shadow.medium, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  blob1: { position: 'absolute', top: -32, right: -20, width: 152, height: 152, borderRadius: 76, backgroundColor: 'rgba(255,255,255,0.15)' },
  blob2: { position: 'absolute', bottom: -80, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 16, backgroundColor: ON_BRAND_SCRIM, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: ON_BRAND_SOFT },
  heading: { fontSize: 20, fontWeight: '900', color: ON_BRAND, letterSpacing: -0.3, marginTop: 4 },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  tierTxt: { fontSize: 11, fontWeight: '900', color: ON_BRAND, letterSpacing: 0.4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ON_BRAND_SCRIM, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statEmoji: { fontSize: 24 },
  statLbl: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: ON_BRAND_SOFT },
  statVal: { fontSize: 20, fontWeight: '900', color: ON_BRAND, letterSpacing: -0.4, marginTop: 0 },
}));
