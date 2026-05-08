/**
 * Toast config — iOS-17 "Dynamic Island"-inspired pill toasts.
 * Round 30b: migrated to makeStyles + useAppColors so theme toggles
 * propagate without parent Stack remount.
 */
import React, { useEffect } from 'react';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppColors, RADIUS, SPACING, shadowStyle, COLORS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';



// R113 FIX — useStyles hoisted above first render-time call
// to avoid Metro/SDK52 TDZ error (`Cannot access X before init.`).
const useStyles = makeStyles(() => ({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    minHeight: 60,
    ...shadowStyle('#000', 6, 16, 0.16, 8),
  },
  iconChip: {
    width: 36, height: 36, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title:   { fontSize: 14.5, fontWeight: '800', letterSpacing: -0.2 },
  message: { fontSize: 12.5, fontWeight: '500', marginTop: 2, lineHeight: 17 },
  action:  { fontSize: 13, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 4, letterSpacing: -0.1 },
}));

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

interface BaseProps {
  variant: ToastVariant;
  text1?: string;
  text2?: string;
  action?: { label: string; onPress: () => void } | null;
}

const ICON: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error:   'close-circle',
  warning: 'warning',
  info:    'information-circle',
  neutral: 'ellipse',
};

/** Pick per-variant colors from the theme (adaptive). */
const themeFor = (v: ToastVariant, c: typeof COLORS) => {
  switch (v) {
    case 'success':
      return { accent: c.state.success, bgChip: c.state.successBg, border: c.state.successBorder };
    case 'error':
      return { accent: c.state.danger,  bgChip: c.state.dangerBg,  border: c.state.dangerBorder };
    case 'warning':
      return { accent: c.state.warning, bgChip: c.state.warningBg, border: c.state.warningBorder };
    case 'info':
      return { accent: c.accent.primary, bgChip: c.accent.primary + '1A', border: c.accent.primary + '33' };
    case 'neutral':
    default:
      return { accent: c.text.muted, bgChip: c.bg.card, border: c.border.subtle };
  }
};

const ToastBase: React.FC<BaseProps> = ({ variant, text1, text2, action }) => {
  const c = useAppColors();
  const styles = useStyles();
  const t = themeFor(variant, c);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (variant === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (variant === 'error' || variant === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [variant]);

  return (
    <View
      style={[styles.toast, { backgroundColor: c.bg.secondary, borderColor: t.border }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.iconChip, { backgroundColor: t.bgChip }]} accessibilityElementsHidden>
        <Ionicons name={ICON[variant]} size={20} color={t.accent} />
      </View>
      <View style={styles.textWrap}>
        {text1 ? <Text style={[styles.title, { color: c.text.primary }]} numberOfLines={1}>{text1}</Text> : null}
        {text2 ? <Text style={[styles.message, { color: c.text.muted }]} numberOfLines={2}>{text2}</Text> : null}
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} hitSlop={8} activeOpacity={0.7}>
          <Text style={[styles.action, { color: t.accent }]} numberOfLines={1}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

/**
 * Registered variants for react-native-toast-message.
 * `props.props` carries extras like `action` passed via Toast.show({ props: { action } }).
 */
export const toastConfig = {
  success: (p: any) => <ToastBase variant="success" text1={p.text1} text2={p.text2} action={p.props?.action || null} />,
  error:   (p: any) => <ToastBase variant="error"   text1={p.text1} text2={p.text2} action={p.props?.action || null} />,
  warning: (p: any) => <ToastBase variant="warning" text1={p.text1} text2={p.text2} action={p.props?.action || null} />,
  info:    (p: any) => <ToastBase variant="info"    text1={p.text1} text2={p.text2} action={p.props?.action || null} />,
  neutral: (p: any) => <ToastBase variant="neutral" text1={p.text1} text2={p.text2} action={p.props?.action || null} />,
};

