/**
 * RewardsHero.tsx — Gamified hero header for the Rewards Hub.
 *
 * Shows:
 *   • Coin balance (animated counter-up) with gold pill
 *   • Energy bolt (free spins today)
 *   • Tier badge mini-pill
 *   • Subtle particle/blob decorations
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  coins: number;
  freeSpinsLeft: number;
  tierName: string;
  tierColor: string;
  onBack?: () => void;
  // Round 39 — tap on COINS card → coin ledger.
  onPressCoins?: () => void;
};

export default function RewardsHero({ coins, freeSpinsLeft, tierName, tierColor, onBack, onPressCoins }: Props) {
  const coinBounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(coinBounce, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();
  }, [coins, coinBounce]);

  return (
    <LinearGradient colors={['#F56E1E', '#F59E0B', '#FCD34D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.wrap}>
      <View style={s.blob1} />
      <View style={s.blob2} />

      <View style={s.topRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={14} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>⚡ REWARDS HUB</Text>
          <Text style={s.heading}>Spin. Win. Repeat.</Text>
        </View>
        <View style={[s.tierPill, { backgroundColor: tierColor + 'AA' }]}>
          <Ionicons name="trophy" size={11} color="#fff" />
          <Text style={s.tierTxt}>{tierName}</Text>
        </View>
      </View>

      <View style={s.statsRow}>
        <Animated.View style={[s.statCard, { transform: [{ scale: coinBounce.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
          <TouchableOpacity
            onPress={onPressCoins}
            disabled={!onPressCoins}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
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

const s = StyleSheet.create({
  wrap: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 14, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  blob1: { position: 'absolute', top: -30, right: -20, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.15)' },
  blob2: { position: 'absolute', bottom: -80, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)' },
  heading: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginTop: 2 },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  tierTxt: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  statEmoji: { fontSize: 22 },
  statLbl: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: 'rgba(255,255,255,0.85)' },
  statVal: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.4, marginTop: 1 },
});
