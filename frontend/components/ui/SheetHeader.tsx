/**
 * SheetHeader — unified top of every bottom-sheet modal across MintU.
 *
 *   ▬▬▬▬▬  (drag handle)
 *   Title               ✕
 *   optional subtitle
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { useHaptic } from '../../hooks/useHaptic';

interface Props {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  showHandle?: boolean;
}

export default function SheetHeader({ title, subtitle, onClose, showHandle = true }: Props) {
  const s = useStyles();
  const haptic = useHaptic();
  return (
    <View>
      {showHandle && <View style={s.handle} />}
      <View style={s.row}>
        <View style={{ flex: 1, paddingRight: onClose ? 12 : 0 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
        </View>
        {onClose && (
          <TouchableOpacity
            onPress={() => { haptic.light(); onClose(); }}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={s.closeBtn}
            testID="sheet-close-btn"
            accessibilityLabel="Close sheet"
          >
            <Ionicons name="close" size={20} color={COLORS.text.secondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.gray[300], alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 12 },
  title: { fontSize: 19, fontWeight: '800', color: c.text.primary, letterSpacing: -0.3 },
  sub: { fontSize: 12.5, fontWeight: '600', color: c.text.secondary, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: c.gray[100],
    alignItems: 'center', justifyContent: 'center',
  },
}));
