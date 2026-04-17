import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../utils/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: COLORS.text.primary,
        tabBarInactiveTintColor: COLORS.text.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {/* LEFT: Expenses */}
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={23} color={color} />
          ),
        }}
      />
      {/* LEFT-CENTER: Budget */}
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={23} color={color} />
          ),
        }}
      />
      {/* CENTER: AI Insights — elevated FAB style */}
      <Tabs.Screen
        name="insights"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.centerTab, focused && styles.centerTabActive]}>
              <Ionicons name="sparkles" size={26} color="#fff" />
            </View>
          ),
          tabBarItemStyle: styles.centerTabItem,
        }}
      />
      {/* RIGHT-CENTER: Split (Splitwise) */}
      <Tabs.Screen
        name="split"
        options={{
          title: 'Split',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'git-compare' : 'git-compare-outline'} size={23} color={color} />
          ),
        }}
      />
      {/* RIGHT: Home (merged with rewards) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={23} color={color} />
          ),
        }}
      />
      {/* HIDDEN: Profile (accessed from Home header) */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      {/* HIDDEN: Rewards (merged into Home) */}
      <Tabs.Screen
        name="rewards"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 88 : 72,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    paddingTop: 10,
    shadowColor: '#2E1F1A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 16,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  tabItem: {
    paddingTop: 2,
  },
  // Center elevated AI tab — CRED style
  centerTab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -28,
    shadowColor: COLORS.accent.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  centerTabActive: {
    backgroundColor: COLORS.accent.primary,
    shadowOpacity: 0.5,
  },
  centerTabItem: {
    paddingTop: 0,
    height: 60,
  },
});
