// Reusable swipe-to-edit/delete row wrapper.
// Swipe LEFT → Edit (blue)    Swipe RIGHT → Delete (red)
// Built on `react-native-gesture-handler` Swipeable for native smoothness.
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../utils/theme';

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
  const rowRef = useRef<Swipeable>(null);

  const close = () => rowRef.current?.close();

  const renderRightActions = (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onDelete) return null;
    const scale = dragX.interpolate({
      inputRange: [-120, -40, 0],
      outputRange: [1, 0.8, 0.2],
      extrapolate: 'clamp',
    });
    return (
      <RectButton style={s.rightAction} onPress={() => { close(); onDelete?.(); }}>
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={s.actionText}>{deleteLabel}</Text>
        </Animated.View>
      </RectButton>
    );
  };

  const renderLeftActions = (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onEdit) return null;
    const scale = dragX.interpolate({
      inputRange: [0, 40, 120],
      outputRange: [0.2, 0.8, 1],
      extrapolate: 'clamp',
    });
    return (
      <RectButton style={s.leftAction} onPress={() => { close(); onEdit?.(); }}>
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="create-outline" size={22} color="#fff" />
          <Text style={s.actionText}>{editLabel}</Text>
        </Animated.View>
      </RectButton>
    );
  };

  // On web, Swipeable gestures can be flaky — fall back to a simple inline Edit/Delete bar.
  if (Platform.OS === 'web' || disabled) {
    return (
      <View style={{ position: 'relative' }}>
        {children}
        {(onEdit || onDelete) && !disabled && (
          <View style={s.webActions} pointerEvents="box-none">
            {onEdit && (
              <TouchableOpacity onPress={onEdit} style={[s.webBtn, { backgroundColor: '#3B82F6' }]} activeOpacity={0.8} accessibilityLabel={editLabel}>
                <Ionicons name="create-outline" size={14} color="#fff" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={[s.webBtn, { backgroundColor: '#EF4444' }]} activeOpacity={0.8} accessibilityLabel={deleteLabel}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
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

const s = StyleSheet.create({
  rightAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
    marginLeft: 8,
  },
  leftAction: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
    marginRight: 8,
  },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  webActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  webBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.85,
  },
});
