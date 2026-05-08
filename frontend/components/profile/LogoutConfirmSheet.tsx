/**
 * LogoutConfirmSheet — clean bottom sheet for logout confirmation.
 * Replaces Alert.alert / window.confirm with in-app UX.
 */
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS, GLASS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: GLASS.solidBg, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: GLASS.borderLight, padding: 20, paddingBottom: 32, alignItems: 'center' },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, marginBottom: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 0, backgroundColor: c.bg.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: c.text.primary, textAlign: 'center', letterSpacing: -0.3 },
  sub: { fontSize: 13, fontWeight: '500', color: c.text.muted, textAlign: 'center', marginTop: 6, lineHeight: 17, marginBottom: 20 },

  primary: { width: '100%', paddingVertical: 14, borderRadius: 0, backgroundColor: c.state.danger, alignItems: 'center', marginBottom: 8 },
  primaryTxt: { fontSize: 14.5, fontWeight: '700', color: c.bg.elevated },
  secondary: { width: '100%', paddingVertical: 14, borderRadius: 0, alignItems: 'center' },
  secondaryTxt: { fontSize: 14, fontWeight: '600', color: c.text.secondary },
}));

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmSheet({ visible, onCancel, onConfirm }: Props) {
  const s = useStyles();
  const haptic = (heavy = false) => {
    if (Platform.OS === 'web') return;
    (heavy
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    ).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%' }}>
          <View style={s.sheet}>
            <View style={s.grip} />
            <View style={s.iconCircle}>
              <Ionicons name="log-out-outline" size={24} color={COLORS.text.muted} />
            </View>
            <Text style={s.title}>Log out?</Text>
            <Text style={s.sub}>You can sign back in anytime with your phone and PIN.</Text>

            <TouchableOpacity
              style={s.primary}
              onPress={() => { haptic(true); onConfirm(); }}
              activeOpacity={0.88}
              testID="logout-confirm"
            >
              <Text style={s.primaryTxt}>Log out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondary}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={s.secondaryTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

