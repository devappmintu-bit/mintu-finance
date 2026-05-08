/**
 * ProfilePhotoSheet — Samsung Health–style action sheet for profile avatar CUD.
 * Round 30b: migrated to makeStyles + useAppColors.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Platform, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { COLORS, useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: GLASS.solidBg,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: c.text.primary, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, fontWeight: '500', color: c.text.muted, marginTop: 2, marginBottom: 18 },

  grid: { gap: 10 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: c.bg.primary,
    borderRadius: 0, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.border.subtle,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionTxt: { flex: 1, fontSize: 15.5, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },

  cancel: { marginTop: 14, paddingVertical: 14, alignItems: 'center', borderRadius: 0 },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: c.text.muted },
}));

interface Props {
  visible: boolean;
  hasAvatar: boolean;
  onClose: () => void;
  onPicked: (base64DataUri: string) => void;
  onRemoved: () => void;
}

export default function ProfilePhotoSheet({ visible, hasAvatar, onClose, onPicked, onRemoved }: Props) {
  const c = useAppColors();
  const s = useStyles();
  const haptic = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

  const handleCamera = async () => {
    haptic();
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Enable camera access in Settings to take a profile photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        onPicked(`data:image/jpeg;base64,${result.assets[0].base64}`);
        onClose();
      }
    } catch {
      Alert.alert('Camera error', 'Could not open camera. Please try again.');
    }
  };

  const handleLibrary = async () => {
    haptic();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Enable photo library access in Settings to choose a picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        onPicked(`data:image/jpeg;base64,${result.assets[0].base64}`);
        onClose();
      }
    } catch {
      Alert.alert('Photo error', 'Could not open photo library. Please try again.');
    }
  };

  const handleRemove = () => {
    haptic();
    Alert.alert(
      'Remove profile photo?',
      'Your avatar will be replaced with your initials.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => { onRemoved(); onClose(); },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title}>Profile photo</Text>
          <Text style={s.subtitle}>Update how you appear in MintU</Text>

          <View style={s.grid}>
            <Action
              icon="camera-outline"
              label="Take Photo"
              onPress={handleCamera}
              accent={c.accent.primary}
              mutedColor={c.text.muted}
              styles={s}
            />
            <Action
              icon="images-outline"
              label="Choose from Gallery"
              onPress={handleLibrary}
              accent="#6366F1"
              mutedColor={c.text.muted}
              styles={s}
            />
            {hasAvatar ? (
              <Action
                icon="trash-outline"
                label="Remove Photo"
                onPress={handleRemove}
                accent={COLORS.state.danger}
                mutedColor={c.text.muted}
                styles={s}
                destructive
              />
            ) : null}
          </View>

          <TouchableOpacity onPress={onClose} style={s.cancel} activeOpacity={0.75}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Action({
  icon, label, onPress, accent, destructive, mutedColor, styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accent: string;
  destructive?: boolean;
  mutedColor: string;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: accent + '1A', borderColor: accent + '33' }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={[styles.actionTxt, destructive && { color: accent }]} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={mutedColor} />
    </TouchableOpacity>
  );
}

