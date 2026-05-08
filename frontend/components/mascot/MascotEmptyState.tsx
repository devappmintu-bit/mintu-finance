/**
 * MascotEmptyState — reusable empty-state primitive across the app.
 *
 * Replaces bare "Nothing here yet" empty states across transactions /
 * budget / goals / missions tabs with a Mintu-led prompt.
 *
 *   <MascotEmptyState
 *      title="No expenses yet"
 *      message="Log one. I'll start watching for patterns."
 *      ctaText="Add expense"
 *      onPress={() => router.push('/add-expense')}
 *   />
 *
 * Always shows the mascot (no honest-UX gate — empty states are
 * inherently "come start" moments and are appropriate for cold-start).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import MascotPresence from './MascotPresence';
import { MascotMood } from '../../hooks/useMascotMood';

type Props = {
  title: string;
  message: string;
  ctaText?: string;
  onPress?: () => void;
  mood?: MascotMood;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
};

export default function MascotEmptyState({
  title, message, ctaText, onPress, mood = 'encouraging', iconName, style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <MascotPresence size={108} mood={mood} showWhenGated />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {ctaText && onPress ? (
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={ctaText}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          {iconName ? <Ionicons name={iconName} size={14} color="#FFF" /> : null}
          <Text style={styles.ctaText}>{ctaText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0B0B0B',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: '#525252',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6B1A',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 2,
    borderColor: '#0B0B0B',
    marginTop: 6,
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  ctaPressed: { transform: [{ translateX: 2 }, { translateY: 2 }], shadowOffset: { width: 1, height: 1 } },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
});
