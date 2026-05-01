/**
 * StaggeredListItem — entry animation wrapper for individual rows
 * inside a virtualized list (FlatList / FlashList / SectionList).
 *
 * DS 2.0 primitive. Complements StaggeredEntrance (which works on
 * static children) by handling the tricky case where children are
 * mounted by a virtualiser — we can't wrap them all at once because
 * most haven't rendered yet.
 *
 * Strategy:
 *   - Only the first `maxStaggeredIndex` items (default 8) animate
 *     with a calculated delay; later items mount instantly. This
 *     mirrors the Apple-Wallet / Notion feel — the initial visible
 *     viewport cascades, the rest appears instant when scrolled in.
 *   - When an item re-appears on scroll (common in virtualisation),
 *     we rely on the one-time-per-mount nature of moti's `from` prop
 *     so it doesn't re-fire; the second `key` bump does it.
 *
 * Usage:
 *   renderItem={({ item, index }) => (
 *     <StaggeredListItem index={index}>
 *       <MyRow item={item} />
 *     </StaggeredListItem>
 *   )}
 */
import React from 'react';
import { MotiView } from 'moti';
import { StyleProp, ViewStyle } from 'react-native';

export interface StaggeredListItemProps {
  index: number;
  children: React.ReactNode;
  /**
   * Items with `index >= maxStaggeredIndex` mount instantly (opacity:1,
   * no slide). Keeps the cascade crisp without slowing scrolling.
   */
  maxStaggeredIndex?: number;
  /** Delay between animated items (ms). */
  delayPerItemMs?: number;
  /** Initial translateY distance (px). Positive = slides up. */
  distance?: number;
  /** Per-item animation duration (ms). */
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

function StaggeredListItemImpl({
  index,
  children,
  maxStaggeredIndex = 8,
  delayPerItemMs = 55,
  distance = 12,
  duration = 380,
  style,
}: StaggeredListItemProps) {
  const shouldAnimate = index < maxStaggeredIndex;

  if (!shouldAnimate) {
    // Items beyond the cascade window: instant mount, no animation cost.
    return <>{children}</>;
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: distance }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration,
        delay: index * delayPerItemMs,
      }}
      style={style}
    >
      {children}
    </MotiView>
  );
}

export const StaggeredListItem = React.memo(StaggeredListItemImpl);
StaggeredListItem.displayName = 'StaggeredListItem';
export default StaggeredListItem;
