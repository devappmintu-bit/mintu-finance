/**
 * BSection — large uppercase header + hairline rule + children.
 * Swiss structural device: every section stacks under a tagged title.
 *
 *     [ 01 ]  ━━━━━━━━━━━━━━━━━━━━━━━
 *     ACCOUNT
 *     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *     <children />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BR_COLORS, BR_SPACE, BR_TYPE, BR_BORDER } from '../../utils/brutalist';

interface Props {
  index?: string;           // e.g., '01', '02'
  title: string;
  caption?: string;         // short meta-line under title
  children?: React.ReactNode;
}

export default function BSection({ index, title, caption, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {index ? <Text style={[BR_TYPE.label, styles.idx]}>{index}</Text> : null}
        <View style={styles.rule} />
      </View>
      <Text style={[BR_TYPE.h2, styles.title]}>{title}</Text>
      {caption ? <Text style={[BR_TYPE.meta, styles.caption]}>{caption}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: BR_SPACE.xl, marginBottom: BR_SPACE.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BR_SPACE.sm,
    marginBottom: BR_SPACE.sm,
  },
  idx: { color: BR_COLORS.ink, minWidth: 28 },
  rule: { flex: 1, height: BR_BORDER.hair, backgroundColor: BR_COLORS.ink },
  title: { textTransform: 'uppercase', color: BR_COLORS.ink },
  caption: { color: BR_COLORS.muted, marginTop: 4 },
  body: { marginTop: BR_SPACE.md, gap: 0 },
});
