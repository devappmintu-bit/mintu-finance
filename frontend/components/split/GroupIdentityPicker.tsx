/**
 * GroupIdentityPicker.tsx — R117 social-split feature.
 *
 * Inline emoji + banner-color picker shown in the New Group screen so
 * every group has a visual identity. Replaces the bland letter avatar.
 *
 * Output is a (`emoji`, `bannerColor`) pair sent to the backend as
 * `custom_emoji` (already supported) plus a CLIENT-side cached
 * `banner_color` field stored in the group's settings (best effort).
 */
import React, { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BR_COLORS } from '../../utils/brutalist';

const { ink: INK, paper: PAPER, line: LINE, muted: MUTED, accent: ACCENT } = BR_COLORS;

const EMOJI_PRESETS = ['🏖️', '🍕', '🏠', '✈️', '💡', '🎉', '👬', '💼', '☕', '🎦', '🛍️', '🚗', '🍽️', '🍳'] as const;

const BANNER_COLORS = [
  '#FFE0CC', // peach
  '#D1FAE5', // mint
  '#DBEAFE', // sky
  '#FCE7F3', // rose
  '#FEF3C7', // butter
  '#E9D5FF', // violet
  '#FED7AA', // amber
  '#F4EFEA', // paper
] as const;

interface Props {
  emoji: string;
  bannerColor: string;
  onChange: (next: { emoji: string; bannerColor: string }) => void;
}

function GroupIdentityPickerImpl({ emoji, bannerColor, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>GROUP VIBE</Text>
      <Pressable onPress={() => setOpen((s) => !s)} style={[styles.preview, { backgroundColor: bannerColor }]}>
        <Text style={styles.previewEmoji}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.previewLabel}>{open ? 'CLOSE' : 'PICK A VIBE'}</Text>
          <Text style={styles.previewHint}>This appears at the top of your group page.</Text>
        </View>
        <Text style={styles.chevron}>{open ? '−' : '+'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>EMOJI</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
            {EMOJI_PRESETS.map((e) => {
              const active = e === emoji;
              return (
                <Pressable
                  key={e}
                  onPress={() => onChange({ emoji: e, bannerColor })}
                  style={[styles.emojiCell, active && styles.emojiCellActive]}
                >
                  <Text style={styles.emojiCellTxt}>{e}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.panelLabel, { marginTop: 12 }]}>BANNER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
            {BANNER_COLORS.map((c) => {
              const active = c === bannerColor;
              return (
                <Pressable
                  key={c}
                  onPress={() => onChange({ emoji, bannerColor: c })}
                  style={[styles.colorCell, { backgroundColor: c }, active && styles.colorCellActive]}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 28 },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: INK, marginBottom: 8 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: INK,
  },
  previewEmoji: { fontSize: 30 },
  previewLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6, color: INK },
  previewHint: { fontSize: 11, color: MUTED, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 22, fontWeight: '900', color: INK, paddingHorizontal: 6 },
  panel: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: INK,
    backgroundColor: PAPER,
    paddingTop: 10,
    paddingBottom: 8,
  },
  panelLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: MUTED,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  scrollRow: { paddingHorizontal: 12, gap: 6, paddingBottom: 4 },
  emojiCell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: LINE,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  emojiCellActive: { borderColor: ACCENT, borderWidth: 2.5 },
  emojiCellTxt: { fontSize: 22 },
  colorCell: {
    width: 44,
    height: 28,
    borderWidth: 1.5,
    borderColor: LINE,
    marginRight: 6,
  },
  colorCellActive: { borderColor: INK, borderWidth: 3 },
});

export default memo(GroupIdentityPickerImpl);
