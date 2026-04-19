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
      {/* Raised center card — MintU app icon on an ivory tile so the green-bars icon stays clearly visible */}
      <TouchableOpacity
        testID="tab-ai-coach"
        onPress={onPressCenter}
        activeOpacity={0.88}
        style={st.raisedWrap}
      >
        <View style={st.raisedCard}>
          <MintULogo size={58} />
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
        {/* Spacer under the raised card — houses the AI Coach label aligned to row */}
        <TouchableOpacity style={st.pillCenterSpace} onPress={onPressCenter} activeOpacity={0.7}>
          <View style={{ height: 38 }} />
          <Text style={st.centerLabel} numberOfLines={1}>AI Coach</Text>
        </TouchableOpacity>
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

const RAISED_SIZE = 72;

const st = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 120,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 18 : 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 10,
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 6px 20px rgba(15,23,42,0.1)' as any },
    }),
  },
  pillSide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pillCenterSpace: { width: RAISED_SIZE + 8, alignItems: 'center', justifyContent: 'flex-end' },
  centerLabel: { fontSize: 11, color: COLORS.accent.primary, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  sideTab: { alignItems: 'center', flex: 1, paddingVertical: 2 },
  sideIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F5F6F8',
    alignItems: 'center', justifyContent: 'center',
  },
  sideIconCircleOn: {
    backgroundColor: COLORS.accent.primary,
  },
  sideLabel: { fontSize: 11, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  sideLabelOn: { color: COLORS.accent.primary, fontWeight: '800' },

  // Raised card — floats above the pill; ivory background lets the green icon POP.
  raisedWrap: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -(RAISED_SIZE / 2),
    width: RAISED_SIZE,
    alignItems: 'center',
    zIndex: 10,
  },
  raisedCard: {
    width: RAISED_SIZE,
    height: RAISED_SIZE,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF', // clean white — lets the green icon breathe without any tinted halo
    // Neutral depth shadow only — no saffron glow per design ask
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
      web: { boxShadow: '0 6px 16px rgba(15,23,42,0.1)' as any },
    }),
  },
  raisedLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent.primary,
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
