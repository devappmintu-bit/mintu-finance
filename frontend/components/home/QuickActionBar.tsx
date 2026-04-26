/**
 * QuickActionBar — 1-tap shortcuts for high-intent moments.
 * Design: primary saffron pill (Add) + 4 icon tiles (Scan / Split / AI / Rewards)
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { makeStyles } from '../../utils/makeStyles';

type Action = { id: string; icon: keyof typeof Ionicons.glyphMap; label: string; route: string; tint: string };

const ACTIONS: Action[] = [
  { id: 'scan_sms', icon: 'scan',     label: 'Scan',    route: '/(tabs)/transactions?openSmsScan=1', tint: '#7C3AED' },
  { id: 'split',    icon: 'people',   label: 'Split',   route: '/(tabs)/split',                        tint: '#2563EB' },
  { id: 'ai_coach', icon: 'sparkles', label: 'Ask AI',  route: '/(tabs)/ai-coach',                     tint: '#10B981' },
  { id: 'rewards',  icon: 'gift',     label: 'Rewards', route: '/(tabs)/rewards',                      tint: '#F59E0B' },
];

function QuickActionBar() {
  const s = useStyles();
  const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
  };
  const go = (r: string) => { haptic(); try { router.push(r as any); } catch {} };
  const add = () => { haptic(Haptics.ImpactFeedbackStyle.Medium); try { router.push('/(tabs)/transactions?openAdd=1' as any); } catch {} };

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.primaryShell} activeOpacity={0.9} onPress={add} testID="qa-add">
        <LinearGradient colors={['#F56E1E', '#C14A06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.primary}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={s.primaryTxt}>Add Expense</Text>
        </LinearGradient>
      </TouchableOpacity>
      {ACTIONS.map((a) => (
        <TouchableOpacity key={a.id} style={s.tile} activeOpacity={0.72} onPress={() => go(a.route)} testID={`qa-${a.id}`}>
          <View style={[s.iconBubble, { backgroundColor: a.tint + '1E' }]}>
            <Ionicons name={a.icon} size={18} color={a.tint} />
          </View>
          <Text style={s.tileTxt} numberOfLines={1}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default memo(QuickActionBar);

const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  primaryShell: { flex: 1.35, borderRadius: 16, overflow: 'hidden' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 16 },
  primaryTxt: { color: c.bg.elevated, fontSize: 13, fontWeight: '900', letterSpacing: -0.2 },
  tile: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 10, borderRadius: 14, backgroundColor: c.bg.secondary, borderWidth: 1, borderColor: c.border.card },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileTxt: { fontSize: 10.5, fontWeight: '800', color: c.text.primary },
}));
