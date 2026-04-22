/**
 * SubScreenModal — shared container for Profile's slide-up sub-screens.
 *
 * Used by: Achievements, Payment Methods, Preferences, Notifications.
 * Eliminates ~80 LOC of duplicated header/scaffold boilerplate.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Override contentContainerStyle of the inner ScrollView. */
  contentPadding?: number;
}

export default function SubScreenModal({ visible, title, onClose, children, contentPadding = 16 }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.bg}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={`Close ${title}`}>
            <Ionicons name="close" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: contentPadding, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border.subtle,
  },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text.primary, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
});
