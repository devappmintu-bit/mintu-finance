/**
 * SmartEntryLauncher — brutalist 3-button trigger row.
 *
 * Drop-in primitive for any screen that needs quick add access. Opens
 * the unified SmartEntry sheet via the zustand store. Mascot-safe,
 * AI-Brain-compatible (same action model as the Brain's CTAs).
 *
 * Layout: [＋ EXPENSE] [◎ BUDGET] [⚑ GOAL]
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSmartEntry } from '../../store/smartEntry';

const INK    = '#0A0A0A';
const PAPER  = '#F5F1EA';
const ACCENT = '#E84A0C';
const LINE   = '#E4E2DB';

type Kind = 'expense' | 'budget' | 'goal';

const BTNS: { k: Kind; label: string; icon: string }[] = [
  { k: 'expense', label: 'EXPENSE', icon: 'add-circle-outline' },
  { k: 'budget',  label: 'BUDGET',  icon: 'pie-chart-outline' },
  { k: 'goal',    label: 'GOAL',    icon: 'flag-outline' },
];

export default function SmartEntryLauncher({ source = 'launcher' }: { source?: string }) {
  const open = useSmartEntry((s) => s.open);
  return (
    <View style={styles.wrap}>
      <View style={styles.tagRow}>
        <View style={styles.rule} />
        <Text style={styles.tag}>QUICK ADD</Text>
      </View>
      <View style={styles.row}>
        {BTNS.map((b, i) => (
          <Pressable
            key={b.k}
            onPress={() => open(b.k, {}, source)}
            style={({ pressed }) => [
              styles.btn,
              i === 0 && styles.primary,
              i < BTNS.length - 1 && styles.divider,
              pressed && { transform: [{ translateY: 1 }] },
            ]}
            testID={`smart-entry-${b.k}`}
          >
            <Ionicons name={b.icon as any} size={16} color={i === 0 ? '#fff' : INK} />
            <Text style={[styles.lbl, i === 0 && styles.lblPrimary]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 12 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rule: { width: 10, height: 3, backgroundColor: ACCENT },
  tag: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: INK },
  row: {
    flexDirection: 'row',
    borderWidth: 2, borderColor: INK,
    backgroundColor: '#fff',
  },
  btn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    minHeight: 48,
  },
  primary: { backgroundColor: ACCENT },
  divider: { borderRightWidth: 1, borderColor: INK },
  lbl: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: INK },
  lblPrimary: { color: '#fff' },
});
