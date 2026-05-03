/**
 * ProfileSheet — the "Identity Control Node" entered by tapping the
 * avatar. Brutalist bottom sheet with:
 *   • Avatar
 *   • Name + Phone/Email
 *   • Edit Profile (name)
 *   • Change Avatar
 *   • Log out
 */
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER, BR_STAMP } from '../../../utils/brutalist';

export interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
  onEditName: () => void;
  onChangeAvatar: () => void;
  onLogout: () => void;
}

export default function ProfileSheet({
  visible, onClose, name, phone, avatar,
  onEditName, onChangeAvatar, onLogout,
}: ProfileSheetProps) {
  const initial = (name || 'U').trim().charAt(0).toUpperCase();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.wrap}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {/* Identity block */}
          <View style={styles.idRow}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: BR_SPACE.md }}>
              <Text style={[BR_TYPE.h3]} numberOfLines={1}>
                {name || 'Set your name'}
              </Text>
              <Text style={[BR_TYPE.meta, { marginTop: 2 }]} numberOfLines={1}>
                {phone ? maskPhone(phone) : 'No phone on file'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={18} color={BR_COLORS.ink} />
            </Pressable>
          </View>

          {/* Actions */}
          <Row icon="create-outline"  label="Edit profile"  onPress={() => { onClose(); setTimeout(onEditName, 150); }} />
          <Row icon="camera-outline"  label="Change avatar" onPress={() => { onClose(); setTimeout(onChangeAvatar, 150); }} />
          <Row icon="log-out-outline" label="Log out"       danger onPress={() => { onClose(); setTimeout(onLogout, 150); }} testID="ps-logout" />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ icon, label, onPress, danger, testID }: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string; onPress: () => void; danger?: boolean; testID?: string;
}) {
  const color = danger ? BR_COLORS.negative : BR_COLORS.ink;
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [
      row.wrap, pressed && { backgroundColor: BR_COLORS.paperAlt },
    ]}>
      <View style={[row.icon, { borderColor: color }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[BR_TYPE.bodyBold, { color, flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={color} />
    </Pressable>
  );
}

function maskPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length < 4) return phone;
  return `${d.slice(0, 2)} •••• ${d.slice(-4)}`;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  wrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: BR_COLORS.paper,
    borderTopWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    padding: BR_SPACE.lg,
    paddingTop: BR_SPACE.sm,
    ...BR_STAMP.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36, height: 4,
    backgroundColor: BR_COLORS.ink,
    marginBottom: BR_SPACE.md,
  },
  idRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: BR_SPACE.md,
    borderBottomWidth: BR_BORDER.hair, borderColor: BR_COLORS.line,
  },
  avatar: { width: 52, height: 52, borderWidth: BR_BORDER.bold, borderColor: BR_COLORS.ink, borderRadius: 0 },
  avatarFallback: { backgroundColor: BR_COLORS.paperAlt, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 22, fontWeight: '900', color: BR_COLORS.ink },
  close: {
    width: 32, height: 32,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },
});

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: BR_SPACE.md,
    paddingVertical: 14, paddingHorizontal: 4,
    minHeight: 52,
  },
  icon: {
    width: 32, height: 32,
    borderWidth: BR_BORDER.hair,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
});
