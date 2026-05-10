/**
 * NBThemeToggle — Light / Dark / System segmented control.
 *
 * Drop into Profile > Preferences. Persists to AsyncStorage via
 * useNeoTheme. Cosmetic-only; the app reads from useNeoPalette which
 * reflects the choice instantly.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { haptic as h } from '../../utils/haptics';
import { useNeoTheme, useNeoPalette } from '../../store/neoTheme';
import { NB_BORDER, NB_RADIUS, NB_SPACE } from '../../utils/neoBrutalism';

const OPTIONS: { id: 'light' | 'dark' | 'system'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'light', label: 'Light',  icon: 'sunny-outline' },
  { id: 'dark',  label: 'Dark',   icon: 'moon-outline' },
  { id: 'system', label: 'Auto',  icon: 'phone-portrait-outline' },
];

export default function NBThemeToggle() {
  const palette = useNeoPalette();
  const mode = useNeoTheme((s) => s.mode);
  const setMode = useNeoTheme((s) => s.setMode);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.muted }]}>THEME</Text>
      <View style={[styles.row, { borderColor: palette.ink, backgroundColor: palette.surface }]}>
        {OPTIONS.map((opt, idx) => {
          const active = mode === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => { h.select(); setMode(opt.id); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.label} theme`}
              style={[
                styles.cell,
                { backgroundColor: active ? palette.ink : 'transparent' },
                idx > 0 && { borderLeftWidth: NB_BORDER.thin, borderLeftColor: palette.ink },
              ]}
            >
              <Ionicons name={opt.icon} size={16} color={active ? palette.bg : palette.ink} />
              <Text style={[styles.cellText, { color: active ? palette.bg : palette.ink }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: NB_SPACE.lg, paddingTop: NB_SPACE.md, gap: NB_SPACE.sm },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  row: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: NB_BORDER.medium,
    borderRadius: NB_RADIUS.sm,
    overflow: 'hidden',
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cellText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
});
