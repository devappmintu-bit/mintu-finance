/**
 * app/split/[id]/settings.tsx — Group settings / management screen.
 *
 * R100J — full GPay-style group settings. Replaces the old "tap
 * ellipsis → confirm delete" UX where the only affordance was nuking
 * the whole group. Now the 3-dot opens a proper settings surface:
 *
 *   • AVATAR STACK (overlapping member avatars as visual identity)
 *   • GROUP NAME   (with edit pencil; rename in-place)
 *   • ACTION ROWS  — Add people · Mute · Invite via link · Invite QR
 *   • MEMBERS LIST — every member with Admin badge for the creator
 *   • LEAVE GROUP  — destructive, separate section
 *
 * Strict Brutalist: 2-px ink borders, BR_STAMP drops, mono numerals,
 * square avatars, no pastel buttons, no rounded pills.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, Share,
  TextInput, ActivityIndicator, Platform, Modal, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import api from '../../../utils/api';
import { useAuthStore } from '../../../store/authStore';
import {
  BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP, BR_FONT,
} from '../../../utils/brutalist';

const { ink: INK, paper: PAPER, paperAlt: PAPERALT, accent: ACCENT, line: LINE, muted: MUTED, negative: DANGER } = BR_COLORS;
const MONO = BR_FONT.mono;

type Member = { user_id: string; name: string; phone?: string; is_admin?: boolean };
type PendingInvite = { phone: string; invited_at?: string };
type Group = {
  id: string;
  name: string;
  members: Member[];
  pending_invites?: PendingInvite[];
  group_code?: string;
  created_by?: string;
  muted?: boolean;
};

export default function GroupSettings() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || '');
  const myId = useAuthStore(s => s.user?.id) || '';

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // ── Load
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get(`/split/groups/${id}/manage`);
      const g: Group = r.data;
      // Derive admin status: the creator is the admin. If server
      // doesn't send is_admin, use the first member as admin (legacy).
      const creator = g.created_by || g.members?.[0]?.user_id;
      g.members = (g.members || []).map(m => ({
        ...m, is_admin: m.user_id === creator,
      }));
      setGroup(g);
      setNameDraft(g.name || '');
    } catch {
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ─────────────────────────────────────────────────────
  const saveName = useCallback(async () => {
    if (!group) return;
    const next = (nameDraft || '').trim();
    if (!next || next === group.name) { setEditing(false); return; }
    setBusy('rename');
    try {
      await api.patch(`/split/groups/${id}`, { name: next });
      setGroup(g => g ? { ...g, name: next } : g);
      setEditing(false);
      Toast.show({ type: 'success', text1: 'Group renamed', position: 'bottom' });
    } catch {
      Alert.alert('Could not rename', 'Please try again.');
    } finally { setBusy(null); }
  }, [group, nameDraft, id]);

  const toggleMute = useCallback(async () => {
    if (!group) return;
    const next = !group.muted;
    setGroup(g => g ? { ...g, muted: next } : g);
    try { await api.patch(`/split/groups/${id}`, { muted: next }); }
    catch { /* revert */ setGroup(g => g ? { ...g, muted: !next } : g); }
  }, [group, id]);

  const inviteLink = useCallback(async () => {
    if (!group) return;
    const url = `https://mintu.app/g/${group.group_code || group.id}`;
    const msg =
      `Join my split group on MintU: ${group.name}\n\n${url}\n\n` +
      `Code: ${group.group_code || group.id.slice(0, 6).toUpperCase()}`;
    try { await Share.share({ message: msg }); } catch { /* cancelled */ }
  }, [group]);

  const copyCode = useCallback(async () => {
    const code = group?.group_code || group?.id?.slice(0, 6).toUpperCase() || '';
    try {
      await Clipboard.setStringAsync(code);
      Toast.show({ type: 'success', text1: 'Code copied', text2: code, position: 'bottom' });
    } catch { /* noop */ }
  }, [group]);

  const addPeople = useCallback(() => {
    setAddOpen(true);
  }, []);

  const submitAddPeople = useCallback(async (entries: { name: string; phone: string }[]) => {
    if (!entries.length) return;
    try {
      await api.post(`/split/groups/${id}/members`, { entries });
      Toast.show({
        type: 'success',
        text1: entries.length === 1 ? 'Person added' : `${entries.length} added`,
        position: 'bottom',
      });
      setAddOpen(false);
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not add people. Try again.';
      Alert.alert('Add people', String(msg));
    }
  }, [id, load]);

  const leaveGroup = useCallback(() => {
    if (!group) return;
    Alert.alert(
      'Leave group?',
      `You'll stop receiving updates for "${group.name}". Your past balances stay recorded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setBusy('leave');
            try {
              await api.post(`/split/groups/${id}/leave`);
              router.replace('/split' as any);
            } catch (e: any) {
              const msg = e?.response?.data?.detail || 'Could not leave group.';
              Alert.alert('Leave group', String(msg));
            } finally { setBusy(null); }
          },
        },
      ]
    );
  }, [group, id]);

  const removeMember = useCallback(async (member: Member) => {
    if (!group) return;
    Alert.alert(
      `Remove ${member.name}?`,
      'Their past expenses remain, but they will lose access to this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/split/groups/${id}/remove-member`, {
                user_id: member.user_id,
              });
              await load();
            } catch (e: any) {
              const msg = e?.response?.data?.detail || 'Could not remove member.';
              Alert.alert('Remove member', String(msg));
            }
          },
        },
      ]
    );
  }, [group, id, load]);

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={st.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={() => router.back()} />
        <View style={st.loadingPane}>
          <ActivityIndicator size="small" color={INK} />
        </View>
      </SafeAreaView>
    );
  }

  if (!group) return null;

  const amIAdmin = group.members.find(m => m.user_id === myId)?.is_admin;
  const memberCount = group.members.length;
  const pendingCount = (group.pending_invites || []).length;
  const totalCount = memberCount + pendingCount;

  return (
    <SafeAreaView style={st.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* ── IDENTITY ──────────────────────────────────────────── */}
        <View style={st.identity}>
          <AvatarStack members={group.members} />

          {editing ? (
            <View style={st.nameRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                style={st.nameInput}
                returnKeyType="done"
                onSubmitEditing={saveName}
                maxLength={40}
              />
              <Pressable onPress={saveName} style={st.nameBtn} disabled={busy === 'rename'}>
                <Ionicons name="checkmark" size={16} color={INK} />
              </Pressable>
              <Pressable onPress={() => { setEditing(false); setNameDraft(group.name); }} style={st.nameBtnGhost}>
                <Ionicons name="close" size={16} color={MUTED} />
              </Pressable>
            </View>
          ) : (
            <View style={st.nameRow}>
              <Text style={st.groupName} numberOfLines={2}>{group.name}</Text>
              <Pressable onPress={() => setEditing(true)} hitSlop={8} style={st.editPencil} testID="edit-name">
                <Ionicons name="pencil" size={12} color={INK} />
              </Pressable>
            </View>
          )}

          <Text style={st.memberCount}>
            {totalCount} {totalCount === 1 ? 'member' : 'members'}
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
            {group.group_code ? ` · code ${group.group_code}` : ''}
          </Text>
        </View>

        {/* ── ACTION ROWS ───────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLbl}>— MANAGE</Text>
          <View style={st.sectionCard}>
            <ActionRow
              icon="person-add"
              label="Add people"
              onPress={addPeople}
              testID="settings-add-people"
            />
            <ActionRow
              icon={group.muted ? 'notifications-off' : 'notifications'}
              label={group.muted ? 'Unmute notifications' : 'Mute notifications'}
              onPress={toggleMute}
              testID="settings-mute"
            />
            <ActionRow
              icon="link"
              label="Invite via link"
              onPress={inviteLink}
              testID="settings-invite-link"
            />
            <ActionRow
              icon="copy-outline"
              label="Copy group code"
              rightValue={group.group_code || group.id.slice(0, 6).toUpperCase()}
              onPress={copyCode}
              last
              testID="settings-copy-code"
            />
          </View>
        </View>

        {/* ── MEMBERS ───────────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLbl}>
            — MEMBERS · {memberCount}{pendingCount > 0 ? ` + ${pendingCount} INVITED` : ''}
          </Text>
          <View style={st.sectionCard}>
            {group.members.map((m, idx) => (
              <MemberRow
                key={m.user_id || idx}
                member={m}
                isMe={m.user_id === myId}
                canRemove={!!amIAdmin && m.user_id !== myId && !m.is_admin}
                onRemove={() => removeMember(m)}
                last={idx === group.members.length - 1 && pendingCount === 0}
              />
            ))}
            {(group.pending_invites || []).map((p: any, idx, arr) => (
              <PendingInviteRow
                key={`pi-${p.phone}-${idx}`}
                phone={p.phone}
                name={p.name}
                last={idx === arr.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── DANGER ZONE ───────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLbl}>— DANGER ZONE</Text>
          <Pressable
            onPress={leaveGroup}
            disabled={busy === 'leave'}
            style={({ pressed }) => [
              st.leaveBtn,
              BR_STAMP.negative,
              pressed && { transform: [{ translateY: 1 }] },
            ]}
            testID="settings-leave"
          >
            {busy === 'leave' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="log-out" size={16} color="#fff" />
                <Text style={st.leaveTxt}>LEAVE GROUP</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <AddPeopleSheet
        visible={addOpen}
        existingPhones={[
          ...(group.members || []).map(m => m.phone || ''),
          ...(group.pending_invites || []).map(p => p.phone || ''),
        ].filter(Boolean)}
        onClose={() => setAddOpen(false)}
        onSubmit={submitAddPeople}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function AddPeopleSheet({
  visible, existingPhones, onClose, onSubmit,
}: {
  visible: boolean;
  existingPhones: string[];
  onClose: () => void;
  onSubmit: (entries: { name: string; phone: string }[]) => Promise<void>;
}) {
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [entries, setEntries] = useState<{ name: string; phone: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setNameDraft(''); setPhoneDraft(''); setEntries([]); setSubmitting(false);
  }, []);

  useEffect(() => { if (!visible) reset(); }, [visible, reset]);

  const normalizePhone = (raw: string): string | null => {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
  };

  const addCurrent = useCallback(() => {
    const p = normalizePhone(phoneDraft);
    if (!p) return;
    const exists = entries.some(e => e.phone === p) ||
      existingPhones.some(e => normalizePhone(e) === p);
    if (exists) {
      Toast.show({ type: 'info', text1: 'Already added', position: 'bottom' });
      setPhoneDraft(''); setNameDraft('');
      return;
    }
    setEntries(prev => [...prev, { name: nameDraft.trim(), phone: p }]);
    setPhoneDraft(''); setNameDraft('');
  }, [nameDraft, phoneDraft, entries, existingPhones]);

  const removeAt = (i: number) =>
    setEntries(prev => prev.filter((_, idx) => idx !== i));

  const submit = useCallback(async () => {
    // Auto-flush whatever's in the inputs.
    const last = normalizePhone(phoneDraft);
    let final = entries;
    if (last && !entries.some(e => e.phone === last)) {
      final = [...entries, { name: nameDraft.trim(), phone: last }];
    }
    if (!final.length) return;
    setSubmitting(true);
    try {
      await onSubmit(final);
    } finally {
      setSubmitting(false);
    }
  }, [nameDraft, phoneDraft, entries, onSubmit]);

  const canSubmit =
    !submitting &&
    (entries.length > 0 || (phoneDraft.replace(/\D/g, '').length >= 10));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={st.sheetBackdrop}
      >
        <Pressable style={st.sheetDismiss} onPress={onClose} />
        <View style={[st.sheet, BR_STAMP.lg]}>
          {/* Header */}
          <View style={st.sheetHeader}>
            <Text style={st.sheetTitle}>ADD PEOPLE</Text>
            <Pressable onPress={onClose} hitSlop={10} style={st.sheetClose}>
              <Ionicons name="close" size={18} color={INK} />
            </Pressable>
          </View>

          <Text style={st.sheetHint}>
            Add a name + 10-digit phone. Tap + to queue another.
          </Text>

          {/* Name input */}
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="Name (e.g. Rohan)"
            placeholderTextColor={MUTED}
            maxLength={40}
            style={[st.phoneInput, { marginBottom: 8 }]}
            autoCapitalize="words"
            returnKeyType="next"
          />

          {/* Phone input row */}
          <View style={st.inputRow}>
            <TextInput
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              placeholder="9876543210"
              placeholderTextColor={MUTED}
              keyboardType="phone-pad"
              maxLength={14}
              style={st.phoneInput}
              onSubmitEditing={addCurrent}
              returnKeyType="next"
            />
            <Pressable
              onPress={addCurrent}
              disabled={normalizePhone(phoneDraft) === null}
              style={[
                st.addBtn,
                normalizePhone(phoneDraft) === null && { opacity: 0.4 },
              ]}
              hitSlop={4}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>

          {/* Queued chips */}
          {entries.length > 0 ? (
            <View style={st.queuedRow}>
              {entries.map((e, i) => (
                <View key={e.phone + i} style={st.phoneChip}>
                  <Text style={st.phoneChipTxt}>
                    {e.name || `Member ${e.phone.slice(-4)}`}
                    {e.name ? <Text style={{ color: MUTED }}>{' · ' + e.phone.slice(-4)}</Text> : null}
                  </Text>
                  <Pressable onPress={() => removeAt(i)} hitSlop={6}>
                    <Ionicons name="close" size={12} color={INK} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* CTA */}
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              st.sheetCta,
              !canSubmit && st.sheetCtaDisabled,
              pressed && canSubmit && { transform: [{ translateY: 1 }] },
            ]}
            testID="add-people-submit"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={st.sheetCtaTxt}>
                ADD {entries.length + (normalizePhone(phoneDraft) ? 1 : 0) || ''}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={st.header}>
      <Pressable onPress={onBack} hitSlop={10} style={st.headerBtn} testID="settings-back">
        <Ionicons name="chevron-back" size={22} color={INK} />
      </Pressable>
      <Text style={st.headerTitle}>GROUP SETTINGS</Text>
      <View style={st.headerBtn} />
    </View>
  );
}

function AvatarStack({ members }: { members: Member[] }) {
  const shown = members.slice(0, 4);
  const extra = members.length - shown.length;
  return (
    <View style={st.avatarStack}>
      {shown.map((m, i) => (
        <View
          key={m.user_id || i}
          style={[
            st.avatar,
            i > 0 && { marginLeft: -10 },
            { zIndex: shown.length - i },
          ]}
        >
          <Text style={st.avatarInitial}>
            {(m.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      ))}
      {extra > 0 ? (
        <View style={[st.avatar, st.avatarExtra, { marginLeft: -10 }]}>
          <Text style={st.avatarInitial}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ActionRow({
  icon, label, rightValue, onPress, last, testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  rightValue?: string;
  onPress: () => void;
  last?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.row, !last && st.rowDivider, pressed && { backgroundColor: PAPERALT },
      ]}
      testID={testID}
    >
      <View style={st.rowIcon}>
        <Ionicons name={icon} size={16} color={INK} />
      </View>
      <Text style={st.rowLabel} numberOfLines={1}>{label}</Text>
      {rightValue ? (
        <Text style={st.rowValue} numberOfLines={1}>{rightValue}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={MUTED} />
    </Pressable>
  );
}

function MemberRow({
  member, isMe, canRemove, onRemove, last,
}: {
  member: Member; isMe: boolean; canRemove: boolean; onRemove: () => void; last?: boolean;
}) {
  return (
    <View style={[st.row, !last && st.rowDivider]}>
      <View style={[st.avatar, { marginRight: 8 }]}>
        <Text style={st.avatarInitial}>
          {(member.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.rowLabel} numberOfLines={1}>
          {member.name}{isMe ? ' (you)' : ''}
        </Text>
        {member.phone ? (
          <Text style={st.rowSubtext} numberOfLines={1}>{member.phone}</Text>
        ) : null}
      </View>
      {member.is_admin ? (
        <View style={st.adminBadge}>
          <Text style={st.adminTxt}>ADMIN</Text>
        </View>
      ) : null}
      {canRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={st.removeBtn} testID="settings-remove-member">
          <Ionicons name="close" size={14} color={DANGER} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PendingInviteRow({
  phone, name, last,
}: {
  phone: string; name?: string; last?: boolean;
}) {
  const trimmed = (name || '').trim();
  const tail = (phone || '').slice(-4);
  const display = trimmed || `Member ${tail}`;
  const subline = trimmed
    ? `Awaiting MintU sign-up · ${tail}`
    : `Awaiting MintU sign-up`;
  return (
    <View style={[st.row, !last && st.rowDivider, { backgroundColor: PAPERALT }]}>
      <View style={[st.avatarPending, { marginRight: 8 }]}>
        <Ionicons name="time-outline" size={14} color={MUTED} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.rowLabel} numberOfLines={1}>{display}</Text>
        <Text style={st.rowSubtext} numberOfLines={1}>{subline}</Text>
      </View>
      <View style={st.invitedBadge}>
        <Text style={st.invitedTxt}>INVITED</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },

  loadingPane: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: BR_SPACE.sm,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: LINE,
    backgroundColor: PAPER,
  },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12, fontWeight: '900', letterSpacing: 2, color: INK,
  },

  // Identity
  identity: {
    alignItems: 'center',
    paddingVertical: BR_SPACE.xl,
    paddingHorizontal: BR_SPACE.lg,
    borderBottomWidth: BR_BORDER.hair,
    borderColor: LINE,
  },
  avatarStack: { flexDirection: 'row', marginBottom: BR_SPACE.md },
  avatar: {
    width: 44, height: 44,
    backgroundColor: ACCENT,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarExtra: { backgroundColor: PAPERALT },
  avatarInitial: {
    fontSize: 15, fontWeight: '900', color: INK,
    fontFamily: MONO, letterSpacing: -0.3,
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: BR_SPACE.md,
  },
  groupName: { ...BR_TYPE.h2, color: INK, textAlign: 'center' },
  editPencil: {
    width: 22, height: 22,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    backgroundColor: PAPERALT,
    alignItems: 'center', justifyContent: 'center',
  },
  nameInput: {
    flex: 1,
    ...BR_TYPE.h2,
    color: INK,
    backgroundColor: PAPERALT,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    paddingHorizontal: 10, paddingVertical: 6,
    minHeight: 36,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  nameBtn: {
    width: 36, height: 36,
    borderWidth: BR_BORDER.bold, borderColor: INK,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  nameBtnGhost: {
    width: 36, height: 36,
    borderWidth: BR_BORDER.hair, borderColor: MUTED,
    backgroundColor: PAPER,
    alignItems: 'center', justifyContent: 'center',
  },
  memberCount: {
    ...BR_TYPE.meta, color: MUTED, marginTop: 6,
    fontFamily: MONO, letterSpacing: 0.3,
  },

  // Sections
  section: { paddingHorizontal: BR_SPACE.lg, paddingTop: BR_SPACE.lg },
  sectionLbl: {
    fontSize: 10, fontWeight: '900', letterSpacing: 2, color: MUTED,
    marginBottom: BR_SPACE.sm,
  },
  sectionCard: {
    borderWidth: BR_BORDER.bold, borderColor: INK, backgroundColor: PAPER,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.md,
    minHeight: 48,
  },
  rowDivider: { borderBottomWidth: BR_BORDER.hair, borderColor: LINE },
  rowIcon: {
    width: 28, height: 28,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    backgroundColor: PAPERALT,
    alignItems: 'center', justifyContent: 'center',
    marginRight: BR_SPACE.sm,
  },
  rowLabel: { ...BR_TYPE.body, color: INK, flex: 1, fontSize: 14 },
  rowSubtext: { ...BR_TYPE.meta, color: MUTED, fontFamily: MONO, fontSize: 11 },
  rowValue: {
    ...BR_TYPE.meta, color: MUTED, fontFamily: MONO,
    marginRight: 6, fontSize: 11,
  },

  adminBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: INK, backgroundColor: ACCENT,
    marginRight: BR_SPACE.sm,
  },
  adminTxt: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.4, color: INK,
  },

  // Pending-invite row (R100L — fix for "settings shows 1 member while
  // list says 6"). Pending phones get a clock-icon avatar + INVITED
  // badge so the user understands they've been invited but haven't
  // joined MintU yet.
  avatarPending: {
    width: 44, height: 44,
    borderWidth: BR_BORDER.hair,
    borderColor: MUTED,
    backgroundColor: PAPER,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  invitedBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: MUTED, backgroundColor: PAPER,
    marginRight: BR_SPACE.sm,
  },
  invitedTxt: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1.4, color: MUTED,
  },

  removeBtn: {
    width: 28, height: 28,
    borderWidth: BR_BORDER.hair, borderColor: DANGER,
    backgroundColor: PAPER,
    alignItems: 'center', justifyContent: 'center',
  },

  // Leave
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: DANGER,
    borderWidth: BR_BORDER.bold, borderColor: INK,
  },
  leaveTxt: {
    fontSize: 12, fontWeight: '900', letterSpacing: 1.8, color: '#fff',
  },

  // ── AddPeopleSheet ──────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.55)',
    justifyContent: 'flex-end',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: PAPER,
    borderTopWidth: BR_BORDER.bold,
    borderLeftWidth: BR_BORDER.bold,
    borderRightWidth: BR_BORDER.bold,
    borderColor: INK,
    paddingHorizontal: BR_SPACE.lg,
    paddingTop: BR_SPACE.lg,
    paddingBottom: BR_SPACE.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 13, fontWeight: '900', letterSpacing: 2, color: INK,
  },
  sheetClose: {
    width: 28, height: 28,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    backgroundColor: PAPERALT,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetHint: {
    ...BR_TYPE.meta, color: MUTED, marginBottom: BR_SPACE.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: BR_SPACE.md,
  },
  phoneInput: {
    flex: 1,
    borderWidth: BR_BORDER.bold,
    borderColor: INK,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: INK,
    fontWeight: '800',
    fontFamily: MONO,
    letterSpacing: 1,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  addBtn: {
    width: 48,
    borderWidth: BR_BORDER.bold, borderColor: INK,
    backgroundColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  queuedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: BR_SPACE.md,
  },
  phoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: BR_BORDER.hair, borderColor: INK,
    backgroundColor: PAPERALT,
  },
  phoneChipTxt: {
    fontSize: 12, fontWeight: '800', color: INK, fontFamily: MONO,
  },
  sheetCta: {
    backgroundColor: ACCENT,
    borderWidth: BR_BORDER.bold, borderColor: INK,
    paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCtaDisabled: { backgroundColor: '#E5E0D5' },
  sheetCtaTxt: {
    color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.8,
  },
});
