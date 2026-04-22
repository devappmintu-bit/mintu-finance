/**
 * Split · Add Member — FULL-SCREEN FLOW with QR code
 *
 * Fixes the "Contacts not available on web" dead-end. Gives users 3
 * clear ways to invite: WhatsApp (primary), Copy link, QR code.
 *
 * Query params:
 *   group_id (required)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Share, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { fetchGroupSummary, addGroupMember } from '../../services/split';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, SPACING } from '../../utils/theme';

type Chip = { phone: string; name?: string };

export default function AddMemberScreen() {
  const s = useStyles();
  const params = useLocalSearchParams<{ group_id?: string }>();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState('');
  const [selected, setSelected] = useState<Chip[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!params.group_id) { router.back(); return; }
      try {
        const data = await fetchGroupSummary(String(params.group_id));
        setGroup(data);
      } catch {
        Toast.show({ type: 'error', text1: 'Could not load group' });
        router.back();
      } finally { setLoading(false); }
    })();
  }, [params.group_id]);

  const inviteLink = useMemo(() => {
    if (!group?.id) return 'https://mintu.app';
    return `https://mintu.app/join/${group.id}`;
  }, [group?.id]);

  const canAdd = /^\d{10}$/.test(phoneInput.trim());

  const addChip = () => {
    if (!canAdd) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const phone = phoneInput.trim();
    if (selected.some(c => c.phone === phone)) {
      Toast.show({ type: 'info', text1: 'Already added' });
      return;
    }
    setSelected(prev => [...prev, { phone }]);
    setPhoneInput('');
  };

  const removeChip = (phone: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setSelected(prev => prev.filter(c => c.phone !== phone));
  };

  const submit = async () => {
    if (!group?.id || selected.length === 0) return;
    setSubmitting(true);
    try {
      for (const c of selected) {
        await addGroupMember(group.id, c.phone);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Toast.show({ type: 'success', text1: `${selected.length} added to ${group.name}` });
      router.back();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e?.response?.data?.detail || 'Could not add' });
    } finally { setSubmitting(false); }
  };

  const shareWhatsApp = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const msg = `Hey! Join my MintU group "${group?.name || ''}" to split expenses together: ${inviteLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      try { Share.share({ message: msg }); } catch {}
    });
  };

  const copyLink = async () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    try {
      await Clipboard.setStringAsync(inviteLink);
      Toast.show({ type: 'success', text1: 'Invite link copied' });
    } catch {}
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator style={{ flex: 1 }} color={COLORS.accent.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="close" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.title}>Add members</Text>
          <Text style={s.groupName} numberOfLines={1}>to {group?.name}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Selected chips */}
          {selected.length > 0 && (
            <View>
              <Text style={s.label}>SELECTED ({selected.length})</Text>
              <View style={s.chipRow}>
                {selected.map(c => (
                  <View key={c.phone} style={s.personChip}>
                    <Text style={s.personTxt}>{c.phone}</Text>
                    <TouchableOpacity onPress={() => removeChip(c.phone)}>
                      <Ionicons name="close-circle" size={14} color="#C14A06" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Phone input */}
          <Text style={s.label}>PHONE NUMBER</Text>
          <View style={s.phoneInputWrap}>
            <Text style={s.dialCode}>+91</Text>
            <TextInput
              value={phoneInput}
              onChangeText={(v) => setPhoneInput(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              placeholderTextColor={COLORS.text.muted}
              keyboardType="phone-pad"
              style={s.phoneInput}
              onSubmitEditing={canAdd ? addChip : undefined}
              testID="am-phone"
            />
            {canAdd && (
              <TouchableOpacity onPress={addChip} style={s.addChipBtn} activeOpacity={0.85}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {selected.length === 0 && (
            <Text style={s.emptyHint}>Add people using phone number or share the invite below</Text>
          )}

          {/* Invite methods */}
          <Text style={[s.label, { marginTop: 18 }]}>OR SHARE INVITE</Text>
          <TouchableOpacity style={s.waBtn} onPress={shareWhatsApp} activeOpacity={0.88}>
            <LinearGradient colors={['#25D366', '#128C7E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.waGrad}>
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={s.waTxt}>Invite via WhatsApp</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.altBtn} onPress={copyLink} activeOpacity={0.85}>
            <Ionicons name="link" size={16} color={COLORS.accent.primary} />
            <Text style={s.altTxt}>Copy invite link</Text>
            <Text style={s.altSub} numberOfLines={1}>{inviteLink.replace('https://', '')}</Text>
          </TouchableOpacity>

          {/* QR Code */}
          <View style={s.qrCard}>
            <View style={s.qrHeader}>
              <Ionicons name="qr-code" size={14} color={COLORS.accent.primary} />
              <Text style={s.qrLbl}>OR SCAN QR CODE</Text>
            </View>
            <View style={s.qrWrap}>
              <QRCode
                value={inviteLink}
                size={170}
                color="#0B0D12"
                backgroundColor="#FFFFFF"
                logoBackgroundColor="#F56E1E"
              />
            </View>
            <Text style={s.qrHint}>Show this to your friend — they tap to join</Text>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* CTA */}
        {selected.length > 0 && (
          <View style={s.ctaWrap}>
            <TouchableOpacity onPress={submit} disabled={submitting} activeOpacity={0.88} style={s.ctaBtn} testID="am-submit">
              <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGrad}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={s.ctaTxt}>Add {selected.length} to group</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  title: { fontSize: 16, fontWeight: '900', color: c.text.primary, letterSpacing: -0.2 },
  groupName: { fontSize: 11, fontWeight: '700', color: c.text.muted, marginTop: 1 },
  scroll: { padding: SPACING.lg, gap: 10 },

  label: { fontSize: 10, fontWeight: '900', color: c.text.muted, letterSpacing: 1.2, marginTop: 6 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#C14A06' },
  personTxt: { fontSize: 12, fontWeight: '800', color: '#C14A06' },

  phoneInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg.secondary, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border.subtle },
  dialCode: { fontSize: 14, fontWeight: '900', color: c.text.primary },
  phoneInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: '700', color: c.text.primary, letterSpacing: 0.5 },
  addChipBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent.primary, justifyContent: 'center', alignItems: 'center' },

  emptyHint: { fontSize: 12, fontWeight: '600', color: c.text.muted, marginTop: 4 },

  waBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  waGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  waTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },

  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.subtle },
  altTxt: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  altSub: { flex: 1, fontSize: 11, fontWeight: '600', color: c.text.muted, textAlign: 'right' },

  qrCard: { backgroundColor: c.bg.secondary, borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: c.border.subtle, gap: 12, marginTop: 8 },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qrLbl: { fontSize: 10, fontWeight: '900', color: c.accent.primary, letterSpacing: 1.2 },
  qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border.subtle },
  qrHint: { fontSize: 11.5, fontWeight: '600', color: c.text.secondary, textAlign: 'center' },

  ctaWrap: { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: c.border.subtle, backgroundColor: c.bg.primary },
  ctaBtn: { borderRadius: 14, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15 },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
}));
