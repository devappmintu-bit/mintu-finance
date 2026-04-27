import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {  COLORS, RADIUS, SPACING, shadowStyle, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';

import { APP_LINK } from '../../utils/brand';

interface Props {
  weeklyReport: any;
  snapshot: any;
  user: any;
}

function WeeklyReport({ weeklyReport, snapshot, user }: Props) {
  const s = useStyles();
  const c = useAppColors();
  if (!weeklyReport || weeklyReport.total_spent <= 0) return null;

  const handleShare = async () => {
    const snap = snapshot || {};
    const tierEmoji = snap.tier?.current?.emoji || '💰';
    const tierName = snap.tier?.current?.name || 'MintU';
    const txt = (
      `${weeklyReport.mood} My MintU Weekly Report\n\n` +
      `${weeklyReport.headline}\n\n` +
      `${tierEmoji} Tier: ${tierName}\n` +
      `🔥 Streak: ${snap.tier?.streak_days || user?.streak_days || 0} days\n` +
      `📊 Score: ${snap.tier?.score || user?.money_score || 50}/100\n\n` +
      (weeklyReport.top_category?.amount
        ? `Top: ${weeklyReport.top_category.name} — ₹${Math.round(weeklyReport.top_category.amount).toLocaleString('en-IN')}\n`
        : '') +
      `\nTrack your money with MintU 👉 ${APP_LINK}`
    );
    try {
      const wa = `whatsapp://send?text=${encodeURIComponent(txt)}`;
      const canWA = await Linking.canOpenURL(wa);
      if (canWA) { Linking.openURL(wa); return; }
      await Share.share({ message: txt });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not share' });
    }
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="calendar" size={16} color={COLORS.accent.secondary} />
        <Text style={s.label}>WEEKLY REPORT</Text>
        <Text style={s.period}>{weeklyReport.period}</Text>
      </View>
      <Text style={s.headline}>{weeklyReport.headline}</Text>
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={[s.statVal, { color: c.state.danger }]}>₹{weeklyReport.total_spent?.toFixed(0)}</Text>
          <Text style={s.statLbl}>This Week</Text>
        </View>
        {weeklyReport.last_week_spent > 0 && (
          <View style={s.stat}>
            <Text style={[s.statVal, { color: COLORS.text.muted }]}>₹{weeklyReport.last_week_spent?.toFixed(0)}</Text>
            <Text style={s.statLbl}>Last Week</Text>
          </View>
        )}
        {weeklyReport.change_pct !== 0 && (
          <View style={[s.changePill, { backgroundColor: weeklyReport.change_pct > 0 ? '#FEF2F2' : '#F0FDF4' }]}>
            <Ionicons
              name={weeklyReport.change_pct > 0 ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={weeklyReport.change_pct > 0 ? COLORS.state.danger : COLORS.state.successAlt}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', color: weeklyReport.change_pct > 0 ? COLORS.state.danger : COLORS.state.successAlt }}>
              {Math.abs(weeklyReport.change_pct).toFixed(0)}%
            </Text>
          </View>
        )}
      </View>
      <Text style={s.suggestion}>{weeklyReport.savings_suggestion}</Text>
      <TouchableOpacity style={s.shareBtn} activeOpacity={0.85} onPress={handleShare}>
        <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
        <Text style={s.shareBtnText}>Share Weekly Report</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: RADIUS.card, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 12, 0.04, 3) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: c.accent.secondary, flex: 1 },
  period: { fontSize: 10, fontWeight: '700', color: c.text.muted, letterSpacing: 0.5 },
  headline: { fontSize: 15, fontWeight: '700', color: c.text.primary, lineHeight: 22, marginBottom: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  stat: { },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 10, color: c.text.muted, marginTop: 2, fontWeight: '600' },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  suggestion: { fontSize: 13, color: c.text.secondary, lineHeight: 18, marginTop: 4 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', paddingVertical: 12, borderRadius: 999, marginTop: 12 },
  shareBtnText: { fontSize: 13, fontWeight: '800', color: c.bg.elevated },
}));

// Round 43 perf — memoized so unrelated parent state changes don't re-render this widget.
export default React.memo(WeeklyReport);
