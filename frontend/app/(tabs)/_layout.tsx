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
import { useState } from 'react';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../../utils/theme';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import MintULogo from '../../components/MintULogo';
import AICoachChat from '../../components/AICoachChat';

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
      <View style={[st.sideIconCircle, focused && st.sideIconCircleOn]}>
        <Ionicons
          name={(focused ? iconFilled : icon) as any}
          size={20}
          color={focused ? '#FFFFFF' : '#1F2937'}
        />
      </View>
      <Text style={[st.sideLabel, focused && st.sideLabelOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, navigation, onPressCenter }: BottomTabBarProps & { onPressCenter: () => void }) {
  const { lang } = useLangStore();
  const visible = state.routes.filter(r => TAB_META[r.name]);
  const left = visible.slice(0, 2);
  const right = visible.slice(2, 4);

  const fire = (route: any, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };

  return (
    <View style={st.wrap} pointerEvents="box-none">
      {/* Raised center puck — outer saffron glow → white ring → dark card (Kiwi style) */}
      <TouchableOpacity
        testID="tab-ai-coach"
        onPress={onPressCenter}
        activeOpacity={0.88}
        style={st.raisedWrap}
        accessibilityLabel="Open AI Coach"
      >
        <View style={st.raisedOuterRing}>
          <View style={st.raisedMidRing}>
            <View style={st.raisedCard}>
              <MintULogo size={52} />
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Pill container */}
      <View style={st.pill}>
        <View style={st.pillSide}>
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
        {/* Spacer under the raised puck — empty (label removed; puck speaks for itself) */}
        <View style={st.pillCenterSpace} />
        <View style={st.pillSide}>
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
  );
}

export default function TabLayout() {
  const [aiVisible, setAiVisible] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <MintUTabBar {...props} onPressCenter={() => setAiVisible(true)} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="transactions" />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="budget" />
        <Tabs.Screen name="split" />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={aiVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      >
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
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
  sideLabel: { fontSize: 10.5, color: '#6B7280', marginTop: 3, fontWeight: '600' },
  sideLabelOn: { color: COLORS.accent.primary, fontWeight: '800' },

  // ── Raised center puck (Kiwi style) ─────────────────────────────────────
  // Sits ABOVE the pill with clear gap. Has an outer saffron glow ring +
  // white mid-ring + inner warm tile so the MintU mascot pops.
  raisedWrap: {
    position: 'absolute',
    // Lift the puck so ~60% of it sits above the pill. Pill top edge ≈ 70px from bottom.
    bottom: (Platform.OS === 'ios' ? 24 : 14) + 54,
    left: '50%',
    marginLeft: -(RAISED_SIZE / 2) - 6,   // -6 to offset the 6px outer ring
    width: RAISED_SIZE + 12,
    alignItems: 'center',
    zIndex: 20,
  },
  // Outer neon-style ring — saffron gradient glow that makes the puck read at any distance
  raisedOuterRing: {
    width: RAISED_SIZE + 12,
    height: RAISED_SIZE + 12,
    borderRadius: (RAISED_SIZE + 12) / 2,
    backgroundColor: COLORS.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: COLORS.accent.primary, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 18 },
      web:     { boxShadow: '0 8px 22px rgba(230,81,0,0.45)' as any },
    }),
  },
  // White mid-ring — creates the crisp "neon glow + punch-out" effect
  raisedMidRing: {
    width: RAISED_SIZE + 6,
    height: RAISED_SIZE + 6,
    borderRadius: (RAISED_SIZE + 6) / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Inner card — dark charcoal tile (Kiwi pattern) so the saffron mascot glows against it
  raisedCard: {
    width: RAISED_SIZE,
    height: RAISED_SIZE,
    borderRadius: RAISED_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0A06',       // deep espresso — lets the orange mascot POP
  },
  raisedLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.accent.primary,
    marginTop: 4, letterSpacing: 0.3,
  },
});
