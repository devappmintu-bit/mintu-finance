/**
 * EditNameSheet — centered fade modal to edit user's display name.
 * Extracted from profile.tsx (Round 2A refactor).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { updateProfile } from '../../services/user';
import { useAuthStore } from '../../store/authStore';

interface Props {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  /** Called after a successful rename so the parent can refresh identity. */
  onSaved?: (name: string) => void;
}

export default function EditNameSheet({ visible, currentName, onClose, onSaved }: Props) {
  const [value, setValue] = useState(currentName || '');
  const [saving, setSaving] = useState(false);
  const user = useAuthStore(st => st.user);
  const setUser = useAuthStore(st => st.setUser);

  useEffect(() => { if (visible) setValue(currentName || ''); }, [visible, currentName]);

  const save = async () => {
    const name = value.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await updateProfile({ name });
      if (user) setUser({ ...user, name });
      Toast.show({ type: 'success', text1: 'Name updated' });
      onSaved?.(name);
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save', text2: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>Edit name</Text>
          <TextInput
            style={s.input}
            value={value}
            onChangeText={setValue}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.muted}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={save}
            accessibilityLabel="Name input"
          />
          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            <Text style={s.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.cancel} activeOpacity={0.7}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: COLORS.bg.secondary, borderRadius: 20, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border.subtle, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text.primary, marginBottom: 12, letterSpacing: -0.3 },
  input: {
    borderWidth: 1, borderColor: COLORS.border.subtle, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600',
    color: COLORS.text.primary, backgroundColor: COLORS.bg.primary,
  },
  saveBtn: { backgroundColor: COLORS.accent.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  saveTxt: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cancel: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: COLORS.text.muted, fontSize: 14, fontWeight: '600' },
});
