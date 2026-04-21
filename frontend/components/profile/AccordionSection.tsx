/**
 * AccordionSection — reusable collapsible module for Profile (Delta 2).
 *
 * Design:
 *   • Single-tap header with animated chevron
 *   • LayoutAnimation for smooth expand/collapse
 *   • Optional subtitle + count badge
 *   • Haptic on toggle
 *   • Default collapsed (per spec — reduce cognitive overload)
 *   • Supports lazy rendering: children only mount after first open
 */
import React, { memo, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  badgeCount?: number;
  defaultOpen?: boolean;
  lazy?: boolean; // if true, children only render after first open
  children: React.ReactNode;
};

function AccordionSection({
  icon = 'chevron-down', iconTint = '#F56E1E', iconBg,
  title, subtitle, badgeCount, defaultOpen = false, lazy = true, children,
}: Props) {
  const s = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  const toggle = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => {
      if (!v && !everOpened) setEverOpened(true);
      return !v;
    });
  }, [everOpened]);

  const shouldRender = lazy ? everOpened : true;

  return (
    <View style={[s.card, open && s.cardOpen]}>
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.7}>
        {icon && (
          <View style={[s.iconBubble, { backgroundColor: iconBg || (iconTint + '1A') }]}>
            <Ionicons name={icon} size={16} color={iconTint} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={s.title}>{title}</Text>
            {typeof badgeCount === 'number' && badgeCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeTxt}>{badgeCount}</Text>
              </View>
            )}
          </View>
          {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
      </TouchableOpacity>
      {open && shouldRender && (
        <View style={s.body}>
          {children}
        </View>
      )}
    </View>
  );
}

export default memo(AccordionSection);

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.bg.secondary,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  cardOpen: { borderColor: c.accent.primary + '50' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconBubble: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14.5, fontWeight: '800', color: c.text.primary, letterSpacing: -0.2 },
  badge: { backgroundColor: c.accent.primary + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, minWidth: 20, alignItems: 'center' },
  badgeTxt: { fontSize: 10.5, fontWeight: '900', color: c.accent.primary },
  sub: { fontSize: 11.5, color: c.text.secondary, marginTop: 2, fontWeight: '600' },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
}));
