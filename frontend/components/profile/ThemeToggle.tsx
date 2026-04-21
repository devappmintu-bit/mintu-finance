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
import { FONT_FAMILY, RADIUS, SPACING } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

const OPTIONS: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'light',  label: 'Light',  icon: 'sunny-outline'       },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'dark',   label: 'Dark',   icon: 'moon-outline'        },
];

export default function ThemeToggle() {
  const mode = useThemePref((s) => s.mode);
  const amoled = useThemePref((s) => s.amoled);
  const setMode = useThemePref((s) => s.setMode);
  const setAmoled = useThemePref((s) => s.setAmoled);
  const resolved = useResolvedTheme();
  const s = useStyles();

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
        <Mascot size={52} glow />
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
        Currently showing <Text style={s.currentlyBold}>{resolved}</Text> mode
        {mode === 'system' ? ' (auto)' : ''}
      </Text>

      {/* AMOLED true-black toggle — only active when resolved to dark */}
      <Pressable
        onPress={() => { try { Haptics.selectionAsync(); } catch {} setAmoled(!amoled); }}
        style={s.amoledRow}
        android_ripple={{ color: 'rgba(255,107,26,0.2)' }}
      >
        <Ionicons name="contrast-outline" size={18} color={resolved === 'amoled' ? '#fff' : (resolved === 'light' ? '#111' : '#FF6B1A')} />
        <View style={{ flex: 1 }}>
          <Text style={s.amoledTitle}>AMOLED true-black</Text>
          <Text style={s.amoledSub}>Saves battery on OLED displays (active in dark mode)</Text>
        </View>
        <View style={[s.toggle, amoled && s.toggleOn]}>
          <View style={[s.knob, amoled && s.knobOn]} />
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: c.border.subtle,
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
    color: c.accent.primary,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.bold,
    color: c.text.primary,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    color: c.text.secondary,
    marginTop: 3,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: c.bg.primary,
    padding: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: c.border.subtle,
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
    backgroundColor: c.accent.primary,
  },
  pillText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.semibold,
    color: c.text.secondary,
    letterSpacing: 0.2,
  },
  pillTextOn: {
    color: '#fff',
    fontFamily: FONT_FAMILY.bold,
  },
  currently: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    color: c.text.muted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  currentlyBold: {
    color: c.accent.primary,
    fontFamily: FONT_FAMILY.bold,
    textTransform: 'capitalize',
  },
}));
