/**
 * New Group — REBUILD R100A.
 *
 * Replaces the 869-LOC `add-member.tsx` (which was actually a member-management
 * AND group-creation AND invite AND chat-prefill mega-screen).
 *
 * Job: collect a group name + 1..N named contacts (name required, phone
 * required so the existing backend `pending_invites` flow still works).
 *
 * No login required for friends — phone is just so the backend can match
 * them when they sign up later. We say so explicitly under the input.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import api from '../../utils/api';
import { BR_COLORS, BR_FONT } from '../../utils/brutalist';

const {
  ink:    INK,
  paper:  PAPER,
  accent: ACCENT,
  line:   LINE,
  muted:  MUTED,
  negative: DANGER,
} = BR_COLORS;

type DraftMember = { id: string; name: string; phone: string };

function normalisePhone(p: string): string {
  return p.replace(/[^\d]/g, '').slice(-10);
}

export default function NewGroup() {
  const [name, setName] = useState('');
  const [members, setMembers] = useState<DraftMember[]>([
    { id: 'm0', name: '', phone: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validMembers = useMemo(
    () =>
      members.filter(
        (m) => m.name.trim().length > 0 && normalisePhone(m.phone).length === 10
      ),
    [members]
  );

  const canSubmit =
    name.trim().length >= 1 && validMembers.length >= 1 && !submitting;

  const updateMember = (id: string, patch: Partial<DraftMember>) => {
    setMembers((arr) => arr.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  const removeMember = (id: string) => {
    setMembers((arr) => (arr.length === 1 ? arr : arr.filter((m) => m.id !== id)));
  };
  const addRow = () => {
    setMembers((arr) => [...arr, { id: `m${Date.now()}`, name: '', phone: '' }]);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        members: validMembers.map((m) => normalisePhone(m.phone)),
      };
      const r = await api.post('/split/groups', payload);
      const groupId = r?.data?.id;
      if (groupId) {
        // Replace so the user doesn't bounce back to the create form.
        router.replace(`/split/${groupId}` as any);
      } else {
        router.replace('/split');
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Could not create group. Try again.';
      setError(typeof msg === 'string' ? msg : 'Could not create group. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={st.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={INK} />
        </Pressable>
        <Text style={st.headerTitle}>NEW GROUP</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={st.section}>
            <Text style={st.sectionLabel}>GROUP NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Goa trip · Roommates · Office lunch"
              placeholderTextColor={MUTED}
              style={st.input}
              maxLength={60}
              autoCapitalize="words"
              autoFocus
            />
          </View>

          <View style={st.section}>
            <View style={st.sectionHead}>
              <Text style={st.sectionLabel}>WHO'S IN?</Text>
              <Text style={st.sectionHint}>Add friends — no app needed</Text>
            </View>

            {members.map((m, idx) => (
              <View key={m.id} style={st.memberRow}>
                <View style={st.memberInputs}>
                  <TextInput
                    value={m.name}
                    onChangeText={(v) => updateMember(m.id, { name: v })}
                    placeholder={`Friend ${idx + 1} name`}
                    placeholderTextColor={MUTED}
                    style={st.memberName}
                    autoCapitalize="words"
                  />
                  <TextInput
                    value={m.phone}
                    onChangeText={(v) => updateMember(m.id, { phone: v })}
                    placeholder="10-digit phone"
                    placeholderTextColor={MUTED}
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={st.memberPhone}
                  />
                </View>
                {members.length > 1 && (
                  <Pressable
                    onPress={() => removeMember(m.id)}
                    hitSlop={10}
                    style={st.removeBtn}
                  >
                    <Ionicons name="close" size={18} color={MUTED} />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable onPress={addRow} style={st.addRowBtn}>
              <Ionicons name="add" size={18} color={INK} />
              <Text style={st.addRowText}>Add another friend</Text>
            </Pressable>

            <Text style={st.helper}>
              Phone helps us match them later — we won't text or notify them.
            </Text>
          </View>

          {error ? <Text style={st.error}>{error}</Text> : null}
        </ScrollView>

        <View style={st.footer}>
          <Pressable
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              st.submit,
              !canSubmit && st.submitDisabled,
              pressed && canSubmit && st.submitPressed,
            ]}
          >
            <Text style={st.submitText}>
              {submitting ? 'CREATING…' : 'CREATE GROUP'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2, color: INK },
  scroll: { paddingTop: 16, paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    color: INK,
    marginBottom: 8,
  },
  sectionHint: { fontSize: 11, color: MUTED, fontWeight: '600' },
  input: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: INK,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
  },
  memberInputs: {
    flex: 1,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  memberName: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: INK,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  memberPhone: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: INK,
    fontVariant: ['tabular-nums'],
  },
  removeBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  addRowText: { fontSize: 13, fontWeight: '800', color: INK, marginLeft: 4 },
  helper: {
    fontSize: 11,
    color: MUTED,
    marginTop: 4,
    fontStyle: 'italic',
  },
  error: {
    color: DANGER,
    fontSize: 13,
    paddingHorizontal: 20,
    marginTop: 4,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: PAPER,
  },
  submit: {
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: '#E5E0D5' },
  submitPressed: { transform: [{ translateY: 1 }] },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
