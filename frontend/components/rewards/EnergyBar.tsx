/**
 * EnergyBar.tsx — Progress bar showing spin availability.
 *
 * Renders one of three states based on backend summary:
 *   1. Free spins left → success bar showing "X free spins left today"
 *   2. No free but enough coins → brand bar showing "Ready to spin"
 *   3. Insufficient coins → progress bar "Earn N more coins to spin"
 *
 * Round 50 — migrated to theme-aware colors via makeStyles + useAppColors.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '../../utils/makeStyles';
import { useAppColors } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  wrap: { gap: 8, width: '100%' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lblRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lblTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: c.text.muted },
  valTxt: { fontSize: 13, fontWeight: '900' },
  track: { height: 8, borderRadius: 4, backgroundColor: c.gray[200], overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  helperTxt: { fontSize: 11, color: c.text.muted, fontWeight: '600', marginTop: 4 },
}));

type Props = {
  freeSpinsLeft: number;
  coins: number;
  spinCost: number;
  coinsToNextSpin: number;
};

export default function EnergyBar({ freeSpinsLeft, coins, spinCost, coinsToNextSpin }: Props) {
  const s = useStyles();
  const c = useAppColors();

  let state: 'free' | 'ready' | 'earn' = 'earn';
  if (freeSpinsLeft > 0) state = 'free';
  else if (coins >= spinCost) state = 'ready';

  if (state === 'free') {
    const total = Math.max(freeSpinsLeft, 3);
    return (
      <View style={s.wrap}>
        <View style={s.rowBetween}>
          <View style={s.lblRow}>
            <Ionicons name="flash" size={12} color={c.state.success} />
            <Text style={s.lblTxt}>FREE SPINS TODAY</Text>
          </View>
          <Text style={[s.valTxt, { color: c.state.success }]}>{freeSpinsLeft} left</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${(freeSpinsLeft / total) * 100}%`, backgroundColor: '#0A0A0A' }]} />
        </View>
      </View>
    );
  }

  if (state === 'ready') {
    return (
      <View style={s.wrap}>
        <View style={s.rowBetween}>
          <View style={s.lblRow}>
            <Ionicons name="cash" size={12} color={c.accent.brand} />
            <Text style={s.lblTxt}>READY TO SPIN</Text>
          </View>
          <Text style={[s.valTxt, { color: c.accent.brand }]}>{spinCost} coins</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: '100%' }, { backgroundColor: '#0A0A0A' }]} />
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
          <Ionicons name="warning" size={12} color={c.accent.brandDark} />
          <Text style={[s.lblTxt, { color: c.accent.brandDark }]}>NEXT SPIN IN</Text>
        </View>
        <Text style={[s.valTxt, { color: c.accent.brandDark }]}>{coinsToNextSpin} more coins</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.min(100, haveRatio * 100)}%`, backgroundColor: '#0A0A0A' }]} />
      </View>
      <Text style={s.helperTxt}>Complete missions or refer a friend to earn coins</Text>
    </View>
  );
}

