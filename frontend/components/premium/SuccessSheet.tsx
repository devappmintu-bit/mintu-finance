/**
 * components/premium/SuccessSheet.tsx — Round 72.
 *
 * Celebratory bottom sheet that morphs out of CheckoutSheet on a
 * successful payment / activation. Confetti + plan-unlocked title +
 * 3 high-value feature highlights + a single "Start exploring" CTA.
 *
 * Why a separate sheet (not just a toast)?
 *   • The user just spent money — they deserve an emotional reward.
 *   • Top-3 feature highlights act as silent onboarding so the first
 *     value-add happens within seconds of paying.
 *   • A dismiss CTA is more satisfying than an auto-fade toast.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS } from '../../utils/theme';
import { PLAN_META, type Plan } from '../../utils/premium';
import Confetti from '../Confetti';

interface Props {
  visible: boolean;
  plan: Plan | null;
  onDismiss: () => void;
}

export default function SuccessSheet({ visible, plan, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [confetti, setConfetti] = React.useState(false);

  useEffect(() => {
    if (visible) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { /* noop */ }
      // Pop animation + confetti
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      setConfetti(true);
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
      setConfetti(false);
    }
  }, [visible, scale, opacity]);

  if (!plan) return null;
  const meta = PLAN_META[plan];
  // Top 3 features only — quality > quantity.
  const top3 = (meta.features || []).slice(0, 3);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <Confetti trigger={confetti} onDone={() => setConfetti(false)} />

        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ scale }], opacity },
          ]}
        >
          {/* Diamond icon with halo */}
          <View style={styles.iconWrap}>
            <View
              style={[styles.iconBg, { backgroundColor: '#0A0A0A' }]}>
              <Ionicons name="diamond" size={34} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.kicker}>PLAN UNLOCKED</Text>
          <Text style={styles.title}>{meta.label} {meta.emoji}</Text>
          <Text style={styles.sub}>You're in. Here's what just unlocked:</Text>

          <View style={styles.features}>
            {top3.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.checkBubble}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.featureTxt} numberOfLines={2}>{f}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* noop */ }
              onDismiss();
            }}
            activeOpacity={0.88}
            style={styles.cta}
            testID="btn-start-exploring"
          >
            <View
              style={[styles.ctaBg, { backgroundColor: '#0A0A0A' }]}
            />
            <Text style={styles.ctaTxt}>Start exploring</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 28 },
      web: { boxShadow: '0 12px 40px rgba(15,23,42,0.30)' as any },
    }),
  },
  iconWrap: { marginBottom: 14 },
  iconBg: {
    width: 72, height: 72, borderRadius: 0,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: COLORS.accent.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
      web: { boxShadow: `0 8px 22px ${COLORS.accent.primary}66` as any },
    }),
  },
  kicker: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1.6,
    color: COLORS.accent.primary, marginBottom: 4,
  },
  title: {
    fontSize: 28, fontWeight: '900', color: COLORS.text.primary,
    letterSpacing: -0.6, marginBottom: 6,
  },
  sub: {
    fontSize: 13.5, color: COLORS.text.secondary,
    marginBottom: 22, textAlign: 'center', lineHeight: 19,
  },
  features: {
    width: '100%', gap: 10, marginBottom: 22,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 0,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(16,185,129,0.20)',
  },
  checkBubble: {
    width: 22, height: 22, borderRadius: 0,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  featureTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text.primary, letterSpacing: -0.1 },

  cta: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  ctaBg: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS.pill },
  ctaTxt: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.2 },
});
