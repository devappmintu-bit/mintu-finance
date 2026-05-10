/**
 * components/intelligence/BehaviorInsightsCard.tsx — R118 SLICE B
 *
 * Behavioral finance engine surface. Renders the 1-3 most-active
 * behavioral patterns from /api/intelligence/behavior on the home
 * dashboard as a horizontally-scrollable strip of insight tiles.
 *
 * Each tile shows:
 *   • emoji + title (LATE NIGHT / WEEKEND / PAYDAY / STRESS)
 *   • signal_text (short headline metric)
 *   • encouraging copy (NEVER judgmental)
 *   • confidence pill (VERIFIED ≥0.7 / ESTIMATED ≥0.4 / SUGGESTED <0.4)
 *
 * Tap a tile → opens a modal with the full evidence trace so the user
 * understands "Why am I seeing this?".
 *
 * If no patterns are active, the strip stays hidden (honest UX).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBehavior, type BehaviorInsight } from '../../hooks/useIntelligence';
import { BR_COLORS, BR_TYPE, BR_SPACE, BR_BORDER, BR_FONT } from '../../utils/brutalist';

const KIND_PALETTE: Record<string, { bg: string; ink: string; ring: string }> = {
  late_night_impulse: { bg: '#E5DAFE', ink: '#2A1A66', ring: '#5840CC' },
  weekend_overspend:  { bg: '#FFE4B8', ink: '#5A2D00', ring: '#E07B00' },
  payday_inflation:   { bg: '#FFE0E8', ink: '#660A2C', ring: '#C7244D' },
  stress_pattern:     { bg: '#D6EFFF', ink: '#0A3A66', ring: '#1865B5' },
};

function confTier(c: number): { label: string; bg: string; ink: string } {
  if (c >= 0.7) return { label: 'VERIFIED',  bg: '#0B6E3A', ink: '#FFFFFF' };
  if (c >= 0.4) return { label: 'ESTIMATED', bg: '#B87400', ink: '#FFFFFF' };
  return                  { label: 'SUGGESTED', bg: BR_COLORS.muted, ink: '#FFFFFF' };
}

function fmtINR(n: number) {
  if (!n) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function InsightTile({
  insight, onPress,
}: { insight: BehaviorInsight; onPress: () => void }) {
  const palette = KIND_PALETTE[insight.kind] || KIND_PALETTE.weekend_overspend;
  const tier = confTier(insight.confidence);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: palette.bg, borderColor: palette.ink },
        pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${insight.title}: ${insight.signal_text}`}
    >
      <View style={styles.tileHead}>
        <Text style={styles.tileEmoji}>{insight.emoji}</Text>
        <View style={[styles.tierPill, { backgroundColor: tier.bg }]}>
          <Text style={[styles.tierTxt, { color: tier.ink }]}>{tier.label}</Text>
        </View>
      </View>
      <Text style={[styles.tileTitle, { color: palette.ink }]}>
        {insight.title.toUpperCase()}
      </Text>
      <Text style={[styles.tileSignal, { color: palette.ink }]} numberOfLines={2}>
        {insight.signal_text}
      </Text>
      <Text style={[styles.tileCopy, { color: palette.ink }]} numberOfLines={3}>
        {insight.copy}
      </Text>
    </Pressable>
  );
}

function EvidenceSheet({
  visible, onClose, insight,
}: { visible: boolean; onClose: () => void; insight: BehaviorInsight | null }) {
  if (!insight) return null;
  const palette = KIND_PALETTE[insight.kind] || KIND_PALETTE.weekend_overspend;
  const ev = insight.evidence || {};
  const rows = Object.entries(ev).flatMap(([k, v]) => {
    if (Array.isArray(v)) {
      return v.length === 0
        ? [[k, '—']]
        : v.map((row, i) => [
            `${k}[${i}]`,
            typeof row === 'object'
              ? Object.entries(row).map(([rk, rv]) => `${rk}=${rv}`).join('  ·  ')
              : String(row),
          ]);
    }
    if (v === null || v === undefined) return [[k, '—']];
    if (typeof v === 'number') {
      // Heuristic format
      const str = (k.includes('total') || k.includes('amount') || k.includes('avg'))
        ? fmtINR(v as number)
        : (v as number).toString();
      return [[k, str]];
    }
    return [[k, String(v)]];
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={[styles.sheetHero, { backgroundColor: palette.bg, borderBottomColor: palette.ink }]}>
            <View style={styles.sheetHeroRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetKicker, { color: palette.ink }]}>BEHAVIOR PATTERN</Text>
                <Text style={[styles.sheetTitle, { color: palette.ink }]}>
                  {insight.emoji}  {insight.title}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={BR_COLORS.ink} />
              </Pressable>
            </View>
            <Text style={[styles.sheetSignal, { color: palette.ink }]}>
              {insight.signal_text}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: BR_SPACE.lg }}>
            <Text style={styles.sheetBody}>{insight.copy}</Text>

            <Text style={styles.evidenceHead}>EVIDENCE TRACE</Text>
            <View style={styles.evidenceBox}>
              {rows.map(([k, v]) => (
                <View key={k} style={styles.evRow}>
                  <Text style={styles.evK}>{k}</Text>
                  <Text style={styles.evV} numberOfLines={2}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sourceFoot}>
              Confidence: {Math.round(insight.confidence * 100)}% · derived
              deterministically from your last 60 days. No LLM.
            </Text>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function BehaviorInsightsCard() {
  const { data, loading } = useBehavior();
  const [openInsight, setOpen] = useState<BehaviorInsight | null>(null);

  const tiles = useMemo(
    () => (data?.insights || []).filter(i => i.is_active),
    [data?.insights],
  );

  if (loading && !data) return null;
  if (!data || tiles.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>BEHAVIOUR · LAST 60 DAYS</Text>
        {data.active_count > 1 && (
          <Text style={styles.sectionMeta}>{data.active_count} patterns</Text>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollPad}
      >
        {tiles.map(insight => (
          <InsightTile
            key={insight.kind}
            insight={insight}
            onPress={() => setOpen(insight)}
          />
        ))}
      </ScrollView>
      <EvidenceSheet
        visible={!!openInsight}
        insight={openInsight}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: BR_SPACE.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE.lg,
    marginBottom: BR_SPACE.sm,
  },
  sectionLabel: {
    ...BR_TYPE.label,
    color: BR_COLORS.muted,
    letterSpacing: 1.8,
    fontSize: 10,
  },
  sectionMeta: {
    fontSize: 10,
    fontWeight: '900',
    color: BR_COLORS.ink,
    letterSpacing: 1.2,
  },
  scrollPad: {
    paddingHorizontal: BR_SPACE.lg,
    paddingVertical: 4,
    gap: BR_SPACE.md,
  },

  // Tile
  tile: {
    width: 220,
    minHeight: 158,
    padding: BR_SPACE.md,
    borderWidth: BR_BORDER.bold,
    marginRight: BR_SPACE.md,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tileEmoji: { fontSize: 22 },
  tierPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.2,
    borderColor: BR_COLORS.ink,
  },
  tierTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },

  tileTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 2,
  },
  tileSignal: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
    marginTop: 4,
    lineHeight: 18,
  },
  tileCopy: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 6,
    opacity: 0.9,
  },

  // Sheet
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: BR_COLORS.paper,
    borderTopWidth: 3,
    borderTopColor: BR_COLORS.ink,
  },
  sheetHero: {
    padding: BR_SPACE.lg,
    borderBottomWidth: 2,
  },
  sheetHeroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sheetKicker: { ...BR_TYPE.label, letterSpacing: 1.8, fontSize: 10 },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  sheetSignal: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: BR_SPACE.md,
    paddingTop: BR_SPACE.md,
    borderTopWidth: 1.5,
    borderTopColor: BR_COLORS.ink,
    opacity: 0.9,
  },
  closeBtn: {
    width: 32, height: 32,
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetBody: {
    fontSize: 14,
    fontWeight: '600',
    color: BR_COLORS.ink,
    lineHeight: 20,
    marginBottom: BR_SPACE.lg,
  },
  evidenceHead: {
    ...BR_TYPE.label,
    color: BR_COLORS.muted,
    letterSpacing: 1.8,
    fontSize: 10,
    marginBottom: 6,
  },
  evidenceBox: {
    borderWidth: 1.5,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.paperAlt,
  },
  evRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: BR_SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: BR_COLORS.line,
    gap: BR_SPACE.md,
  },
  evK: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: BR_COLORS.muted,
    letterSpacing: 0.6,
  },
  evV: {
    flex: 1,
    fontSize: 11,
    fontFamily: BR_FONT.mono,
    fontWeight: '700',
    color: BR_COLORS.ink,
    textAlign: 'right',
  },
  sourceFoot: {
    fontSize: 11,
    color: BR_COLORS.muted,
    fontStyle: 'italic',
    marginTop: BR_SPACE.lg,
    lineHeight: 16,
  },
});
