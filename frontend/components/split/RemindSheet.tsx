import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {  COLORS, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { C, DebtRow } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: DebtRow | null;
  onSend: (note: string) => void;
};

export default function RemindSheet({ visible, onClose, target, onSend }: Props) {
  const s = useStyles();
  const c = useAppColors();
  const [note, setNote] = useState('');
  useEffect(() => { if (visible) setNote(''); }, [visible]);

  const remindeeName = target?.direction === 'owed_to_me' ? target?.from_name : target?.to_name;

  const shareWhatsApp = async () => {
    if (!target) return;
    const amt = `₹${target.amount.toFixed(0)}`;
    const grp = `${target.group_emoji} ${target.group_name}`;
    const msg = (
      `Hey ${remindeeName}! 👋\n\n` +
      `Quick reminder — you owe me ${amt} for ${grp}.\n` +
      (note ? `\n${note}\n` : '') +
      `\nSettle via UPI in 1 tap 👉 https://mintu.app/settle\n\nSent from MintU 💸`
    );
    try {
      const wa = `whatsapp://send?text=${encodeURIComponent(msg)}`;
      const can = await Linking.canOpenURL(wa);
      if (can) { Linking.openURL(wa); onSend(note.trim()); return; }
    } catch {}
    // Fall back to posting to in-app chat if WhatsApp not installed
    onSend(note.trim());
  };

  const inviteToSettle = async () => {
    if (!target) return;
    try {
      // Lazy import to avoid circular deps
      const api = (await import('../../utils/api')).default;
      const res = await api.post('/split/invite-to-settle', {
        target_user_id: (target as any).from_id || (target as any).to_id,
        target_name: remindeeName,
        target_phone: (target as any).phone || '',
        amount: target.amount,
        group_name: target.group_name,
        note,
      });
      const url = res.data?.whatsapp_url;
      if (url) {
        Linking.openURL(url);
        onSend(note.trim());
      }
    } catch (e) {
      // Fallback to plain WA share
      shareWhatsApp();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mBg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.sheetH}>
            <Ionicons name="notifications" size={22} color={c.accent.warning} />
            <Text style={[s.sheetT, { flex: 1 }]}>Send Reminder</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color={C.text4} /></TouchableOpacity>
          </View>
          {target && (
            <>
              <View style={s.remindInfo}>
                <Text style={s.remindInfoN}>{remindeeName}</Text>
                <Text style={s.remindInfoG}>{`${target.group_emoji} ${target.group_name}`}</Text>
                <Text style={s.remindInfoA}>{`₹${target.amount.toFixed(0)}`}</Text>
              </View>
              <Text style={s.label}>Add a friendly note (optional)</Text>
              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                multiline
                placeholder="e.g. Hey, remember the Goa trip?"
                placeholderTextColor={C.text4}
                value={note}
                onChangeText={setNote}
                maxLength={200}
              />
              <Text style={s.remindHint}>
                {`Will post a reminder in the group chat${Platform.OS !== 'web' ? ' + open WhatsApp' : ''}. 1 reminder/hour limit.`}
              </Text>
              <TouchableOpacity onPress={inviteToSettle} activeOpacity={0.85}>
                <LinearGradient colors={['#E65100', '#E65100']} style={s.primaryBtn}>
                  <Ionicons name="card" size={18} color={C.inv} />
                  <Text style={s.primaryBtnText}> Invite to Settle (UPI)</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareWhatsApp} activeOpacity={0.85} style={{ marginTop: 10 }}>
                <LinearGradient colors={['#25D366', '#128C7E']} style={s.primaryBtn}>
                  <Ionicons name="logo-whatsapp" size={18} color={C.inv} />
                  <Text style={s.primaryBtnText}> Remind on WhatsApp</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSend(note.trim())} activeOpacity={0.85} style={{ marginTop: 10 }}>
                <LinearGradient colors={['#F59E0B', '#FB923C']} style={s.primaryBtn}>
                  <Ionicons name="notifications" size={18} color={C.inv} />
                  <Text style={s.primaryBtnText}> In-app Reminder</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  mBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.text4, alignSelf: 'center', marginBottom: 16 },
  sheetH: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  sheetT: { fontSize: 20, fontWeight: '700', color: C.text1 },
  label: { fontSize: 13, fontWeight: '600', color: C.text3, marginBottom: 8 },
  input: { backgroundColor: c.bg.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.text1, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  remindInfo: { alignItems: 'center', paddingVertical: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  remindInfoN: { fontSize: 18, fontWeight: '700', color: C.text1 },
  remindInfoG: { fontSize: 13, color: C.text3, marginTop: 2 },
  remindInfoA: { fontSize: 28, fontWeight: '800', color: C.red, marginTop: 8 },
  remindHint: { fontSize: 11, color: C.text3, textAlign: 'center', marginVertical: 10, fontStyle: 'italic' },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.inv },
}));
