import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, FlatList,
  TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t, LANGUAGES, LangCode } from '../../utils/i18n';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';
import Toast from 'react-native-toast-message';
import { ProfileSkeleton } from '../../components/SkeletonLoader';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    api.get('/stats/overview').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/user/upi').then(r => setUpiId(r.data.upi_id || '')).catch(() => {});
    api.get('/user/avatar').then(r => { if (r.data?.avatar) setAvatar(r.data.avatar); }).catch(() => {});
  }, []);

  const handleLogout = () => {
    Alert.alert(t('logout', lang), t('logout_confirm', lang), [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('logout', lang), style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const saveUpiId = async () => {
    if (!upiId.trim()) return;
    setUpiSaving(true);
    try {
      await api.post('/user/upi', { upi_id: upiId.trim() });
      Toast.show({ type: 'success', text1: 'Saved!', text2: 'UPI ID updated successfully' });
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Invalid UPI ID format');
    } finally { setUpiSaving(false); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64);
      try { await api.post('/user/avatar', { avatar: b64 }); } catch (e) { Alert.alert('Error', 'Could not upload photo'); }
    }
  };

  const moneyScore = user?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? COLORS.accent.moneyIn : moneyScore >= 50 ? COLORS.accent.warning : COLORS.accent.moneyOut;
  const currentLang = LANGUAGES.find(l => l.code === lang);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView testID="profile-screen" contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={36} color={COLORS.accent.primary} />
              </View>
            )}
            <View style={styles.cameraBadge}><Ionicons name="camera" size={12} color="#fff" /></View>
          </TouchableOpacity>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          <View style={styles.scorePill}>
            <Ionicons name="trophy" size={16} color={scoreColor} />
            <Text style={[styles.scorePillText, { color: scoreColor }]}>{t('money_score', lang)}: {moneyScore}</Text>
          </View>
        </View>

        {/* UPI ID Section */}
        <View style={styles.upiCard}>
          <View style={styles.upiHeader}>
            <Ionicons name="card" size={18} color="#6366F1" />
            <Text style={styles.upiTitle}>UPI ID</Text>
          </View>
          <Text style={styles.upiHint}>Add your UPI ID for instant split payments</Text>
          <View style={styles.upiInputRow}>
            <TextInput
              style={styles.upiInput}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="yourname@okicici"
              placeholderTextColor={COLORS.text.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={[styles.upiSaveBtn, (!upiId.trim() || upiSaving) && { opacity: 0.5 }]} onPress={saveUpiId} disabled={!upiId.trim() || upiSaving}>
              {upiSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        {!loading && stats && (
          <View style={styles.statsGrid}>
            {[
              { icon: 'arrow-down-circle', color: COLORS.accent.moneyIn, label: t('income', lang), value: `\u20B9${stats.total_income.toFixed(0)}` },
              { icon: 'arrow-up-circle', color: COLORS.accent.moneyOut, label: t('expenses', lang), value: `\u20B9${stats.total_expense.toFixed(0)}` },
              { icon: 'wallet', color: COLORS.accent.secondary, label: t('balance', lang), value: `\u20B9${stats.balance.toFixed(0)}` },
              { icon: 'receipt', color: COLORS.accent.warning, label: t('transactions', lang), value: `${stats.transaction_count}` },
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

        <Text style={styles.sectionTitle}>{t('settings', lang)}</Text>

        {/* Language Selector — prominent */}
        <TouchableOpacity testID="language-selector" style={[styles.menuItem, styles.langItem]} onPress={() => setLangModalVisible(true)}>
          <View style={[styles.menuIcon, { backgroundColor: '#8B5CF6' + '15' }]}>
            <Ionicons name="language" size={20} color="#8B5CF6" />
          </View>
          <View style={styles.langInfo}>
            <Text style={styles.menuText}>{t('language', lang)}</Text>
            <Text style={styles.langCurrent}>{currentLang?.nativeName} ({currentLang?.name})</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>

        {[
          { icon: 'notifications-outline', label: t('notifications', lang), color: COLORS.accent.primary },
          { icon: 'shield-checkmark-outline', label: t('privacy_security', lang), color: COLORS.accent.secondary },
          { icon: 'download-outline', label: t('export_data', lang), color: COLORS.accent.tertiary },
          { icon: 'help-circle-outline', label: t('help_support', lang), color: COLORS.accent.warning },
          { icon: 'information-circle-outline', label: t('about', lang), color: COLORS.text.muted },
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
          <Text style={styles.logoutText}>{t('logout', lang)}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>{t('version', lang)} · {t('made_with_love', lang)}</Text>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('language', lang)}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`lang-${item.code}`}
                  style={[styles.langOption, lang === item.code && styles.langOptionActive]}
                  onPress={() => { setLang(item.code); setLangModalVisible(false); }}
                >
                  <View style={styles.langOptionInfo}>
                    <Text style={styles.langNative}>{item.nativeName}</Text>
                    <Text style={styles.langEnglish}>{item.name}</Text>
                  </View>
                  {lang === item.code && <Ionicons name="checkmark-circle" size={24} color={COLORS.accent.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  scrollContent: { padding: SPACING.lg },
  profileCard: { alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xxxl, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: COLORS.border.card },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '18', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  avatarWrap: { position: 'relative', marginBottom: SPACING.lg },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.card },
  // UPI
  upiCard: { backgroundColor: '#EEF2FF', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.xxl, borderWidth: 1, borderColor: '#C7D2FE' },
  upiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  upiTitle: { fontSize: 16, fontWeight: '700', color: '#4338CA' },
  upiHint: { fontSize: 12, color: '#6B7280', marginBottom: SPACING.md },
  upiInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  upiInput: { flex: 1, backgroundColor: '#fff', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.text.primary, borderWidth: 1, borderColor: '#C7D2FE' },
  upiSaveBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
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
  langItem: { borderColor: '#8B5CF6' + '30' },
  menuIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  langInfo: { flex: 1 },
  langCurrent: { fontSize: 12, color: '#8B5CF6', marginTop: 2, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '12', borderRadius: RADIUS.full, paddingVertical: 16, marginTop: SPACING.xxl },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.text.muted, marginTop: SPACING.xxl, marginBottom: SPACING.xxxl },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: 4 },
  langOptionActive: { backgroundColor: COLORS.accent.primary + '12' },
  langOptionInfo: {},
  langNative: { fontSize: 18, fontWeight: '600', color: COLORS.text.primary },
  langEnglish: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
});
