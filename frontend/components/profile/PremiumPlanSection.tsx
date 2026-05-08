/**
 * PremiumPlanSection — owned by the Profile Control Center.
 *
 * Premium card was previously homed below Discover on Home. User
 * directive: "Move the premium card to profile without fail". This
 * lives inside the Profile screen as its own "PLAN" section, sitting
 * between the identity row and the Quick Controls strip.
 *
 * Two visual modes:
 *   • Free  — orange-bordered hero with diamond icon, headline value
 *             prop, list of 3 perks, primary UPGRADE pill.
 *   • Pro   — slim status row showing the active plan + manage CTA.
 *
 * Strict Brutalist: 2px ink borders, BR_STAMP.accent for the upsell
 * card so it telegraphs offer-energy without breaking the language.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_STAMP } from '../../utils/brutalist';
import { useAuthStore } from '../../store/authStore';

interface Props {
  onPress?: () => void;
}

export default function PremiumPlanSection({ onPress }: Props) {
  const { user } = useAuthStore();
  const isPremium = !!(user as any)?.is_premium;
  const planLabel: string = (user as any)?.premium_plan || 'MintU Pro';

  const handlePress = () => {
    if (onPress) return onPress();
    try { router.push('/premium' as any); } catch { /* noop */ }
  };

  // ── Section header (matches the rest of the Brutalist profile sections)
  const Header = (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTxt, { color: BR_COLORS.muted }]}>— PLAN</Text>
      <View style={styles.sectionRule} />
    </View>
  );

  // ── Pro state: thin status card, no upsell theatre.
  if (isPremium) {
    return (
      <View style={{ marginTop: BR_SPACE.xl }}>
        {Header}
        <Pressable
          onPress={handlePress}
          testID="profile-plan-pro"
          style={({ pressed }) => [
            styles.proCard,
            pressed && { backgroundColor: BR_COLORS.paperAlt },
          ]}
        >
          <View style={styles.proIcon}>
            <Ionicons name="diamond" size={18} color={BR_COLORS.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: BR_SPACE.md }}>
            <Text style={styles.proTitle}>{planLabel}</Text>
            <Text style={styles.proSub}>Manage subscription · Renewal · Receipts</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={BR_COLORS.ink} />
        </Pressable>
      </View>
    );
  }

  // ── Free state: hero upsell card with 3 perks + UPGRADE pill.
  return (
    <View style={{ marginTop: BR_SPACE.xl }}>
      {Header}
      <Pressable
        onPress={handlePress}
        testID="profile-plan-upgrade"
        style={({ pressed }) => [
          styles.card,
          BR_STAMP.accent,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.cardHead}>
          <View style={styles.iconBox}>
            <Ionicons name="diamond" size={20} color={BR_COLORS.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: BR_SPACE.md }}>
            <Text style={styles.title} numberOfLines={1}>Get MintU Pro</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              Unlimited AI Coach · advanced reports · auto-import
            </Text>
          </View>
        </View>

        <View style={styles.perksWrap}>
          <Perk text="Unlimited AI Coach + multi-agent answers" />
          <Perk text="Pro reports — tax, investment, year-in-review" />
          <Perk text="Auto-import banking SMS + Gmail receipts" />
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaTxt}>UPGRADE</Text>
          <Ionicons name="arrow-forward" size={14} color={BR_COLORS.accentInk} />
        </View>
      </Pressable>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perkRow}>
      <Ionicons name="checkmark" size={14} color={BR_COLORS.accent} />
      <Text style={styles.perkTxt} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginBottom: BR_SPACE.md,
  },
  sectionTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  sectionRule: { flex: 1, height: BR_BORDER.hair, backgroundColor: BR_COLORS.line },

  // Free state — hero upsell
  card: {
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    padding: BR_SPACE.md,
  },
  pressed: { transform: [{ translateX: 1 }, { translateY: 1 }], opacity: 0.96 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40, height: 40,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    ...BR_TYPE.h3,
    color: BR_COLORS.ink,
  },
  subtitle: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
  },

  perksWrap: {
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.sm,
    borderTopWidth: BR_BORDER.hair,
    borderColor: BR_COLORS.line,
    gap: 6,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
  },
  perkTxt: {
    ...BR_TYPE.body,
    fontSize: 13,
    color: BR_COLORS.ink,
    flex: 1,
  },

  cta: {
    marginTop: BR_SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  ctaTxt: {
    fontSize: 12, fontWeight: '900', letterSpacing: 2,
    color: BR_COLORS.accentInk,
  },

  // Pro state — slim status
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
  },
  proIcon: {
    width: 36, height: 36,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  proTitle: {
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.ink,
  },
  proSub: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
  },
});
