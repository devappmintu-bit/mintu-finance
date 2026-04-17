import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, TouchableOpacity, Modal, Text } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../../utils/theme';
import AICoachChat from '../../components/AICoachChat';

export default function TabLayout() {
  const [aiVisible, setAiVisible] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.accent.primary,
          tabBarInactiveTintColor: COLORS.text.muted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="transactions" options={{ title: 'Expenses', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="budget" options={{ title: 'Budget', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="split" options={{ title: 'Split', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'git-compare' : 'git-compare-outline'} size={22} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="rewards" options={{ href: null }} />
        <Tabs.Screen name="insights" options={{ href: null }} />
      </Tabs>

      {/* Floating AI Bubble */}
      <TouchableOpacity style={styles.fab} onPress={() => setAiVisible(true)} activeOpacity={0.85}>
        <Ionicons name="sparkles" size={24} color="#fff" />
      </TouchableOpacity>

      {/* AI Coach Modal */}
      <Modal visible={aiVisible} animationType="slide" presentationStyle="pageSheet">
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 85 : 68,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
    paddingTop: 8,
    shadowColor: '#2E1F1A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 16,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  tabItem: { paddingTop: 2 },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
});
