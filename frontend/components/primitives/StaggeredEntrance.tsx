/**
 * StaggeredEntrance — makes every direct child slide-up + fade-in with
 * a staggered delay on mount. THE signature Apple-Wallet / Notion
 * content-reveal effect.
 *
 * Design System 2.0 · Phase 1 primitive.
 *
 * Props:
 *   delayMs   — delay between children (default 55 ms)
 *   initialMs — initial delay before first child animates (default 0)
 *   distance  — px to translate-up from (default 18)
 *   duration  — per-child animation duration (default 460 ms)
 *
 * Implementation: we iterate React.Children, wrap each in a <MotiView>
 * with a calculated delay. MotiView is one of the cheapest animations
 * on the UI thread — fine for up to ~30 children per frame.
 *
 * Note: parent should still handle its own scroll / layout; this is
 * purely a presentation wrapper.
 */
import React from 'react';
import { MotiView } from 'moti';
import { StyleProp, ViewStyle } from 'react-native';

export interface StaggeredEntranceProps {
  children: React.ReactNode;
  delayMs?: number;
  initialMs?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

function StaggeredEntranceImpl({
  children,
  delayMs = 55,
  initialMs = 0,
  distance = 18,
  duration = 460,
  style,
}: StaggeredEntranceProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, i) => (
        <MotiView
          key={i}
          from={{ opacity: 0, translateY: distance }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: 'timing',
            duration,
            delay: initialMs + i * delayMs,
          }}
          style={style}
        >
          {child}
        </MotiView>
      ))}
    </>
  );
}

export const StaggeredEntrance = React.memo(StaggeredEntranceImpl);
StaggeredEntrance.displayName = 'StaggeredEntrance';
export default StaggeredEntrance;
