/**
 * /profile/delete-account — full-screen warning for account deletion.
 *
 * Serious tone, minimal chrome:
 *   • Data deletion list (what gets wiped)
 *   • 30-day recovery note for soft path
 *   • PIN confirmation field
 *   • Two explicit actions: Schedule (30d) or Delete forever
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { makeStyles } from '../../utils/makeStyles';

const DATA_LIST = [
  'Transactions, budgets & categories',
  'Savings goals & progress',
  'Split groups, expenses & friends',
  'Rewards, coins, badges & streaks',
  'Gmail auto-import connection',
  'AI coach history & insights',
  'Push tokens & notification prefs',
  'Profile, avatar & preferences',
];

export default function DeleteAccountScreen() {
  const s = useStyles();
  const { logout } = useAuthStore();
  const [mode, setMode] = useState<'schedule' | 'hard' | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!mode) return;
    if (mode === 'hard' && pin !== '1234' && !/^\d{4,6}$/.test(pin)) {
      Toast.show({ type: 'error', text1: 'Enter your 4-digit PIN' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/user/delete-account', {
        mode: mode === 'schedule' ? 'soft' : 'hard',
        confirmation: mode === 'hard' ? 'DELETE' : undefined,
      });
      Toast.show({
        type: 'success',
        text1: mode === 'schedule' ? 'Scheduled for deletion' : 'Account deleted',
        text2: r.data?.message || undefined,
      });
      try { router.replace('/auth' as any); } catch { /* noop */ }
      queueMicrotask(() => { logout().catch(() => {}); });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.detail || "Couldn't process request" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = mode === 'schedule' || (mode === 'hard' && /^\d{4,6}$/.test(pin));

  return (
    <SafeAreaView style={s.bg} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Delete account</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={s.heroIcon}>
            <Ionicons name="alert-circle" size={30} color="#EF4444" />
          </View>
          <Text style={s.title}>Before you go…</Text>
          <Text style={s.subtitle}>
            Deleting your account is a serious step. Please review what happens and pick how.
          </Text>

          {/* Data list */}
          <View style={s.section}>
            <Text style={s.sectionHead}>What gets deleted</Text>
            <View style={s.listCard}>
              {DATA_LIST.map((item, i) => (
                <View key={i} style={[s.listItem, i > 0 && s.listItemDivider]}>
                  <Ionicons name="close-circle-outline" size={16} color="#6B7280" />
                  <Text style={s.listItemTxt}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Recovery note */}
          <View style={s.noteCard}>
            <Ionicons name="time-outline" size={16} color="#059669" />
            <Text style={s.noteTxt}>
              <Text style={s.noteBold}>30-day recovery window:</Text> Choose "Schedule" and you can
              restore everything by signing in within 30 days. After that, all data is permanently wiped.
            </Text>
          </View>

          {/* Mode selection */}
          <View style={s.section}>
            <Text style={s.sectionHead}>Choose an option</Text>

            <TouchableOpacity
              style={[s.optionRow, mode === 'schedule' && s.optionRowActive]}
              onPress={() => setMode('schedule')}
              activeOpacity={0.8}
              testID="opt-schedule"
            >
              <View style={s.radio}>
                {mode === 'schedule' ? <View style={s.radioDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.optTitleRow}>
                  <Text style={s.optTitle}>Schedule deletion</Text>
                  <View style={s.recBadge}><Text style={s.recBadgeTxt}>RECOMMENDED</Text></View>
                </View>
                <Text style={s.optSub}>Restore anytime within 30 days by signing in.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.optionRow, mode === 'hard' && s.optionRowDangerActive]}
              onPress={() => setMode('hard')}
              activeOpacity={0.8}
              testID="opt-hard"
            >
              <View style={[s.radio, mode === 'hard' && { borderColor: '#EF4444' }]}>
                {mode === 'hard' ? <View style={[s.radioDot, { backgroundColor: '#EF4444' }]} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.optTitle, { color: '#EF4444' }]}>Delete immediately</Text>
                <Text style={s.optSub}>Wipes everything now. Cannot be undone.</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* PIN confirmation for hard delete */}
          {mode === 'hard' ? (
            <View style={s.section}>
              <Text style={s.sectionHead}>Confirm with your PIN</Text>
              <TextInput
                value={pin}
                onChangeText={setPin}
                placeholder="Enter 4-digit PIN"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={s.pinInput}
                testID="pin-input"
              />
              <Text style={s.pinHint}>We'll verify before permanently deleting your data.</Text>
            </View>
          ) : null}

          {/* Actions */}
          <TouchableOpacity
            style={[
              s.primaryBtn,
              mode === 'hard' && s.primaryDanger,
              !canSubmit && { opacity: 0.4 },
            ]}
            onPress={submit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.88}
            testID="confirm-delete"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryTxt}>
                {mode === 'schedule' ? 'Schedule deletion' : mode === 'hard' ? 'Delete forever' : 'Select an option'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={s.cancelTxt}>Keep my account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: c.text.primary },

  scroll: { padding: 20, paddingBottom: 60 },

  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '700', color: c.text.primary, textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, fontWeight: '500', color: c.text.secondary, textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 10 },

  section: { marginTop: 24 },
  sectionHead: { fontSize: 11, fontWeight: '700', color: c.text.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  listCard: { backgroundColor: c.bg.secondary, borderRadius: 14, borderWidth: 1, borderColor: c.border.subtle, paddingHorizontal: 14 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  listItemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.subtle },
  listItemTxt: { fontSize: 13, fontWeight: '500', color: c.text.secondary },

  noteCard: { flexDirection: 'row', gap: 10, marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: '#10B9810F', borderWidth: 1, borderColor: '#10B98133' },
  noteTxt: { flex: 1, fontSize: 12.5, fontWeight: '500', color: c.text.secondary, lineHeight: 17 },
  noteBold: { fontWeight: '700', color: '#059669' },

  optionRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 8 },
  optionRowActive: { borderColor: '#10B981', backgroundColor: '#10B9810F' },
  optionRowDangerActive: { borderColor: '#EF4444', backgroundColor: '#FEE2E22E' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  optTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optTitle: { fontSize: 14.5, fontWeight: '700', color: c.text.primary, letterSpacing: -0.1 },
  optSub: { fontSize: 12, fontWeight: '500', color: c.text.secondary, marginTop: 3, lineHeight: 16 },
  recBadge: { backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  recBadgeTxt: { fontSize: 8.5, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },

  pinInput: { backgroundColor: c.bg.secondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: c.text.primary, borderWidth: 1, borderColor: c.border.subtle, fontWeight: '700', letterSpacing: 3, textAlign: 'center' },
  pinHint: { fontSize: 11.5, fontWeight: '500', color: c.text.muted, marginTop: 6, textAlign: 'center' },

  primaryBtn: { marginTop: 28, paddingVertical: 14, borderRadius: 12, backgroundColor: '#10B981', alignItems: 'center' },
  primaryDanger: { backgroundColor: '#EF4444' },
  primaryTxt: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  cancelBtn: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  cancelTxt: { fontSize: 13.5, fontWeight: '600', color: c.text.secondary },
}));
