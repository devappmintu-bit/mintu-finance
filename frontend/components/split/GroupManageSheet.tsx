import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../utils/theme';
import { C, MEMBER_COLORS } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  manage: any;
  currentUserId?: string;
  onRename: (newName: string) => void;
  onAddMember: (phone: string) => void;
  onRemoveMember: (memberId: string) => void;
  onDelete: () => void;
  onLeave: () => void;
};

export default function GroupManageSheet({ visible, onClose, manage, currentUserId, onRename, onAddMember, onRemoveMember, onDelete, onLeave }: Props) {
  const [addPhoneVal, setAddPhoneVal] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [showRename, setShowRename] = useState(false);

  const handleAddMember = () => {
    const p = addPhoneVal.replace(/\D/g, '').slice(-10);
    if (p.length !== 10) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter valid 10-digit number' }); return; }
    onAddMember(p);
    setAddPhoneVal('');
  };

  const handleRemove = (mid: string) => {
    Alert.alert('Remove?', 'Remove from group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemoveMember(mid) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mBg}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>
          <View style={s.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.manAvatars}>
              {(manage?.members || []).slice(0, 5).map((m: any, i: number) => (
                <View key={i} style={[s.manAv, { marginLeft: i > 0 ? -14 : 0, zIndex: 5 - i, backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '18' }]}>
                  <Text style={[s.manInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                </View>
              ))}
            </View>
            <Text style={s.manName}>{manage?.name}</Text>
            <TouchableOpacity style={s.manAction} onPress={() => { setRenameVal(manage?.name || ''); setShowRename(true); }}>
              <Ionicons name="create-outline" size={22} color={C.accent} />
              <Text style={s.manActionT}>Rename group</Text>
            </TouchableOpacity>
            {showRename && (
              <View style={s.inputRow}>
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={renameVal} onChangeText={setRenameVal} autoFocus />
                <TouchableOpacity onPress={() => { onRename(renameVal.trim()); setShowRename(false); }}>
                  <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                    <Ionicons name="checkmark" size={20} color={C.inv} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={s.manAction} onPress={() => Share.share({ message: `Join MintU group! Code: ${manage?.invite_code}\n📲 https://mintu.app/download` })}>
              <Ionicons name="link-outline" size={22} color={C.accent} />
              <Text style={s.manActionT}>Invite via link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.manAction} onPress={onDelete}>
              <Ionicons name="trash-outline" size={22} color={C.red} />
              <Text style={[s.manActionT, { color: C.red }]}>Delete group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.manAction} onPress={onLeave}>
              <Ionicons name="exit-outline" size={22} color={C.red} />
              <Text style={[s.manActionT, { color: C.red }]}>Leave group</Text>
            </TouchableOpacity>
            <Text style={[s.label, { marginTop: 16 }]}>Add member</Text>
            <View style={s.inputRow}>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Phone number" placeholderTextColor={C.text4} value={addPhoneVal} onChangeText={setAddPhoneVal} keyboardType="phone-pad" maxLength={10} />
              <TouchableOpacity onPress={handleAddMember}>
                <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                  <Ionicons name="person-add" size={20} color={C.inv} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <Text style={[s.label, { marginTop: 16 }]}>{`Members (${manage?.member_count || 0})`}</Text>
            {(manage?.members || []).map((m: any, i: number) => (
              <View key={i} style={s.manMemRow}>
                <View style={[s.memAv, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '15' }]}>
                  <Text style={[s.memInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                </View>
                <Text style={s.manMemName}>{m.name}</Text>
                {m.is_admin && (
                  <LinearGradient colors={['#880E4F', '#6A1B9A']} style={s.adminBadge}>
                    <Text style={s.adminT}>Admin</Text>
                  </LinearGradient>
                )}
                {!m.is_admin && m.user_id !== currentUserId && (
                  <TouchableOpacity onPress={() => handleRemove(m.user_id)}>
                    <Ionicons name="close-circle" size={22} color={C.text4} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={[s.primaryBtn, { marginTop: 12 }]}>
              <Text style={s.primaryBtnText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  input: { backgroundColor: COLORS.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text1, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  iconBtn: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: C.text3, marginBottom: 8 },
  manAvatars: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  manAv: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: C.sheetBg },
  manInit: { fontSize: 18, fontWeight: '700' },
  manName: { fontSize: 22, fontWeight: '700', color: C.text1, textAlign: 'center', marginBottom: 20 },
  manAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  manActionT: { fontSize: 16, fontWeight: '500', color: C.text1 },
  manMemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  manMemName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text1 },
  memAv: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memInit: { fontSize: 14, fontWeight: '700' },
  adminBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  adminT: { fontSize: 11, fontWeight: '600', color: '#fff' },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
});
