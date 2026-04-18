import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Modal, TouchableOpacity, Text } from 'react-native';
import { useState } from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Rect } from 'react-native-svg';
import { COLORS } from '../../utils/theme';
import AICoachChat from '../../components/AICoachChat';

const MintUIcon = () => (
  <Svg width={28} height={28} viewBox="0 0 240 240">
    <Defs>
      <LinearGradient id="mbg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FFFFFF" />
        <Stop offset="100%" stopColor="#D8FFF3" />
      </LinearGradient>
      <LinearGradient id="mf2" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#00C48A" />
        <Stop offset="55%" stopColor="#009EAA" />
        <Stop offset="100%" stopColor="#0082CC" />
      </LinearGradient>
    </Defs>
    <Rect x="10" y="10" width="220" height="220" rx="52" fill="url(#mbg2)" stroke="rgba(0,180,130,0.25)" strokeWidth="3" />
    <Path d="M52 11 Q120 8 188 11 Q210 11 220 30 L220 70 Q120 45 20 70 L20 30 Q20 11 52 11Z" fill="rgba(255,255,255,0.5)" />
    <Path d="M 62 145 C 62 145, 62 78, 64 72 C 66 66, 70 64, 76 68 C 82 72, 94 95, 102 108 C 108 118, 114 126, 120 126 C 126 126, 132 118, 138 108 C 146 95, 158 72, 164 68 C 170 64, 174 66, 176 72 C 178 78, 178 145, 178 145 C 176 149, 172 150, 168 148 C 166 146, 166 102, 164 92 C 162 86, 158 80, 154 84 C 148 90, 136 114, 128 124 C 124 130, 122 133, 120 133 C 118 133, 116 130, 112 124 C 104 114, 92 90, 86 84 C 82 80, 78 86, 76 92 C 74 102, 74 146, 72 148 C 68 150, 64 149, 62 145 Z" fill="url(#mf2)" />
    <Circle cx="120" cy="124" r="5" fill="white" stroke="#00C48A" strokeWidth="1.5" />
    <Circle cx="120" cy="124" r="2" fill="#00C48A" />
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
          tabBarInactiveTintColor: COLORS.text.muted,
          tabBarLabelStyle: st.tabLabel,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="transactions" options={{ title: 'Expenses', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} /> }} />
        {/* Center elevated AI Coach */}
        <Tabs.Screen name="insights" options={{
          title: '',
          tabBarIcon: () => (
            <TouchableOpacity style={st.centerBtn} onPress={() => setAiVisible(true)} activeOpacity={0.85}>
              <View style={st.centerInner}>
                <MintUIcon />
              </View>
            </TouchableOpacity>
          ),
          tabBarLabel: () => <Text style={st.centerLabel}>AI Coach</Text>,
          listeners: { tabPress: (e) => { e.preventDefault(); setAiVisible(true); } },
        }} />
        <Tabs.Screen name="budget" options={{ title: 'Budget', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="split" options={{ title: 'Split', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'git-compare' : 'git-compare-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
      </Tabs>

      {/* AI Coach Modal */}
      <Modal visible={aiVisible} animationType="slide" presentationStyle="pageSheet">
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0B0F2F',
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 90 : 72,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  centerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0D1535',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -28,
    borderWidth: 3,
    borderColor: 'rgba(0,196,138,0.35)',
    shadowColor: '#00C48A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  centerInner: { justifyContent: 'center', alignItems: 'center' },
  centerLabel: { fontSize: 9, fontWeight: '700', color: '#00C48A', marginTop: -2 },
});
