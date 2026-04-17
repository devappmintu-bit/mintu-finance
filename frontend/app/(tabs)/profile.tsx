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

const APP_LINK = 'https://mintu.app/download';
type ProfileTab = 'profile' | 'insights' | 'settings';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);
  const [avatar, setAvatar] = useState('');
  // Insights data
  const [waste, setWaste] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [statsCard, setStatsCard] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, upiRes, avatarRes] = await Promise.all([
        api.get('/stats/overview'),
        api.get('/user/upi').catch(() => ({ data: {} })),
        api.get('/user/avatar').catch(() => ({ data: {} })),
      ]);
      setStats(statsRes.data);
      setUpiId(upiRes.data?.upi_id || '');
      if (avatarRes.data?.avatar) {
        setAvatar(avatarRes.data.avatar);
        await AsyncStorage.setItem('user_avatar', avatarRes.data.avatar);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const [wasteRes, shareRes, insRes] = await Promise.all([
        api.get('/waste-detector').catch(() => ({ data: null })),
        api.get('/share/stats-card').catch(() => ({ data: null })),
        api.get(`/insights/daily?lang=${lang}`).catch(() => ({ data: null })),
      ]);
      if (wasteRes.data) setWaste(wasteRes.data);
      if (shareRes.data) setStatsCard(shareRes.data);
      if (insRes.data) setInsights(insRes.data);
    } catch (e) { console.error(e); }
    finally { setInsightsLoading(false); }
  }, [lang]);

  useEffect(() => {
    // Load cached avatar immediately
    AsyncStorage.getItem('user_avatar').then(cached => {
      if (cached) setAvatar(cached);
    });
    loadData();
    loadInsights();
  }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); loadInsights(); };

  const handleLogout = () => {
    Alert.alert(t('logout', lang), t('logout_confirm', lang), [
      { text: t('cancel', lang), style: 'cancel' },
      { text: t('logout', lang), style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user_avatar');
        await logout();
        router.replace('/');
      }},
    ]);
  };

  const saveUpiId = async () => {
    if (!upiId.trim()) return;
    setUpiSaving(true);
    try {
      await api.post('/user/upi', { upi_id: upiId.trim() });
      Toast.show({ type: 'success', text1: 'Saved!', text2: 'UPI ID updated' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e.response?.data?.detail || 'Invalid UPI ID' });
    } finally { setUpiSaving(false); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64);
      await AsyncStorage.setItem('user_avatar', b64);
      try { await api.post('/user/avatar', { avatar: b64 }); Toast.show({ type: 'success', text1: 'Photo Updated!' }); }
      catch { Toast.show({ type: 'error', text1: 'Upload Failed' }); }
    }
  };

  const removeAvatar = () => {
    Alert.alert('Remove Photo?', 'Your profile photo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setAvatar('');
        await AsyncStorage.removeItem('user_avatar');
        try { await api.post('/user/avatar', { avatar: '' }); } catch {}
      }},
    ]);
  };

  const shareContent = (text: string, platform: string) => {
    const fullText = `${text}\n\n📲 Download MintU: ${APP_LINK}`;
    if (platform === 'whatsapp') {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(fullText)}`).catch(() => Share.share({ message: fullText }));
    } else {
      Share.share({ message: fullText });
    }
  };

  const moneyScore = insights?.money_score || user?.money_score || 50;
  const scoreColor = moneyScore >= 75 ? '#10B981' : moneyScore >= 50 ? '#F59E0B' : '#EF4444';
  const currentLang = LANGUAGES.find(l => l.code === lang);

  // === PROFILE TAB ===
  const renderProfileTab = () => (
    <ScrollView contentContainerStyle={st.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}>
      {/* Avatar + Name */}
      <View style={st.profileHero}>
        <TouchableOpacity onPress={pickAvatar} onLongPress={avatar ? removeAvatar : undefined} style={st.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={st.avatarImg} />
          ) : (
            <View style={st.avatarPlaceholder}>
              <Ionicons name="person" size={40} color={COLORS.accent.primary} />
            </View>
          )}
          <View style={st.cameraBadge}><Ionicons name="camera" size={12} color="#fff" /></View>
        </TouchableOpacity>
        <Text style={st.userName}>{user?.name || 'User'}</Text>
        <Text style={st.userPhone}>{user?.phone}</Text>
      </View>

      {/* Money Score Card */}
      <View style={[st.scoreCard, { borderColor: scoreColor + '30' }]}>
        <View style={[st.scoreRing, { borderColor: scoreColor }]}>
          <Text style={[st.scoreVal, { color: scoreColor }]}>{moneyScore}</Text>
          <Text style={st.scoreOf}>/100</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={st.scoreLabel}>Money Score</Text>
          <Text style={[st.scoreGrade, { color: scoreColor }]}>
            {moneyScore >= 75 ? 'Excellent! 🏆' : moneyScore >= 50 ? 'Good 💪' : 'Needs Work 📈'}
          </Text>
        </View>
      </View>

      {/* UPI Card */}
      <View style={st.upiCard}>
        <View style={st.upiHeader}>
          <Ionicons name="card" size={18} color="#6366F1" />
          <Text style={st.upiTitle}>UPI ID</Text>
        </View>
        <Text style={st.upiHint}>For instant split payments</Text>
        <View style={st.upiInputRow}>
          <TextInput style={st.upiInput} value={upiId} onChangeText={setUpiId} placeholder="yourname@okicici" placeholderTextColor={COLORS.text.muted} autoCapitalize="none" />
          <TouchableOpacity style={[st.upiSaveBtn, (!upiId.trim() || upiSaving) && { opacity: 0.5 }]} onPress={saveUpiId} disabled={!upiId.trim() || upiSaving}>
            {upiSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Grid */}
      {stats && (
        <View style={st.statsGrid}>
          {[
            { icon: 'arrow-down-circle', color: COLORS.accent.moneyIn, label: t('income', lang), value: `₹${stats.total_income?.toFixed(0) || 0}` },
            { icon: 'arrow-up-circle', color: COLORS.accent.moneyOut, label: t('expenses', lang), value: `₹${stats.total_expense?.toFixed(0) || 0}` },
            { icon: 'wallet', color: COLORS.accent.secondary, label: t('balance', lang), value: `₹${stats.balance?.toFixed(0) || 0}` },
            { icon: 'receipt', color: COLORS.accent.warning, label: t('transactions', lang), value: `${stats.transaction_count || 0}` },
          ].map((s, i) => (
            <View key={i} style={st.statItem}>
              <View style={[st.statIcon, { backgroundColor: s.color + '12' }]}>
                <Ionicons name={s.icon as any} size={22} color={s.color} />
              </View>
              <Text style={st.statValue}>{s.value}</Text>
              <Text style={st.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      {loading && <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginVertical: 24 }} />}
      <View style={{ height: 24 }} />
    </ScrollView>
  );

  // === INSIGHTS TAB ===
  const renderInsightsTab = () => {
    const pieData = Object.entries(stats?.category_breakdown || {}).map(([cat, amount]: [string, any]) => ({
      value: amount, color: CATEGORIES[cat]?.color || '#64748B', text: cat,
    }));
    const totalSpent = pieData.reduce((sum, d) => sum + d.value, 0);

    return (
      <ScrollView contentContainerStyle={st.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent.primary} />}>
        {insightsLoading ? (
          <ActivityIndicator size="large" color={COLORS.accent.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Waste Detector */}
            {waste && waste.category_waste?.length > 0 && (
              <View style={st.wasteCard}>
                <View style={st.wasteBadge}>
                  <Ionicons name="flame" size={14} color="#EF4444" />
                  <Text style={st.wasteBadgeText}>WASTE DETECTOR</Text>
                </View>
                {/* Overall trend */}
                {waste.overall_trend_pct !== undefined && waste.prev_month_total > 0 && (
                  <View style={[st.trendPill, { backgroundColor: waste.overall_trend_pct > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
                    <Ionicons name={waste.overall_trend_pct > 0 ? 'trending-up' : 'trending-down'} size={16} color={waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981'} />
                    <Text style={[st.trendText, { color: waste.overall_trend_pct > 0 ? '#EF4444' : '#10B981' }]}>
                      {Math.abs(waste.overall_trend_pct).toFixed(0)}% {waste.overall_trend_pct > 0 ? 'more' : 'less'} than last month
                    </Text>
                  </View>
                )}
                {waste.category_waste.slice(0, 3).map((w: any, i: number) => (
                  <View key={i} style={st.wasteItem}>
                    <Text style={st.wasteShock}>{w.shock_text}</Text>
                    {w.equivalences?.slice(0, 2).map((eq: any, j: number) => (
                      <Text key={j} style={st.wasteEq}>{eq.emoji} That's {eq.text}</Text>
                    ))}
                    {w.trend?.text ? <Text style={st.wasteTrend}>{w.trend.text}</Text> : null}
                    {w.peer_comparison?.text ? <Text style={st.wastePeer}>{w.peer_comparison.text}</Text> : null}
                  </View>
                ))}
                {waste.ai_recommendation ? (
                  <View style={st.aiRecCard}>
                    <Ionicons name="sparkles" size={14} color={COLORS.accent.primary} />
                    <Text style={st.aiRecText}>{waste.ai_recommendation}</Text>
                  </View>
                ) : null}
                {waste.comparison && <Text style={st.wasteCompare}>{waste.comparison.text}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity style={st.shareWaBtn} onPress={() => shareContent(waste.shareable_text, 'whatsapp')}>
                    <Ionicons name="logo-whatsapp" size={14} color="#fff" /><Text style={st.shareWaTxt}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.shareGenBtn} onPress={() => shareContent(waste.shareable_text, 'general')}>
                    <Ionicons name="share-social" size={14} color={COLORS.accent.primary} /><Text style={st.shareGenTxt}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Pie Chart */}
            {pieData.length > 0 && (
              <View style={st.card}>
                <Text style={st.cardTitle}>Expense Breakdown</Text>
                <View style={{ alignItems: 'center', marginVertical: SPACING.lg }}>
                  <PieChart data={pieData} donut radius={80} innerRadius={52} innerCircleColor={COLORS.bg.card}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text.primary }}>₹{totalSpent.toFixed(0)}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.text.muted }}>Total</Text>
                      </View>
                    )}
                  />
                </View>
                {pieData.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 10 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: COLORS.text.secondary }}>{item.text}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.primary }}>₹{item.value.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Stats Card */}
            {statsCard && (
              <View style={st.card}>
                <Text style={st.shareHeadline}>{statsCard.card_data?.headline}</Text>
                <Text style={st.shareSub}>{statsCard.card_data?.subtitle}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
                  {statsCard.card_data?.stats?.map((s: any, i: number) => (
                    <View key={i} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: s.color === 'green' ? '#10B981' : s.color === 'red' ? '#EF4444' : COLORS.accent.primary }}>{s.value}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.text.muted, marginTop: 4 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  <TouchableOpacity style={st.shareWaBtn} onPress={() => shareContent(statsCard.whatsapp_text, 'whatsapp')}>
                    <Ionicons name="logo-whatsapp" size={14} color="#fff" /><Text style={st.shareWaTxt}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.shareGenBtn} onPress={() => shareContent(statsCard.instagram_caption, 'general')}>
                    <Ionicons name="share-social" size={14} color={COLORS.accent.primary} /><Text style={st.shareGenTxt}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* AI Tips */}
            {insights?.recommendations?.length > 0 && (
              <View style={st.card}>
                <Text style={st.cardTitle}>Smart Tips</Text>
                {insights.recommendations.map((rec: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', marginTop: 10 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent.primary + '12', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.accent.primary }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: COLORS.text.secondary, lineHeight: 20 }}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  // === SETTINGS TAB ===
  const renderSettingsTab = () => (
    <ScrollView contentContainerStyle={st.tabContent}>
      {/* Language */}
      <TouchableOpacity testID="language-selector" style={[st.menuItem, { borderColor: '#8B5CF630' }]} onPress={() => setLangModalVisible(true)}>
        <View style={[st.menuIcon, { backgroundColor: '#8B5CF612' }]}>
          <Ionicons name="language" size={20} color="#8B5CF6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.menuText}>{t('language', lang)}</Text>
          <Text style={{ fontSize: 12, color: '#8B5CF6', marginTop: 1, fontWeight: '500' }}>{currentLang?.nativeName}</Text>
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
        <TouchableOpacity key={i} style={st.menuItem}>
          <View style={[st.menuIcon, { backgroundColor: item.color + '12' }]}>
            <Ionicons name={item.icon as any} size={20} color={item.color} />
          </View>
          <Text style={st.menuText}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity testID="logout-btn" style={st.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} />
        <Text style={st.logoutText}>{t('logout', lang)}</Text>
      </TouchableOpacity>

      <Text style={st.version}>{t('version', lang)} · {t('made_with_love', lang)}</Text>
    </ScrollView>
  );

  const TABS: { id: ProfileTab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'insights', label: 'Insights', icon: 'analytics' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <SafeAreaView style={st.container}>
      {/* Tab Switcher */}
      <View style={st.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} style={[st.tabBtn, activeTab === tab.id && st.tabActive]} onPress={() => setActiveTab(tab.id)}>
            <Ionicons name={(activeTab === tab.id ? tab.icon : tab.icon + '-outline') as any} size={18} color={activeTab === tab.id ? COLORS.accent.primary : COLORS.text.muted} />
            <Text style={[st.tabText, activeTab === tab.id && st.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === 'profile' && renderProfileTab()}
      {activeTab === 'insights' && renderInsightsTab()}
      {activeTab === 'settings' && renderSettingsTab()}

      {/* Language Modal */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={st.modalBg}>
          <View style={st.modalSheet}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>{t('language', lang)}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[st.langOption, lang === item.code && st.langOptionActive]}
                  onPress={() => { setLang(item.code); setLangModalVisible(false); }}
                >
                  <View><Text style={st.langNative}>{item.nativeName}</Text><Text style={st.langEn}>{item.name}</Text></View>
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

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg.primary },
  // Tab bar
  tabBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: RADIUS.full, backgroundColor: COLORS.bg.secondary },
  tabActive: { backgroundColor: COLORS.accent.primary + '10', borderWidth: 1, borderColor: COLORS.accent.primary + '25' },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text.muted },
  tabTextActive: { color: COLORS.accent.primary },
  tabContent: { padding: SPACING.lg },
  // Profile hero
  profileHero: { alignItems: 'center', marginBottom: SPACING.xl },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: COLORS.accent.primary + '25' },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.accent.primary + '10', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.accent.primary + '25' },
  cameraBadge: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.primary },
  userName: { fontSize: 22, fontWeight: '800', color: COLORS.text.primary },
  userPhone: { fontSize: 14, color: COLORS.text.muted, marginTop: 2 },
  // Score card
  scoreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 2 },
  scoreRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 5, justifyContent: 'center', alignItems: 'center' },
  scoreVal: { fontSize: 26, fontWeight: '900' },
  scoreOf: { fontSize: 11, color: COLORS.text.muted, marginTop: -3 },
  scoreLabel: { fontSize: 12, color: COLORS.text.muted },
  scoreGrade: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  // UPI
  upiCard: { backgroundColor: '#EEF2FF', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#C7D2FE' },
  upiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  upiTitle: { fontSize: 15, fontWeight: '700', color: '#4338CA' },
  upiHint: { fontSize: 11, color: '#6B7280', marginBottom: SPACING.sm },
  upiInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  upiInput: { flex: 1, backgroundColor: '#fff', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 11, fontSize: 14, color: COLORS.text.primary, borderWidth: 1, borderColor: '#C7D2FE' },
  upiSaveBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.lg },
  statItem: { width: '47%', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border.card, flexGrow: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary },
  statLabel: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  // Insights
  wasteCard: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA' },
  wasteBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  wasteBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444', letterSpacing: 0.8 },
  wasteItem: { marginBottom: SPACING.sm },
  wasteShock: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  wasteEq: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginLeft: 4 },
  wasteCompare: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 6 },
  wasteTrend: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 3 },
  wastePeer: { fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginTop: 2 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, marginBottom: SPACING.sm },
  trendText: { fontSize: 13, fontWeight: '600' },
  aiRecCard: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.accent.primary + '08', padding: 12, borderRadius: RADIUS.lg, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.accent.primary + '15' },
  aiRecText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.text.secondary, lineHeight: 19 },
  shareWaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  shareWaTxt: { fontSize: 12, fontWeight: '600', color: '#fff' },
  shareGenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent.primary + '10', paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  shareGenTxt: { fontSize: 12, fontWeight: '600', color: COLORS.accent.primary },
  card: { backgroundColor: COLORS.bg.card, borderRadius: RADIUS.card, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border.card },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: 4 },
  shareHeadline: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary, marginBottom: 4 },
  shareSub: { fontSize: 13, color: COLORS.text.muted, marginBottom: SPACING.md },
  // Settings
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg.card, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border.card },
  menuIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '10', borderRadius: RADIUS.full, paddingVertical: 16, marginTop: SPACING.xl },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.text.muted, marginTop: SPACING.xl, marginBottom: SPACING.xxxl },
  // Modal
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xxl, maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: SPACING.lg, opacity: 0.3 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xxl },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text.primary },
  langOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: 4 },
  langOptionActive: { backgroundColor: COLORS.accent.primary + '10' },
  langNative: { fontSize: 17, fontWeight: '600', color: COLORS.text.primary },
  langEn: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },
});
