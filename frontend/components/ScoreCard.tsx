import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { COLORS, RADIUS, SPACING } from '../utils/theme';

interface ScoreCardProps {
  name: string;
  score: number;
  streak: number;
  totalSaved: number;
  month: string;
}

export default function ScoreCard({ name, score, streak, totalSaved, month }: ScoreCardProps) {
  const cardRef = useRef<View>(null);

  const scoreColor = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work';

  const handleShare = async () => {
    try {
      if (!cardRef.current) return;
      const uri = await captureRef(cardRef, { format: 'png', quality: 0.9 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your MintU Score' });
      } else {
        Alert.alert('Sharing not available on this device');
      }
    } catch (e) {
      console.error('Share error:', e);
      Alert.alert('Error', 'Could not share. Try again.');
    }
  };

  return (
    <View>
      {/* The card that gets captured as image */}
      <View ref={cardRef} testID="score-card-capture" collapsable={false} style={s.card}>
        <View style={s.cardInner}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.logoRow}>
              <View style={s.logoIcon}>
                <Text style={s.logoText}>{'\u20B9'}</Text>
              </View>
              <Text style={s.appName}>MintU</Text>
            </View>
            <Text style={s.month}>{month}</Text>
          </View>

          {/* Score Circle */}
          <View style={s.scoreSection}>
            <View style={[s.scoreRing, { borderColor: scoreColor }]}>
              <Text style={[s.scoreNum, { color: scoreColor }]}>{score}</Text>
              <Text style={s.scoreOf}>/100</Text>
            </View>
            <Text style={[s.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
            <Text style={s.userName}>{name}</Text>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Ionicons name="flame" size={18} color="#F59E0B" />
              <Text style={s.statNum}>{streak}</Text>
              <Text style={s.statLabel}>Day Streak</Text>
            </View>
            <View style={[s.stat, s.statBorder]}>
              <Ionicons name="cash" size={18} color="#10B981" />
              <Text style={s.statNum}>{'\u20B9'}{totalSaved.toFixed(0)}</Text>
              <Text style={s.statLabel}>Saved</Text>
            </View>
          </View>

          {/* Footer */}
          <Text style={s.footer}>Track your money smartly with MintU</Text>
        </View>
      </View>

      {/* Share buttons */}
      <View style={s.shareActions}>
        <TouchableOpacity testID="share-instagram-btn" style={s.instaBtn} onPress={handleShare}>
          <Ionicons name="logo-instagram" size={20} color="#fff" />
          <Text style={s.instaTxt}>Share to Instagram Story</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="share-general-btn" style={s.generalBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={COLORS.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#0A0F1C',
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardInner: { padding: SPACING.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 18, fontWeight: '800', color: '#0A0F1C' },
  appName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  month: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  scoreSection: { alignItems: 'center', marginBottom: 24 },
  scoreRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  scoreNum: { fontSize: 48, fontWeight: '800' },
  scoreOf: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: -6 },
  scoreLabel: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  userName: { fontSize: 15, color: 'rgba(255,255,255,0.6)' },
  statsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' },
  statNum: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  footer: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  // Share buttons
  shareActions: { flexDirection: 'row', gap: 10, marginTop: SPACING.lg },
  instaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: RADIUS.full,
    backgroundColor: '#E1306C',
  },
  instaTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  generalBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bg.secondary,
    borderWidth: 1, borderColor: COLORS.border.subtle, justifyContent: 'center', alignItems: 'center',
  },
});
