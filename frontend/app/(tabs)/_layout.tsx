// Bottom tab bar — MintU v3 (Nov 2026).
//
// Matches the "flat bar with notched raised circular puck" reference:
//   ┌──────────────────────────────────────────────────────┐
//   │                      ●●●                             │
//   │                      │ │  ← perfectly circular puck  │
//   │                      │ │    (raised, with mascot)    │
//   │  ┌──────────────────╮ ╰╭───────────────────────────┐ │
//   │  │  [icon] [icon]        [icon] [icon]             │ │
//   │  │  label  label         label  label              │ │
//   │  └──────────────────────────────────────────────────┘ │
//   └──────────────────────────────────────────────────────┘
//
// The tab bar is a flat ivory capsule that fills the screen-bottom edge.
// A "notch cutout" silhouette is simulated with an overlay mask so the
// floating CIRCULAR AI Coach puck reads as carved-out on top of the bar
// (exactly like the HDFC PayZapp reference). All colors pulled from
// in-app saffron/cream palette — NO BLACK.
//
// Design principles:
// * Flat look — zero shadow under the bar (only on the puck).
// * CIRCLE, not squircle — borderRadius: 50% of the size.
// * Saffron active state for side tabs — filled pill under icon + label.
// * One raised puck above the bar, mascot centered, saffron shadow halo.

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { Image } from 'expo-image';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../../utils/theme';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';

// Tab metadata — iconsets are native to @expo/vector-icons so they stay crisp.
const TAB_META: Record<string, { out: string; fill: string; key: string }> = {
  index: { out: 'home-outline', fill: 'home', key: 'home' },
  transactions: { out: 'receipt-outline', fill: 'receipt', key: 'transactions' },
  budget: { out: 'pie-chart-outline', fill: 'pie-chart', key: 'budgets' },
  split: { out: 'people-outline', fill: 'people', key: 'split' },
};

function labelOf(name: string, lang: any): string {
  const k = TAB_META[name]?.key || name;
  const raw = t(k, lang);
  const fallback: Record<string, string> = { home: 'Home', transactions: 'Transactions', budgets: 'Budgets', split: 'Split' };
  if (raw === k || !raw) return fallback[k] || name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
  const visible = state.routes.filter(r => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2, 4);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  const openAiCoach = () => navigation.navigate('ai-coach' as never);

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* Flat tab bar — fills bottom, rounded top corners only */}
      <View style={st.bar}>
        <View style={st.barInner}>
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
          {/* Center gap (matches puck diameter + breathing room) */}
          <View style={st.centerGap} />
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
      </View>

      {/* Raised CIRCULAR AI Coach puck — floats above the notch */}
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

// ───────────────────────────────────────────────────────────────────
// Geometry constants — kept as named consts so the notch/puck math stays
// consistent across edits.
const PUCK_SIZE = 64;            // diameter of the raised circular button
const PUCK_INNER = 54;           // inner tile (mascot) — smaller by rim width
const NOTCH_SIZE = PUCK_SIZE + 16;  // cutout diameter — a touch larger than puck
const BAR_HEIGHT = 72;           // flat bar height (excluding safe-area pad)
const WRAP_HEIGHT = 112;
const BOTTOM_PAD = Platform.OS === 'ios' ? 18 : 10;
// ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Outer wrap — transparent container that positions the flat bar + raised puck
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: WRAP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },

  // FLAT bar — ivory background, fills edge-to-edge
  bar: {
    width: '100%',
    height: BAR_HEIGHT + BOTTOM_PAD,
    paddingBottom: BOTTOM_PAD,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    // Subtle top shadow only, to lift the bar off the page
    ...Platform.select({
      ios:     { shadowColor: '#2E1F1A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 10 },
      web:     { boxShadow: '0 -4px 18px rgba(46,31,26,0.08)' as any },
    }),
  },
  // Notch — a circle of app-background color overlaid on the bar, creating
  // the illusion of a cutout around the raised puck
  notch: {
    position: 'absolute',
    top: -NOTCH_SIZE / 2,
    left: '50%',
    marginLeft: -NOTCH_SIZE / 2,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    backgroundColor: COLORS.bg.primary,
    zIndex: 1,
  },

  barInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  centerGap: { width: PUCK_SIZE + 12 },

  // Side tab — small icon wrapper + label below
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
  // Active = saffron filled pill under icon (matches the "Pay" state in the ref)
  sideIconWrapOn: {
    backgroundColor: COLORS.accent.primary,
    paddingHorizontal: 12,
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
      web:     { boxShadow: '0 4px 8px rgba(230,81,0,0.35)' as any },
    }),
  },
  sideLabel: {
    fontSize: 10.5,
    color: COLORS.text.muted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sideLabelOn: {
    color: COLORS.accent.primary,
    fontWeight: '800',
  },

  // RAISED circular puck — perfectly round, floats above the notch
  raisedWrap: {
    position: 'absolute',
    bottom: BOTTOM_PAD + BAR_HEIGHT - PUCK_SIZE / 2 - 6,
    left: '50%',
    marginLeft: -PUCK_SIZE / 2,
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  raisedOuter: {
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    borderRadius: PUCK_SIZE / 2,          // perfect circle
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent.primary + '22',
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 14 },
      web:     { boxShadow: '0 6px 18px rgba(230,81,0,0.38)' as any },
    }),
  },
  raisedInner: {
    width: PUCK_INNER,
    height: PUCK_INNER,
    borderRadius: PUCK_INNER / 2,         // perfect circle inside the outer ring
    backgroundColor: '#FFF0DE',           // warm cream tile — NO BLACK
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raisedMascot: {
    width: '100%',
    height: '100%',
  },
});
