/**
 * BStatStrip — slim 3-cell (or N-cell) statistic row with vertical dividers.
 *
 * Replaces three separate KPI tiles when we want a denser, more readable
 * "at a glance" block. Density matters: tiles are ≥92pt tall with 4 sides
 * of ink border each (12 borders for 3 tiles); a single strip is one
 * outer border + 2 internal vertical rules → far less visual noise.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

export interface StatCell {
  value: string | number;
  label: string;
  tone?: 'ink' | 'accent' | 'positive' | 'negative';
}

export default function BStatStrip({ cells, style }: { cells: StatCell[]; style?: ViewStyle | ViewStyle[] }) {
  return (
    <View style={[styles.wrap, style]}>
      {cells.map((c, i) => {
        const color =
          c.tone === 'accent' ? BR_COLORS.accent :
          c.tone === 'positive' ? BR_COLORS.positive :
          c.tone === 'negative' ? BR_COLORS.negative :
          BR_COLORS.ink;
        return (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.cell}>
              <Text style={[BR_TYPE.numLg, styles.value, { color, fontSize: 30, lineHeight: 32 }]}>
                {c.value}
              </Text>
              <Text style={[BR_TYPE.labelSm, styles.label]} numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: BR_COLORS.paper,
    // SECONDARY tier — 1px hairline, no stamp shadow
    borderColor: BR_COLORS.ink,
    borderWidth: BR_BORDER.hair,
  },
  cell: {
    flex: 1,
    paddingVertical: BR_SPACE.md,
    paddingHorizontal: BR_SPACE.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  divider: { width: BR_BORDER.hair, backgroundColor: BR_COLORS.ink },
  value: { letterSpacing: -0.5 },
  label: { color: BR_COLORS.muted, marginTop: 4 },
});
