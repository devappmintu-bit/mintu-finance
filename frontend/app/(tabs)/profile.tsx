import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  Modal, FlatList, TextInput, Image, RefreshControl, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { t, LANGUAGES } from '../../utils/i18n';
import api from '../../utils/api';
import { COLORS, RADIUS, SPACING, CATEGORIES } from '../../utils/theme';
import Toast from 'react-native-toast-message';
import { PieChart } from 'react-native-gifted-charts';
import HelpSupport from '../../components/HelpSupport';
import AboutMintU from '../../components/AboutMintU';

const APP_LINK = 'https://mintu.app/download';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [upiId, setUpiId] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [waste, setWaste] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [statsCard, setStatsCard] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, upiRes, avatarRes, wasteRes, shareRes, insRes] = await Promise.all([
        api.get('/stats/overview'),
        api.get('/user/upi').catch(() => ({ data: {} })),
        api.get('/user/avatar').catch(() => ({ data: {} })),
        api.get('/waste-detector').catch(() => ({ data: null })),
        api.get('/share/stats-card').catch(() => ({ data: null })),
        api.get(`/insights/daily?lang=${lang}`).catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setUpiId(upiRes.data?.upi_id || '');
      if (avatarRes.data?.avatar) { setAvatar(avatarRes.data.avatar); await AsyncStorage.setItem('user_avatar', avatarRes.data.avatar); }
      if (wasteRes.data) setWaste(wasteRes.data);
      if (shareRes.data) setStatsCard(shareRes.data);
      if (insRes.data) setInsights(insRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [lang]);

  useEffect(() => {
    AsyncStorage.getItem('user_avatar').then(c => { if (c) setAvatar(c); });
    loadData();
  }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleLogout = () => Alert.alert(t('logout', lang), t('logout_confirm', lang), [
    { text: t('cancel', lang), style: 'cancel' },
    { text: t('logout', lang), style: 'destructive', onPress: async () => { await AsyncStorage.removeItem('user_avatar'); await logout(); router.replace('/'); } },
  ]);

  const saveUpiId = async () => {
    if (!upiId.trim()) return;
    setUpiSaving(true);
    try { await api.post('/user/upi', { upi_id: upiId.trim() }); Toast.show({ type: 'success', text1: 'Saved!', text2: 'UPI ID updated' }); }
    catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Invalid UPI ID' }); }
    finally { setUpiSaving(false); }
  };

  const updateName = async () => {
    if (!editName.trim()) return;
    try {
      await api.put('/user/profile', { name: editName.trim() });
      Toast.show({ type: 'success', text1: 'Name Updated!' });
      setEditNameVisible(false); loadData();
    } catch { Toast.show({ type: 'error', text1: 'Error' }); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64); await AsyncStorage.setItem('user_avatar', b64);
      try { await api.post('/user/avatar', { avatar: b64 }); Toast.show({ type: 'success', text1: 'Photo Updated!' }); } catch { Toast.show({ type: 'error', text1: 'Upload Failed' }); }
    }
  };

  const removeAvatar = () => Alert.alert('Remove Photo?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { setAvatar(''); await AsyncStorage.removeItem('user_avatar'); try { await api.post('/user/avatar', { avatar: '' }); } catch {} } },
  ]);

  const shareContent = (text: string, platform: string) => {
    const full = `${text}\n\n📲 Download MintU: ${APP_LINK}`;
    if (platform === 'whatsapp') Linking.openURL(`whatsapp://send?text=${encodeURIComponent(full)}`).catch(() => Share.share({ message: full }));
    else Share.share({ message: full });
  };

  const moneyScore = insights?.money_score || user?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? '#10B981' : moneyScore >= 50 ? '#F59E0B' : '#EF4444';
  const currentLang = LANGUAGES.find(l => l.code === lang);

  const pieData = Object.entries(stats?.category_breakdown || {}).map(([cat, amount]: [string, any]) => ({
    value: amount, color: CATEGORIES[cat]?.color || '#64748B', text: cat,
  }));
  const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);

  if (loading) return <SafeAreaView style={p.bg}><ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 80 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={p.bg}>
      <ScrollView contentContainerStyle={p.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}>
        {/* ═══ PROFILE HERO ═══ */}
        <View style={p.hero}>
          <TouchableOpacity onPress={pickAvatar} onLongPress={avatar ? removeAvatar : undefined}>
            {avatar ? <Image source={{ uri: avatar }} style={p.avatarImg} /> : (
              <View style={p.avatarPlace}><Ionicons name="person" size={36} color={COLORS.accent.primary} /></View>
            )}
            <View style={p.camBadge}><Ionicons name="camera" size={11} color="#fff" /></View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setEditName(user?.name || ''); setEditNameVisible(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={p.userName}>{user?.name || 'User'}</Text>
            <Ionicons name="create-outline" size={16} color={COLORS.accent.primary} />
          </TouchableOpacity>
          <Text style={p.userPhone}>{user?.phone}</Text>
        </View>

        {/* ═══ MONEY SCORE ═══ */}
        <View style={[p.scoreCard, { borderColor: scoreColor + '30' }]}>
          <View style={[p.scoreRing, { borderColor: scoreColor }]}>
            <Text style={[p.scoreVal, { color: scoreColor }]}>{moneyScore}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={p.scoreLabel}>Money Score</Text>
            <Text style={[p.scoreGrade, { color: scoreColor }]}>{moneyScore >= 75 ? 'Excellent! 🏆' : moneyScore >= 50 ? 'Good 💪' : 'Needs Work 📈'}</Text>
          </View>
        </View>

        {/* ═══ UPI ═══ */}
        <View style={p.upiCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="card" size={16} color="#6366F1" />
            <Text style={p.upiTitle}>UPI ID</Text>
          </View>
          <View style={p.upiRow}>
            <TextInput style={p.upiInput} value={upiId} onChangeText={setUpiId} placeholder="yourname@okicici" placeholderTextColor={COLORS.text.muted} autoCapitalize="none" />
            <TouchableOpacity style={[p.upiSave, (!upiId.trim() || upiSaving) && { opacity: 0.5 }]} onPress={saveUpiId} disabled={!upiId.trim() || upiSaving}>
              {upiSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══ STATS ═══ */}
        {stats && (
          <View style={p.statsGrid}>
            {[
              { icon: 'arrow-down-circle', color: COLORS.accent.moneyIn, label: 'Income', val: `₹${stats.total_income?.toFixed(0) || 0}` },
              { icon: 'arrow-up-circle', color: COLORS.accent.moneyOut, label: 'Expenses', val: `₹${stats.total_expense?.toFixed(0) || 0}` },
              { icon: 'wallet', color: COLORS.accent.secondary, label: 'Balance', val: `₹${stats.balance?.toFixed(0) || 0}` },
              { icon: 'receipt', color: COLORS.accent.warning, label: 'Transactions', val: `${stats.transaction_count || 0}` },
            ].map((s, i) => (
              <View key={i} style={p.statItem}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
                <Text style={p.statVal}>{s.val}</Text>
                <Text style={p.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ AI WASTE DETECTOR ═══ */}
        {waste && waste.category_waste?.length > 0 && (
          <View style={p.wasteCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="flame" size={16} color="#EF4444" />
              <Text style={p.wasteTitle}>AI Waste Detector</Text>
            </View>
            {waste.overall_trend_pct !== undefined && waste.prev_month_total > 0 && (
              <View style={[p.trendPill, { backgroundColor: waste.overall_trend_pct > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
                <Ionicons name={waste.overall_trend_pct > 0 ? 'trending-up' : 'trending-down'} size={14} color={waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981' }}>
                  {Math.abs(waste.overall_trend_pct).toFixed(0)}% {waste.overall_trend_pct > 0 ? 'more' : 'less'} than last month
                </Text>
              </View>
            )}
            {waste.category_waste.slice(0, 3).map((w: any, i: number) => (
              <View key={i} style={p.wasteItem}>
                <Text style={p.wasteShock}>{w.shock_text}</Text>
                {w.equivalences?.slice(0, 1).map((eq: any, j: number) => (
                  <Text key={j} style={p.wasteEq}>{eq.emoji} That's {eq.text}</Text>
                ))}
                {w.peer_comparison?.text ? <Text style={p.wastePeer}>👥 {w.peer_comparison.text}</Text> : null}
              </View>
            ))}
            {waste.ai_recommendation ? (
              <View style={p.aiRec}>
                <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
                <Text style={p.aiRecText}>{waste.ai_recommendation}</Text>
              </View>
            ) : null}
            {waste.comparison && <Text style={p.wasteCompare}>{waste.comparison.text}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={p.shareWa} onPress={() => shareContent(waste.shareable_text, 'whatsapp')}>
                <Ionicons name="logo-whatsapp" size={13} color="#fff" /><Text style={p.shareWaT}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={p.shareGen} onPress={() => shareContent(waste.shareable_text, 'general')}>
                <Ionicons name="share-social" size={13} color={COLORS.accent.primary} /><Text style={p.shareGenT}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══ PIE CHART ═══ */}
        {pieData.length > 0 && (
          <View style={p.card}>
            <Text style={p.cardTitle}>Expense Breakdown</Text>
            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <PieChart data={pieData} donut radius={72} innerRadius={48} innerCircleColor={COLORS.bg.card}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.text.primary }}>₹{totalSpent.toFixed(0)}</Text><Text style={{ fontSize: 10, color: COLORS.text.muted }}>Total</Text></View>
                )}
              />
            </View>
            {pieData.slice(0, 5).map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.text.secondary }}>{item.text}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.primary }}>₹{item.value.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ PAYMENT METHODS ═══ */}
        <View style={p.payCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="wallet" size={18} color={COLORS.accent.primary} />
              <Text style={p.cardTitle}>Payment Methods</Text>
            </View>
          </View>
          {upiId ? (
            <View style={p.payMethod}>
              <View style={[p.payIcon, { backgroundColor: '#6366F112' }]}><Ionicons name="card" size={18} color="#6366F1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={p.payName}>UPI</Text>
                <Text style={p.payDetail}>{upiId}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.accent.moneyIn} />
            </View>
          ) : null}
          <TouchableOpacity style={p.addPayBtn}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.accent.primary} />
            <Text style={p.addPayText}>Add Card / Bank Account</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ SETTINGS ═══ */}
        <Text style={p.sectionTitle}>Settings</Text>

        <TouchableOpacity style={p.menuItem} onPress={() => setLangModalVisible(true)}>
          <Ionicons name="language" size={20} color="#8B5CF6" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={p.menuText}>{t('language', lang)}</Text>
            <Text style={{ fontSize: 11, color: '#8B5CF6' }}>{currentLang?.nativeName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>

        <TouchableOpacity style={p.menuItem} onPress={() => setPrivacyVisible(true)}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.accent.secondary} />
          <Text style={[p.menuText, { marginLeft: 12 }]}>Privacy & Security</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>

        {/* Help & Support */}
        <TouchableOpacity style={p.menuItem} onPress={() => setHelpVisible(true)}>
          <Ionicons name="help-circle-outline" size={20} color={COLORS.accent.warning} />
          <Text style={[p.menuText, { marginLeft: 12 }]}>{t('help_support', lang)}</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>

        {/* About MintU */}
        <TouchableOpacity style={p.menuItem} onPress={() => setAboutVisible(true)}>
          <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
          <Text style={[p.menuText, { marginLeft: 12 }]}>About MintU</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>

        <TouchableOpacity style={p.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} />
          <Text style={p.logoutText}>{t('logout', lang)}</Text>
        </TouchableOpacity>
        <Text style={p.version}>v1.0.0 · Made with ❤️ in India</Text>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Language Modal */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={p.mBg}>
          <View style={p.sheet}>
            <View style={p.handle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={p.sheetTitle}>{t('language', lang)}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <FlatList data={LANGUAGES} keyExtractor={i => i.code} renderItem={({ item }) => (
              <TouchableOpacity style={[p.langOpt, lang === item.code && p.langOptActive]} onPress={() => { setLang(item.code); setLangModalVisible(false); }}>
                <View><Text style={p.langNative}>{item.nativeName}</Text><Text style={p.langEn}>{item.name}</Text></View>
                {lang === item.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.primary} />}
              </TouchableOpacity>
            )} />
          </View>
        </View>
      </Modal>

      {/* Help & Support Modal */}
      <Modal visible={helpVisible} animationType="slide">
        <HelpSupport onClose={() => setHelpVisible(false)} />
      </Modal>

      {/* About MintU Modal */}
      <Modal visible={aboutVisible} animationType="slide">
        <AboutMintU onClose={() => setAboutVisible(false)} />
      </Modal>

      {/* Edit Name Modal */}
      <Modal visible={editNameVisible} animationType="fade" transparent>
        <View style={p.mBg}>
          <View style={[p.sheet, { maxHeight: 280 }]}>
            <View style={p.handle} />
            <Text style={p.sheetTitle}>Edit Name</Text>
            <TextInput style={[p.upiInput, { marginTop: 16, marginBottom: 16, borderColor: COLORS.border.subtle }]} value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor={COLORS.text.muted} autoFocus />
            <TouchableOpacity style={[p.upiSave, { width: '100%', height: 48, borderRadius: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }]} onPress={updateName}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditNameVisible(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text.muted, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy & Security Modal */}
      <Modal visible={privacyVisible} animationType="slide">
        <SafeAreaView style={p.bg}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle }}>
            <Text style={p.sheetTitle}>Privacy & Security</Text>
            <TouchableOpacity onPress={() => setPrivacyVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={p.card}><Ionicons name="shield-checkmark" size={20} color="#10B981" /><Text style={[p.cardTitle, { marginTop: 8 }]}>Data Encryption</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>All personal and financial data is encrypted using AES-256 at rest and protected by TLS 1.3 during transmission. Your passwords are hashed with bcrypt (10 salt rounds).</Text></View>
            <View style={p.card}><Ionicons name="lock-closed" size={20} color="#6366F1" /><Text style={[p.cardTitle, { marginTop: 8 }]}>Authentication Security</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>Phone-based OTP verification ensures only you can access your account. Sessions expire after 30 days of inactivity. JWT tokens are cryptographically signed.</Text></View>
            <View style={p.card}><Ionicons name="eye-off" size={20} color="#E65100" /><Text style={[p.cardTitle, { marginTop: 8 }]}>Data Privacy</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>MintU does NOT sell, share, or monetize your financial data. We process transactions locally and only use anonymized, aggregated data for product improvements. Compliant with IT Act 2000 and RBI data localization norms.</Text></View>
            <View style={p.card}><Ionicons name="server" size={20} color="#059669" /><Text style={[p.cardTitle, { marginTop: 8 }]}>Data Storage</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>All data is stored on encrypted servers within India, complying with RBI's data localization mandate. Regular backups ensure data integrity. You can request data deletion at any time.</Text></View>
            <View style={p.card}><Ionicons name="finger-print" size={20} color="#D32F2F" /><Text style={[p.cardTitle, { marginTop: 8 }]}>Access Control</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>Role-based access control (RBAC) ensures employees cannot access your personal data. API rate limiting (1000 req/min) prevents abuse. All access attempts are logged and audited.</Text></View>
            <View style={p.card}><Ionicons name="document-text" size={20} color={COLORS.accent.secondary} /><Text style={[p.cardTitle, { marginTop: 8 }]}>Your Rights</Text><Text style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 }}>You have the right to: Access all your data (Export), Request data deletion, Opt out of analytics, File grievances with our Data Protection Officer at dpo@mintu.app. We respond within 48 hours.</Text></View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const p = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: SPACING.lg },
  // Hero
  hero: { alignItems: 'center', marginBottom: 20 },
  avatarImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: COLORS.accent.primary + '25' },
  avatarPlace: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accent.primary + '10', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.accent.primary + '25' },
  camBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.primary },
  userName: { fontSize: 20, fontWeight: '800', color: COLORS.text.primary, marginTop: 10 },
  userPhone: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
  // Score
  scoreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 2 },
  scoreRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  scoreVal: { fontSize: 22, fontWeight: '900' },
  scoreLabel: { fontSize: 11, color: COLORS.text.muted },
  scoreGrade: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  // UPI
  upiCard: { backgroundColor: '#EEF2FF', borderRadius: RADIUS.xl, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  upiTitle: { fontSize: 14, fontWeight: '700', color: '#4338CA' },
  upiRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  upiInput: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text.primary, borderWidth: 1, borderColor: '#C7D2FE' },
  upiSave: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statItem: { width: '47%', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: 12, borderWidth: 1, borderColor: COLORS.border.card, flexGrow: 1, gap: 4 },
  statVal: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary },
  statLabel: { fontSize: 10, color: COLORS.text.muted },
  // Waste
  wasteCard: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FECACA' },
  wasteTitle: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, marginBottom: 8 },
  wasteItem: { marginBottom: 8 },
  wasteShock: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  wasteEq: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  wastePeer: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  wasteCompare: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 4 },
  aiRec: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.accent.primary + '08', padding: 10, borderRadius: RADIUS.lg, marginTop: 6, borderWidth: 1, borderColor: COLORS.accent.primary + '15' },
  aiRecText: { flex: 1, fontSize: 12, fontWeight: '500', color: COLORS.text.secondary, lineHeight: 18 },
  shareWa: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#25D366', paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full },
  shareWaT: { fontSize: 11, fontWeight: '600', color: '#fff' },
  shareGen: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent.primary + '10', paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full },
  shareGenT: { fontSize: 11, fontWeight: '600', color: COLORS.accent.primary },
  // Card
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border.card },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text.primary },
  // Payment Methods
  payCard: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border.card },
  payMethod: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  payIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  payName: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  payDetail: { fontSize: 12, color: COLORS.text.muted, marginTop: 1 },
  addPayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.accent.primary + '08', borderWidth: 1, borderColor: COLORS.accent.primary + '20' },
  addPayText: { fontSize: 13, fontWeight: '600', color: COLORS.accent.primary },
  // Settings
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginTop: 8, marginBottom: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.lg, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border.card },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '10', borderRadius: RADIUS.full, paddingVertical: 16, marginTop: 16 },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 11, color: COLORS.text.muted, marginTop: 12 },
  // Modal
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  langOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS.lg, marginBottom: 2 },
  langOptActive: { backgroundColor: COLORS.accent.primary + '10' },
  langNative: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  langEn: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  // About
  aboutEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  aboutTagline: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary, textAlign: 'center', marginBottom: 8 },
  aboutDesc: { fontSize: 14, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  aboutFeatures: { gap: 12 },
  aboutFeature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  aboutFTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  aboutFDesc: { fontSize: 12, color: COLORS.text.muted, marginTop: 1 },
  aboutFooter: { textAlign: 'center', fontSize: 12, color: COLORS.text.muted, marginTop: 20 },
});
