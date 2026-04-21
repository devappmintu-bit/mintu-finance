/**
 * SoftPaywall — reusable conversion-first unlock prompt.
 *
 * Design:
 *   • Partial data visible above the blur (2-3 teaser rows)
 *   • BlurView overlay (native) or translucent fog (web) hiding deeper rows
 *   • Loss-framing headline — "You're missing ₹{amount} in savings"
 *   • Trust signals — 3 compact badges (users / rating / secure)
 *   • Emotional CTA — "Start saving today" with PulseCTA breathing ring
 *   • Inline — NOT a full screen (can live inside any card)
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import PulseCTA from './PulseCTA';
import { makeStyles } from '../../utils/makeStyles';

type Props = {
  lossAmount?: number;         // "You're missing ₹X"
  teaserLines?: string[];      // 1-3 visible bullet points (pre-blur)
  hiddenCount?: number;        // # of hidden insights behind blur
  ctaText?: string;            // override default
  ctaRoute?: string;           // default → /premium
  onPress?: () => void;
  compact?: boolean;           // smaller variant for inline use
};

const fmt = (n: number) => {
  const v = Math.round(Math.abs(n));
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
};

function SoftPaywall({
  lossAmount = 0,
  teaserLines = [],
  hiddenCount = 3,
  ctaText,
  ctaRoute = '/premium',
  onPress,
  compact = false,
}: Props) {
  const s = useStyles();

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (onPress) onPress();
    else try { router.push(ctaRoute as any); } catch {}
  };

  const ctaLabel = ctaText || (lossAmount > 0 ? `Unlock ${fmt(lossAmount)} savings` : 'Start saving today');

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      {/* Loss-framing headline */}
      <View style={s.lossRow}>
        <View style={s.lossIcon}>
          <Ionicons name="trending-down" size={14} color="#DC2626" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.lossLabel}>MONEY YOU'RE LEAKING</Text>
          <Text style={s.lossAmount} numberOfLines={1}>
            {lossAmount > 0 ? fmt(lossAmount) : 'Hidden insights'}
            <Text style={s.lossPeriod}>{lossAmount > 0 ? ' this month' : ''}</Text>
          </Text>
        </View>
      </View>

      {/* Teaser bullets (visible) */}
      {teaserLines.length > 0 && (
        <View style={s.teaserList}>
          {teaserLines.slice(0, 3).map((line, i) => (
            <View key={i} style={s.teaserRow}>
              <View style={s.bullet} />
              <Text style={s.teaserTxt} numberOfLines={2}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Blurred "hidden" preview section */}
      <View style={s.blurHost}>
        <View style={s.fakeRows}>
          <View style={s.fakeRow}><View style={[s.fakeBar, { width: '80%' }]} /><View style={[s.fakeBar, { width: 40 }]} /></View>
          <View style={s.fakeRow}><View style={[s.fakeBar, { width: '65%' }]} /><View style={[s.fakeBar, { width: 34 }]} /></View>
          <View style={s.fakeRow}><View style={[s.fakeBar, { width: '72%' }]} /><View style={[s.fakeBar, { width: 38 }]} /></View>
        </View>
        {Platform.OS !== 'web' ? (
          <BlurView intensity={28} tint="light" style={s.blurOverlay}>
            <View style={s.blurInner}>
              <Ionicons name="lock-closed" size={18} color="#C14A06" />
              <Text style={s.blurTxt}>{hiddenCount} more insights locked</Text>
            </View>
          </BlurView>
        ) : (
          <View style={[s.blurOverlay, s.webFog]}>
            <View style={s.blurInner}>
              <Ionicons name="lock-closed" size={18} color="#C14A06" />
              <Text style={s.blurTxt}>{hiddenCount} more insights locked</Text>
            </View>
          </View>
        )}
      </View>

      {/* Trust signals */}
      <View style={s.trustRow}>
        <View style={s.trustBadge}>
          <Ionicons name="people" size={11} color="#065F46" />
          <Text style={s.trustTxt}>50K+ users</Text>
        </View>
        <View style={s.trustBadge}>
          <Ionicons name="star" size={11} color="#B45309" />
          <Text style={s.trustTxt}>4.8★</Text>
        </View>
        <View style={s.trustBadge}>
          <Ionicons name="shield-checkmark" size={11} color="#1D4ED8" />
          <Text style={s.trustTxt}>RBI aligned</Text>
        </View>
      </View>

      {/* Primary CTA with pulse */}
      <PulseCTA>
        <TouchableOpacity activeOpacity={0.88} onPress={handlePress} style={s.ctaBtn} testID="softpaywall-cta">
          <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGrad}>
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={s.ctaTxt}>{ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={15} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </PulseCTA>
      <Text style={s.subCta}>7-day free trial · cancel anytime</Text>
    </View>
  );
}

export default memo(SoftPaywall);

const useStyles = makeStyles((c) => ({
  wrap: {
    backgroundColor: c.bg.secondary,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
    gap: 14,
  },
  wrapCompact: { padding: 12, gap: 10 },

  lossRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lossIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  lossLabel: { fontSize: 9.5, fontWeight: '900', color: '#B91C1C', letterSpacing: 1 },
  lossAmount: { fontSize: 22, fontWeight: '900', color: c.text.primary, letterSpacing: -0.6 },
  lossPeriod: { fontSize: 12, fontWeight: '700', color: c.text.muted },

  teaserList: { gap: 7 },
  teaserRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.accent.primary, marginTop: 6 },
  teaserTxt: { flex: 1, fontSize: 12.5, color: c.text.secondary, fontWeight: '600', lineHeight: 17 },

  blurHost: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  fakeRows: { gap: 8, padding: 10 },
  fakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fakeBar: { height: 9, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.1)' },
  blurOverlay: { ...{ position: 'absolute' }, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  webFog: { backgroundColor: 'rgba(255,255,255,0.78)' },
  blurInner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(193,74,6,0.2)' },
  blurTxt: { fontSize: 11, fontWeight: '800', color: '#7A2E0A' },

  trustRow: { flexDirection: 'row', gap: 6 },
  trustBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 999, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle },
  trustTxt: { fontSize: 10, fontWeight: '800', color: c.text.secondary },

  ctaBtn: { borderRadius: 14, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 16 },
  ctaTxt: { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  subCta: { fontSize: 10.5, fontWeight: '700', color: c.text.muted, textAlign: 'center', marginTop: -6 },
}));
