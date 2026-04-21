/**
 * SectionHeader — uppercase eyebrow title with optional right action.
 *
 * Visual: 10.5px 900-weight saffron-tinted muted label + spaced letters.
 * Use above any card block for consistent typography across the app.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  title: string;
  actionLabel?: string;
  actionIcon?: string;
  onAction?: () => void;
  tone?: 'muted' | 'primary';
  testID?: string;
};

export default function SectionHeader({ title, actionLabel, actionIcon, onAction, tone = 'muted', testID }: Props) {
  const s = useStyles();
  return (
    <View style={s.row} testID={testID}>
      <Text style={[s.title, tone === 'primary' && { color: COLORS.accent.primary }]}>{title}</Text>
      {!!onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <View style={s.action}>
            {actionLabel && <Text style={s.actionT}>{actionLabel}</Text>}
            {actionIcon && <Ionicons name={actionIcon as any} size={13} color={COLORS.accent.primary} />}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 11,
    fontWeight: '900',
    color: c.text.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actionT: { fontSize: 11.5, fontWeight: '800', color: c.accent.primary, letterSpacing: 0.2 },
}));
