import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, Modal } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../../utils/theme';
import AICoachChat from '../../components/AICoachChat';
import DraggableAIBubble from '../../components/DraggableAIBubble';

export default function TabLayout() {
  const [aiVisible, setAiVisible] = useState(false);

  return (
    <View style={{ flex: 1 }}>
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

      {/* Draggable AI Bubble — MintU Logo */}
      <DraggableAIBubble onPress={() => setAiVisible(true)} />

      {/* AI Coach Modal */}
      <Modal visible={aiVisible} animationType="slide" presentationStyle="pageSheet">
        <AICoachChat onClose={() => setAiVisible(false)} />
      </Modal>
    </View>
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
});
