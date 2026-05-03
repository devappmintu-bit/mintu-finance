// Reusable swipe-to-edit/delete row wrapper.
// - On NATIVE: left swipe → Edit, right swipe → Delete (uses RNGH Swipeable).
// - On WEB (gestures are flaky on RN-Web): falls back to a pinned action bar
//   that hangs BELOW the row so it never overlaps price/amount text.
// Each screen can disable Edit or Delete by passing the handler as undefined.
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../utils/theme';
import { makeStyles } from '../utils/makeStyles';

interface Props {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
}

export default function SwipeableRow({
  children,
  onEdit,
  onDelete,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  disabled,
}: Props) {
  const s = useStyles();
  const rowRef = useRef<Swipeable>(null);
  const [openActions, setOpenActions] = useState(false);

  const close = () => rowRef.current?.close();

  const renderRightActions = (_p: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onDelete) return null;
    const scale = dragX.interpolate({ inputRange: [-120, -40, 0], outputRange: [1, 0.8, 0.2], extrapolate: 'clamp' });
    return (
      <RectButton style={s.rightAction} onPress={() => { close(); onDelete?.(); }}>
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={s.actionText}>{deleteLabel}</Text>
        </Animated.View>
      </RectButton>
    );
  };

  const renderLeftActions = (_p: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onEdit) return null;
    const scale = dragX.interpolate({ inputRange: [0, 40, 120], outputRange: [0.2, 0.8, 1], extrapolate: 'clamp' });
    return (
      <RectButton style={s.leftAction} onPress={() => { close(); onEdit?.(); }}>
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="create-outline" size={22} color="#fff" />
          <Text style={s.actionText}>{editLabel}</Text>
        </Animated.View>
      </RectButton>
    );
  };

  // ---- WEB FALLBACK ----
  // We can't rely on swipe on the web preview. Show a small "⋯" handle at the
  // row's right edge; tapping it toggles an action bar that hangs BELOW the
  // row so it never overlaps the amount/title text.
  if (Platform.OS === 'web' || disabled) {
    const hasAction = (!!onEdit || !!onDelete) && !disabled;
    return (
      <View style={{ position: 'relative', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>{children}</View>
          {hasAction && (
            <TouchableOpacity
              onPress={() => setOpenActions(v => !v)}
              style={s.webHandle}
              activeOpacity={0.7}
              accessibilityLabel="Row actions"
            >
              <Ionicons name={openActions ? 'close' : 'ellipsis-vertical'} size={16} color={COLORS.text.primary} />
            </TouchableOpacity>
          )}
        </View>
        {hasAction && openActions && (
          <View style={s.webBar}>
            {onEdit && (
              <TouchableOpacity
                onPress={() => { setOpenActions(false); onEdit(); }}
                style={[s.webBarBtn, { backgroundColor: '#3B82F6' }]}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={14} color="#fff" />
                <Text style={s.webBarText}>{editLabel}</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                onPress={() => { setOpenActions(false); onDelete(); }}
                style={[s.webBarBtn, { backgroundColor: COLORS.state.danger }]}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={s.webBarText}>{deleteLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <Swipeable
      ref={rowRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
    >
      {children}
    </Swipeable>
  );
}

const useStyles = makeStyles((c) => ({
  rightAction: { backgroundColor: COLORS.state.danger, justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: RADIUS.lg, marginBottom: 10, marginLeft: 8 },
  leftAction: { backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: RADIUS.lg, marginBottom: 10, marginRight: 8 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },

  webHandle: {
    width: 30, height: 30, borderRadius: 0,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  webBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    marginTop: -6,
    backgroundColor: '#F9FAFB',
    borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg,
    borderWidth: 1, borderTopWidth: 0,
    borderColor: '#E5E7EB',
  },
  webBarBtn: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  webBarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
}));
