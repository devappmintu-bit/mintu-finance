/**
 * DeleteAccountSection — expandable danger-zone panel.
 *
 * Offers TWO deletion modes per user's design ask:
 *   • Soft (recoverable, 30-day window) — default recommended
 *   • Hard (immediate, irreversible) — requires typing "DELETE" to confirm
 *
 * Hard mode wipes every document referencing the user across 25+ collections
 * (transactions, budgets, splits, rewards, Gmail tokens, sessions, etc.).
 *
 * Backend: POST /api/user/delete-account { mode, confirmation }
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator,
  Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../utils/theme';

type Mode = 'soft' | 'hard';

export default function DeleteAccountSection() {
  const [expanded, setExpanded] = useState(false);
  const [modalMode, setModalMode] = useState<Mode | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { logout } = useAuthStore();

  const submit = async () => {
    if (!modalMode) return;
    if (modalMode === 'hard' && confirmation !== 'DELETE') {
      Toast.show({ type: 'error', text1: 'Type DELETE to confirm' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/user/delete-account', { mode: modalMode, confirmation });
      Toast.show({ type: 'success', text1: 'Account ' + (modalMode === 'soft' ? 'scheduled for deletion' : 'deleted'), text2: r.data?.message });
      setModalMode(null);
      setConfirmation('');
      // Wipe client session
      await logout();
      setTimeout(() => router.replace('/auth' as any), 300);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || 'Couldn\'t delete account' });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOpen = (mode: Mode) => {
    if (mode === 'soft') {
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && window.confirm('Schedule account for deletion?\n\nYou can log back in within 30 days to restore.')) {
          setModalMode(mode);
          setTimeout(submit, 50);
        }
        return;
      }
      Alert.alert(
        'Schedule account deletion?',
        'You can log back in within 30 days to restore. After that, all data is permanently wiped.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Schedule', style: 'destructive', onPress: () => { setModalMode(mode); setTimeout(submit, 50); } },
        ],
      );
      return;
    }
    setModalMode('hard');
    setConfirmation('');
  };

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.75} testID="danger-header">
        <View style={s.iconBox}><Ionicons name="warning" size={20} color={COLORS.state.danger} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Delete account</Text>
          <Text style={s.sub}>Soft (30-day recovery) or hard (immediate, irreversible)</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {/* Soft option */}
          <TouchableOpacity style={s.optionCard} onPress={() => confirmOpen('soft')} activeOpacity={0.85} testID="del-soft-btn">
            <View style={[s.optIcon, { backgroundColor: '#F59E0B22' }]}>
              <Ionicons name="time-outline" size={22} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.optTitle}>Schedule deletion · 30 days</Text>
              <Text style={s.optSub}>Recoverable if you log in within the window. Data kept read-only.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
          </TouchableOpacity>

          {/* Hard option */}
          <TouchableOpacity style={s.optionCard} onPress={() => confirmOpen('hard')} activeOpacity={0.85} testID="del-hard-btn">
            <View style={[s.optIcon, { backgroundColor: COLORS.state.dangerBg }]}>
              <Ionicons name="nuclear" size={22} color={COLORS.state.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.optTitle, { color: COLORS.state.danger }]}>Delete immediately · Irreversible</Text>
              <Text style={s.optSub}>Wipes all transactions, budgets, splits, rewards, Gmail & login tokens. Cannot be undone.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.state.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* HARD delete confirm modal */}
      <Modal visible={modalMode === 'hard'} transparent animationType="slide" onRequestClose={() => setModalMode(null)}>
        <View style={m.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={m.sheet}>
              <View style={m.grip} />
              <View style={m.iconBig}><Ionicons name="warning" size={30} color={COLORS.state.danger} /></View>
              <Text style={m.title}>Delete account permanently?</Text>
              <Text style={m.body}>
                This will immediately wipe every trace of your data across MintU:
                transactions, budgets, splits, rewards, vouchers, Gmail integrations, push tokens,
                AI chat history, and your user profile. This cannot be undone.
              </Text>
              <Text style={m.label}>Type DELETE to confirm</Text>
              <TextInput
                value={confirmation}
                onChangeText={setConfirmation}
                placeholder="DELETE"
                placeholderTextColor={COLORS.text.muted}
                autoCapitalize="characters"
                style={m.input}
                testID="del-hard-confirm"
              />
              <View style={m.actions}>
                <TouchableOpacity style={[m.btn, m.btnGhost]} onPress={() => setModalMode(null)} activeOpacity={0.85}>
                  <Text style={[m.btnT, { color: COLORS.text.primary }]}>Keep my account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.btn, m.btnDanger, confirmation !== 'DELETE' && { opacity: 0.4 }]}
                  onPress={submit}
                  disabled={submitting || confirmation !== 'DELETE'}
                  activeOpacity={0.85}
                  testID="del-hard-submit"
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={[m.btnT, { color: '#fff' }]}>Delete forever</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF7F6', borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.state.danger + '33' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.state.dangerBg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text.primary },
  sub: { fontSize: 11.5, color: COLORS.text.muted, marginTop: 2 },
  body: { marginTop: 12, gap: 8 },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border.subtle },
  optIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.text.primary },
  optSub: { fontSize: 11, color: COLORS.text.secondary, marginTop: 3, lineHeight: 15 },
});

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(46,31,26,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border.subtle, alignSelf: 'center', marginBottom: 12 },
  iconBig: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.state.dangerBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.state.danger, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 12.5, color: COLORS.text.secondary, lineHeight: 18, textAlign: 'center', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.text.primary, borderWidth: 1.5, borderColor: COLORS.state.danger + '66', letterSpacing: 2, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: COLORS.bg.primary, borderWidth: 1, borderColor: COLORS.border.subtle },
  btnDanger: { backgroundColor: COLORS.state.danger },
  btnT: { fontSize: 14, fontWeight: '800' },
});
