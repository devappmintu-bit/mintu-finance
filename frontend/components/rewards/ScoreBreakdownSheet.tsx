/**
 * components/rewards/ScoreBreakdownSheet.tsx — Round 73.
 *
 * Bottom-sheet that opens when the user taps the score ring.
 * Shows the 4 sub-score components (Tracking, Budget, Streak,
 * Savings), each as a row with icon + label + filled bar +
 * "X / 25" reading. Total adds up to the user's money_score.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, RADIUS } from '../../utils/theme';

interface BreakdownItem {
  label: string;
  value: number;
  max: number;
  icon: string;
}

interface Props {
  visible: boolean;
  total: number;
  items: BreakdownItem[];
  urgencyText?: string | null;
  onClose: () => void;
}

export default function ScoreBreakdownSheet({ visible, total, items, urgencyText, onClose }: Props) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const slideY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }], opacity: slide }]}>
          <View style={styles.handleRow}><View style={styles.handle} /></View>

          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>HOW YOUR SCORE IS BUILT</Text>
              <Text style={styles.totalRow}>
                <Text style={styles.totalNum}>{total}</Text>
                <Text style={styles.totalOf}>/100</Text>
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.text.secondary} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {items.map((it) => {
              const pct = Math.min(100, Math.round((it.value / Math.max(1, it.max)) * 100));
              return (
                <View key={it.label} style={styles.item}>
                  <View style={styles.itemHead}>
                    <View style={styles.itemIcon}>
                      <Ionicons name={it.icon as any} size={14} color={COLORS.accent.primary} />
                    </View>
                    <Text style={styles.itemLbl}>{it.label}</Text>
                    <Text style={styles.itemVal}>{it.value}<Text style={styles.itemMax}>/{it.max}</Text></Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${pct}%` }]}>
                      <View
                        style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A' }]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {urgencyText ? (
            <View style={styles.urgency}>
              <Ionicons name="flash" size={13} color="#FFFFFF" />
              <Text style={styles.urgencyTxt}>{urgencyText}</Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 8,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 22,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -6 } },
      android: { elevation: 24 },
      web: { boxShadow: '0 -10px 30px rgba(15,23,42,0.20)' as any },
    }),
  },
  handleRow: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(15,23,42,0.18)' },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingBottom: 14 },
  kicker: { fontSize: 10, fontFamily: FONT_FAMILY.bold, letterSpacing: 1.4, color: COLORS.text.muted },
  totalRow: { marginTop: 4 },
  totalNum: {
    fontSize: 36, fontFamily: FONT_FAMILY.black, color: COLORS.text.primary, letterSpacing: -1,
  },
  totalOf: { fontSize: 16, fontWeight: '700', color: COLORS.text.muted, letterSpacing: -0.3 },
  list: { gap: 14, paddingTop: 4 },
  item: { gap: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemIcon: {
    width: 28, height: 28, borderRadius: 0,
    backgroundColor: COLORS.accent.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  itemLbl: { flex: 1, fontSize: 13.5, fontFamily: FONT_FAMILY.semibold, color: COLORS.text.primary },
  itemVal: { fontSize: 14, fontWeight: '900', color: COLORS.accent.primary },
  itemMax: { fontSize: 11, fontWeight: '700', color: COLORS.text.muted },
  bar: {
    height: 7, borderRadius: 4,
    backgroundColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  urgency: {
    marginTop: 18,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent.primary,
  },
  urgencyTxt: {
    flex: 1, fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.1,
  },
});
