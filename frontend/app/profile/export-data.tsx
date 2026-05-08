/**
 * Profile → Data Export route — R109.
 *
 * Wraps the brutalist BrutalDataExportCard in a full-screen with
 * Brutal-styled header. Reachable from the Profile screen.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import BrutalDataExportCard from '../../components/profile/BrutalDataExportCard';
import {
  BrutalCard,
  BR_COLORS,
  BR_BORDER,
  BR_SHADOW,
  BR_SPACE,
  BR_FONT,
} from '../../components/brutal';

export default function DataExportRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Brutalist header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={BR_COLORS.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>DATA EXPORT</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero context — no fake claims, no fluff */}
        <BrutalCard variant="accent" style={{ marginBottom: BR_SPACE['4'] }}>
          <Text style={styles.heroEyebrow}>POWER USER</Text>
          <Text style={styles.heroTitle}>Your data,{'\n'}your move.</Text>
          <Text style={styles.heroSub}>
            Stream every transaction, budget and goal as CSV or JSON. Streamed straight from your account — no third-party in the loop, ever.
          </Text>
        </BrutalCard>

        {/* The actual export controls */}
        <BrutalDataExportCard />

        {/* Trust footnote */}
        <Text style={styles.footnote}>
          Files are generated on demand and never stored on our servers. Your bearer token authenticates each download — exports cannot be triggered by anyone but you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BR_COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BR_SPACE['4'],
    paddingVertical: BR_SPACE['3'],
    borderBottomWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.bg,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BR_BORDER.base,
    borderColor: BR_COLORS.ink,
    backgroundColor: BR_COLORS.card,
    ...(BR_SHADOW.xs as any),
  },
  headerTitle: { ...BR_FONT.stamp, color: BR_COLORS.ink, fontSize: 13 },

  scrollPad: {
    padding: BR_SPACE['4'],
    paddingBottom: BR_SPACE['16'],
  },

  heroEyebrow: {
    ...BR_FONT.stamp,
    color: '#fff',
    opacity: 0.85,
    marginBottom: BR_SPACE['2'],
  },
  heroTitle: {
    ...BR_FONT.h1,
    color: '#fff',
    fontSize: 28,
    marginBottom: BR_SPACE['2'],
  },
  heroSub: {
    ...BR_FONT.body,
    color: '#fff',
    opacity: 0.95,
    fontSize: 13,
    lineHeight: 18,
  },

  footnote: {
    ...BR_FONT.caption,
    color: BR_COLORS.textMuted,
    fontSize: 11,
    marginTop: BR_SPACE['4'],
    lineHeight: 16,
  },
});
