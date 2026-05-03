/**
 * components/split/InviteGroupSheet.tsx — Round 57d extraction.
 *
 * Pure presentational sheet shown immediately after a Split group is
 * created. Two CTAs (WhatsApp invite, Copy link) plus a "Do it later"
 * dismissal that hands control back to the parent so it can auto-open
 * the new group's summary.
 *
 * Extracted from app/(tabs)/split.tsx to shave ~65 LOC off the parent
 * and isolate the brand-literal styles (WhatsApp #25D366) for clarity.
 * NO data flow changes — the parent still owns inviteGroup state and
 * the openSummary handler.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS } from '../../utils/theme';
import { shareSmart, copyToClipboard } from '../../utils/share';

export interface InviteGroup {
  id: string;
  name: string;
  memberCount: number;
}

interface Props {
  group: InviteGroup | null;
  onClose: () => void;
  /** "Do it later" — dismiss + open summary for the just-created group. */
  onSkip: (g: { id: string; name: string }) => void;
}

export default function InviteGroupSheet({ group, onClose, onSkip }: Props) {
  if (!group) return null;
  const inviteUrl = `https://mintu.app/split/invite/${group.id}`;

  const inviteWhatsApp = async () => {
    const msg =
      `Hey! I made a "${group.name}" group on MintU to track our shared expenses 💸\n\nJoin here → ${inviteUrl}`;
    await shareSmart({ message: msg, title: 'Join my MintU group' });
  };

  const copyLink = async () => {
    await copyToClipboard(inviteUrl, '🔗 Invite link copied');
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-circle" size={38} color={COLORS.accent.moneyIn} />
            </View>
            <Text style={styles.title}>Group Created! 🎉</Text>
            <Text style={styles.subtitle}>
              {group.name} · {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
            </Text>
          </View>

          <Text style={styles.hint}>Invite friends so they can log expenses with you</Text>

          {/* WhatsApp brand green (#25D366) is an intentional brand literal. */}
          <TouchableOpacity style={styles.waBtn} onPress={inviteWhatsApp} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.waBtnTxt}>Invite via WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.copyBtn} onPress={copyLink} activeOpacity={0.85}>
            <Ionicons name="copy-outline" size={18} color={COLORS.text.primary} />
            <Text style={styles.copyBtnTxt}>Copy invite link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onSkip({ id: group.id, name: group.name })}
            style={styles.skipBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnTxt}>Do it later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: GLASS.solidBg,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    padding: 24, paddingBottom: 36, gap: 14,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border.subtle, alignSelf: 'center', marginBottom: 8 },
  header: { alignItems: 'center', marginBottom: 4 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 0,
    backgroundColor: COLORS.accent.moneyIn + '15',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.text.primary },
  subtitle: { fontSize: 13, color: COLORS.text.secondary, marginTop: 3, textAlign: 'center' },
  hint: { fontSize: 13, color: COLORS.text.muted, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 999,
  },
  waBtnTxt: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.bg.card, paddingVertical: 14, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border.card,
  },
  copyBtnTxt: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
  skipBtn: { paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  skipBtnTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted },
});
