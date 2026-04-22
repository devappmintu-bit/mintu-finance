/**
 * AIOrb — Floating AI assistant button.
 *
 * • Fixed bottom-right with a pulsing ring animation
 * • Opens AIOrbSheet on press
 * • Positioned above the tab bar (safe area aware by consumer)
 */
import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

interface Props { onPress: () => void; bottomOffset?: number; }

export default function AIOrb({ onPress, bottomOffset = 86 }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
    transform: [{
      scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.6] }),
    }],
  };

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <Animated.View style={[styles.pulseRing, ringStyle]} pointerEvents="none" />
      <TouchableOpacity onPress={handlePress} activeOpacity={0.88} testID="ai-orb">
        <LinearGradient
          colors={['#7C3AED', '#4C1D95']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.orb}
        >
          <Ionicons name="sparkles" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  pulseRing: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: '#7C3AED' },
  orb: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#4C1D95', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
});
