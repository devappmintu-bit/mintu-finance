/**
 * DeleteAccountTrigger — exposes a headless trigger for opening the
 * delete account flow. Renders ONLY the modals — no visible button.
 *
 * The parent decides what the visible trigger looks like (for the
 * revamped profile we use a SettingsRow so it blends in with logout).
 *
 * Usage:
 *   const triggerRef = useRef<DeleteAccountTriggerRef>(null);
 *   <DeleteAccountTrigger ref={triggerRef} />
 *   <SettingsRow ... onPress={() => triggerRef.current?.open()} />
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator,
  Alert, Platform, KeyboardAvoidingView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Mode = 'soft' | 'hard';

export type DeleteAccountTriggerRef = {
  open: () => void;
};

const DeleteAccountTrigger = forwardRef<DeleteAccountTriggerRef>((_props, ref) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalMode, setModalMode] = useState<Mode | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { logout } = useAuthStore();
  const c = useAppColors();
  const s = useStyles();

  useImperativeHandle(ref, () => ({
    open: () => setSheetOpen(true),
  }), []);

  const submit = async () => {
    if (!modalMode) return;
    if (modalMode === 'hard' && confirmation !== 'DELETE') {
      Toast.show({ type: 'error', text1: 'Type DELETE to confirm' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/user/delete-account', { mode: modalMode, confirmation });
      Toast.show({
        type: 'success',
        text1: 'Account ' + (modalMode === 'soft' ? 'scheduled for deletion' : 'deleted'),
        text2: r.data?.message,
      });
      setModalMode(null);
      setSheetOpen(false);
      setConfirmation('');
      try { router.replace('/auth' as any); } catch { /* noop */ }
      queueMicrotask(() => { logout().catch(() => {}); });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || "Couldn't delete account" });
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
      {/* Options sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setSheetOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%' }}>
            <View style={s.sheet}>
              <View style={s.grip} />
              <View style={s.iconBig}>
                <Ionicons name="warning" size={26} color="#EF4444" />
              </View>
              <Text style={s.title}>Leave MintU?</Text>
              <Text style={s.sub}>Pick the option that works for you.</Text>

              {/* Schedule — primary recommended */}
              <TouchableOpacity style={s.primaryOption} onPress={() => onPickMode('soft')} activeOpacity={0.88} testID="del-soft-btn">
                <View style={s.primaryHeader}>
                  <View style={s.primaryBadge}>
                    <Text style={s.primaryBadgeTxt}>RECOMMENDED</Text>
                  </View>
                  <View style={s.primaryDays}>
                    <Text style={s.primaryDaysTxt}>30 DAYS</Text>
                  </View>
                </View>
                <View style={s.primaryBody}>
                  <Ionicons name="shield-checkmark" size={22} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.primaryTitle}>Schedule deletion</Text>
                    <Text style={s.primarySub}>Log back in within 30 days to restore — no data lost.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#059669" />
                </View>
              </TouchableOpacity>

              {/* Danger zone */}
              <View style={s.dangerZone}>
                <View style={s.dangerZoneHeader}>
                  <Ionicons name="alert-circle" size={13} color="#EF4444" />
                  <Text style={s.dangerZoneLabel}>DANGER ZONE — IRREVERSIBLE</Text>
                </View>
                <TouchableOpacity style={s.dangerRow} onPress={() => onPickMode('hard')} activeOpacity={0.8} testID="del-hard-btn">
                  <Ionicons name="nuclear" size={16} color="#EF4444" />
                  <Text style={s.dangerRowTxt}>Delete immediately · wipe all data</Text>
                  <Ionicons name="chevron-forward" size={14} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheetOpen(false)} activeOpacity={0.8}>
                <Text style={s.cancelText}>Keep my account</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Hard delete confirm modal */}
      <Modal visible={modalMode === 'hard'} transparent animationType="slide" onRequestClose={() => setModalMode(null)}>
        <View style={s.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={s.sheet}>
              <View style={s.grip} />
              <View style={[s.iconBig, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="nuclear" size={32} color="#EF4444" />
              </View>
              <View style={s.irreversibleBadge}>
                <Ionicons name="alert-circle" size={12} color="#EF4444" />
                <Text style={s.irreversibleTxt}>IRREVERSIBLE ACTION</Text>
              </View>
              <Text style={s.title}>Delete account permanently?</Text>
              <Text style={s.body}>
                This wipes every trace of your data: transactions, budgets, splits, rewards, Gmail, push tokens, AI history.{' '}
                <Text style={{ fontWeight: '900', color: '#EF4444' }}>Cannot be undone.</Text>
              </Text>
              <Text style={s.typeHint}>Type <Text style={s.typeHintBold}>DELETE</Text> (all caps) to confirm</Text>
              <TextInput
                value={confirmation}
                onChangeText={setConfirmation}
                placeholder="DELETE"
                placeholderTextColor={c.text.muted}
                autoCapitalize="characters"
                style={[s.input, s.dangerInput, confirmation === 'DELETE' && s.dangerInputValid]}
                testID="del-hard-confirm"
              />
              <View style={s.actions}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setModalMode(null)} activeOpacity={0.85}>
                  <Text style={[s.btnT, { color: c.text.primary }]}>Keep my account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnDanger, confirmation !== 'DELETE' && { opacity: 0.4 }]}
                  onPress={submit}
                  disabled={submitting || confirmation !== 'DELETE'}
                  activeOpacity={0.85}
                  testID="del-hard-submit"
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnT, { color: '#fff' }]}>Delete forever</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
});

