/**
 * ThemeToggle — 3-option segmented selector for Light / System / Dark.
 *
 * Reads/writes `useThemePref` store. Shows a tiny mascot-preview of the
 * currently-resolved theme so users SEE the effect before committing.
 * Matches the design reference where light renders white-shield mascot,
 * dark renders dark-shield mascot, system auto-switches.
 *
 * Note: Currently only the <Mascot/> + <MintULogo/> components respect the
 * chosen theme; the rest of the app is still dark by default. This is a
 * foundation primitive — full-app theme re-skinning is a future session.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemePref, ThemeMode, useResolvedTheme } from '../../store/themeStore';
import Mascot from '../Mascot';
import { COLORS, FONT_FAMILY, RADIUS, SPACING } from '../../utils/theme';

const OPTIONS: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'light',  label: 'Light',  icon: 'sunny-outline'       },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'dark',   label: 'Dark',   icon: 'moon-outline'        },
];

export default function ThemeToggle() {
  const mode = useThemePref((s) => s.mode);
  const setMode = useThemePref((s) => s.setMode);
  const resolved = useResolvedTheme();

  const onPick = (m: ThemeMode) => {
    try { Haptics.selectionAsync(); } catch {}
    setMode(m);
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>APPEARANCE</Text>
          <Text style={s.title}>Theme preference</Text>
          <Text style={s.sub}>Pick a vibe. System mode follows your device.</Text>
        </View>
        <Mascot size={52} glow variant={resolved} />
      </View>

      <View style={s.row}>
        {OPTIONS.map((opt) => {
          const active = mode === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onPick(opt.key)}
              style={[s.pill, active && s.pillOn]}
              android_ripple={{ color: 'rgba(255,107,26,0.2)' }}
            >
              <Ionicons
                name={opt.icon as any}
                size={16}
                color={active ? '#fff' : COLORS.text.secondary}
              />
              <Text style={[s.pillText, active && s.pillTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.currently}>
        Currently showing <Text style={s.currentlyBold}>{resolved}</Text>-shield mascot
        {mode === 'system' ? ' (auto)' : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(26,26,36,0.85)',
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,107,26,0.25)',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.4,
    color: COLORS.accent.primary,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text.secondary,
    marginTop: 3,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
  },
  pillOn: {
    backgroundColor: COLORS.accent.primary,
  },
  pillText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.semibold,
    color: COLORS.text.secondary,
    letterSpacing: 0.2,
  },
  pillTextOn: {
    color: '#fff',
    fontFamily: FONT_FAMILY.bold,
  },
  currently: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text.muted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  currentlyBold: {
    color: COLORS.accent.primary,
    fontFamily: FONT_FAMILY.bold,
    textTransform: 'capitalize',
  },
});
