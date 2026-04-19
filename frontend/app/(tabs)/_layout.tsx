// Custom bottom tab bar — notched curve under a floating MintU logo.
// 4 side tabs with labels · 1 elevated center tab (AI Coach).
// Inspired by the reference hero image but rendered entirely in MintU saffron.
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Modal, TouchableOpacity, Text, Dimensions } from 'react-native';
import { useState } from 'react';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../../utils/theme';
import { useLangStore } from '../../store/langStore';
import { t } from '../../utils/i18n';
import MintULogo from '../../components/MintULogo';
import AICoachChat from '../../components/AICoachChat';

const TAB_HEIGHT = 72;
const FAB_SIZE = 62;
const NOTCH_WIDTH = 84;

function NotchedBackground({ width }: { width: number }) {
  // Build a path with a semi-circular cutout centered on the tab bar.
  const notchStart = (width - NOTCH_WIDTH) / 2;
  const notchEnd = notchStart + NOTCH_WIDTH;
  const notchDepth = 30;

  const d = `
    M 0 0
    H ${notchStart}
    C ${notchStart + 12} 0, ${notchStart + 14} ${notchDepth}, ${width / 2} ${notchDepth}
    C ${notchEnd - 14} ${notchDepth}, ${notchEnd - 12} 0, ${notchEnd} 0
    H ${width}
    V ${TAB_HEIGHT + 30}
    H 0
    Z
  `;

  return (
    <Svg width={width} height={TAB_HEIGHT + 30} style={{ position: 'absolute', bottom: 0, left: 0 }}>
      <Defs>
        <SvgLinearGradient id="tab_bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#FFF8F2" />
        </SvgLinearGradient>
      </Defs>
      <Path d={d} fill="url(#tab_bg)" stroke="#F4E3D0" strokeWidth={1} />
    </Svg>
  );
}

function TabItem({
  icon, iconFilled, label, focused, onPress,
}: { icon: string; iconFilled: string; label: string; focused: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.tabItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={(focused ? iconFilled : icon) as any}
        size={22}
        color={focused ? COLORS.accent.primary : '#9AA3AE'}
      />
      <Text style={[st.tabLabel, focused && st.tabLabelActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function MintUTabBar({ state, descriptors, navigation, onPressCenter }: BottomTabBarProps & { onPressCenter: () => void }) {
  const { lang } = useLangStore();
  const width = Dimensions.get('window').width;

  // Only the 4 visible side routes — center is custom.
  const routes = state.routes.filter(r => ['index', 'transactions', 'budget', 'split'].includes(r.name));

  const iconMap: Record<string, { o: string; f: string; key: string }> = {
    index: { o: 'home-outline', f: 'home', key: 'home' as any },
    transactions: { o: 'receipt-outline', f: 'receipt', key: 'transactions' },
    budget: { o: 'pie-chart-outline', f: 'pie-chart', key: 'budgets' },
    split: { o: 'people-outline', f: 'people', key: 'split' },
  };
  const labelFor = (name: string) => {
    const k = iconMap[name]?.key || name;
    // "home" → "Home" fallback when translation unavailable
    const trans = t(k, lang);
    if (k === 'home' && (trans === 'home' || !trans)) return 'Home';
    return trans.charAt(0).toUpperCase() + trans.slice(1);
  };

  return (
    <View style={st.wrap}>
      <NotchedBackground width={width} />

      {/* Floating center FAB */}
      <TouchableOpacity onPress={onPressCenter} activeOpacity={0.85} style={st.fab} accessibilityLabel="AI Coach">
        <View style={st.fabRing}>
          <MintULogo size={FAB_SIZE - 8} glow />
        </View>
        <Text style={st.fabLabel}>{t('ai_insight', lang).includes('AI') ? 'AI Coach' : 'AI'}</Text>
      </TouchableOpacity>

      {/* 4 side tabs — 2 left, spacer for center, 2 right */}
      <View style={st.row}>
        {routes.slice(0, 2).map((route) => {
          const focused = state.index === state.routes.findIndex(r => r.key === route.key);
          const { o, f } = iconMap[route.name];
          return (
            <TabItem
              key={route.key}
              icon={o}
              iconFilled={f}
              label={labelFor(route.name)}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
              }}
            />
          );
        })}
        <View style={st.spacer} />
        {routes.slice(2).map((route) => {
          const focused = state.index === state.routes.findIndex(r => r.key === route.key);
          const { o, f } = iconMap[route.name];
          return (
            <TabItem
              key={route.key}
              icon={o}
              iconFilled={f}
              label={labelFor(route.name)}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
              }}
            />
          );
        })}
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

      <Modal visible={aiVisible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}>
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: TAB_HEIGHT + 30,
    backgroundColor: 'transparent',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingHorizontal: 14,
    height: TAB_HEIGHT,
    marginTop: 30,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  spacer: { width: NOTCH_WIDTH - 14 },
  tabLabel: {
    fontSize: 11,
    color: '#9AA3AE',
    marginTop: 4,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.accent.primary,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -(FAB_SIZE / 2) - 2,
    width: FAB_SIZE + 4,
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#F56E1E', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 6px 18px rgba(245,110,30,0.35)' as any },
    }),
  },
  fabRing: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#FFF',
    borderWidth: 3,
    borderColor: '#FFF8F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    fontSize: 10,
    color: COLORS.accent.primary,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
