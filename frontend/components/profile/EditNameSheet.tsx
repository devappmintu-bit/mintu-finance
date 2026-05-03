/**
 * EditNameSheet — centered fade modal to edit user's display name.
 * Round 30b: migrated to makeStyles.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { updateProfile } from '../../services/user';
import { useAuthStore } from '../../store/authStore';
import { showError, showSuccess } from '../../utils/toast';

interface Props {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSaved?: (name: string) => void;
}

export default function EditNameSheet({ visible, currentName, onClose, onSaved }: Props) {
  const [value, setValue] = useState(currentName || '');
  const [saving, setSaving] = useState(false);
  const user = useAuthStore(st => st.user);
  const setUser = useAuthStore(st => st.setUser);
  const c = useAppColors();
  const s = useStyles();

  useEffect(() => { if (visible) setValue(currentName || ''); }, [visible, currentName]);

  const save = async () => {
    const name = value.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await updateProfile({ name });
      if (user) setUser({ ...user, name });
      showSuccess('Name updated');
      onSaved?.(name);
      onClose();
    } catch {
      showError('Could not save', 'Please try again.');
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
            placeholderTextColor={c.text.muted}
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

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: c.bg.secondary, borderRadius: 0, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: c.text.primary, marginBottom: 12, letterSpacing: -0.3 },
  input: {
    borderWidth: 1, borderColor: c.border.subtle, borderRadius: 0,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600',
    color: c.text.primary, backgroundColor: c.bg.primary,
  },
  saveBtn: { backgroundColor: c.accent.primary, paddingVertical: 13, borderRadius: 0, alignItems: 'center', marginTop: 14 },
  saveTxt: { color: c.bg.elevated, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cancel: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: c.text.muted, fontSize: 14, fontWeight: '600' },
}));
