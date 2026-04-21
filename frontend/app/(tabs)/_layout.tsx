// Bottom tab bar — MintU v4 (Apr 2026).
//
// HDFC PayZapp reference match:
//   ┌────────────────────────────────────────────────────────────────┐
//   │                     ●                                          │
//   │                ┌───●●●●●───┐                                    │
//   │                │  ●●●●●●● │ ← raised circular puck               │
//   │                │   ●●●●●   │   (mascot — cream + saffron)       │
//   │                ╰─╮       ╭─╯                                    │
//   │  ╭──────────╯    ╲_____╱    ╰──────────╮                        │
//   │  │  [Pay] [Cards]          [Shop] [Bank]│  ← two arches carved   │
//   │  ╰──────────────────────────────────────╯     out of the bar    │
//   └────────────────────────────────────────────────────────────────┘
//
// The two arch cutouts on either side of the center puck are drawn with SVG
// <Path>. The bar itself is an off-white surface rendered INSIDE the SVG so
// the puck appears to be carved into the bar silhouette (matches the ref).
//
// Colour scheme: in-app cream (#FFFFFF surface) + saffron (#E65100) — NO BLACK.

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, TouchableOpacity, Text, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Mascot from '../../components/Mascot';
import { COLORS, FONT_FAMILY, GLOW, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';

const TAB_META: Record<string, { out: string; fill: string; key: string }> = {
  index:        { out: 'home-outline',       fill: 'home',       key: 'home' },
  transactions: { out: 'receipt-outline',    fill: 'receipt',    key: 'transactions' },
  budget:       { out: 'pie-chart-outline',  fill: 'pie-chart',  key: 'budgets' },
  split:        { out: 'people-outline',     fill: 'people',     key: 'split' },
};

function labelOf(name: string, lang: any): string {
  const k = TAB_META[name]?.key || name;
  const raw = t(k, lang);
  const fallback: Record<string, string> = { home: 'Home', transactions: 'Transactions', budgets: 'Budgets', split: 'Split' };
  if (raw === k || !raw) return fallback[k] || name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Geometry constants ────────────────────────────────────────────────────
const PUCK_SIZE  = 72;       // rounded-SQUARE center button (larger than 40px tab chips)
const PUCK_INNER = 62;
const BAR_HEIGHT = 76;       // floating pill height
const BAR_INSET_X = 16;      // horizontal gap from screen edges
const BAR_INSET_B = Platform.OS === 'ios' ? 22 : 14; // gap from bottom
const TOP_RADIUS = 28;

// Compatibility stub (keep for call sites that still import it)
function archGeom(screenW: number) {
  return { CUTOUT_W: 80, CUTOUT_DEPTH: 0 };
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Simple rounded-rect (pill) silhouette. No cutouts — the center button
 * is now a separate raised element (Paytm-style floating capsule).
 */
function barPath(w: number, h: number): string {
  const r = TOP_RADIUS;
  // Full rounded rectangle
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

function SideTab({ icon, iconFilled, label, focused, onPress, testID }:
  { icon: string; iconFilled: string; label: string; focused: boolean; onPress: () => void; testID?: string }) {
  const st = useStyles();
  // Smooth bounce+scale on focus change + halo pulse
  const scale = React.useRef(new Animated.Value(focused ? 1 : 0.92)).current;
  const halo  = React.useRef(new Animated.Value(focused ? 1 : 0)).current;
  const lift  = React.useRef(new Animated.Value(focused ? -2 : 0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1.05 : 0.92, friction: 6, tension: 160, useNativeDriver: true }),
      Animated.timing(halo,  { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.spring(lift,  { toValue: focused ? -2 : 0, friction: 7, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [focused, scale, halo, lift]);

  return (
    <TouchableOpacity testID={testID} style={st.sideTab} onPress={onPress} activeOpacity={0.7}>
      <Animated.View
        style={[
          st.sideIconWrap,
          focused && st.sideIconWrapOn,
          { transform: [{ scale }, { translateY: lift }] },
        ]}
      >
        <Ionicons
          name={(focused ? iconFilled : icon) as any}
          size={focused ? 22 : 20}
          color={focused ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
        />
      </Animated.View>
      <Animated.Text
        style={[
          st.sideLabel,
          focused && st.sideLabelOn,
          { opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, navigation }: BottomTabBarProps) {
  const st = useStyles();
  const c = useAppColors();
  const { lang } = useLangStore();
  const screenW = Dimensions.get('window').width;
  // Paytm-inspired floating capsule palette (light/white pill adapts to theme)
  const isLight = c.bg.primary === '#FAFAF9' || c.bg.primary.toUpperCase() === '#FAFAF9';
  const pillBg = isLight ? '#FFFFFF' : '#14151B';
  const pillBorder = isLight ? 'rgba(17,24,39,0.06)' : 'rgba(255,255,255,0.08)';

  const visible = state.routes.filter(r => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2, 4);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  const openAiCoach = () => navigation.navigate('ai-coach' as never);

  const pillW = screenW - BAR_INSET_X * 2;
  const barH = BAR_HEIGHT;

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* Floating pill silhouette */}
      <View style={[st.barContainer, { width: pillW, height: barH, backgroundColor: pillBg, borderColor: pillBorder }]} pointerEvents="none" />

      {/* Tab icons sit inside the pill with a gap in the middle for the raised button */}
      <View style={[st.iconsRow, { width: pillW, height: barH }]}>
        <View style={st.side}>
          {left.map((route) => {
            const focused = state.index === state.routes.findIndex(r => r.key === route.key);
            const meta = TAB_META[route.name];
            return (
              <SideTab
                key={route.key}
                icon={meta.out}
                iconFilled={meta.fill}
                label={labelOf(route.name, lang)}
                focused={focused}
                onPress={() => fire(route, focused)}
                testID={`tab-${route.name}`}
              />
            );
          })}
        </View>
        {/* Spacer for the raised center button */}
        <View style={{ width: PUCK_SIZE + 18 }} />
        <View style={st.side}>
          {right.map((route) => {
            const focused = state.index === state.routes.findIndex(r => r.key === route.key);
            const meta = TAB_META[route.name];
            return (
              <SideTab
                key={route.key}
                icon={meta.out}
                iconFilled={meta.fill}
                label={labelOf(route.name, lang)}
                focused={focused}
                onPress={() => fire(route, focused)}
                testID={`tab-${route.name}`}
              />
            );
          })}
        </View>
      </View>

      {/* Raised ROUNDED-SQUARE AI Coach button — floats above the pill */}
      <TouchableOpacity
        testID="tab-ai-coach"
        onPress={openAiCoach}
        activeOpacity={0.88}
        style={st.raisedWrap}
        accessibilityLabel="Open AI Coach"
      >
        <View style={st.raisedOuter}>
          <View style={st.raisedInner}>
            <Mascot size={PUCK_INNER} variant="auto" />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Smooth 280ms shift animation when switching tabs — gives a premium cross-fade feel
          animation: 'shift',
          // Freeze inactive tabs to save CPU & keep scroll state
          freezeOnBlur: true,
          lazy: true,
        } as any}
        tabBar={(props) => <MintUTabBar {...props} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="transactions" />
        <Tabs.Screen name="ai-coach" options={{ href: null }} />
        <Tabs.Screen name="budget" />
        <Tabs.Screen name="split" />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const useStyles = makeStyles((c) => {
  const isLight = c.bg.primary === '#FAFAF9' || c.bg.primary.toUpperCase() === '#FAFAF9';
  return ({
    wrap: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: BAR_INSET_B,
      alignItems: 'center',
      justifyContent: 'flex-end',
      backgroundColor: 'transparent',
    },
    // Floating pill capsule (light bg in light mode, obsidian in dark)
    barContainer: {
      borderRadius: TOP_RADIUS,
      borderWidth: 1,
      // Soft lift shadow beneath pill
      ...Platform.select({
        ios:     { shadowColor: '#000', shadowOpacity: isLight ? 0.18 : 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
        android: { elevation: 14 },
        web:     { boxShadow: isLight ? '0 10px 28px rgba(17,24,39,0.15)' : '0 10px 28px rgba(0,0,0,0.55)' as any },
      }),
    },
    iconsRow: {
      position: 'absolute',
      bottom: BAR_INSET_B,
      left: BAR_INSET_X,
      right: BAR_INSET_X,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    side: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    sideTab: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      paddingVertical: 6,
      gap: 4,
    },
    // Dark circular chip holding the icon (Paytm-style prominent chip)
    sideIconWrap: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#1F2230',
    },
    // Active icon chip — orange brand halo
    sideIconWrapOn: {
      backgroundColor: c.accent.primary,
      ...Platform.select({
        ios:     { shadowColor: c.accent.primary, shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
        android: { elevation: 6 },
        web:     { boxShadow: '0 4px 14px rgba(255,107,26,0.55)' as any },
      }),
    },
    sideLabel:   { fontSize: 10.5, color: c.text.secondary, fontFamily: FONT_FAMILY.semibold, letterSpacing: 0.2, marginTop: 2 },
    sideLabelOn: { color: c.accent.primary, fontFamily: FONT_FAMILY.bold },

    // RAISED rounded-SQUARE center button (larger + transparent mascot bg)
    raisedWrap: {
      position: 'absolute',
      bottom: BAR_INSET_B + BAR_HEIGHT - PUCK_SIZE / 2 - 4,
      alignSelf: 'center',
      width: PUCK_SIZE,
      height: PUCK_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
    },
    raisedOuter: {
      width: PUCK_SIZE, height: PUCK_SIZE,
      borderRadius: 20,                // rounded-SQUARE (not circle)
      backgroundColor: isLight ? '#FFFFFF' : '#1A1C24',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2,
      borderColor: isLight ? 'rgba(17,24,39,0.08)' : 'rgba(255,255,255,0.08)',
      ...Platform.select({
        ios:     { shadowColor: '#000', shadowOpacity: isLight ? 0.16 : 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
        android: { elevation: 18 },
        web:     { boxShadow: isLight ? '0 8px 22px rgba(17,24,39,0.18)' : '0 8px 22px rgba(0,0,0,0.55)' as any },
      }),
    },
    raisedInner: {
      width: PUCK_INNER, height: PUCK_INNER,
      borderRadius: 16,                // rounded-square inner — NO orange bg, transparent
      backgroundColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    raisedMascot: { width: '100%', height: '100%' },
  });
});
