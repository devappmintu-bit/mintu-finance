// Group management sheet — redesigned for simplicity & better tracking.
// Sections (clearly separated, emoji-cleaned icons):
//   1. Group identity (big avatar stack + name + member count)
//   2. Quick stats (total spent · most active · your share) — pulled from summary
//   3. Actions (rename · invite · settings)
//   4. Members list (with remove action)
//   5. Danger zone (leave · delete) — visually separated red block
import React, { useMemo, useState } from 'react';
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
  const [showAddMember, setShowAddMember] = useState(false);

  const members: any[] = manage?.members || [];

  // Quick-stats derived entirely from the group summary — no hardcoded values.
  const stats = useMemo(() => {
    const total = Number(manage?.total_spent || 0);
    const yourShare = Number(manage?.your_total_share || 0);
    const mostActive = manage?.most_active_member || members[0] || null;
    return {
      total: `₹${Math.round(total).toLocaleString('en-IN')}`,
      yourShare: `₹${Math.round(yourShare).toLocaleString('en-IN')}`,
      topMember: mostActive?.name || '—',
    };
  }, [manage, members]);

  const handleAddMember = () => {
    const p = addPhoneVal.replace(/\D/g, '').slice(-10);
    if (p.length !== 10) { Toast.show({ type: 'error', text1: 'Error', text2: 'Enter a valid 10-digit number' }); return; }
    onAddMember(p);
    setAddPhoneVal('');
    setShowAddMember(false);
  };

  const handleRemove = (mid: string, name: string) => {
    Alert.alert('Remove member?', `${name} will lose access to this group's expenses.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemoveMember(mid) },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete group?', 'This permanently deletes all expenses. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Leave group?', 'You will stop seeing new expenses here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onLeave },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mBg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.topBar}>
            <Text style={s.topTitle}>Manage Group</Text>
            <TouchableOpacity onPress={onClose} hitSlop={16}><Ionicons name="close" size={24} color={C.text3} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* SECTION 1 — IDENTITY */}
            <View style={s.heroCard}>
              <View style={s.avStack}>
                {members.slice(0, 5).map((m: any, i: number) => (
                  <View key={m.user_id || i} style={[s.av, { marginLeft: i > 0 ? -14 : 0, zIndex: 5 - i, backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '18' }]}>
                    <Text style={[s.avInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                  </View>
                ))}
                {members.length > 5 && (
                  <View style={[s.av, { marginLeft: -14, backgroundColor: '#F3F4F6' }]}>
                    <Text style={[s.avInit, { color: C.text3 }]}>+{members.length - 5}</Text>
                  </View>
                )}
              </View>
              <Text style={s.groupName} numberOfLines={1}>{manage?.name || 'Group'}</Text>
              <Text style={s.groupMeta}>{members.length} members · invite code {manage?.invite_code || '—'}</Text>
            </View>

            {/* SECTION 2 — QUICK STATS (tracking) */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statVal}>{stats.total}</Text>
                <Text style={s.statLbl}>Total spent</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{stats.yourShare}</Text>
                <Text style={s.statLbl}>Your share</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal} numberOfLines={1}>{stats.topMember}</Text>
                <Text style={s.statLbl}>Most active</Text>
              </View>
            </View>

            {/* SECTION 3 — ACTIONS */}
            <Text style={s.sectionTitle}>Actions</Text>
            <View style={s.actionGroup}>
              <ActionRow
                icon="create-outline"
                label="Rename group"
                onPress={() => { setRenameVal(manage?.name || ''); setShowRename(!showRename); }}
              />
              {showRename && (
                <View style={s.inlineRow}>
                  <TextInput style={s.input} value={renameVal} onChangeText={setRenameVal} autoFocus placeholder="New name" placeholderTextColor={C.text4} />
                  <TouchableOpacity onPress={() => { onRename(renameVal.trim()); setShowRename(false); }}>
                    <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                      <Ionicons name="checkmark" size={18} color={C.inv} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
              <ActionRow
                icon="person-add-outline"
                label="Add member"
                onPress={() => setShowAddMember(!showAddMember)}
              />
              {showAddMember && (
                <View style={s.inlineRow}>
                  <TextInput style={s.input} placeholder="10-digit phone number" placeholderTextColor={C.text4} value={addPhoneVal} onChangeText={setAddPhoneVal} keyboardType="phone-pad" maxLength={10} autoFocus />
                  <TouchableOpacity onPress={handleAddMember}>
                    <LinearGradient colors={[C.accent, C.accentLight]} style={s.iconBtn}>
                      <Ionicons name="person-add" size={18} color={C.inv} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
              <ActionRow
                icon="link-outline"
                label="Share invite link"
                onPress={() => Share.share({ message: `Join our "${manage?.name || 'MintU'}" group! Code: ${manage?.invite_code}\n📲 https://mintu.app/download` })}
              />
            </View>

            {/* SECTION 4 — MEMBERS */}
            <Text style={s.sectionTitle}>Members</Text>
            <View style={s.actionGroup}>
              {members.map((m: any, i: number) => (
                <View key={m.user_id || i} style={[s.memRow, i < members.length - 1 && s.memRowBorder]}>
                  <View style={[s.memAv, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] + '20' }]}>
                    <Text style={[s.memInit, { color: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>{m.initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memName} numberOfLines={1}>{m.name}</Text>
                    {m.user_id === currentUserId && <Text style={s.youTag}>You</Text>}
                  </View>
                  {m.is_admin && (
                    <View style={s.adminBadge}><Text style={s.adminTxt}>Admin</Text></View>
                  )}
                  {!m.is_admin && m.user_id !== currentUserId && (
                    <TouchableOpacity onPress={() => handleRemove(m.user_id, m.name)} hitSlop={10}>
                      <Ionicons name="close-circle" size={22} color={C.text4} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            {/* SECTION 5 — DANGER */}
            <Text style={[s.sectionTitle, { color: C.red }]}>Danger Zone</Text>
            <View style={[s.actionGroup, { borderColor: '#FEE2E2', backgroundColor: '#FEF2F2' }]}>
              <ActionRow icon="exit-outline" label="Leave group" danger onPress={handleLeave} />
              <ActionRow icon="trash-outline" label="Delete group (admins only)" danger onPress={handleDelete} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// --- Sub-component ---
function ActionRow({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? C.red : C.text1;
  return (
    <TouchableOpacity style={s.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.actIcon, { backgroundColor: danger ? '#FEE2E2' : C.accent + '15' }]}>
        <Ionicons name={icon as any} size={18} color={danger ? C.red : C.accent} />
      </View>
      <Text style={[s.actLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.text4} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  topTitle: { fontSize: 18, fontWeight: '800', color: C.text1 },

  heroCard: { alignItems: 'center', marginBottom: 16 },
  avStack: { flexDirection: 'row' },
  av: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: C.sheetBg },
  avInit: { fontSize: 17, fontWeight: '800' },
  groupName: { fontSize: 22, fontWeight: '800', color: C.text1, marginTop: 12, textAlign: 'center' },
  groupMeta: { fontSize: 12, color: C.text3, marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.bg.primary, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '800', color: C.text1, maxWidth: '100%' },
  statLbl: { fontSize: 10, color: C.text3, marginTop: 4, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.text3, marginBottom: 8, marginTop: 14, letterSpacing: 0.5 },
  actionGroup: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  actIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  inlineRow: { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  input: { flex: 1, backgroundColor: COLORS.bg.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text1, borderWidth: 1, borderColor: C.border },
  iconBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  memRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  memRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  memAv: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  memInit: { fontSize: 14, fontWeight: '700' },
  memName: { fontSize: 14, fontWeight: '600', color: C.text1 },
  youTag: { fontSize: 10, color: C.accent, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  adminBadge: { backgroundColor: C.accent + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  adminTxt: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 0.3 },
});