DeleteAccountTrigger.displayName = 'DeleteAccountTrigger';
export default DeleteAccountTrigger;

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.gray[200], alignSelf: 'center', marginBottom: 12 },
  iconBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '900', color: c.text.primary, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 12.5, color: c.text.muted, lineHeight: 17, textAlign: 'center', marginBottom: 6 },
  body: { fontSize: 12.5, color: c.text.muted, lineHeight: 18, textAlign: 'center', marginBottom: 14 },
  input: { backgroundColor: c.gray[50], borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: c.text.primary, borderWidth: 1.5, borderColor: '#FCA5A5', letterSpacing: 2, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.gray[200] },
  btnDanger: { backgroundColor: c.state.danger },
  btnT: { fontSize: 14, fontWeight: '800' },
  cancelBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 999, backgroundColor: c.gray[50], borderWidth: 1, borderColor: c.gray[200], alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: c.text.muted },

  primaryOption: { marginTop: 12, borderRadius: 18, backgroundColor: '#F0FDF4', borderWidth: 2, borderColor: '#86EFAC', padding: 14 },
  primaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  primaryBadge: { backgroundColor: c.state.success, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  primaryBadgeTxt: { fontSize: 9.5, fontWeight: '900', color: c.bg.elevated, letterSpacing: 0.7 },
  primaryDays: { backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  primaryDaysTxt: { fontSize: 10, fontWeight: '900', color: '#065F46', letterSpacing: 1 },
  primaryBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryTitle: { fontSize: 15, fontWeight: '900', color: '#065F46', letterSpacing: -0.2 },
  primarySub: { fontSize: 11.5, color: '#047857', marginTop: 2, lineHeight: 15.5, fontWeight: '600' },

  dangerZone: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.gray[200] },
  dangerZoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  dangerZoneLabel: { fontSize: 9.5, fontWeight: '900', color: c.state.danger, letterSpacing: 0.8 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  dangerRowTxt: { flex: 1, fontSize: 12.5, fontWeight: '800', color: c.state.danger },

  irreversibleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginBottom: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  irreversibleTxt: { fontSize: 10, fontWeight: '900', color: c.state.danger, letterSpacing: 1 },
  typeHint: { fontSize: 12.5, color: c.text.muted, marginTop: 6, marginBottom: 6, fontWeight: '600', textAlign: 'center' },
  typeHintBold: { fontWeight: '900', color: c.state.danger, letterSpacing: 1 },
  dangerInput: { borderColor: '#FCA5A5', borderWidth: 1.5, fontWeight: '900', letterSpacing: 3, fontSize: 16, textAlign: 'center' },
  dangerInputValid: { borderColor: c.state.danger, backgroundColor: '#FEE2E2' },
}));
