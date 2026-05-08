/**
 * ActionableAlertCard — interactive alert with 1-3 CTA buttons.
 * Backend emits `actions[]` per alert; we render them as tap-through pills.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';
import { COLORS } from '../../utils/theme';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles(() => ({
  card: { borderRadius: 0, padding: 12, marginBottom: 10, borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBubble: { width: 38, height: 38, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 19 },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 3, letterSpacing: -0.2 },
  message: { fontSize: 12.5, color: '#374151', lineHeight: 17, fontWeight: '500' },
  ctaRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 0, borderWidth: 1 },
  ctaTxt: { fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },
}));

type AlertAction = {
  label: string;
  route: string;
  style?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
};

type Props = {
  emoji: string;
  severity: 'danger' | 'warning' | 'success' | 'info' | string;
  title: string;
  message: string;
  actions?: AlertAction[];
};

const THEME: Record<string, { bg: string; border: string; iconBg: string; title: string }> = {
  danger:  { bg: '#FEF2F2', border: '#FCA5A5', iconBg: '#FEE2E2', title: '#991B1B' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', iconBg: '#FEF3C7', title: '#92400E' },
  success: { bg: '#F0FDF4', border: '#86EFAC', iconBg: '#DCFCE7', title: '#166534' },
  info:    { bg: '#EFF6FF', border: '#BFDBFE', iconBg: '#DBEAFE', title: '#1E40AF' },
};

const BTN: Record<string, { bg: string; fg: string; border: string }> = {
  primary:   { bg: COLORS.text.primary, fg: '#FFFFFF', border: COLORS.text.primary },
  secondary: { bg: '#FFFFFF', fg: '#1F2937', border: '#E5E7EB' },
  danger:    { bg: COLORS.state.danger, fg: '#FFFFFF', border: COLORS.state.danger },
};

function ActionableAlertCard({ emoji, severity, title, message, actions }: Props) {
  const s = useStyles();
  const theme = THEME[severity] || THEME.info;

  const go = (a: AlertAction) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { router.push(a.route as any); } catch (e) { if (__DEV__) console.warn('alert nav', e); }
  };

  return (
    <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      <View style={s.topRow}>
        <View style={[s.iconBubble, { backgroundColor: theme.iconBg }]}>
          <Text style={s.emoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.title }]} numberOfLines={2}>{title}</Text>
          <Text style={s.message} numberOfLines={3}>{message}</Text>
        </View>
      </View>
      {!!(actions && actions.length) && (
        <View style={s.ctaRow}>
          {actions.slice(0, 3).map((a, i) => {
            const btn = BTN[a.style || (i === 0 ? 'primary' : 'secondary')] || BTN.primary;
            return (
              <TouchableOpacity key={a.label + i} onPress={() => go(a)} activeOpacity={0.8} style={[s.ctaBtn, { backgroundColor: btn.bg, borderColor: btn.border }]}>
                {a.icon && <Ionicons name={a.icon} size={13} color={btn.fg} />}
                <Text style={[s.ctaTxt, { color: btn.fg }]} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default memo(ActionableAlertCard);

