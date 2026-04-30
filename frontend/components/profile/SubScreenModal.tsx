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
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppColors, GLASS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

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
          {/* Frosted blur band behind the header — gives the iOS glass feel. */}
          {Platform.OS !== 'web' ? (
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          ) : null}
          <LinearGradient
            colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.55)'] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
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
