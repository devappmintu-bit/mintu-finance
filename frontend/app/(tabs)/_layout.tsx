import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Modal, TouchableOpacity, Text } from 'react-native';
import { useState } from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Rect } from 'react-native-svg';
import { COLORS, shadowStyle } from '../../utils/theme';
import AICoachChat from '../../components/AICoachChat';

const MintUCoinIcon = () => (
  <Svg width={32} height={32} viewBox="0 0 240 240">
    <Defs>
      <LinearGradient id="coinBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#E65100" />
        <Stop offset="100%" stopColor="#FF7D33" />
      </LinearGradient>
      <LinearGradient id="mFillC" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FFFFFF" />
        <Stop offset="100%" stopColor="#FFF3E0" />
      </LinearGradient>
    </Defs>
    <Circle cx="120" cy="120" r="110" fill="url(#coinBg)" />
    <Circle cx="120" cy="120" r="95" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
    <Path d="M 75 140 C 75 140, 75 82, 77 77 C 79 72, 82 70, 87 73 C 92 76, 102 95, 108 106 C 112 113, 116 120, 120 120 C 124 120, 128 113, 132 106 C 138 95, 148 76, 153 73 C 158 70, 161 72, 163 77 C 165 82, 165 140, 165 140 C 163 143, 160 144, 157 142 C 155 140, 155 105, 153 97 C 151 92, 148 88, 145 90 C 140 94, 132 112, 127 120 C 124 125, 122 127, 120 127 C 118 127, 116 125, 113 120 C 108 112, 100 94, 95 90 C 92 88, 89 92, 87 97 C 85 105, 85 140, 83 142 C 80 144, 77 143, 75 140 Z" fill="url(#mFillC)" />
    <Circle cx="120" cy="120" r="4" fill="#E65100" stroke="#fff" strokeWidth="1.5" />
  </Svg>
);

export default function TabLayout() {
  const [aiVisible, setAiVisible] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: st.tabBar,
          tabBarActiveTintColor: COLORS.accent.primary,
          tabBarInactiveTintColor: '#A0A0A0',
          tabBarLabelStyle: st.tabLabel,
          tabBarIconStyle: { marginBottom: -2 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} /> }} />
        <Tabs.Screen name="transactions" options={{ title: 'Expenses', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={24} color={color} /> }} />
        {/* CENTER — Elevated AI Coach (brand gradient icon) */}
        <Tabs.Screen name="insights" options={{
          title: '',
          tabBarIcon: () => (
            <TouchableOpacity style={st.centerBtn} onPress={() => setAiVisible(true)} activeOpacity={0.85}>
              <View style={st.centerInner}>
                <Ionicons name="sparkles" size={26} color="#FFFFFF" />
                <View style={st.pulse} />
              </View>
            </TouchableOpacity>
          ),
          tabBarLabel: () => <Text style={st.centerLabel}>AI Coach</Text>,
          listeners: { tabPress: (e) => { e.preventDefault(); setAiVisible(true); } },
        }} />
        <Tabs.Screen name="budget" options={{ title: 'Budget', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={24} color={color} /> }} />
        <Tabs.Screen name="split" options={{ title: 'Split', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={24} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
      </Tabs>

      <Modal visible={aiVisible} animationType="slide" presentationStyle="pageSheet">
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 0,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  centerBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    ...shadowStyle(COLORS.accent.primary, 6, 12, 0.35, 10),
  },
  centerInner: {
    width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.accent.primary,
  },
  pulse: {
    position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#10B981', borderWidth: 2, borderColor: COLORS.accent.primary,
  },
  centerLabel: { fontSize: 10, fontWeight: '700', color: COLORS.accent.primary, marginTop: 0 },
});
