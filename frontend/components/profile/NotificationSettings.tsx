/**
 * NotificationSettings — industry-standard toggles with server persistence.
 *
 * Sections:
 *   • Master on/off
 *   • Channels: Push · In-app · Email · SMS
 *   • Categories: Budget alerts · Bill reminders · Split updates · Txn alerts
 *                 Security · Rewards · Tips & News · Marketing
 *   • Quiet hours (start-end picker)
 *   • Frequency: Realtime · Daily digest · Weekly digest
 *   • Send test push (calls /notifications/send-test)
 *
 * Backend: GET/PUT /api/user/notification-prefs
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../utils/api';
import useFocusRefresh from '../../hooks/useFocusRefresh';
import {  COLORS, shadowStyle, useAppColors } from '../../utils/theme';
import { makeStyles } from '../../utils/makeStyles';
import { sendTestPush } from '../../hooks/usePushNotifications';
import { showError, showSuccess } from '../../utils/toast';

type Prefs = {
  master_enabled: boolean;
  channels: Record<string, boolean>;
  categories: Record<string, boolean>;
  quiet_hours: { enabled: boolean; start: string; end: string };
  frequency: 'realtime' | 'daily' | 'weekly';
};

const CHANNELS: Array<{ key: string; label: string; icon: string; }> = [
  { key: 'push',   label: 'Push notifications', icon: 'notifications-outline' },
  { key: 'in_app', label: 'In-app banners',      icon: 'megaphone-outline' },
  { key: 'email',  label: 'Email',               icon: 'mail-outline' },
  { key: 'sms',    label: 'SMS',                 icon: 'chatbubble-ellipses-outline' },
];

const CATEGORIES: Array<{ key: string; label: string; desc: string; icon: string; color: string }> = [
  { key: 'budget_alerts',     label: 'Budget alerts',        desc: 'Over-budget warnings, weekly summaries',    icon: 'pie-chart',   color: '#E65100' },
  { key: 'bill_reminders',    label: 'Bill reminders',       desc: 'Upcoming rent, EMIs, subscriptions',         icon: 'calendar',    color: '#4338CA' },
  { key: 'split_updates',     label: 'Split updates',        desc: 'New expenses, friends settled up',           icon: 'people',      color: '#0F766E' },
  { key: 'transaction_alerts',label: 'Transaction alerts',   desc: 'Large txns, duplicate detection',            icon: 'card',        color: COLORS.accent.secondary },
  { key: 'security',          label: 'Security',             desc: 'Sign-ins, PIN/biometric changes',            icon: 'shield-checkmark', color: COLORS.state.successAlt },
  { key: 'rewards',           label: 'Rewards',              desc: 'Coins, vouchers, achievements',              icon: 'gift',        color: COLORS.accent.brand },
  { key: 'tips_news',         label: 'Tips & finance news',  desc: 'Money School, India Finance Today',          icon: 'school',      color: '#06B6D4' },
  { key: 'marketing',         label: 'Offers & promos',      desc: 'Partner deals, referral bonuses',            icon: 'megaphone',   color: '#A855F7' },
];

const FREQUENCIES: Array<{ key: Prefs['frequency']; label: string; sub: string }> = [
  { key: 'realtime', label: 'Realtime', sub: 'Instant' },
  { key: 'daily',    label: 'Daily',    sub: '1 digest/day' },
  { key: 'weekly',   label: 'Weekly',   sub: '1 digest/week' },
];

export default function NotificationSettings() {
  const s = useStyles();
  const c = useAppColors();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/user/notification-prefs');
      setPrefs(r.data);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusRefresh(load);

  const save = async (next: Prefs) => {
    setPrefs(next);
    setSaving(true);
    try {
      await api.put('/user/notification-prefs', next);
    } catch { showError('Save failed'); }
    finally { setSaving(false); }
  };

  // Round 49 — wrap in `void` form so the toggleX handlers' return types
  // satisfy Switch's `onValueChange: (v: boolean) => void` signature
  // (otherwise TS infers `false | Promise<void>` from the `&&` short-circuit).
  const toggleMaster   = () => { if (prefs) save({ ...prefs, master_enabled: !prefs.master_enabled }); };
  const toggleChannel  = (k: string) => { if (prefs) save({ ...prefs, channels: { ...prefs.channels, [k]: !prefs.channels[k] } }); };
  const toggleCategory = (k: string) => { if (prefs) save({ ...prefs, categories: { ...prefs.categories, [k]: !prefs.categories[k] } }); };
  const toggleQuiet    = () => { if (prefs) save({ ...prefs, quiet_hours: { ...prefs.quiet_hours, enabled: !prefs.quiet_hours.enabled } }); };
  const setFreq = (f: Prefs['frequency']) => { if (prefs) save({ ...prefs, frequency: f }); };

  const testPush = async () => {
    setTesting(true);
    const r = await sendTestPush();
    if (r.sent) showSuccess('Test push sent');
    else        Toast.show({ type: 'info', text1: r.message || 'Push not configured' });
    setTesting(false);
  };

  const enabledCount = prefs ? Object.values(prefs.categories).filter(Boolean).length : 0;

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.75} testID="notif-header">
        <View style={s.iconBox}><Ionicons name="notifications" size={20} color="#4338CA" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.sub} numberOfLines={1}>
            {prefs?.master_enabled ? `${enabledCount}/${CATEGORIES.length} categories · ${prefs.frequency}` : 'All notifications paused'}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {loading || !prefs ? (
            <ActivityIndicator color={COLORS.accent.primary} />
          ) : (
            <>
              {/* Master switch */}
              <View style={[s.masterRow, !prefs.master_enabled && { opacity: 0.65 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.masterT}>All notifications</Text>
                  <Text style={s.masterSub}>Turn off to pause everything instantly</Text>
                </View>
                <Switch
                  value={prefs.master_enabled}
                  onValueChange={toggleMaster}
                  trackColor={{ false: COLORS.border.subtle, true: COLORS.accent.primary + '66' }}
                  thumbColor={prefs.master_enabled ? COLORS.accent.primary : '#FFFFFF'}
                  testID="notif-master-switch"
                />
              </View>

              {/* Channels */}
              <Text style={s.groupTitle}>Delivery channels</Text>
              <View style={{ gap: 4 }}>
                {CHANNELS.map(c => (
                  <View key={c.key} style={s.toggleRow}>
                    <Ionicons name={c.icon as any} size={18} color={COLORS.text.secondary} />
                    <Text style={s.toggleLabel}>{c.label}</Text>
                    <Switch
                      value={!!prefs.channels[c.key] && prefs.master_enabled}
                      onValueChange={() => { if (prefs.master_enabled) toggleChannel(c.key); }}
                      disabled={!prefs.master_enabled}
                      trackColor={{ false: COLORS.border.subtle, true: COLORS.accent.primary + '66' }}
                      thumbColor={prefs.channels[c.key] ? COLORS.accent.primary : '#FFFFFF'}
                    />
                  </View>
                ))}
              </View>

              {/* Categories */}
              <Text style={s.groupTitle}>Categories</Text>
              <View style={{ gap: 4 }}>
                {CATEGORIES.map(c => (
                  <View key={c.key} style={s.toggleRow}>
                    <View style={[s.catIcon, { backgroundColor: c.color + '22' }]}>
                      <Ionicons name={c.icon as any} size={13} color={c.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.toggleLabel}>{c.label}</Text>
                      <Text style={s.toggleDesc} numberOfLines={1}>{c.desc}</Text>
                    </View>
                    <Switch
                      value={!!prefs.categories[c.key] && prefs.master_enabled}
                      onValueChange={() => { if (prefs.master_enabled) toggleCategory(c.key); }}
                      disabled={!prefs.master_enabled}
                      trackColor={{ false: COLORS.border.subtle, true: COLORS.accent.primary + '66' }}
                      thumbColor={prefs.categories[c.key] ? COLORS.accent.primary : '#FFFFFF'}
                    />
                  </View>
                ))}
              </View>

              {/* Quiet hours */}
              <View style={s.toggleRow}>
                <Ionicons name="moon-outline" size={18} color={COLORS.text.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Quiet hours</Text>
                  <Text style={s.toggleDesc}>Silence {prefs.quiet_hours.start} – {prefs.quiet_hours.end}</Text>
                </View>
                <Switch
                  value={prefs.quiet_hours.enabled}
                  onValueChange={toggleQuiet}
                  trackColor={{ false: COLORS.border.subtle, true: COLORS.accent.primary + '66' }}
                  thumbColor={prefs.quiet_hours.enabled ? COLORS.accent.primary : '#FFFFFF'}
                />
              </View>

              {/* Frequency */}
              <Text style={s.groupTitle}>Digest frequency</Text>
              <View style={s.freqRow}>
                {FREQUENCIES.map(f => (
                  <TouchableOpacity
                    key={f.key}
                    style={[s.freqChip, prefs.frequency === f.key && s.freqChipOn]}
                    onPress={() => setFreq(f.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.freqLabel, prefs.frequency === f.key && s.freqLabelOn]}>{f.label}</Text>
                    <Text style={[s.freqSub, prefs.frequency === f.key && s.freqSubOn]}>{f.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Test push */}
              <TouchableOpacity style={s.testBtn} onPress={testPush} disabled={testing} activeOpacity={0.85} testID="notif-test-btn">
                {testing
                  ? <ActivityIndicator color={COLORS.accent.primary} size="small" />
                  : (<><Ionicons name="paper-plane-outline" size={14} color={COLORS.accent.primary} /><Text style={s.testBtnT}>Send test push</Text></>)}
              </TouchableOpacity>

              {saving && <View style={s.savingChip}><ActivityIndicator size="small" color={COLORS.accent.primary} /><Text style={s.savingT}>Saving…</Text></View>}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(238,221,204,0.6)', ...shadowStyle('#2E1F1A', 2, 10, 0.04, 2) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#4338CA15', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: c.text.primary },
  sub: { fontSize: 12, color: c.text.muted, marginTop: 2 },
  body: { marginTop: 12, gap: 10 },
  masterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.accent.brandSoft, borderRadius: 12, borderWidth: 1, borderColor: c.accent.primary + '2E' },
  masterT: { fontSize: 13.5, fontWeight: '800', color: c.text.primary },
  masterSub: { fontSize: 11, color: c.text.secondary, marginTop: 2 },
  groupTitle: { fontSize: 10.5, fontWeight: '900', color: c.text.muted, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  toggleLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text.primary },
  toggleDesc: { fontSize: 10.5, color: c.text.muted, marginTop: 1 },
  catIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: c.bg.primary, borderWidth: 1, borderColor: c.border.subtle, alignItems: 'center' },
  freqChipOn: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
  freqLabel: { fontSize: 13, fontWeight: '800', color: c.text.primary },
  freqLabelOn: { color: c.bg.elevated },
  freqSub: { fontSize: 10, color: c.text.muted, marginTop: 2 },
  freqSubOn: { color: 'rgba(255,255,255,0.85)' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent.primary + '15', paddingVertical: 10, borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: c.accent.primary + '2E' },
  testBtnT: { fontSize: 12.5, fontWeight: '800', color: c.accent.primary },
  savingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 6 },
  savingT: { fontSize: 11, color: c.text.muted },
}));
