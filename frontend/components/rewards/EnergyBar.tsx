/**
 * EnergyBar.tsx — Progress bar showing spin availability.
 *
 * Renders one of three states based on backend summary:
 *   1. Free spins left → green bar showing "X free spins left today"
 *   2. No free but enough coins → saffron bar showing "Ready to spin"
 *   3. Insufficient coins → progress bar "Earn N more coins to spin"
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  freeSpinsLeft: number;
  coins: number;
  spinCost: number;
  coinsToNextSpin: number;
};

export default function EnergyBar({ freeSpinsLeft, coins, spinCost, coinsToNextSpin }: Props) {
  let state: 'free' | 'ready' | 'earn' = 'earn';
  if (freeSpinsLeft > 0) state = 'free';
  else if (coins >= spinCost) state = 'ready';

  if (state === 'free') {
    const total = Math.max(freeSpinsLeft, 3);
    return (
      <View style={s.wrap}>
        <View style={s.rowBetween}>
          <View style={s.lblRow}>
            <Ionicons name="flash" size={12} color="#10B981" />
            <Text style={s.lblTxt}>FREE SPINS TODAY</Text>
          </View>
          <Text style={[s.valTxt, { color: '#10B981' }]}>{freeSpinsLeft} left</Text>
        </View>
        <View style={s.track}>
          <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${(freeSpinsLeft / total) * 100}%` }]} />
        </View>
      </View>
    );
  }

  if (state === 'ready') {
    return (
      <View style={s.wrap}>
        <View style={s.rowBetween}>
          <View style={s.lblRow}>
            <Ionicons name="cash" size={12} color="#F56E1E" />
            <Text style={s.lblTxt}>READY TO SPIN</Text>
          </View>
          <Text style={[s.valTxt, { color: '#F56E1E' }]}>{spinCost} coins</Text>
        </View>
        <View style={s.track}>
          <LinearGradient colors={['#F59E0B', '#F56E1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: '100%' }]} />
        </View>
      </View>
    );
  }

  // state === 'earn'
  const haveRatio = coins / spinCost;
  return (
    <View style={s.wrap}>
      <View style={s.rowBetween}>
        <View style={s.lblRow}>
          <Ionicons name="warning" size={12} color="#C14A06" />
          <Text style={[s.lblTxt, { color: '#C14A06' }]}>NEXT SPIN IN</Text>
        </View>
        <Text style={[s.valTxt, { color: '#C14A06' }]}>{coinsToNextSpin} more coins</Text>
      </View>
      <View style={s.track}>
        <LinearGradient colors={['#FBBF24', '#F56E1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${Math.min(100, haveRatio * 100)}%` }]} />
      </View>
      <Text style={s.helperTxt}>Complete missions or refer a friend to earn coins</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lblRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lblTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#6B7280' },
  valTxt: { fontSize: 12, fontWeight: '900' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  helperTxt: { fontSize: 10.5, color: '#6B7280', fontWeight: '600', marginTop: 2 },
});
