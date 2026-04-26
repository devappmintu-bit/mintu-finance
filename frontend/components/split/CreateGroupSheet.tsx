import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import {  COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, phones: string[]) => void;
};

export default function CreateGroupSheet({ visible, onClose, onCreate }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const [name, setName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phones, setPhones] = useState<string[]>([]);

  useEffect(() => {
    if (visible) { setName(''); setPhoneInput(''); setPhones([]); }
  }, [visible]);

  const addPhoneToList = () => {
    const nums = phoneInput.split(',').map(p => p.replace(/\D/g, '').slice(-10)).filter(p => p.length === 10 && !phones.includes(p));
    if (nums.length) { setPhones([...phones, ...nums]); setPhoneInput(''); }
  };

  const handleCreate = () => {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter group name' }); return; }
    onCreate(name, phones);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.sheetH}>
            <Text style={s.sheetT}>New Group</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
          </View>
          <TextInput style={s.input} placeholder="Group name (e.g. Goa Trip)" placeholderTextColor={C.text4} value={name} onChangeText={setName} />
          <Text style={s.label}>Add members (comma-separated phones)</Text>
          <View style={s.inputRow}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="9000000001, 9000000002" placeholderTextColor={C.text4} value={phoneInput} onChangeText={setPhoneInput} keyboardType="phone-pad" />
            <TouchableOpacity onPress={addPhoneToList}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                <Ionicons name="person-add" size={20} color={C.inv} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {phones.map((p, i) => (
              <View key={i} style={s.chip}>
                <Text style={s.chipText}>{p}</Text>
                <TouchableOpacity onPress={() => setPhones(phones.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close-circle" size={16} color={C.accent} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={handleCreate}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={s.primaryBtn}>
              <Text style={s.primaryBtnText}>{`Create Group (${phones.length + 1} members)`}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetH: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  input: { backgroundColor: c.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text1, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  iconBtn: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: C.text3, marginBottom: 8 },
  chipRow: { gap: 8, marginBottom: 12, flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentDim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 14, color: C.accent, fontWeight: '500' },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
}));
