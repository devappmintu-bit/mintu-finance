/**
 * InsightCard — AI-driven insight surface with gradient header, big-number
 * focal point, and optional CTA. Replaces chat-bubble UX for the AI Coach.
 *
 * Usage:
 *   <InsightCard
 *     icon="trending-up"
 *     tag="MONEY PULSE"
 *     headline="You saved ₹2,480 this week"
 *     body="That's 18% better than last week. Nice momentum, rockstar."
 *     ctaLabel="See breakdown"
 *     onPressCta={() => router.push('/analytics')}
 *   />
 */
import React from 'react';
import { Text, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from './TintedGlassCard';
import GlowPill from './GlowPill';
import NeonButton from './NeonButton';
import { COLORS, FONT_FAMILY, GRADIENT, SPACING } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  icon?: string;
  tag?: string;
  tagTone?: 'neon' | 'success' | 'danger' | 'premium' | 'warning';
  headline: string;
  body?: string;
  bigValue?: string;
  bigValueSuffix?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
  gradientStops?: readonly string[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function InsightCard({
  icon,
  tag,
  tagTone = 'neon',
  headline,
  body,
  bigValue,
  bigValueSuffix,
  ctaLabel,
  onPressCta,
  gradientStops = GRADIENT.neon,
  style,
  children,
}: Props) {
  const styles = useStyles();
  return (
    <GlassCard style={[styles.wrap, style]} tint="orange" radius={24}>
      {/* Gradient accent bar at top */}
      <LinearGradient
        colors={gradientStops as any}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.accentBar}
      />

      <View style={styles.body}>
        {/* Header: icon + tag */}
        <View style={styles.header}>
          {icon && (
            <LinearGradient
              colors={gradientStops as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.iconBubble}
            >
              <Ionicons name={icon as any} size={18} color="#fff" />
            </LinearGradient>
          )}
          {tag && <GlowPill label={tag} tone={tagTone} />}
        </View>

        {/* Big value if provided */}
        {bigValue && (
          <View style={styles.bigRow}>
            <Text style={styles.bigValue}>{bigValue}</Text>
            {bigValueSuffix && <Text style={styles.bigSuffix}>{bigValueSuffix}</Text>}
          </View>
        )}

        {/* Headline + body */}
        <Text style={styles.headline}>{headline}</Text>
        {body && <Text style={styles.bodyText}>{body}</Text>}

        {children}

        {/* CTA */}
        {ctaLabel && onPressCta && (
          <NeonButton label={ctaLabel} onPress={onPressCta} size="sm" style={styles.cta} icon="arrow-forward" />
        )}
      </View>
    </GlassCard>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBubble: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  bigValue: {
    fontSize: 38,
    fontFamily: FONT_FAMILY.black,
    color: c.text.primary,
    letterSpacing: -1,
  },
  bigSuffix: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
    color: c.text.secondary,
    letterSpacing: 0.3,
  },
  headline: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: c.text.primary,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.regular,
    color: c.text.secondary,
    lineHeight: 21,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
}));
