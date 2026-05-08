/**
 * BrutalistHeader — reusable primitive for small-screen headers.
 *
 * Pattern: orange accent rule (10×3) + eyebrow + optional right slot.
 * Matches the grammar of every tab hero, AIBrainDashboard, NewsCardStack.
 *
 *   <BrutalistHeader eyebrow="REWARDS · GAME" right={<CoinsPill n={420} />} />
 *
 * Can be used standalone or wrapped inside a 2px INK bordered card.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const INK    = '#0A0A0A';
const ACCENT = '#F56E1E';

type Props = {
  eyebrow: string;
  right?: React.ReactNode;
  style?: any;
  dense?: boolean;
};

function BrutalistHeader({ eyebrow, right, style, dense }: Props) {
  return (
    <View style={[styles.row, dense ? styles.rowDense : null, style]}>
      <View style={styles.rule} />
      <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
      <View style={{ flex: 1 }} />
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export default memo(BrutalistHeader);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 16 },
  rowDense: { marginBottom: 4 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  right: { marginLeft: 8 },
});
