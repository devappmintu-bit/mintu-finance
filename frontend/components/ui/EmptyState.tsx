/**
 * EmptyState — friendly empty view with icon, title, subtitle, and optional CTA.
 * Used app-wide wherever a list could be empty (budgets, transactions, split, etc.)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from './PrimaryButton';
import { COLORS } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  compact?: boolean;
}

export default function EmptyState({ icon, emoji, title, subtitle, ctaLabel, onCta, compact }: Props) {
  const s = useStyles();
  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <View style={s.iconWrap}>
        {emoji ? (
          <Text style={s.emoji}>{emoji}</Text>
        ) : (
          <Ionicons name={icon || 'sparkles-outline'} size={compact ? 36 : 44} color={COLORS.accent.primary} />
        )}
      </View>
      <Text style={[s.title, compact && s.titleCompact]}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {!!ctaLabel && onCta && (
        <View style={{ marginTop: 16, width: '70%' }}>
          <PrimaryButton label={ctaLabel} onPress={onCta} size={compact ? 'sm' : 'md'} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  wrapCompact: { paddingVertical: 28 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: c.accent.primary + '1F',    // theme-adaptive 12% tint of accent
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1, borderColor: c.accent.primary + '33',
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 17, fontWeight: '800', color: c.text.primary, textAlign: 'center', letterSpacing: -0.2 },
  titleCompact: { fontSize: 15 },
  subtitle: { fontSize: 13, fontWeight: '500', color: c.text.secondary, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: 280 },
}));
