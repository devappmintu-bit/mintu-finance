/**
 * LanguageSheet — bottom sheet for language selection.
 * Extracted from profile.tsx (Round 2A refactor).
 * Round 30b: migrated to makeStyles so theme toggles propagate
 * without a full Stack remount.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { LANGUAGES, t } from '../../utils/i18n';
import { useLangStore } from '../../store/langStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function LanguageSheet({ visible, onClose }: Props) {
  const { lang, setLang } = useLangStore();
  const c = useAppColors();
  const s = useStyles();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.bg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>{t('language', lang)}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close language picker">
              <Ionicons name="close" size={22} color={c.text.primary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={LANGUAGES}
            keyExtractor={i => i.code}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.opt, lang === item.code && s.optActive]}
                onPress={() => { setLang(item.code); onClose(); }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.native}>{item.nativeName}</Text>
                  <Text style={s.english}>{item.name}</Text>
                </View>
                {lang === item.code ? (
                  <Ionicons name="checkmark-circle" size={22} color={c.accent.primary} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.bg.secondary,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32,
    maxHeight: '70%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.subtle, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },

  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: c.bg.primary, marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.border.subtle,
  },
  optActive: { borderColor: c.accent.primary, backgroundColor: c.accent.primary + '0E' },
  native: { fontSize: 15.5, fontWeight: '700', color: c.text.primary, letterSpacing: -0.2 },
  english: { fontSize: 12.5, fontWeight: '500', color: c.text.muted, marginTop: 2 },
}));
