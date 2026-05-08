/**
 * SubScreenModal — shared container for Profile's slide-up sub-screens.
 *
 * Round 56 — Glassmorphic upgrade: header is now a frosted BlurView band
 * pinned to the top (iOS-Crystal look) with a hairline separator. The
 * backdrop canvas keeps the warm off-white to match the app shell.
 *
 * Used by: Achievements, Payment Methods, Preferences, Notifications.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: c.bg.primary },
  headerWrap: {
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS.borderLight,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
}));

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Override contentContainerStyle of the inner ScrollView. */
  contentPadding?: number;
}

export default function SubScreenModal({ visible, title, onClose, children, contentPadding = 16 }: Props) {
  const c = useAppColors();
  const s = useStyles();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.bg} edges={['top', 'left', 'right']}>
        <View style={s.headerWrap}>
          {/* Round 89c — flat paper band (Brutalist mandate). */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#F4F1EA' }]}
          />
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={`Close ${title}`}>
              <Ionicons name="close" size={24} color={c.text.primary} />
            </TouchableOpacity>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

