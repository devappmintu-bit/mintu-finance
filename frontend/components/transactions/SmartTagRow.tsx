/**
 * SmartTagRow.tsx — R117 smart-tag chips strip for a transaction row.
 *
 * Used inline below the txn description. Renders up to 2 tags with
 * brutalist hairline pill geometry. Cheap and memoizable.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SmartTag } from '../../utils/transactionInsights';
import { TAG_TONE_BG, TAG_TONE_INK } from '../../utils/transactionInsights';

interface Props {
  tags: SmartTag[];
}

function SmartTagRowImpl({ tags }: Props) {
  if (!tags?.length) return null;
  return (
    <View style={styles.row}>
      {tags.map((t) => (
        <View
          key={t.id}
          style={[
            styles.pill,
            { backgroundColor: TAG_TONE_BG[t.tone], borderColor: TAG_TONE_INK[t.tone] + '55' },
          ]}
        >
          <Text style={[styles.pillEmoji, { color: TAG_TONE_INK[t.tone] }]}>{t.emoji}</Text>
          <Text style={[styles.pillText, { color: TAG_TONE_INK[t.tone] }]}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
  },
  pillEmoji: { fontSize: 9, fontWeight: '800', lineHeight: 12 },
  pillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
});

export default memo(SmartTagRowImpl);
