import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats/overview').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const moneyScore = user?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? COLORS.accent.moneyIn : moneyScore >= 50 ? COLORS.accent.warning : COLORS.accent.moneyOut;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView testID="profile-screen" contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={COLORS.accent.primary} />
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          <View style={styles.scorePill}>
            <Ionicons name="trophy" size={16} color={scoreColor} />
            <Text style={[styles.scorePillText, { color: scoreColor }]}>Score: {moneyScore}</Text>
          </View>
        </View>

        {/* Stats Grid */}
        {!loading && stats && (
          <View style={styles.statsGrid}>
            {[
              { icon: 'arrow-down-circle', color: COLORS.accent.moneyIn, label: 'Income', value: `\u20B9${stats.total_income.toFixed(0)}` },
              { icon: 'arrow-up-circle', color: COLORS.accent.moneyOut, label: 'Expenses', value: `\u20B9${stats.total_expense.toFixed(0)}` },
              { icon: 'wallet', color: COLORS.accent.secondary, label: 'Balance', value: `\u20B9${stats.balance.toFixed(0)}` },
              { icon: 'receipt', color: COLORS.accent.warning, label: 'Txns', value: `${stats.transaction_count}` },
            ].map((s, i) => (
              <View key={i} style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: s.color + '15' }]}>
                  <Ionicons name={s.icon as any} size={22} color={s.color} />
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
        {loading && <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginVertical: 24 }} />}

        {/* Settings Menu */}
        <Text style={styles.sectionTitle}>Settings</Text>

        {[
          { icon: 'notifications-outline', label: 'Notifications', color: COLORS.accent.primary },
          { icon: 'shield-checkmark-outline', label: 'Privacy & Security', color: COLORS.accent.secondary },
          { icon: 'download-outline', label: 'Export Data', color: COLORS.accent.tertiary },
          { icon: 'help-circle-outline', label: 'Help & Support', color: COLORS.accent.warning },
          { icon: 'information-circle-outline', label: 'About MintU', color: COLORS.text.muted },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={styles.menuText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MintU v1.0.0 · Made with love for India</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scrollContent: { padding: SPACING.lg },
  profileCard: { alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xxxl, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border.card },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  name: { fontSize: 24, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  phone: { fontSize: 15, color: COLORS.text.muted, marginBottom: SPACING.md },
  scorePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full },
  scorePillText: { fontSize: 14, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.xxl },
  statItem: { width: '48%', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card, flexGrow: 1 },
  statIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary },
  statLabel: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: SPACING.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border.card },
  menuIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '12', borderRadius: RADIUS.full, paddingVertical: 16, marginTop: SPACING.xxl },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.text.muted, marginTop: SPACING.xxl, marginBottom: SPACING.xxxl },
});
