// Bottom tab bar — MintU 2.1, inspired by the Kiwi-style "pill container +
// raised center card" pattern. Uses only in-app saffron / ivory / charcoal.
//
// Layout:
//   ┌──────────────────────────────────────────────┐
//   │                    ┌──────┐                  │
//   │                    │  ▣   │  ← raised card   │
//   │                    │      │    (AI Coach)    │
//   │   ╔════════════════│      │═══════════════╗  │
//   │   ║ [icon] [icon]  └──────┘ [icon] [icon] ║  │
//   │   ║ label  label            label  label  ║  │
//   │   ╚════════════════════════════════════════╝ │
//   └──────────────────────────────────────────────┘
//
// The raised card floats higher than the pill, has rounded corners like a
// mini app-icon, and shows our MintU brand mark (the phone-with-bars icon).
// Side tabs get circular icon backgrounds; the active tab's circle fills
// with saffron.

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Modal, TouchableOpacity, Text } from 'react-native';
import { Image } from 'expo-image';
import { useState } from 'react';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../../utils/theme';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import MintULogo from '../../components/MintULogo';
import AICoachChat from '../../components/AICoachChat';

// Tab metadata — iconsets are native to @expo/vector-icons so they stay crisp.
const TAB_META: Record<string, { out: string; fill: string; key: string; label?: string }> = {
  index: { out: 'home-outline', fill: 'home', key: 'home' },
  transactions: { out: 'receipt-outline', fill: 'receipt', key: 'transactions' },
  'ai-coach': { out: 'sparkles-outline', fill: 'sparkles', key: 'ai-coach', label: 'AI Coach' },
  budget: { out: 'pie-chart-outline', fill: 'pie-chart', key: 'budgets' },
  split: { out: 'people-outline', fill: 'people', key: 'split' },
};

function labelOf(name: string, lang: any): string {
  const meta = TAB_META[name];
  if (meta?.label) return meta.label;
  const k = meta?.key || name;
  const raw = t(k, lang);
  const fallback: Record<string, string> = { home: 'Home', transactions: 'Transactions', budgets: 'Budgets', split: 'Split' };
  if (raw === k || !raw) return fallback[k] || name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function SideTab({ icon, iconFilled, label, focused, onPress, testID, isCenter }:
  { icon: string; iconFilled: string; label: string; focused: boolean; onPress: () => void; testID?: string; isCenter?: boolean }) {
  // Center tab (AI Coach) gets the mascot image instead of an icon
  return (
    <TouchableOpacity testID={testID} style={st.sideTab} onPress={onPress} activeOpacity={0.7}>
      {isCenter ? (
        <View style={[st.sideIconCircle, focused && st.sideIconCircleCenterOn, st.centerCircle]}>
          <Image
            source={require('../../assets/images/mintu-logo.png')}
            style={{ width: 28, height: 28, borderRadius: 14 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
      ) : (
        <View style={[st.sideIconCircle, focused && st.sideIconCircleOn]}>
          <Ionicons
            name={(focused ? iconFilled : icon) as any}
            size={20}
            color={focused ? '#FFFFFF' : '#1F2937'}
          />
        </View>
      )}
      <Text style={[st.sideLabel, focused && st.sideLabelOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, navigation }: BottomTabBarProps) {
  const { lang } = useLangStore();
  const visible = state.routes.filter(r => TAB_META[r.name]);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* Floating pill with all 5 tabs — AI Coach merged as a regular tab */}
      <View style={st.pill}>
        {visible.map((route) => {
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
              isCenter={route.name === 'ai-coach'}
            />
          );
        })}
      </View>
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
        <Tabs.Screen name="ai-coach" />
        <Tabs.Screen name="budget" />
        <Tabs.Screen name="split" />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const RAISED_SIZE = 64;

const st = StyleSheet.create({
  // Outer wrap — transparent container that positions the floating pill + raised puck
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 112,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    paddingHorizontal: 18,            // Kiwi-style: pill floats with margin from screen edges
    backgroundColor: 'transparent',
  },

  // Pill container — floating white capsule, doesn't touch screen edges.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 34,                 // fully rounded pill
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '100%',                    // fills wrap which has paddingHorizontal:18
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1E7DB',
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 14 },
      web:     { boxShadow: '0 10px 28px rgba(15,23,42,0.14)' as any },
    }),
  },
  pillSide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  pillCenterSpace: { width: RAISED_SIZE + 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  centerLabel: { fontSize: 11, color: COLORS.accent.primary, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  sideTab: { alignItems: 'center', flex: 1, paddingVertical: 2 },
  sideIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F7F3EE',
    alignItems: 'center', justifyContent: 'center',
  },
  sideIconCircleOn: {
    backgroundColor: COLORS.accent.primary,
  },
  sideIconCircleCenterOn: {
    backgroundColor: '#FFF0E3',
    borderWidth: 2,
    borderColor: COLORS.accent.primary,
  },
  centerCircle: {
    backgroundColor: '#FFF0E3',
  },
  sideLabel: { fontSize: 10.5, color: '#6B7280', marginTop: 3, fontWeight: '600' },
  sideLabelOn: { color: COLORS.accent.primary, fontWeight: '800' },

  // ── Raised center puck (Kiwi style) ─────────────────────────────────────
  // White rounded-square pedestal holding a saffron-tinted squircle tile that
  // the MintU mascot completely FILLS. No black, no circle — matches the
  // reference screenshot's aesthetic while staying on-brand.
  raisedWrap: {
    position: 'absolute',
    // Lift the puck so ~55% sits above the pill top edge
    bottom: (Platform.OS === 'ios' ? 24 : 14) + 48,
    left: '50%',
    marginLeft: -38,                   // -(pedestal size)/2
    width: 76,
    alignItems: 'center',
    zIndex: 20,
  },
  // White outer pedestal — crisp frame that pops off the pill
  raisedPedestal: {
    width: 76,
    height: 76,
    borderRadius: 24,                  // squircle (rounded square) — matches Kiwi reference
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.38, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 16 },
      web:     { boxShadow: '0 8px 22px rgba(230,81,0,0.35)' as any },
    }),
  },
  // Inner tile — warm cream in MintU theme (NOT black); mascot fills it.
  raisedTile: {
    width: 64,
    height: 64,
    borderRadius: 18,                  // slightly less rounded than pedestal for the "nested" look
    backgroundColor: '#FFF0DE',        // soft cream — matches app bg family, NO black
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mascot fills the tile edge-to-edge (cover, no letterboxing)
  raisedMascot: {
    width: '100%',
    height: '100%',
  },
  raisedLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.accent.primary,
    marginTop: 4, letterSpacing: 0.3,
  },
});
