import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  Modal, FlatList, TextInput, Image, RefreshControl, Linking,
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
import { COLORS, RADIUS, SPACING } from '../../utils/theme';
import Toast from 'react-native-toast-message';
import HelpSupport from '../../components/HelpSupport';
import AboutMintU from '../../components/AboutMintU';

const UPI_APPS = [
  { id: 'gpay', name: 'Google Pay', icon: 'logo-google', color: '#4285F4' },
  { id: 'phonepe', name: 'PhonePe', icon: 'phone-portrait', color: '#5F259F' },
  { id: 'paytm', name: 'Paytm', icon: 'wallet', color: '#00BAF2' },
  { id: 'bhim', name: 'BHIM UPI', icon: 'shield-checkmark', color: '#00695C' },
];

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiExpanded, setUpiExpanded] = useState(false);
  const [avatar, setAvatar] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [upiRes, avatarRes] = await Promise.all([
        api.get('/user/upi').catch(() => ({ data: {} })),
        api.get('/user/avatar').catch(() => ({ data: {} })),
      ]);
      setUpiId(upiRes.data?.upi_id || '');
      if (avatarRes.data?.avatar) { setAvatar(avatarRes.data.avatar); await AsyncStorage.setItem('user_avatar', avatarRes.data.avatar); }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { AsyncStorage.getItem('user_avatar').then(c => { if (c) setAvatar(c); }); loadData(); }, []);

  const handleLogout = () => Alert.alert(t('logout', lang), t('logout_confirm', lang), [
    { text: t('cancel', lang), style: 'cancel' },
    { text: t('logout', lang), style: 'destructive', onPress: async () => { await AsyncStorage.removeItem('user_avatar'); await logout(); router.replace('/'); } },
  ]);

  const updateName = async () => {
    if (!editName.trim()) return;
    try { await api.put('/user/profile', { name: editName.trim() }); Toast.show({ type: 'success', text1: 'Name Updated!' }); setEditNameVisible(false); } catch { Toast.show({ type: 'error', text1: 'Error' }); }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatar(b64); await AsyncStorage.setItem('user_avatar', b64);
      try { await api.post('/user/avatar', { avatar: b64 }); Toast.show({ type: 'success', text1: 'Photo Updated!' }); } catch {}
    }
  };

  const removeAvatar = () => Alert.alert('Remove Photo?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { setAvatar(''); await AsyncStorage.removeItem('user_avatar'); try { await api.post('/user/avatar', { avatar: '' }); } catch {} } }]);

  const currentLang = LANGUAGES.find(l => l.code === lang);

  return (
    <SafeAreaView style={s.bg}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.accent.primary} />}>
        {/* ═══ PROFILE CARD ═══ */}
        <View style={s.profileCard}>
          <TouchableOpacity onPress={pickAvatar} onLongPress={avatar ? removeAvatar : undefined}>
            {avatar ? <Image source={{ uri: avatar }} style={s.avatar} /> : (
              <View style={s.avatarPlace}><Ionicons name="person" size={32} color={COLORS.accent.primary} /></View>
            )}
            <View style={s.camBadge}><Ionicons name="camera" size={10} color="#fff" /></View>
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <TouchableOpacity onPress={() => { setEditName(user?.name || ''); setEditNameVisible(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.name}>{user?.name || 'User'}</Text>
              <Ionicons name="create-outline" size={14} color={COLORS.accent.primary} />
            </TouchableOpacity>
            <Text style={s.phone}>{user?.phone}</Text>
          </View>
        </View>

        {/* ═══ PAYMENT METHODS (Emergent-style) ═══ */}
        <View style={s.payCard}>
          <Text style={s.payTitle}>Payment Options</Text>

          {/* Recommended */}
          {upiId ? (
            <View style={s.recSection}>
              <Text style={s.recLabel}>Recommended</Text>
              {UPI_APPS.slice(0, 3).map((app, i) => (
                <TouchableOpacity key={i} style={s.recRow}>
                  <View style={[s.recIcon, { backgroundColor: app.color + '15' }]}><Ionicons name={app.icon as any} size={18} color={app.color} /></View>
                  <Text style={s.recName}>UPI - {app.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* All Payment Options */}
          <Text style={s.allLabel}>All Payment Options</Text>

          {/* UPI Section */}
          <TouchableOpacity style={s.optRow} onPress={() => setUpiExpanded(!upiExpanded)}>
            <Ionicons name="flash" size={18} color="#6366F1" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.optName}>UPI</Text>
                {UPI_APPS.map((a, i) => <View key={i} style={[s.miniIcon, { backgroundColor: a.color + '15' }]}><Ionicons name={a.icon as any} size={10} color={a.color} /></View>)}
              </View>
              <Text style={s.optOffer}>4 Options</Text>
            </View>
            <Ionicons name={upiExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
          {upiExpanded && (
            <View style={s.subGrid}>
              {UPI_APPS.map((app, i) => (
                <TouchableOpacity key={i} style={s.subCard}>
                  <Ionicons name={app.icon as any} size={20} color={app.color} />
                  <Text style={s.subName}>{app.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Cards */}
          <TouchableOpacity style={s.optRow}>
            <Ionicons name="card" size={18} color="#E65100" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.optName}>Cards</Text>
                <Text style={{ fontSize: 9, color: COLORS.text.muted }}>VISA  MC  RuPay</Text>
              </View>
              <Text style={s.optOffer}>3 Offers</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>

          {/* Netbanking */}
          <TouchableOpacity style={s.optRow}>
            <Ionicons name="business" size={18} color="#059669" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.optName}>Netbanking</Text>
              <Text style={s.optOffer}>₹850 instant discount</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>

          {/* Wallet */}
          <TouchableOpacity style={[s.optRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="wallet" size={18} color="#8B5CF6" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.optName}>Wallet</Text>
              <Text style={s.optOffer}>₹850 instant discount</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
        </View>

        {/* ═══ SETTINGS ═══ */}
        <Text style={s.secTitle}>Settings</Text>
        <TouchableOpacity style={s.menuItem} onPress={() => setLangModalVisible(true)}>
          <Ionicons name="language" size={20} color="#8B5CF6" />
          <View style={{ flex: 1, marginLeft: 12 }}><Text style={s.menuText}>{t('language', lang)}</Text><Text style={{ fontSize: 11, color: '#8B5CF6' }}>{currentLang?.nativeName}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.menuItem}><Ionicons name="notifications-outline" size={20} color={COLORS.accent.primary} /><Text style={[s.menuText, { marginLeft: 12 }]}>{t('notifications', lang)}</Text><Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} /></TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setPrivacyVisible(true)}><Ionicons name="shield-checkmark-outline" size={20} color={COLORS.accent.secondary} /><Text style={[s.menuText, { marginLeft: 12 }]}>Privacy & Security</Text><Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} /></TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setHelpVisible(true)}><Ionicons name="help-circle-outline" size={20} color={COLORS.accent.warning} /><Text style={[s.menuText, { marginLeft: 12 }]}>{t('help_support', lang)}</Text><Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} /></TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => setAboutVisible(true)}><Ionicons name="information-circle-outline" size={20} color="#6366F1" /><Text style={[s.menuText, { marginLeft: 12 }]}>About MintU</Text><Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} /></TouchableOpacity>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color={COLORS.accent.moneyOut} /><Text style={s.logoutText}>{t('logout', lang)}</Text></TouchableOpacity>
        <Text style={s.version}>v1.0.0 · Made with ❤️ in India</Text>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Language Modal */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={s.mBg}><View style={s.sheet}><View style={s.handle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><Text style={s.sheetTitle}>{t('language', lang)}</Text><TouchableOpacity onPress={() => setLangModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity></View>
          <FlatList data={LANGUAGES} keyExtractor={i => i.code} renderItem={({ item }) => (
            <TouchableOpacity style={[s.langOpt, lang === item.code && s.langOn]} onPress={() => { setLang(item.code); setLangModalVisible(false); }}>
              <View><Text style={s.langNative}>{item.nativeName}</Text><Text style={s.langEn}>{item.name}</Text></View>
              {lang === item.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent.primary} />}
            </TouchableOpacity>
          )} />
        </View></View>
      </Modal>

      {/* Edit Name */}
      <Modal visible={editNameVisible} animationType="fade" transparent>
        <View style={s.mBg}><View style={[s.sheet, { maxHeight: 260 }]}><View style={s.handle} />
          <Text style={s.sheetTitle}>Edit Name</Text>
          <TextInput style={s.editInput} value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor={COLORS.text.muted} autoFocus />
          <TouchableOpacity style={s.saveBtn} onPress={updateName}><Text style={s.saveBtnT}>Save</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setEditNameVisible(false)} style={{ paddingVertical: 10, alignItems: 'center' }}><Text style={{ color: COLORS.text.muted }}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={helpVisible} animationType="slide"><HelpSupport onClose={() => setHelpVisible(false)} /></Modal>
      <Modal visible={aboutVisible} animationType="slide"><AboutMintU onClose={() => setAboutVisible(false)} /></Modal>

      {/* Privacy */}
      <Modal visible={privacyVisible} animationType="slide">
        <SafeAreaView style={s.bg}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle }}><Text style={s.sheetTitle}>Privacy & Security</Text><TouchableOpacity onPress={() => setPrivacyVisible(false)}><Ionicons name="close" size={24} color={COLORS.text.primary} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {[
              { icon: 'shield-checkmark', color: '#10B981', title: 'Data Encryption', desc: 'AES-256 encryption at rest, TLS 1.3 in transit. Passwords hashed with bcrypt.' },
              { icon: 'lock-closed', color: '#6366F1', title: 'Authentication', desc: 'Phone OTP verification, JWT tokens with 30-day expiry, session management.' },
              { icon: 'eye-off', color: '#E65100', title: 'Data Privacy', desc: 'We do NOT sell or share your data. RBI & IT Act 2000 compliant. India-only servers.' },
              { icon: 'server', color: '#059669', title: 'Data Storage', desc: 'Encrypted servers in India per RBI data localization. Regular backups. Request deletion anytime.' },
              { icon: 'finger-print', color: '#D32F2F', title: 'Access Control', desc: 'RBAC for employees. Rate limiting (1000 req/min). All access logged and audited.' },
              { icon: 'document-text', color: COLORS.accent.secondary, title: 'Your Rights', desc: 'Export all data, request deletion, opt out of analytics. DPO: dpo@mintu.app (48hr response).' },
            ].map((c, i) => (
              <View key={i} style={s.privCard}><Ionicons name={c.icon as any} size={20} color={c.color} /><Text style={s.privTitle}>{c.title}</Text><Text style={s.privDesc}>{c.desc}</Text></View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg.primary },
  scroll: { padding: 16 },
  // Profile Card
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', shadowColor: '#2E1F1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: COLORS.accent.primary + '25' },
  avatarPlace: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.accent.primary + '10', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.accent.primary + '25' },
  camBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg.primary },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary },
  phone: { fontSize: 13, color: COLORS.text.muted, marginTop: 2 },
  // Payment Card
  payCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', shadowColor: '#2E1F1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  payTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text.primary, marginBottom: 14 },
  recSection: { marginBottom: 14 },
  recLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8 },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  recIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  recName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text.primary },
  allLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.muted, marginBottom: 8, marginTop: 4 },
  optRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border.subtle },
  optName: { fontSize: 14, fontWeight: '600', color: COLORS.text.primary },
  optOffer: { fontSize: 11, fontWeight: '600', color: COLORS.accent.moneyIn, marginTop: 2 },
  miniIcon: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  subCard: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg.primary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border.subtle, flexGrow: 1 },
  subName: { fontSize: 13, fontWeight: '500', color: COLORS.text.primary },
  // Settings
  secTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.muted, marginTop: 8, marginBottom: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(238,221,204,0.5)' },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text.primary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.accent.moneyOut + '10', borderRadius: 999, paddingVertical: 16, marginTop: 16 },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.accent.moneyOut },
  version: { textAlign: 'center', fontSize: 11, color: COLORS.text.muted, marginTop: 12 },
  // Modals
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.text.muted, alignSelf: 'center', marginBottom: 16, opacity: 0.3 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text.primary },
  editInput: { backgroundColor: COLORS.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border.subtle, marginTop: 16, marginBottom: 16 },
  saveBtn: { backgroundColor: COLORS.accent.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveBtnT: { fontSize: 16, fontWeight: '700', color: '#fff' },
  langOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 2 },
  langOn: { backgroundColor: COLORS.accent.primary + '10' },
  langNative: { fontSize: 16, fontWeight: '600', color: COLORS.text.primary },
  langEn: { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  privCard: { backgroundColor: COLORS.bg.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border.card },
  privTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary, marginTop: 8 },
  privDesc: { fontSize: 13, color: COLORS.text.secondary, lineHeight: 20, marginTop: 4 },
});
