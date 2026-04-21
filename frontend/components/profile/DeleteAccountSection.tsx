/**
 * DeleteAccountSection — pill button (matches logout button style) + bottom-sheet options.
 *
 * Tapping the pill opens a sheet with TWO deletion modes:
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
  View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator,
  Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import TapTile from '../ui/TapTile';

type Mode = 'soft' | 'hard';

export default function DeleteAccountSection() {
  const s = useSStyles();
  const m = useMStyles();
  const [sheetOpen, setSheetOpen] = useState(false);
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
      setSheetOpen(false);
      setConfirmation('');
      // Navigate BEFORE clearing auth state — this keeps the Root Layout mounted
      // while the router transition fires (prevents "Attempted to navigate before
      // mounting the Root Layout component" uncaught error).
      try { router.replace('/auth' as any); } catch { /* swallow if already unmounted */ }
      // Defer logout to next microtask so navigation commits first.
      queueMicrotask(() => { logout().catch(() => {}); });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || 'Couldn\'t delete account' });
    } finally {
      setSubmitting(false);
    }
  };

  const onPickMode = (mode: Mode) => {
    if (mode === 'soft') {
      if (Platform.OS === 'web') {
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
    <>
      {/* Pill button — same visual language as the logout button */}
      <TapTile style={s.pillBtn} onPress={() => setSheetOpen(true)} feedback="medium" testID="danger-header">
        <Ionicons name="trash-outline" size={20} color={COLORS.state.danger} />
        <Text style={s.pillText}>Delete account</Text>
      </TapTile>

      {/* Options sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={() => setSheetOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%' }}>
            <View style={m.sheet}>
              <View style={m.grip} />
              <View style={m.iconBig}><Ionicons name="warning" size={26} color={COLORS.state.danger} /></View>
              <Text style={m.title}>Delete account</Text>
              <Text style={m.sub}>Choose how you&apos;d like to proceed. Both actions sign you out.</Text>

              <TouchableOpacity style={s.optionCard} onPress={() => onPickMode('soft')} activeOpacity={0.85} testID="del-soft-btn">
                <View style={[s.optIcon, { backgroundColor: '#F59E0B22' }]}>
                  <Ionicons name="time-outline" size={22} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.optTitle}>Schedule deletion · 30 days</Text>
                  <Text style={s.optSub}>Recoverable if you log in within the window. Data kept read-only.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>

              <TouchableOpacity style={s.optionCard} onPress={() => onPickMode('hard')} activeOpacity={0.85} testID="del-hard-btn">
                <View style={[s.optIcon, { backgroundColor: COLORS.state.dangerBg }]}>
                  <Ionicons name="nuclear" size={22} color={COLORS.state.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.optTitle, { color: COLORS.state.danger }]}>Delete immediately · Irreversible</Text>
                  <Text style={s.optSub}>Wipes all transactions, budgets, splits, rewards, Gmail & login tokens. Cannot be undone.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.state.danger} />
              </TouchableOpacity>

              <TouchableOpacity style={m.cancelBtn} onPress={() => setSheetOpen(false)} activeOpacity={0.8}>
                <Text style={m.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
    </>
  );
}

const useSStyles = makeStyles((c) => ({
  // Matches the `logoutBtn` visual language — pill row with danger tint
  pillBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.state.danger + '12',
    borderRadius: 999, paddingVertical: 16, marginTop: 10,
    borderWidth: 1, borderColor: c.state.danger + '2E',
  },
  pillText: { fontSize: 16, fontWeight: '600', color: c.state.danger },

  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle, marginTop: 8 },
  optIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optTitle: { fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  optSub: { fontSize: 11, color: c.text.secondary, marginTop: 3, lineHeight: 15 },
}));

const useMStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 12 },
  iconBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.state.dangerBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '900', color: c.text.primary, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 12.5, color: c.text.secondary, lineHeight: 17, textAlign: 'center', marginBottom: 6 },
  body: { fontSize: 12.5, color: c.text.secondary, lineHeight: 18, textAlign: 'center', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 },
  input: { backgroundColor: c.bg.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: c.text.primary, borderWidth: 1.5, borderColor: c.state.danger + '66', letterSpacing: 2, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  btnDanger: { backgroundColor: c.state.danger },
  btnT: { fontSize: 14, fontWeight: '800' },
  cancelBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 999, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: c.text.secondary },
}));
