/**
 * PremiumUpsellRow — Home > below Discover.
 *
 * Per Profile re-architecture spec: monetization moves OUT of Profile
 * and lives on Home, below the Discover drawer. Renders NOTHING when
 * the user is already Pro — zero visual noise for paying users.
 *
 * Visual: brutalist hairline card. Left = offer label + one-line
 * benefit. Right = UPGRADE pill. Whole row is pressable → /premium.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';
import { useAuthStore } from '../../store/authStore';

interface Props {
  isPremium?: boolean;
}

export default function PremiumUpsellRow({ isPremium }: Props) {
  const { user } = useAuthStore();
  const pro = isPremium ?? !!(user as any)?.is_premium;
  if (pro) return null;

  const onPress = () => { try { router.push('/premium' as any); } catch {} };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTxt}>— PREMIUM</Text>
        <View style={styles.rule} />
      </View>

      <Pressable
        onPress={onPress}
        testID="home-premium-upsell"
        style={({ pressed }) => [
          styles.card,
          pressed && { backgroundColor: BR_COLORS.paperAlt },
        ]}
      >
        <View style={styles.iconBox}>
          <Ionicons name="diamond" size={16} color={BR_COLORS.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: BR_SPACE.md }}>
          <Text style={styles.title} numberOfLines={1}>Get MintU Pro</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Unlimited AI · advanced reports
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>UPGRADE</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: BR_SPACE.xl },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginBottom: BR_SPACE.md,
  },
  sectionTxt: {
    fontSize: 10, fontWeight: '800', letterSpacing: 2,
    color: BR_COLORS.muted,
  },
  rule: { flex: 1, height: BR_BORDER.hair, backgroundColor: BR_COLORS.line },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BR_SPACE.md,
    paddingVertical: BR_SPACE.md,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paper,
    minHeight: 64,
  },
  iconBox: {
    width: 36, height: 36,
    borderWidth: BR_BORDER.hair, borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    ...BR_TYPE.bodyBold,
    color: BR_COLORS.ink,
  },
  subtitle: {
    ...BR_TYPE.meta,
    color: BR_COLORS.muted,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: BR_COLORS.accent,
    borderWidth: BR_BORDER.bold,
    borderColor: BR_COLORS.ink,
  },
  pillTxt: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1.5,
    color: BR_COLORS.accentInk,
  },
});
