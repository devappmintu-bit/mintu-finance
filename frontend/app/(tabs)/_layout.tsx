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
import { View, StyleSheet, Platform, TouchableOpacity, Text, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../../utils/theme';
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
const PUCK_SIZE  = 64;
const PUCK_INNER = 54;
const BAR_HEIGHT = 72;
const BOTTOM_PAD = Platform.OS === 'ios' ? 18 : 10;
const TOP_RADIUS = 24;

/** Responsive arch geometry — narrower phones get a tighter cutout, tablets
 *  get a wider one. Keeps the silhouette balanced at any width. */
function archGeom(screenW: number) {
  // Phone (≤420) → 90/22; tablet (>600) → 140/34; interpolated in-between.
  const t = Math.max(0, Math.min(1, (screenW - 360) / (720 - 360)));
  const CUTOUT_W     = 90 + t * 60;     // 90 → 150
  const CUTOUT_DEPTH = 22 + t * 14;     // 22 → 36
  return { CUTOUT_W, CUTOUT_DEPTH };
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Builds an SVG <Path> d-string for a rounded rectangle with TWIN ARCHES
 * carved into its top edge at the horizontal center. Think of it as the HDFC
 * PayZapp tab bar silhouette (see reference image).
 *
 *   Starts:  top-left with a rounded corner
 *   Moves:   along the top-edge to the LEFT of the cutout
 *   Curves:  LEFT arch dipping DOWN by CUTOUT_DEPTH
 *   Curves:  back UP and around the center puck
 *   Curves:  RIGHT arch dipping DOWN by CUTOUT_DEPTH
 *   Moves:   along the top-edge to the top-right corner
 *   Closes:  right side, bottom, left side
 */
function barPath(w: number, h: number): string {
  const r  = TOP_RADIUS;
  const cx = w / 2;
  const { CUTOUT_W, CUTOUT_DEPTH } = archGeom(w);

  // Cut-out horizontal boundaries
  const leftStart  = cx - CUTOUT_W / 2;
  const leftMid    = cx - PUCK_SIZE / 2 - 4;
  const rightMid   = cx + PUCK_SIZE / 2 + 4;
  const rightEnd   = cx + CUTOUT_W / 2;
  const archBottom = CUTOUT_DEPTH;

  // Build path
  const d = [
    `M 0 ${r}`,                              // start below TL radius
    `Q 0 0 ${r} 0`,                          // TL rounded corner
    `L ${leftStart} 0`,                      // top edge → LEFT arch start
    // LEFT arch: from (leftStart, 0) down & in to (leftMid, archBottom)
    `C ${leftStart + 14} 0 ${leftMid - 14} ${archBottom} ${leftMid} ${archBottom}`,
    // bridge under puck: smooth curve from leftMid up to rightMid keeping same depth
    `Q ${cx} ${archBottom + 2} ${rightMid} ${archBottom}`,
    // RIGHT arch: from (rightMid, archBottom) up & out to (rightEnd, 0)
    `C ${rightMid + 14} ${archBottom} ${rightEnd - 14} 0 ${rightEnd} 0`,
    `L ${w - r} 0`,                          // top edge → TR
    `Q ${w} 0 ${w} ${r}`,                    // TR rounded corner
    `L ${w} ${h}`,                           // right edge down
    `L 0 ${h}`,                              // bottom edge
    `Z`,
  ].join(' ');
  return d;
}

function SideTab({ icon, iconFilled, label, focused, onPress, testID }:
  { icon: string; iconFilled: string; label: string; focused: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={st.sideTab} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.sideIconWrap, focused && st.sideIconWrapOn]}>
        <Ionicons
          name={(focused ? iconFilled : icon) as any}
          size={focused ? 22 : 20}
          color={focused ? '#FFFFFF' : COLORS.text.secondary}
        />
      </View>
      <Text style={[st.sideLabel, focused && st.sideLabelOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, navigation }: BottomTabBarProps) {
  const { lang } = useLangStore();
  const screenW = Dimensions.get('window').width;

  const visible = state.routes.filter(r => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2, 4);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  const openAiCoach = () => navigation.navigate('ai-coach' as never);

  const barH = BAR_HEIGHT + BOTTOM_PAD;

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* SVG bar silhouette with twin arch cutouts */}
      <View style={[st.barContainer, { height: barH }]} pointerEvents="none">
        <Svg
          width={screenW}
          height={barH}
          viewBox={`0 0 ${screenW} ${barH}`}
          // @ts-ignore (react-native-svg types don't cover this prop universally)
          style={StyleSheet.absoluteFillObject}
        >
          <Path d={barPath(screenW, barH)} fill="#FFFFFF" />
        </Svg>
      </View>

      {/* Tab icons sit ABOVE the SVG silhouette */}
      <View style={[st.iconsRow, { height: barH, paddingBottom: BOTTOM_PAD }]}>
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
        {/* Center gap matching cutout width */}
        <View style={{ width: CUTOUT_W }} />
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

      {/* Raised CIRCULAR AI Coach puck — floats above the arch cutouts */}
      <TouchableOpacity
        testID="tab-ai-coach"
        onPress={openAiCoach}
        activeOpacity={0.88}
        style={st.raisedWrap}
        accessibilityLabel="Open AI Coach"
      >
        <View style={st.raisedOuter}>
          <View style={st.raisedInner}>
            <Image
              source={require('../../assets/images/mintu-logo.png')}
              style={st.raisedMascot}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
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
        screenOptions={{ headerShown: false }}
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

const st = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 112,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  barContainer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    // Soft shadow beneath whole bar
    ...Platform.select({
      ios:     { shadowColor: '#2E1F1A', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 10 },
      web:     { boxShadow: '0 -4px 18px rgba(46,31,26,0.09)' as any },
    }),
  },
  iconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,                    // push icons below the top arch dip
    width: '100%',
  },
  side: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  sideTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 2,
    gap: 3,
  },
  sideIconWrap: {
    width: 40, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sideIconWrapOn: {
    backgroundColor: COLORS.accent.primary,
    paddingHorizontal: 12,
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
      web:     { boxShadow: '0 4px 8px rgba(230,81,0,0.35)' as any },
    }),
  },
  sideLabel:   { fontSize: 10.5, color: COLORS.text.muted, fontWeight: '600', letterSpacing: 0.2 },
  sideLabelOn: { color: COLORS.accent.primary, fontWeight: '800' },

  // RAISED puck sits on top of the cutout
  raisedWrap: {
    position: 'absolute',
    bottom: BOTTOM_PAD + BAR_HEIGHT - PUCK_SIZE / 2 + 4,
    alignSelf: 'center',
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  raisedOuter: {
    width: PUCK_SIZE, height: PUCK_SIZE,
    borderRadius: PUCK_SIZE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.accent.primary + '22',
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 14 },
      web:     { boxShadow: '0 6px 18px rgba(230,81,0,0.38)' as any },
    }),
  },
  raisedInner: {
    width: PUCK_INNER, height: PUCK_INNER,
    borderRadius: PUCK_INNER / 2,
    backgroundColor: '#FFF0DE',
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  raisedMascot: { width: '100%', height: '100%' },
});
